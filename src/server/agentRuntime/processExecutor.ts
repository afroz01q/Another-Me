// ====================================================================
// ANOTHER ME — SECTION 2.1: CONTROLLED PROCESS EXECUTION ENGINE
// Safely executes build, test, and verification commands.
// Prefers isolated container runtime (Docker); falls back to strictly
// restricted process execution with fail-closed command policies,
// credential scrubbing, directory confinement, and process-tree termination.
// Records actual command, exit code, duration, stdout, and stderr.
// Never fabricates terminal output or claims equivalent container security.
// ====================================================================

import { spawn, spawnSync, execSync, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { workspaceManager } from './workspaceManager'
import type { ProcessExecutionOptions, ProcessExecutionResult } from './types'

const DEFAULT_TIMEOUT_MS = 60000 // 60 seconds
const MAX_OUTPUT_BUFFER_BYTES = 512 * 1024 // 512 KB

// Permitted command base names in restricted process fallback mode
const ALLOWED_SAFE_COMMANDS = new Set([
  'node',
  'npm',
  'npx',
  'tsc',
])

// Explicitly forbidden commands and shells in fallback mode
const DISALLOWED_COMMANDS = new Set([
  'bash',
  'sh',
  'zsh',
  'csh',
  'cmd',
  'powershell',
  'pwsh',
  'python',
  'python3',
  'perl',
  'ruby',
  'sudo',
  'su',
  'chmod',
  'chown',
  'rmdir',
  'format',
  'diskpart',
  'reg',
  'regedit',
  'net',
  'netsh',
  'shutdown',
  'reboot',
  'curl',
  'wget',
  'nc',
  'ncat',
  'telnet',
  'ssh',
  'scp',
  'sftp',
  'ftp',
])

export class ProcessExecutionError extends Error {
  statusCode: number
  code: string

  constructor(message: string, statusCode: number = 400, code: string = 'PROCESS_EXECUTION_FAILED') {
    super(message)
    this.name = 'ProcessExecutionError'
    this.statusCode = statusCode
    this.code = code
  }
}

/**
 * Checks if Docker container engine is available on the host.
 */
let cachedDockerAvailability: boolean | null = null

export function isDockerAvailable(forceFresh = false): boolean {
  if (!forceFresh && cachedDockerAvailability !== null) {
    return cachedDockerAvailability
  }
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 4000 })
    cachedDockerAvailability = true
  } catch {
    cachedDockerAvailability = false
  }
  return cachedDockerAvailability
}

let cachedDockerPath: string | null = null

export function getDockerPath(): string {
  if (cachedDockerPath) return cachedDockerPath
  if (process.platform === 'win32') {
    try {
      const out = execSync('where.exe docker.exe', { timeout: 3000 }).toString().trim().split(/\r?\n/)[0]
      if (out && fs.existsSync(out)) {
        cachedDockerPath = out
        return cachedDockerPath
      }
    } catch {}
    cachedDockerPath = 'docker.exe'
    return cachedDockerPath
  }
  cachedDockerPath = 'docker'
  return cachedDockerPath
}

/**
 * Kills an entire process tree reliably across operating systems.
 */
export function killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!pid) return

  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        timeout: 5000,
      })
    } catch {
      try {
        process.kill(pid, signal)
      } catch {}
    }
  } else {
    try {
      // Negative PID kills the entire process group
      process.kill(-pid, signal)
    } catch {
      try {
        process.kill(pid, signal)
      } catch {}
    }
  }
}

/**
 * Creates a sanitized environment stripped of all host secrets and credentials.
 */
