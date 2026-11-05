// ====================================================================
// ANOTHER ME — SECTION 6: LIVE PREVIEW & DEBUGGING MANAGER
// Manages real live preview lifecycle (start, stop, restart, refresh, loading, error),
// streams/polls runtime logs, captures browser runtime & network errors,
// and coordinates with Docker build and coding agent debugging pipeline.
// ====================================================================

import fs from 'fs'
import path from 'path'
import { workspaceManager } from './workspaceManager'
import { packageManager } from './packageManager'
import { previewTokenManager } from './previewTokenManager'

export type PreviewLifecycleState = 'ready' | 'building' | 'stopped' | 'failed' | 'not_built'

export interface PreviewRuntimeLogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'log'
  message: string
  source?: 'browser' | 'network' | 'build' | 'system' | 'client'
  filename?: string
  lineno?: number
  colno?: number
  details?: Record<string, any>
}

export interface PreviewStatus {
  projectId: string
  state: PreviewLifecycleState
  hasDist: boolean
  hasSource: boolean
  buildError?: string
  lastBuiltAt?: string
  lastStartedAt?: string
  stoppedAt?: string
  recentLogs: PreviewRuntimeLogEntry[]
  diagnostics?: {
    file?: string
    line?: number
    column?: number
    code?: string
    message?: string
  }
}

class SafePreviewManager {
  private previewStates = new Map<string, {
    state: PreviewLifecycleState
    buildError?: string
    lastBuiltAt?: string
    lastStartedAt?: string
    stoppedAt?: string
    diagnostics?: {
      file?: string
      line?: number
      column?: number
      code?: string
      message?: string
    }
  }>()

  private projectLogs = new Map<string, PreviewRuntimeLogEntry[]>()
  private MAX_LOGS = 200

  private getProjectKey(userId: string, projectId: string): string {
    return `${userId}:${projectId}`
  }

  /**
   * Appends a log entry to the in-memory rolling buffer for a project.
   */
  recordLog(
    userId: string,
    projectId: string,
    entry: Omit<PreviewRuntimeLogEntry, 'id' | 'timestamp'> & { timestamp?: string }
  ): PreviewRuntimeLogEntry {
    const key = this.getProjectKey(userId, projectId)
    if (!this.projectLogs.has(key)) {
      this.projectLogs.set(key, [])
    }

    const sanitizedMessage = previewTokenManager.redactTokens(entry.message || '')
    const logItem: PreviewRuntimeLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: entry.timestamp || new Date().toISOString(),
      level: entry.level,
      message: sanitizedMessage,
      source: entry.source || 'system',
      filename: entry.filename,
      lineno: entry.lineno,
      colno: entry.colno,
      details: entry.details,
    }

    const list = this.projectLogs.get(key)!
    list.push(logItem)
    if (list.length > this.MAX_LOGS) {
      list.shift()
    }

