// ====================================================================
// ANOTHER ME — SECTION 2: CODING AGENT RUNTIME CLIENT SDK
// Provides typed client functions to communicate with the coding agent runtime.
// Enforces Bearer token authentication on all runtime endpoints.
// ====================================================================

import { getClientAuthToken } from './authSession'
import type {
  ProjectExecutionStatus,
  WorkspaceFileEntry,
  FileChangeRecord,
  TerminalSession,
  TerminalCommandRecord,
  PackageManagerResult,
  BackendServerStatus,
  BackendStartOptions,
  DatabaseMigrationRecord,
  MigrationApplyOptions,
  MigrationResult,
  SeedResult,
  BackendTestSuiteResult,
  TestSuiteRunResult,
  CodeQualityResult,
  SecurityScanResult,
  CoverageSummary,
  TestFixProposal,
  TestRunHistoryEntry,
  GitHubUserStatus,
  GitHubRepo,
  GitHubBranch,
  GitHubCommit,
  GitHubDiffSummary,
  GitHubPushResult,
  GitHubPushConflictDetails,
  GitHubResolutionStrategy,
  GitHubFileResolution,
  GitHubPushOptions,
  ExportInspectionResult,
  ExportArchiveValidation,
  DeploymentProvider,
  DeploymentConfig,
  DeploymentPlan,
  DeploymentRecord,
} from '../server/agentRuntime/types'

export class AgentRuntimeClientError extends Error {
  statusCode: number
  code?: string
  details?: any