function createSanitizedEnv(customEnv?: Record<string, string>): Record<string, string> {
  const safeEnv: Record<string, string> = {
    NODE_ENV: 'development',
    CI: 'true',
    NPM_CONFIG_YES: 'true',
  }

  // Whitelist standard system runtime environment variables
  const allowedKeys = [
    'PATH',
    'Path',
    'PATHEXT',
    'TEMP',
    'TMP',
    'SYSTEMROOT',
    'SystemRoot',
    'WINDIR',
    'windir',
    'APPDATA',
    'LOCALAPPDATA',
    'USERPROFILE',
    'HOME',
    'HOMEPATH',
    'HOMEDRIVE',
    'ComSpec',
    'COMSPEC',
  ]

  for (const key of allowedKeys) {
    if (process.env[key]) {
      safeEnv[key] = process.env[key]!
    }
  }

  // Explicitly delete any sensitive server variables
  const forbiddenSubstrings = [
    'KEY',
    'SECRET',
    'TOKEN',
    'PASSWORD',
    'AUTH',
    'SUPABASE',
    'OPENROUTER',
    'OPENAI',
    'AWS',
    'DATABASE',
    'POSTGRES',
    'GEMINI',
    'ANTIGRAVITY',
  ]

  Object.keys(safeEnv).forEach((k) => {
    const upper = k.toUpperCase()
    if (forbiddenSubstrings.some((f) => upper.includes(f))) {
      delete safeEnv[k]
    }
  })

  // Merge any caller-specified custom environment
  if (customEnv) {
    Object.assign(safeEnv, customEnv)
  }

  return safeEnv
}

export class ControlledProcessExecutor {
  private activeProcesses = new Map<string, ChildProcess>()
  private cancelledExecutions = new Set<string>()

  /**
   * Executes a command with container isolation (Docker) or hardened process fallback.
   */
  async executeCommand(
    workspaceRoot: string,
    command: string,
    args: string[] = [],
    options: ProcessExecutionOptions = {},
    executionId?: string
  ): Promise<ProcessExecutionResult> {
    const rawCmd = command.trim()
    if (!rawCmd) {
      throw new ProcessExecutionError('Command cannot be empty.', 400, 'EMPTY_COMMAND')
    }

    const baseCmd = path.basename(rawCmd).toLowerCase().replace(/\.exe$|\.cmd$|\.bat$/, '')
    const dockerAvailable = isDockerAvailable()

    // 1. Fail-closed policy for arbitrary commands if container isolation is unavailable
    if (DISALLOWED_COMMANDS.has(baseCmd)) {
      throw new ProcessExecutionError(
        `Execution forbidden: Shell or administrative utility "${baseCmd}" is restricted for security.`,
        403,
        'FORBIDDEN_COMMAND'
      )
    }

    if (!dockerAvailable) {
      if (!ALLOWED_SAFE_COMMANDS.has(baseCmd)) {
        throw new ProcessExecutionError(
          `Execution blocked (fail-closed): Arbitrary command "${baseCmd}" is rejected because secure container isolation (Docker) is unavailable on this host. Only vetted development commands (${Array.from(ALLOWED_SAFE_COMMANDS).join(', ')}) are permitted in fallback mode.`,
          403,
          'CONTAINER_UNAVAILABLE_COMMAND_BLOCKED'
        )
      }
    }

    // Enforce strict command-specific argument and operation policies (node/tsc dangerous flags blocked everywhere; npm/npx execution restricted on host)
    this.validateHostFallbackPolicy(baseCmd, args, workspaceRoot, options.allowNpmLifecycle, dockerAvailable)

    // 2. Verify working directory is contained within workspaceRoot
    const targetCwd = options.cwd
      ? workspaceManager.resolveAndValidatePath(workspaceRoot, options.cwd)
      : workspaceRoot

    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
    const maxBuffer = options.maxBufferBytes || MAX_OUTPUT_BUFFER_BYTES
    const sanitizedEnv = createSanitizedEnv(options.env)

    const startTime = Date.now()

    // 3. Containerized execution if Docker is available
    if (dockerAvailable) {
      return this.executeInDocker(workspaceRoot, targetCwd, rawCmd, args, options, executionId, startTime, timeoutMs, maxBuffer)
    }

    // 4. Hardened process execution fallback
    return this.executeInRestrictedProcess(targetCwd, rawCmd, baseCmd, args, options, executionId, startTime, timeoutMs, maxBuffer, sanitizedEnv)
  }

