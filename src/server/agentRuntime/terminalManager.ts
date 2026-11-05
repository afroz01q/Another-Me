// ====================================================================
// ANOTHER ME — SECTION 3: REAL TERMINAL SESSION MANAGER
// Provides authenticated, persistent terminal sessions for workspaces.
// Strictly captures real stdout, stderr, exit codes, execution duration,
// process-tree cancellation, and concurrency locks per session.
// Persists session history across server restarts.
// Enforces container sandbox requirements and fail-closed security policies.
// ====================================================================

import fs from 'fs'
import path from 'path'
import { workspaceManager } from './workspaceManager'
import { processExecutor, ProcessExecutionError } from './processExecutor'
import type {
  TerminalSession,
  TerminalCommandRecord,
  ProcessExecutionOptions,
} from './types'

export class TerminalManagerError extends Error {
  statusCode: number
  code: string

  constructor(message: string, statusCode: number = 400, code: string = 'TERMINAL_ERROR') {
    super(message)
    this.name = 'TerminalManagerError'
    this.statusCode = statusCode
    this.code = code
  }
}

/**
 * Splits a command line string into command name and arguments,
 * respecting basic quotes while remaining safe.
 */
function parseCommandLine(cmdStr: string): { command: string; args: string[] } {
  const trimmed = cmdStr.trim()
  if (!trimmed) {
    return { command: '', args: [] }
  }

  const parts: string[] = []
  let current = ''
  let inQuote: string | null = null

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i]
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null
      } else {
        current += char
      }
    } else if (char === '"' || char === "'") {
      inQuote = char
    } else if (/\s/.test(char)) {
      if (current.length > 0) {
        parts.push(current)
        current = ''
      }
    } else {
      current += char
    }
  }
  if (current.length > 0) {
    parts.push(current)
  }

  const command = parts[0] || ''
  const args = parts.slice(1)
  return { command, args }
}

export class TerminalSessionManager {
  // In-memory active session cache: key = `${userId}:${projectId}`
  private sessionCache = new Map<string, Map<string, TerminalSession>>()

  // Active command execution locks: key = `${userId}:${projectId}:${sessionId}` -> executionId
  private activeExecutionLocks = new Map<string, string>()

  /**
   * Resolves the on-disk terminal storage directory for a project.
   */
  private getStoragePaths(userId: string, projectId: string): {
    workspaceTerminalDir: string
    workspaceSessionsFile: string
    orchestratorSessionsFile: string
  } {
    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const workspaceTerminalDir = path.join(wsRoot, '.terminal')
    const workspaceSessionsFile = path.join(workspaceTerminalDir, 'sessions.json')

    const orchestratorDir = path.resolve(process.cwd(), 'storage', 'orchestrator', userId, projectId)
    const orchestratorSessionsFile = path.join(orchestratorDir, 'terminal_sessions.json')

    return {
      workspaceTerminalDir,
      workspaceSessionsFile,
      orchestratorSessionsFile,
    }
  }

  /**
   * Persists sessions to disk safely for a project.
   */
  private persistSessions(userId: string, projectId: string): void {
    const projectKey = `${userId}:${projectId}`
    const sessionsMap = this.sessionCache.get(projectKey)
    if (!sessionsMap) return

    const sessionsArray = Array.from(sessionsMap.values())
    const jsonStr = JSON.stringify(sessionsArray, null, 2)
    const { workspaceTerminalDir, workspaceSessionsFile, orchestratorSessionsFile } = this.getStoragePaths(
      userId,
      projectId
    )

    try {
      if (!fs.existsSync(workspaceTerminalDir)) {
        fs.mkdirSync(workspaceTerminalDir, { recursive: true })
      }
      fs.writeFileSync(workspaceSessionsFile, jsonStr, 'utf-8')
    } catch (e: any) {
      console.warn(`[terminalManager] Failed to write workspace terminal sessions: ${e.message}`)
    }

    try {
      const orchDir = path.dirname(orchestratorSessionsFile)
      if (!fs.existsSync(orchDir)) {
        fs.mkdirSync(orchDir, { recursive: true })
      }
      fs.writeFileSync(orchestratorSessionsFile, jsonStr, 'utf-8')
    } catch (e: any) {
      console.warn(`[terminalManager] Failed to write orchestrator terminal sessions: ${e.message}`)
    }
  }