  constructor(message: string, statusCode: number, code?: string, details?: any) {
    super(message)
    this.name = 'AgentRuntimeClientError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

async function fetchRuntimeWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getClientAuthToken()
  const headers = new Headers(options.headers || {})

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(url, {
    ...options,
    headers,
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    const message = errData.error || `Runtime request failed with HTTP ${res.status}`
    throw new AgentRuntimeClientError(message, res.status, errData.code, errData.details)
  }

  return res
}

export const agentRuntimeClient = {
  /**
   * Retrieves live or persisted project execution status.
   */
  async getStatus(projectId: string): Promise<ProjectExecutionStatus> {
    const res = await fetchRuntimeWithAuth(`/api/agent-runtime/projects/${encodeURIComponent(projectId)}/status`)
    const data = await res.json()
    return data.status
  },

  /**
   * Starts or resumes coding agent execution on an approved project.
   */
  async executeProject(projectId: string, apiKey?: string): Promise<{ success: boolean; status: ProjectExecutionStatus }> {
    const res = await fetchRuntimeWithAuth(`/api/agent-runtime/projects/${encodeURIComponent(projectId)}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    })
    return res.json()
  },

  /**
   * Lists files in the isolated workspace.
   */
  async listFiles(projectId: string, dir?: string): Promise<WorkspaceFileEntry[]> {
    const query = dir ? `?dir=${encodeURIComponent(dir)}` : ''
    const res = await fetchRuntimeWithAuth(`/api/agent-runtime/projects/${encodeURIComponent(projectId)}/files${query}`)
    const data = await res.json()
    return data.files || []
  },

  /**
   * Reads content of a workspace file.
   */
  async readFile(projectId: string, relativePath: string): Promise<{ content: string; size: number }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(relativePath)}`
    )
    return res.json()
  },

  /**
   * Retrieves change log and diff records.
   */
  async getChanges(projectId: string): Promise<FileChangeRecord[]> {
    const res = await fetchRuntimeWithAuth(`/api/agent-runtime/projects/${encodeURIComponent(projectId)}/changes`)
    const data = await res.json()
    return data.changes || []
  },

  /**
   * Cancels active running execution.
   */
  async cancelExecution(projectId: string): Promise<{ success: boolean; cancelled: boolean }> {
    const res = await fetchRuntimeWithAuth(`/api/agent-runtime/projects/${encodeURIComponent(projectId)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    return res.json()
  },

  /**
   * Retries an eligible failed or cancelled task.
   */
  async retryTask(
    projectId: string,
    taskId: string,
    apiKey?: string
  ): Promise<{ success: boolean; status: ProjectExecutionStatus }> {
    const res = await fetchRuntimeWithAuth(`/api/agent-runtime/projects/${encodeURIComponent(projectId)}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, apiKey }),
    })
    return res.json()
  },

  // ------------------------------------------------------------------
  // SECTION 3: REAL TERMINAL & PACKAGE MANAGER SDK
  // ------------------------------------------------------------------

  /**
   * Lists all terminal sessions for a project.
   */
  async listTerminalSessions(projectId: string): Promise<TerminalSession[]> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/terminal/sessions`
    )
    const data = await res.json()
    return data.sessions || []
  },

  /**
   * Creates a new terminal session.
   */
  async createTerminalSession(projectId: string, name?: string): Promise<TerminalSession> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/terminal/sessions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }
    )
    const data = await res.json()
    return data.session
  },

  /**
   * Retrieves a specific terminal session.
   */
  async getTerminalSession(projectId: string, sessionId: string): Promise<TerminalSession> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/terminal/sessions/${encodeURIComponent(sessionId)}`
    )
    const data = await res.json()
    return data.session
  },

  /**
   * Executes a command in a terminal session.
   */
  async executeTerminalCommand(
    projectId: string,
    sessionId: string,
    command: string,
    args?: string[],
    options?: any
  ): Promise<TerminalCommandRecord> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/terminal/sessions/${encodeURIComponent(sessionId)}/execute`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, args, options }),
      }
    )
    const data = await res.json()
    return data.record
  },

  /**
   * Cancels an active command in a terminal session.
   */
  async cancelTerminalCommand(
    projectId: string,
    sessionId: string,
    commandId?: string
  ): Promise<{ success: boolean; cancelled: boolean }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/terminal/sessions/${encodeURIComponent(sessionId)}/cancel`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId }),
      }
    )
    return res.json()
  },

  /**
   * Retrieves full command history.
   */
  async getTerminalHistory(projectId: string, sessionId?: string): Promise<TerminalCommandRecord[]> {
    const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/terminal/history${query}`
    )
    const data = await res.json()
    return data.history || []
  },

  /**
   * Clears session command history.
   */
  async clearTerminalHistory(projectId: string, sessionId: string): Promise<boolean> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/terminal/sessions/${encodeURIComponent(sessionId)}/history`,
      { method: 'DELETE' }
    )
    const data = await res.json()
    return data.cleared || false
  },

  /**
   * Lists declared package dependencies and scripts from workspace package.json.
   */
  async listProjectPackages(projectId: string): Promise<PackageManagerResult> {
    const res = await fetchRuntimeWithAuth(`/api/agent-runtime/projects/${encodeURIComponent(projectId)}/packages`)
    return res.json()
  },

  /**
   * Installs packages in the workspace (runs inside container; blocked on host).
   */
  async installProjectPackage(
    projectId: string,
    packageName?: string,
    options?: any
  ): Promise<PackageManagerResult> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/packages/install`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageName, options }),
      }
    )
    return res.json()
  },

  /**
   * Builds the project in the workspace (runs inside container; blocked on host).
   */
  async buildProject(projectId: string, options?: any): Promise<PackageManagerResult> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/packages/build`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options }),
      }
    )
    return res.json()
  },

  /**
   * Requests a short-lived, narrowly scoped preview token for iframe embedding.
   */
  async requestPreviewToken(projectId: string, ttlSeconds: number = 900): Promise<{
    previewToken: string
    expiresIn: number
    expiresAt: string
    projectId: string
    scope: string
  }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/preview-token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttlSeconds }),
      }
    )
    return res.json()
  },

  /**
   * Revokes active preview token(s) for a project.
   */
  async revokePreviewToken(projectId: string, jti?: string): Promise<{ success: boolean; message: string }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/preview-token/revoke`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jti }),
      }
    )
    return res.json()
  },

  /**
   * Generates authenticated URL for the isolated live preview using scoped previewToken.
   */
  getPreviewUrl(projectId: string, previewToken?: string, subPath?: string): string {
    const basePath = `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/preview${
      subPath ? `/${subPath.replace(/^\//, '')}` : ''
    }`
    return previewToken ? `${basePath}?previewToken=${encodeURIComponent(previewToken)}` : basePath
  },

  /**
   * Modifies an existing project via the AI coding agent and updates workspace files.
   */
  async editProject(
    projectId: string,
    instruction: string,
    apiKey?: string
  ): Promise<{
    projectId: string
    success: boolean
    explanation: string
    spokenSummary: string
    modifiedFiles: Array<{ path: string; action: string; content?: string }>
    buildResult?: PackageManagerResult
  }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/edit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, apiKey }),
      }
    )
    return res.json()
  },

  /**
   * Generates a real backend API, database schema, and test seed data for the project.
   */
  async generateBackend(
    projectId: string,
    instruction: string,
    apiKey?: string
  ): Promise<{
    projectId: string
    success: boolean
    explanation: string
    spokenSummary: string
    modifiedFiles: string[]
    changes: FileChangeRecord[]
  }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/backend/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, apiKey }),
      }
    )
    return res.json()
  },

  /**
   * Retrieves backend server status, active container, database status, and detected routes.
   */
  async getBackendStatus(projectId: string): Promise<BackendServerStatus> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/backend/status`
    )
    return res.json()
  },

  /**
   * Starts the project backend server inside an isolated Docker container.
   */
  async startBackend(projectId: string, options?: BackendStartOptions): Promise<BackendServerStatus> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/backend/start`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      }
    )
    return res.json()
  },

  /**
   * Stops the running backend container for a project.
   */
  async stopBackend(projectId: string): Promise<{ projectId: string; stopped: boolean }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/backend/stop`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    return res.json()
  },

  /**
   * Lists declared database migrations and their status.
   */
  async getMigrations(projectId: string): Promise<{ projectId: string; migrations: DatabaseMigrationRecord[] }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/backend/migrations`
    )
    return res.json()
  },

  /**
   * Applies pending database migrations inside the isolated runtime.
   */
  async applyMigrations(projectId: string, options?: MigrationApplyOptions): Promise<MigrationResult> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/backend/migrations/apply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      }
    )
    return res.json()
  },

  /**
   * Rolls back the last applied migration.
   */
  async rollbackMigration(projectId: string, targetVersion?: string): Promise<MigrationResult> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/backend/migrations/rollback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetVersion }),
      }
    )
    return res.json()
  },

  /**
   * Seeds the database inside the isolated container.
   */
  async seedDatabase(projectId: string): Promise<SeedResult> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/backend/seed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    return res.json()
  },

  /**
   * Executes real HTTP endpoint tests against the container backend.
   */
  async testBackend(projectId: string): Promise<BackendTestSuiteResult> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/backend/test`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    return res.json()
  },

  /**
   * Returns project-scoped backend reverse proxy URL.
   */
  getBackendProxyUrl(projectId: string, subPath?: string): string {
    const base = `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/backend-proxy`
    return subPath ? `${base}${subPath.startsWith('/') ? '' : '/'}${subPath}` : base
  },

  // ------------------------------------------------------------------
  // SECTION 6: LIVE PREVIEW & DEBUGGING CLIENT METHODS
  // ------------------------------------------------------------------

  /**
   * Retrieves real live preview status and recent diagnostics.
   */
  async getPreviewStatus(projectId: string): Promise<{
    projectId: string
    status: {
      state: 'ready' | 'building' | 'stopped' | 'failed' | 'not_built'
      hasDist: boolean
      hasSource: boolean
      buildError?: string
      lastBuiltAt?: string
      lastStartedAt?: string
      stoppedAt?: string
      recentLogs: Array<{ id: string; timestamp: string; level: string; message: string; source?: string }>
      diagnostics?: { file?: string; line?: number; column?: number; code?: string; message?: string }
    }
  }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/preview/status`
    )
    return res.json()
  },

  /**
   * Starts live preview, building static files in isolated Docker sandbox if needed.
   */
  async startPreview(
    projectId: string,
    options?: { forceRebuild?: boolean }
  ): Promise<{ projectId: string; status: any }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/preview/start`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      }
    )
    return res.json()
  },

  /**
   * Stops live preview serving.
   */
  async stopPreview(projectId: string): Promise<{ projectId: string; status: any }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/preview/stop`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    return res.json()
  },

  /**
   * Restarts live preview: re-executes clean Docker build and reloads preview.
   */
  async restartPreview(projectId: string): Promise<{ projectId: string; status: any }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/preview/restart`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    return res.json()
  },

  /**
   * Fetches streamed or polled preview runtime logs.
   */
  async getPreviewLogs(
    projectId: string,
    limit = 50
  ): Promise<{ projectId: string; logs: Array<{ id: string; timestamp: string; level: string; message: string; source?: string }> }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/preview/logs?limit=${limit}`
    )
    return res.json()
  },

  /**
   * Submits a browser runtime error, compilation error, or failed network request
   * to the AI coding agent to diagnose, generate a unified diff, and apply the fix.
   */
  async debugProject(
    projectId: string,
    options: {
      error: string
      errorType?: 'runtime' | 'build' | 'network'
      file?: string
      line?: number
      column?: number
      context?: string
      autoApply?: boolean
      apiKey?: string
    }
  ): Promise<{
    projectId: string
    success: boolean
    diagnosis: string
    spokenSummary: string
    proposedChanges: Array<{ path: string; action: string; diff: string; content?: string }>
    applied: boolean
    modifiedFiles: string[]
    changes: FileChangeRecord[]
    diff: string
    verificationPassed?: boolean
    error?: string
  }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/debug`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      }
    )
    return res.json()
  },

  // ------------------------------------------------------------------
  // SECTION 7: TESTING & SECURITY CLIENT METHODS
  // ------------------------------------------------------------------

  /**
   * Executes the project's test suite inside the Docker sandbox.
   */
  async runTests(
    projectId: string,
    options?: { timeoutMs?: number; filter?: string }
  ): Promise<TestSuiteRunResult> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/tests/run`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      }
    )
    return res.json()
  },

  /**
   * Cancels an active test execution.
   */
  async cancelTests(projectId: string): Promise<{ success: boolean; cancelled: boolean }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/tests/cancel`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    return res.json()
  },

  /**
   * Fetches test, security, and quality run history.
   */
  async getTestHistory(projectId: string): Promise<{ projectId: string; history: TestRunHistoryEntry[] }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/tests/history`
    )
    return res.json()
  },

  /**
   * Runs TypeScript checks, linting, and production builds.
   */
  async runQualityChecks(projectId: string): Promise<CodeQualityResult> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/quality/check`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    return res.json()
  },

  /**
   * Runs security scanning (hardcoded secrets, heuristic dangerous patterns, and npm audit).
   */
  async runSecurityScan(projectId: string): Promise<SecurityScanResult> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/security/scan`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    return res.json()
  },

  /**
   * Measures test code coverage if supported tools are configured.
   */
  async runCoverage(projectId: string): Promise<{ projectId: string; coverage: CoverageSummary }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/coverage/run`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    return res.json()
  },

  /**
   * Requests an AI-assisted fix proposal with unified diff for a test failure or security finding.
   */
  async proposeTestFix(
    projectId: string,
    options: {
      fixType: 'test_failure' | 'security_finding' | 'quality_issue'
      title: string
      description: string
      file?: string
      line?: number
      errorStack?: string
      evidence?: string
      findingId?: string
      apiKey?: string
    }
  ): Promise<{ projectId: string; proposal: TestFixProposal }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/tests/propose-fix`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      }
    )
    return res.json()
  },

  /**
   * Applies a user-approved fix proposal and optionally re-runs tests.
   */
  async applyTestFix(
    projectId: string,
    proposal: TestFixProposal,
    rerunTests = true
  ): Promise<{
    projectId: string
    success: boolean
    modifiedFile: string
    change: FileChangeRecord
    rerunResult?: TestSuiteRunResult
  }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/tests/apply-fix`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal, rerunTests }),
      }
    )
    return res.json()
  },

  // ==================================================================
  // SECTION 8: GITHUB INTEGRATION CLIENT SDK
  // ==================================================================

  /**
   * Retrieves current user's GitHub connection status.
   */
  async getGitHubStatus(): Promise<GitHubUserStatus> {
    const res = await fetchRuntimeWithAuth('/api/agent-runtime/github/status')
    return res.json()
  },

  /**
   * Connects user's GitHub account via personal access token.
   */
  async connectGitHub(token: string): Promise<GitHubUserStatus> {
    const res = await fetchRuntimeWithAuth('/api/agent-runtime/github/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    return res.json()
  },

  /**
   * Disconnects user's GitHub session.
   */
  async disconnectGitHub(): Promise<{ success: boolean }> {
    const res = await fetchRuntimeWithAuth('/api/agent-runtime/github/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    return res.json()
  },

  /**
   * Obtains an OAuth authorization URL with state token.
   */
  async getGitHubOAuthUrl(projectId?: string, redirectUri?: string): Promise<{ authUrl: string; state: string }> {
    const params = new URLSearchParams()
    if (projectId) params.set('projectId', projectId)
    if (redirectUri) params.set('redirectUri', redirectUri)
    const res = await fetchRuntimeWithAuth(`/api/agent-runtime/github/oauth/url?${params.toString()}`)
    return res.json()
  },

  /**
   * Lists repositories for the authenticated GitHub user.
   */
  async listGitHubRepos(projectId: string): Promise<{ repos: GitHubRepo[] }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/github/repos`
    )
    return res.json()
  },

  /**
   * Creates a new GitHub repository with explicit approval.
   */
  async createGitHubRepo(
    projectId: string,
    options: { name: string; description?: string; private?: boolean; confirmCreate: boolean }
  ): Promise<{ repo: GitHubRepo }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/github/repos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      }
    )
    return res.json()
  },

  /**
   * Lists branches for a repository.
   */
  async listGitHubBranches(projectId: string, owner: string, repo: string): Promise<{ branches: GitHubBranch[] }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/github/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
    )
    return res.json()
  },

  /**
   * Retrieves commit history for a repository branch.
   */
  async getGitHubCommits(
    projectId: string,
    owner: string,
    repo: string,
    branch = 'main'
  ): Promise<{ commits: GitHubCommit[] }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/github/commits?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`
    )
    return res.json()
  },

  /**
   * Computes working diff between local workspace and remote branch.
   */
  async getGitHubDiff(
    projectId: string,
    owner: string,
    repo: string,
    branch = 'main'
  ): Promise<GitHubDiffSummary> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/github/diff?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`
    )
    return res.json()
  },

  /**
   * Pushes workspace changes to GitHub with explicit approval.
   */
  async pushToGitHub(
    projectId: string,
    options: GitHubPushOptions
  ): Promise<GitHubPushResult> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/github/push`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      }
    )
    return res.json()
  },

  // ==================================================================
  // SECTION 8: PROJECT EXPORT CLIENT SDK
  // ==================================================================

  /**
   * Inspects files for export (identifies inclusions, exclusions, and secret warnings).
   */
  async inspectExport(projectId: string): Promise<ExportInspectionResult> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/export/inspect`
    )
    return res.json()
  },

  /**
   * Validates the generated export ZIP archive integrity in memory.
   */
  async validateExport(projectId: string): Promise<ExportArchiveValidation> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/export/validate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    return res.json()
  },

  /**
   * URL for downloading the clean project ZIP archive.
   */
  getExportDownloadUrl(projectId: string): string {
    return `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/export/download`
  },

  // ==================================================================
  // SECTION 8: DEPLOYMENT CLIENT SDK
  // ==================================================================

  /**
   * Detects project framework, build command, output directory, and required env vars.
   */
  async getDeploymentConfig(
    projectId: string
  ): Promise<{ config: DeploymentConfig; providers: { provider: DeploymentProvider; configured: boolean }[] }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/deploy/config`
    )
    return res.json()
  },

  /**
   * Stores cloud provider credentials server-side.
   */
  async setDeploymentCredentials(projectId: string, credentials: any): Promise<{ success: boolean }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/deploy/credentials`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      }
    )
    return res.json()
  },

  /**
   * Generates pre-deployment plan showing target, permissions, costs, and security gate.
   */
  async getDeploymentPlan(projectId: string, provider: DeploymentProvider = 'vercel'): Promise<DeploymentPlan> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/deploy/plan`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      }
    )
    return res.json()
  },

  /**
   * Executes containerized build and provider deployment with user approval.
   */
  async executeDeployment(
    projectId: string,
    options: {
      provider: DeploymentProvider
      confirmDeploy: boolean
      approved: boolean
      envVars?: Record<string, string>
      overrideCriticalSecurity?: boolean
    }
  ): Promise<DeploymentRecord> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/deploy/execute`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      }
    )
    return res.json()
  },

  /**
   * Lists deployment history for a project.
   */
  async getDeploymentHistory(projectId: string): Promise<{ deployments: DeploymentRecord[] }> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/deploy/history`
    )
    return res.json()
  },

  /**
   * Cancels an in-flight deployment.
   */
  async cancelDeployment(projectId: string, deploymentId: string): Promise<DeploymentRecord> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/deploy/cancel`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deploymentId }),
      }
    )
    return res.json()
  },

  /**
   * Rolls back deployment to previous successful version.
   */
  async rollbackDeployment(projectId: string, targetDeploymentId?: string): Promise<DeploymentRecord> {
    const res = await fetchRuntimeWithAuth(
      `/api/agent-runtime/projects/${encodeURIComponent(projectId)}/deploy/rollback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDeploymentId }),
      }
    )
    return res.json()
  },
}