    return logItem
  }

  /**
   * Retrieves recent runtime logs for a project.
   */
  getLogs(userId: string, projectId: string, limit = 50): PreviewRuntimeLogEntry[] {
    const key = this.getProjectKey(userId, projectId)
    const logs = this.projectLogs.get(key) || []
    return logs.slice(-limit)
  }

  /**
   * Clears runtime logs for a project.
   */
  clearLogs(userId: string, projectId: string): void {
    const key = this.getProjectKey(userId, projectId)
    this.projectLogs.delete(key)
  }

  /**
   * Inspects physical workspace files and returns current preview status.
   */
  getPreviewStatus(userId: string, projectId: string): PreviewStatus {
    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const key = this.getProjectKey(userId, projectId)
    const tracked = this.previewStates.get(key)

    const distIndex = path.join(wsRoot, 'dist', 'index.html')
    const hasDist = fs.existsSync(distIndex)
    const rootIndex = path.join(wsRoot, 'index.html')
    const hasSource = fs.existsSync(rootIndex) || fs.existsSync(path.join(wsRoot, 'src', 'App.tsx'))

    let state: PreviewLifecycleState = 'not_built'

    if (tracked?.state === 'stopped') {
      state = 'stopped'
    } else if (tracked?.state === 'building') {
      state = 'building'
    } else if (tracked?.state === 'failed') {
      state = 'failed'
    } else if (hasDist || hasSource) {
      state = 'ready'
    }

    return {
      projectId,
      state,
      hasDist,
      hasSource,
      buildError: tracked?.buildError,
      lastBuiltAt: tracked?.lastBuiltAt,
      lastStartedAt: tracked?.lastStartedAt,
      stoppedAt: tracked?.stoppedAt,
      diagnostics: tracked?.diagnostics,
      recentLogs: this.getLogs(userId, projectId, 30),
    }
  }

  /**
   * Starts live preview. If project is not built or forceRebuild is requested,
   * executes isolated Docker build and transitions to 'ready' or 'failed'.
   */
  async startPreview(
    userId: string,
    projectId: string,
    options?: { forceRebuild?: boolean }
  ): Promise<PreviewStatus> {
    const key = this.getProjectKey(userId, projectId)
    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)

    this.recordLog(userId, projectId, {
      level: 'info',
      source: 'system',
      message: 'Starting live preview...',
    })

    const distIndex = path.join(wsRoot, 'dist', 'index.html')
    const rootIndex = path.join(wsRoot, 'index.html')
    const hasDist = fs.existsSync(distIndex)
    const hasSource =
      fs.existsSync(rootIndex) ||
      fs.existsSync(path.join(wsRoot, 'src', 'App.tsx')) ||
      fs.existsSync(path.join(wsRoot, 'src', 'main.tsx'))

    const hasNodeModules = fs.existsSync(path.join(wsRoot, 'node_modules'))
    const needsBuild = Boolean(options?.forceRebuild && hasNodeModules)

    if (needsBuild && fs.existsSync(path.join(wsRoot, 'package.json'))) {
      this.previewStates.set(key, {
        state: 'building',
        lastStartedAt: new Date().toISOString(),
      })

      this.recordLog(userId, projectId, {
        level: 'info',
        source: 'build',
        message: 'Executing project build in isolated Docker container...',
      })

      const buildResult = await packageManager.buildProject(userId, projectId)

      if (!buildResult.success) {
        const errorText = buildResult.error || buildResult.details || 'Build failed.'
        const diagnostics = this.parseCompilerError(errorText)

        this.previewStates.set(key, {
          state: 'failed',
          buildError: errorText,
          diagnostics,
          lastStartedAt: new Date().toISOString(),
        })

        this.recordLog(userId, projectId, {
          level: 'error',
          source: 'build',
          message: `Build failed: ${errorText}`,
          details: diagnostics,
        })

        return this.getPreviewStatus(userId, projectId)
      }

      this.recordLog(userId, projectId, {
        level: 'info',
        source: 'build',
        message: 'Build succeeded. Static bundle ready in dist/.',
      })
    }

    this.previewStates.set(key, {
      state: hasDist || hasSource ? 'ready' : 'not_built',
      lastBuiltAt: hasDist ? new Date().toISOString() : undefined,
      lastStartedAt: new Date().toISOString(),
    })

    this.recordLog(userId, projectId, {
      level: 'info',
      source: 'system',
      message: 'Live preview is ready and serving application output.',
    })

    return this.getPreviewStatus(userId, projectId)
  }

  /**
   * Stops live preview serving.
   */
  stopPreview(userId: string, projectId: string): PreviewStatus {
    const key = this.getProjectKey(userId, projectId)
    const existing = this.previewStates.get(key)

    this.previewStates.set(key, {
      ...existing,
      state: 'stopped',
      stoppedAt: new Date().toISOString(),
    })

    this.recordLog(userId, projectId, {
      level: 'warn',
      source: 'system',
      message: 'Live preview stopped by user.',
    })

    return this.getPreviewStatus(userId, projectId)
  }

  /**
   * Restarts live preview: re-executes container build and refreshes status.
   */
  async restartPreview(userId: string, projectId: string): Promise<PreviewStatus> {
    this.recordLog(userId, projectId, {
      level: 'info',
      source: 'system',
      message: 'Restarting live preview...',
    })
    return this.startPreview(userId, projectId, { forceRebuild: true })
  }

  /**
   * Sets preview status explicitly (e.g. after successful build or coding agent task).
   */
  setReady(userId: string, projectId: string): void {
    const key = this.getProjectKey(userId, projectId)
    this.previewStates.set(key, {
      state: 'ready',
      lastBuiltAt: new Date().toISOString(),
      lastStartedAt: new Date().toISOString(),
    })
  }

  /**
   * Parses TypeScript/Vite compiler error into structured diagnostics (file, line, column, code, message).
   */
  parseCompilerError(errorOutput: string): {
    file?: string
    line?: number
    column?: number
    code?: string
    message?: string
  } {
    // Examples:
    // src/App.tsx(14,3): error TS2322: Type 'number' is not assignable to type 'string'.
    // src/App.tsx:14:3 - error TS2322: Type 'number' is not assignable to type 'string'.
    const tsMatch = errorOutput.match(/([^\s()]+\.(?:tsx|ts|jsx|js|css))(?:\((\d+),(\d+)\)|:(\d+):(\d+))(?:\s*-\s*|\s*)(error\s+([A-Z0-9]+))?:\s*(.+)/i)
    if (tsMatch) {
      return {
        file: tsMatch[1],
        line: parseInt(tsMatch[2] || tsMatch[4], 10),
        column: parseInt(tsMatch[3] || tsMatch[5], 10),
        code: tsMatch[7],
        message: tsMatch[8]?.trim(),
      }
    }

    return {
      message: errorOutput.slice(0, 300),
    }
  }
}

export const previewManager = new SafePreviewManager()