  /**
   * Enforces strict command-specific argument and operation policy in host fallback mode.
   * Treats no executable as an unrestricted sandbox.
   */
  public validateHostFallbackPolicy(
    baseCmd: string,
    args: string[],
    workspaceRoot: string,
    allowNpmLifecycle?: boolean,
    isContainerIsolated?: boolean
  ): void {
    // 1. Shell injection & metacharacter protection on batch script wrappers (.cmd on Windows)
    if (baseCmd === 'npm' || baseCmd === 'npx') {
      for (const arg of args) {
        if (/[&|;`$><\r\n%]/.test(arg)) {
          throw new ProcessExecutionError(
            `Execution blocked: Shell metacharacters or command chaining prohibited in argument "${arg}".`,
            403,
            'SHELL_INJECTION_DETECTED'
          )
        }
      }
    }

    // 2. Strict policy for npm
    if (baseCmd === 'npm') {
      const subCmd = args[0]?.toLowerCase()

      // Package installation runs untrusted lifecycle hooks (preinstall/install/postinstall)
      const isContainerWithIgnoreScripts = isContainerIsolated && args.includes('--ignore-scripts')
      if (!allowNpmLifecycle && !isContainerWithIgnoreScripts && ['install', 'i', 'add', 'ci', 'update', 'link'].includes(subCmd)) {
        throw new ProcessExecutionError(
          `Execution blocked: "npm ${subCmd}" is prohibited on the host because lifecycle scripts execute untrusted code. Container isolation is required.`,
          403,
          'PACKAGE_INSTALL_RESTRICTED'
        )
      }

      // Custom package scripts run arbitrary shell commands defined in untrusted package.json
      if (!allowNpmLifecycle && ['run', 'run-script', 'test', 'start', 'stop', 'restart', 'build'].includes(subCmd)) {
        throw new ProcessExecutionError(
          `Execution blocked: "npm ${subCmd}" is prohibited on the host because package scripts execute arbitrary shell commands from untrusted package.json. Container isolation is required.`,
          403,
          'PACKAGE_SCRIPTS_RESTRICTED'
        )
      }

      // Arbitrary package execution via npm
      if (subCmd === 'exec') {
        throw new ProcessExecutionError(
          `Execution blocked: "npm exec" is prohibited on the host. Container isolation is required.`,
          403,
          'ARBITRARY_EXECUTION_BLOCKED'
        )
      }

      // Only allow safe informational/version commands
      const allowedNpmSubcommands = new Set(['-v', '--version', 'version', 'view', 'ls', 'list'])
      if (!allowNpmLifecycle && !isContainerWithIgnoreScripts && !allowedNpmSubcommands.has(subCmd) && !args.every((a) => a === '-v' || a === '--version')) {
        throw new ProcessExecutionError(
          `Execution blocked: "npm ${args.join(' ')}" is not permitted in fallback mode. Only safe inspection commands (npm -v, npm view) are allowed on the host.`,
          403,
          'HOST_FALLBACK_UNSAFE_OPERATION'
        )
      }
    }

    // 3. Strict policy for npx
    if (baseCmd === 'npx') {
      // Only allow local compiler type-checking without package downloads (npx tsc --noEmit)
      const isLocalTscTypecheck = args.includes('tsc') && (args.includes('--noEmit') || args.includes('-v') || args.includes('--version'))
      const isVersionCheck = args.length === 1 && (args[0] === '-v' || args[0] === '--version')

      if (!isLocalTscTypecheck && !isVersionCheck) {
        throw new ProcessExecutionError(
          `Execution blocked (fail-closed): Arbitrary npx package execution ("npx ${args[0] || ''}") is prohibited on the host without container isolation.`,
          403,
          'ARBITRARY_NPX_BLOCKED'
        )
      }
    }

    // 4. Strict policy for tsc
    if (baseCmd === 'tsc') {
      const hasPluginFlag = args.some((a) => a.startsWith('--plugins') || a.startsWith('--customTransformers'))
      if (hasPluginFlag) {
        throw new ProcessExecutionError(
          `Execution blocked: TypeScript compiler plugin/transformer flags are prohibited in fallback mode.`,
          403,
          'DANGEROUS_FLAG_BLOCKED'
        )
      }

      // If project path is supplied, verify it resolves strictly within workspaceRoot
      for (let i = 0; i < args.length; i++) {
        if ((args[i] === '-p' || args[i] === '--project') && args[i + 1]) {
          workspaceManager.resolveAndValidatePath(workspaceRoot, args[i + 1])
        }
      }
    }

    // 5. Strict policy for node
    if (baseCmd === 'node') {
      const dangerousNodeFlags = [
        '--inspect',
        '--inspect-brk',
        '--inspect-port',
        '--loader',
        '--experimental-loader',
        '--require',
        '-r',
        '--import',
        '--experimental-vm-modules',
        '--eval-as-script',
      ]

      for (const flag of dangerousNodeFlags) {
        if (args.some((a) => a === flag || a.startsWith(flag + '=') || a.startsWith(flag))) {
          throw new ProcessExecutionError(
            `Execution blocked: Dangerous Node.js flag "${flag}" is prohibited in fallback mode.`,
            403,
            'DANGEROUS_FLAG_BLOCKED'
          )
        }
      }

      // Inspect script paths and inline evaluations
      for (let i = 0; i < args.length; i++) {
        const arg = args[i]

        if (arg === '-e' || arg === '--eval' || arg === '-p' || arg === '--print') {
          const evalCode = args[i + 1] || ''
          i++ // Advance index so eval code is not inspected as a script path in next iteration

          // Reject attempts to access parent directories, external workspaces, or breakout shells
          const forbiddenEvalPatterns = [
            /\.\.[\/\\]/, // Path traversal out of workspace
            /storage[\/\\](orchestrator|workspaces)/, // Cross-tenant directory traversal
            /(?:['"`]|[\/\\])\.env(?:\.[a-zA-Z0-9]+)?\b/, // .env file access / reading
            /require\(['"`]dotenv['"`]\)/i, // dotenv loading host env
            /child_process.*(exec|execSync|spawn|spawnSync).*['"`](bash|sh|cmd|powershell|curl|wget|nc|python)/i, // Shell breakout
            /\bnet\.(connect|createConnection)|require\(['"`]net['"`]\)/i, // Unauthorized socket connections
            /\b(http|https)\.(request|get)|require\(['"`](http|https)['"`]\)/i, // Unauthorized HTTP requests
          ]

          for (const pattern of forbiddenEvalPatterns) {
            if (pattern.test(evalCode)) {
              throw new ProcessExecutionError(
                `Execution blocked: Inline JavaScript contains prohibited host-access pattern (${pattern}).`,
                403,
                'UNAUTHORIZED_SCRIPT_EVALUATION'
              )
            }
          }
        } else if (!arg.startsWith('-')) {
          // If argument is a script file (e.g. node ./script.js or node C:\...)
          // Validate that it resolves strictly within workspaceRoot
          try {
            workspaceManager.resolveAndValidatePath(workspaceRoot, arg)
          } catch (e: any) {
            throw new ProcessExecutionError(
              `Execution blocked: Script path "${arg}" escapes workspace root (${e.message}).`,
              403,
              'PATH_TRAVERSAL_DETECTED'
            )
          }
        }
      }
    }
  }

  /**
   * Ephemeral container execution via Docker.
   */
  private async executeInDocker(
    workspaceRoot: string,
    targetCwd: string,
    command: string,
    args: string[],
    options: ProcessExecutionOptions,
    executionId: string | undefined,
    startTime: number,
    timeoutMs: number,
    maxBuffer: number
  ): Promise<ProcessExecutionResult> {
    const relCwd = path.relative(workspaceRoot, targetCwd).replace(/\\/g, '/')
    const containerWorkdir = relCwd ? `/workspace/${relCwd}` : '/workspace'

    const networkMode = options.network || 'none'
    const sanitizedId = (executionId || `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`).replace(/[^a-zA-Z0-9_.-]/g, '_')
    const containerName = `anotherme_${sanitizedId}`

    const dockerArgs = [
      'run',
      '--name', containerName,
      '--rm',
      '-i',
      '--network', networkMode,
      '--user', '1000:1000',
      '--security-opt', 'no-new-privileges',
      '--cap-drop', 'ALL',
      '--read-only',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
      '--tmpfs', '/home/node:rw,exec,nosuid,uid=1000,gid=1000,size=128m',
      '--cpus=1.0',
      '-m', '512m',
      '--pids-limit', '64',
      '--add-host', 'host.docker.internal:127.0.0.1',
      '--add-host', 'metadata.google.internal:127.0.0.1',
      '--add-host', 'instance-data:127.0.0.1',
      ...(networkMode !== 'none' ? ['--dns', '1.1.1.1', '--dns', '8.8.8.8'] : []),
      '-v', `${path.resolve(workspaceRoot)}:/workspace:rw`,
      '-w', containerWorkdir,
      '-e', 'PATH=/workspace/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      '-e', 'HOME=/home/node',
      '-e', 'npm_config_cache=/workspace/.npm-cache',
    ]

    if (options.env) {
      const sanitized = createSanitizedEnv(options.env)
      for (const [k, v] of Object.entries(sanitized)) {
        if (!['PATH', 'HOME'].includes(k)) {
          dockerArgs.push('-e', `${k}=${v}`)
        }
      }
    }

    dockerArgs.push('node:20-alpine', command, ...args)

    return this.spawnAndCollect(
      getDockerPath(),
      dockerArgs,
      workspaceRoot,
      process.env as Record<string, string>,
      command,
      args,
      options,
      executionId,
      startTime,
      timeoutMs,
      maxBuffer,
      'container_isolated',
      'Executed inside ephemeral Docker container with non-root user, disabled networking, dropped capabilities, and resource limits.',
      containerName
    )
  }

  /**
   * Fallback execution in host-level restricted child process.
   */
  private async executeInRestrictedProcess(
    targetCwd: string,
    rawCmd: string,
    baseCmd: string,
    args: string[],
    options: ProcessExecutionOptions,
    executionId: string | undefined,
    startTime: number,
    timeoutMs: number,
    maxBuffer: number,
    sanitizedEnv: Record<string, string>
  ): Promise<ProcessExecutionResult> {
    // Resolve Windows executable names if needed
    let executable = rawCmd
    if (process.platform === 'win32') {
      if (baseCmd === 'npm') executable = 'npm.cmd'
      else if (baseCmd === 'npx') executable = 'npx.cmd'
      else if (baseCmd === 'tsc') executable = 'tsc.cmd'
    }

    const infrastructureNotice =
      'Container isolation engine (Docker daemon) is unavailable on this host. Arbitrary shell execution is rejected (fail-closed). Execution is strictly restricted to safe project-local commands with credentials scrubbed, working directory confined, and process-tree termination. A Node child process does NOT constitute a full kernel or container sandbox boundary.'

    return this.spawnAndCollect(
      executable,
      args,
      targetCwd,
      sanitizedEnv,
      rawCmd,
      args,
      options,
      executionId,
      startTime,
      timeoutMs,
      maxBuffer,
      'restricted_process_fallback',
      infrastructureNotice
    )
  }

  /**
   * Shared process spawner with output streaming, timeout, and process-tree termination.
   */
  private spawnAndCollect(
    executable: string,
    spawnArgs: string[],
    cwd: string,
    env: Record<string, string>,
    originalCmd: string,
    originalArgs: string[],
    options: ProcessExecutionOptions,
    executionId: string | undefined,
    startTime: number,
    timeoutMs: number,
    maxBuffer: number,
    sandboxTier: 'container_isolated' | 'restricted_process_fallback',
    infrastructureNotice: string,
    dockerContainerName?: string
  ): Promise<ProcessExecutionResult> {
    return new Promise<ProcessExecutionResult>((resolve) => {
      let stdoutBuffer = ''
      let stderrBuffer = ''
      let timedOut = false
      let cancelled = false

      let child: ChildProcess
      try {
        const useShellOnWindows = process.platform === 'win32' && (executable.endsWith('.cmd') || executable.endsWith('.bat'))
        child = spawn(executable, spawnArgs, {
          cwd,
          env,
          shell: useShellOnWindows,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
        })

        // Close stdin immediately to prevent hangs on interactive prompts
        try {
          child.stdin?.end()
        } catch {}
      } catch (err: any) {
        return resolve({
          command: `${originalCmd} ${originalArgs.join(' ')}`.trim(),
          args: originalArgs,
          exitCode: 1,
          stdout: '',
          stderr: `Failed to spawn process: ${err.message}`,
          durationMs: Date.now() - startTime,
          timedOut: false,
          cancelled: false,
          sandboxTier,
          infrastructureNotice,
        })
      }

      const procKey = executionId || `proc_${Date.now()}_${child.pid}`
      this.activeProcesses.set(procKey, child)

      // Timeout handler with process-tree termination
      const timeoutTimer = setTimeout(() => {
        timedOut = true
        if (dockerContainerName) {
          try {
            spawnSync(getDockerPath(), ['rm', '-f', dockerContainerName], { stdio: 'ignore', timeout: 5000 })
          } catch {}
        }
        if (child.pid) {
          killProcessTree(child.pid, 'SIGTERM')
          setTimeout(() => {
            if (child.pid && !child.killed) killProcessTree(child.pid, 'SIGKILL')
          }, 2000)
        }
      }, timeoutMs)

      // AbortSignal cancellation handler with process-tree termination
      if (options.abortSignal) {
        options.abortSignal.addEventListener('abort', () => {
          cancelled = true
          if (dockerContainerName) {
            try {
              spawnSync(getDockerPath(), ['rm', '-f', dockerContainerName], { stdio: 'ignore', timeout: 5000 })
            } catch {}
          }
          if (child.pid) {
            killProcessTree(child.pid, 'SIGTERM')
          }
        })
      }

      // Stream stdout with byte cap
      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdoutBuffer.length < maxBuffer) {
          stdoutBuffer += chunk.toString('utf-8')
          if (stdoutBuffer.length >= maxBuffer) {
            stdoutBuffer += '\n... [STDOUT TRUNCATED: Max buffer limit reached]'
          }
        }
      })

      // Stream stderr with byte cap
      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderrBuffer.length < maxBuffer) {
          stderrBuffer += chunk.toString('utf-8')
          if (stderrBuffer.length >= maxBuffer) {
            stderrBuffer += '\n... [STDERR TRUNCATED: Max buffer limit reached]'
          }
        }
      })

      child.on('error', (err: any) => {
        clearTimeout(timeoutTimer)
        if (dockerContainerName) {
          try {
            spawnSync(getDockerPath(), ['rm', '-f', dockerContainerName], { stdio: 'ignore', timeout: 5000 })
          } catch {}
        }
        this.activeProcesses.delete(procKey)
        const isCancelled = cancelled || this.cancelledExecutions.has(procKey)
        this.cancelledExecutions.delete(procKey)
        const durationMs = Date.now() - startTime
        resolve({
          command: `${originalCmd} ${originalArgs.join(' ')}`.trim(),
          args: originalArgs,
          exitCode: isCancelled ? 130 : 1,
          stdout: stdoutBuffer,
          stderr: stderrBuffer + (stderrBuffer ? '\n' : '') + err.message,
          durationMs,
          timedOut,
          cancelled: isCancelled,
          sandboxTier,
          infrastructureNotice,
        })
      })

      child.on('close', (code: number | null) => {
        clearTimeout(timeoutTimer)
        if (dockerContainerName) {
          try {
            spawnSync(getDockerPath(), ['rm', '-f', dockerContainerName], { stdio: 'ignore', timeout: 5000 })
          } catch {}
        }
        this.activeProcesses.delete(procKey)
        const isCancelled = cancelled || this.cancelledExecutions.has(procKey)
        this.cancelledExecutions.delete(procKey)
        const durationMs = Date.now() - startTime

        const finalExitCode = timedOut ? 124 : isCancelled ? 130 : code !== null ? code : 1

        if (timedOut) {
          stderrBuffer += `\n[Process timed out after ${timeoutMs}ms]`.trim()
        }
        if (isCancelled) {
          stderrBuffer += '\n[Process cancelled by user]'.trim()
        }

        resolve({
          command: `${originalCmd} ${originalArgs.join(' ')}`.trim(),
          args: originalArgs,
          exitCode: finalExitCode,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          durationMs,
          timedOut,
          cancelled: isCancelled,
          sandboxTier,
          infrastructureNotice,
        })
      })
    })
  }

  /**
   * Cancel an active running process by ID with full process-tree termination.
   */
  cancelProcess(executionId: string): boolean {
    this.cancelledExecutions.add(executionId)
    const sanitizedId = executionId.replace(/[^a-zA-Z0-9_.-]/g, '_')
    const containerName = `anotherme_${sanitizedId}`
    try {
      spawnSync(getDockerPath(), ['rm', '-f', containerName], { stdio: 'ignore', timeout: 5000 })
    } catch {}

    const child = this.activeProcesses.get(executionId)
    if (child && child.pid && !child.killed) {
      try {
        killProcessTree(child.pid, 'SIGTERM')
        this.activeProcesses.delete(executionId)
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

export const processExecutor = new ControlledProcessExecutor()