  /**
   * Loads persisted sessions from disk into the cache.
   */
  private loadSessions(userId: string, projectId: string): Map<string, TerminalSession> {
    const projectKey = `${userId}:${projectId}`
    let sessionsMap = this.sessionCache.get(projectKey)

    if (sessionsMap) {
      return sessionsMap
    }

    sessionsMap = new Map<string, TerminalSession>()
    const { workspaceSessionsFile, orchestratorSessionsFile } = this.getStoragePaths(userId, projectId)

    let loaded = false
    for (const filePath of [workspaceSessionsFile, orchestratorSessionsFile]) {
      if (!loaded && fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8')
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            for (const s of parsed) {
              if (s && s.id) {
                // If the server restarted while a command was marked 'running', reset status to 'failed' or 'cancelled'
                if (s.commands) {
                  s.commands.forEach((c: TerminalCommandRecord) => {
                    if (c.status === 'running') {
                      c.status = 'failed'
                      c.exitCode = 1
                      c.stderr += '\n[Execution terminated due to server restart]'
                    }
                  })
                }
                s.activeExecutionId = null
                s.activeCommandId = null
                sessionsMap.set(s.id, s)
              }
            }
            loaded = true
          }
        } catch (e: any) {
          console.warn(`[terminalManager] Failed loading sessions from ${filePath}: ${e.message}`)
        }
      }
    }

    this.sessionCache.set(projectKey, sessionsMap)
    return sessionsMap
  }

  /**
   * Retrieves or creates a default terminal session for a project.
   */
  async getOrCreateDefaultSession(userId: string, projectId: string): Promise<TerminalSession> {
    const sessions = this.loadSessions(userId, projectId)
    let defaultSession = Array.from(sessions.values()).find((s) => s.name === 'Default Terminal' || s.id === 'default')

    if (!defaultSession) {
      defaultSession = await this.createSession(userId, projectId, 'Default Terminal', 'default')
    }

    return defaultSession
  }

  /**
   * Creates a new terminal session.
   */
  async createSession(
    userId: string,
    projectId: string,
    name: string = 'Terminal Session',
    preferredId?: string
  ): Promise<TerminalSession> {
    const sessions = this.loadSessions(userId, projectId)
    const sessionId = preferredId || `term_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`

    const now = new Date().toISOString()
    const session: TerminalSession = {
      id: sessionId,
      projectId,
      userId,
      name,
      createdAt: now,
      updatedAt: now,
      activeExecutionId: null,
      activeCommandId: null,
      commands: [],
    }

    sessions.set(sessionId, session)
    this.persistSessions(userId, projectId)
    return session
  }

  /**
   * Lists all terminal sessions for a project.
   */
  async listSessions(userId: string, projectId: string): Promise<TerminalSession[]> {
    const sessions = this.loadSessions(userId, projectId)
    if (sessions.size === 0) {
      await this.getOrCreateDefaultSession(userId, projectId)
    }
    return Array.from(sessions.values())
  }

  /**
   * Retrieves a specific session by ID.
   */
  async getSession(userId: string, projectId: string, sessionId: string): Promise<TerminalSession | null> {
    const sessions = this.loadSessions(userId, projectId)
    return sessions.get(sessionId) || null
  }

  /**
   * Executes a command in a terminal session with full tracking, output capture,
   * sandbox policy enforcement, cancellation, and concurrency locks.
   */
  async executeCommand(
    userId: string,
    projectId: string,
    sessionId: string,
    rawCommandLine: string,
    explicitArgs?: string[],
    options: ProcessExecutionOptions = {}
  ): Promise<TerminalCommandRecord> {
    const sessions = this.loadSessions(userId, projectId)
    const session = sessions.get(sessionId)

    if (!session) {
      throw new TerminalManagerError(`Terminal session "${sessionId}" not found.`, 404, 'SESSION_NOT_FOUND')
    }

    // 1. Concurrency control: prevent duplicate/overlapping commands in the same session
    const lockKey = `${userId}:${projectId}:${sessionId}`
    if (this.activeExecutionLocks.has(lockKey) || session.activeExecutionId) {
      throw new TerminalManagerError(
        `A command is already currently executing in session "${sessionId}". Wait for completion or cancel it.`,
        409,
        'CONCURRENT_COMMAND_IN_SESSION'
      )
    }

    // 2. Parse command line
    const { command: parsedCmd, args: parsedArgs } = parseCommandLine(rawCommandLine)
    const baseCommand = parsedCmd
    const commandArgs = explicitArgs && explicitArgs.length > 0 ? explicitArgs : parsedArgs

    if (!baseCommand) {
      throw new TerminalManagerError('Command line cannot be empty.', 400, 'EMPTY_COMMAND')
    }

    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    const executionId = `exec_${Date.now()}_${commandId}`
    const startTime = Date.now()
    const startedAt = new Date().toISOString()

    // Create preliminary running record
    const record: TerminalCommandRecord = {
      id: commandId,
      sessionId,
      command: baseCommand,
      args: commandArgs,
      rawCommandString: rawCommandLine.trim(),
      cwd: options.cwd || '.',
      exitCode: null,
      stdout: '',
      stderr: '',
      durationMs: 0,
      status: 'running',
      startedAt,
      sandboxTier: 'restricted_process_fallback',
    }

    // Set concurrency lock
    this.activeExecutionLocks.set(lockKey, executionId)
    session.activeExecutionId = executionId
    session.activeCommandId = commandId
    session.commands.push(record)
    session.updatedAt = startedAt
    this.persistSessions(userId, projectId)

    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)

    try {
      // Execute via controlled process executor
      const execResult = await processExecutor.executeCommand(
        wsRoot,
        baseCommand,
        commandArgs,
        options,
        executionId
      )

      record.exitCode = execResult.exitCode
      record.stdout = execResult.stdout
      record.stderr = execResult.stderr
      record.durationMs = execResult.durationMs
      record.sandboxTier = execResult.sandboxTier
      record.infrastructureNotice = execResult.infrastructureNotice
      record.finishedAt = new Date().toISOString()

      if (execResult.timedOut) {
        record.status = 'timed_out'
      } else if (execResult.cancelled || record.status === 'cancelled') {
        record.status = 'cancelled'
        record.exitCode = 130
      } else if (execResult.exitCode === 0) {
        record.status = 'succeeded'
      } else {
        record.status = 'failed'
      }
    } catch (err: any) {
      record.durationMs = Date.now() - startTime
      record.finishedAt = new Date().toISOString()

      // Handle fail-closed sandbox restrictions transparently
      const isSandboxRestriction =
        err instanceof ProcessExecutionError &&
        (err.code === 'CONTAINER_UNAVAILABLE_COMMAND_BLOCKED' ||
          err.code === 'FORBIDDEN_COMMAND' ||
          err.code === 'PACKAGE_SCRIPTS_RESTRICTED' ||
          err.code === 'PACKAGE_INSTALL_RESTRICTED' ||
          err.code === 'ARBITRARY_EXECUTION_BLOCKED' ||
          err.code === 'ARBITRARY_NPX_BLOCKED' ||
          err.code === 'SHELL_INJECTION_DETECTED' ||
          err.code === 'DANGEROUS_FLAG_BLOCKED' ||
          err.code === 'UNAUTHORIZED_SCRIPT_EVALUATION' ||
          err.code === 'PATH_TRAVERSAL_DETECTED')

      if (isSandboxRestriction) {
        record.status = 'blocked_sandbox_required'
        record.exitCode = 126 // Standard command invocation restriction code
        record.stderr = `[SECURITY GATE BLOCKED]: ${err.message}`
        record.blockedReason = err.message
      } else {
        record.status = 'failed'
        record.exitCode = 1
        record.stderr = err.message
      }
    } finally {
      // Release concurrency lock
      this.activeExecutionLocks.delete(lockKey)
      session.activeExecutionId = null
      session.activeCommandId = null
      session.updatedAt = new Date().toISOString()
      this.persistSessions(userId, projectId)
    }

    return record
  }

  /**
   * Cancels a currently executing command in a session.
   */
  async cancelCommand(
    userId: string,
    projectId: string,
    sessionId: string,
    commandId?: string
  ): Promise<{ success: boolean; cancelled: boolean }> {
    const sessions = this.loadSessions(userId, projectId)
    const session = sessions.get(sessionId)

    if (!session) {
      throw new TerminalManagerError(`Terminal session "${sessionId}" not found.`, 404, 'SESSION_NOT_FOUND')
    }

    const lockKey = `${userId}:${projectId}:${sessionId}`
    const activeExecId = this.activeExecutionLocks.get(lockKey) || session.activeExecutionId

    if (!activeExecId) {
      return { success: true, cancelled: false }
    }

    processExecutor.cancelProcess(activeExecId)

    // Mark command record as cancelled
    const cmdRecord = session.commands.find(
      (c) => (commandId && c.id === commandId) || c.status === 'running'
    )
    if (cmdRecord) {
      cmdRecord.status = 'cancelled'
      cmdRecord.exitCode = 130
      cmdRecord.stderr += (cmdRecord.stderr ? '\n' : '') + '[Process cancelled by user signal]'
      cmdRecord.finishedAt = new Date().toISOString()
    }

    this.activeExecutionLocks.delete(lockKey)
    session.activeExecutionId = null
    session.activeCommandId = null
    session.updatedAt = new Date().toISOString()
    this.persistSessions(userId, projectId)

    return { success: true, cancelled: true }
  }

  /**
   * Retrieves command history across all sessions or for a specific session.
   */
  async getCommandHistory(
    userId: string,
    projectId: string,
    sessionId?: string
  ): Promise<TerminalCommandRecord[]> {
    const sessions = this.loadSessions(userId, projectId)

    if (sessionId) {
      const session = sessions.get(sessionId)
      return session ? [...session.commands] : []
    }

    const allCommands: TerminalCommandRecord[] = []
    for (const session of sessions.values()) {
      allCommands.push(...session.commands)
    }
    // Sort chronologically by startedAt
    return allCommands.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
  }

  /**
   * Clears session command history safely.
   */
  async clearSessionHistory(userId: string, projectId: string, sessionId: string): Promise<boolean> {
    const sessions = this.loadSessions(userId, projectId)
    const session = sessions.get(sessionId)
    if (!session) return false

    session.commands = []
    session.updatedAt = new Date().toISOString()
    this.persistSessions(userId, projectId)
    return true
  }
}

export const terminalManager = new TerminalSessionManager()
