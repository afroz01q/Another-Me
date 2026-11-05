// ====================================================================
// ANOTHER ME — SECTION 2: CODING AGENT RUNTIME TYPES
// Defines contracts for workspace management, safe file operations,
// process execution, coding agent tool invocation, and task runner.
// ====================================================================

import type { OrchestratorTask, WorkflowState } from '../../types/orchestrator'

export type RuntimeTaskStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface WorkspaceMetadata {
  userId: string
  projectId: string
  canonicalRoot: string
  createdAt: string
  updatedAt: string
  fileCount: number
  totalBytes: number
}

export interface WorkspaceFileEntry {
  relativePath: string
  name: string
  size: number
  isDirectory: boolean
  updatedAt: string
  extension: string
}

export interface FileChangeRecord {
  relativePath: string
  path?: string
  action: 'created' | 'modified' | 'deleted'
  previousSize?: number
  currentSize: number
  timestamp: string
  diff?: string
  additions: number
  deletions: number
}

export interface ProcessExecutionOptions {
  cwd?: string
  timeoutMs?: number
  maxBufferBytes?: number
  env?: Record<string, string>
  abortSignal?: AbortSignal
  network?: 'none' | 'bridge'
  allowNpmLifecycle?: boolean
}

export interface ProcessExecutionResult {
  command: string
  args: string[]
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
  cancelled: boolean
  sandboxTier: 'container_isolated' | 'restricted_process_fallback'
  infrastructureNotice?: string
  buildVerificationStatus?: 'verified' | 'blocked_missing_sandbox' | 'failed' | 'not_applicable'
  buildVerificationBlocker?: string
}

export type AgentToolName =
  | 'list_workspace_files'
  | 'read_workspace_file'
  | 'write_workspace_file'
  | 'patch_workspace_file'
  | 'delete_workspace_file'
  | 'run_workspace_command'
  | 'complete_task'

export interface AgentToolCall {
  tool: AgentToolName
  parameters: Record<string, any>
}

export interface AgentToolResult {
  tool: AgentToolName
  success: boolean
  output?: any
  error?: string
}

export interface TaskExecutionRecord {
  taskId: string
  status: RuntimeTaskStatus
  startedAt?: string
  completedAt?: string
  durationMs?: number
  filesModified: string[]
  changes: FileChangeRecord[]
  operationsCount: number
  commandExecutions: ProcessExecutionResult[]
  error?: string
  verificationPassed?: boolean
  verificationDetails?: string
  buildVerification?: {
    verified: boolean
    status: 'verified' | 'blocked_missing_sandbox' | 'failed' | 'not_applicable'
    details: string
    command?: string
    exitCode?: number
  }
}

export interface ProjectExecutionStatus {
  projectId: string
  userId: string
  workflowState: WorkflowState
  executionState: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
  currentStage: number
  totalStages: number
  currentTaskId: string | null
  completedTaskIds: string[]
  failedTaskIds: string[]
  tasks: OrchestratorTask[]
  taskRecords: Record<string, TaskExecutionRecord>
  changedFiles: FileChangeRecord[]
  terminalLogs: RuntimeTerminalLogEntry[]
  startedAt?: string
  finishedAt?: string
}

export interface RuntimeTerminalLogEntry {
  id: string
  timestamp: string
  type: 'stdout' | 'stderr' | 'agent' | 'system' | 'command' | 'error' | 'success'
  message: string
  detail?: string
  taskId?: string
}

// ====================================================================
// SECTION 3: REAL TERMINAL & PACKAGE MANAGER TYPES
// ====================================================================

export type TerminalCommandStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'blocked_sandbox_required'

export interface TerminalCommandRecord {
  id: string
  sessionId: string
  command: string
  args: string[]
  rawCommandString: string
  cwd?: string
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  status: TerminalCommandStatus
  startedAt: string
  finishedAt?: string
  sandboxTier: 'container_isolated' | 'restricted_process_fallback'
  infrastructureNotice?: string
  blockedReason?: string
}

export interface TerminalSession {
  id: string
  projectId: string
  userId: string
  name: string
  createdAt: string
  updatedAt: string
  activeExecutionId?: string | null
  activeCommandId?: string | null
  commands: TerminalCommandRecord[]
}

export type PackageManagerOperation = 'install' | 'list' | 'build'

export interface PackageManagerResult {
  operation: PackageManagerOperation
  success: boolean
  status: 'verified' | 'blocked_missing_sandbox' | 'failed'
  details: string
  packages?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
  commandExecution?: ProcessExecutionResult
  error?: string
}

// ====================================================================
// SECTION 5: REAL BACKEND & DATABASE BUILDER TYPES
// ====================================================================

export interface DatabaseMigrationRecord {
  id: string
  version: string
  name: string
  filename: string
  status: 'pending' | 'applied' | 'failed' | 'rolled_back'
  isDestructive: boolean
  destructiveReasons: string[]
  appliedAt?: string
  sqlContent?: string
}

export interface MigrationApplyOptions {
  confirmDestructive?: boolean
  environment?: 'local_dev' | 'test' | 'production'
  databaseUrl?: string
  targetVersion?: string
  timeoutMs?: number
}

export interface MigrationResult {
  success: boolean
  status: 'applied' | 'destructive_blocked' | 'failed' | 'rolled_back'
  details: string
  appliedMigrations: string[]
  destructiveWarnings?: string[]
  error?: string
  commandExecution?: ProcessExecutionResult
}

export interface DatabaseStatus {
  connected: boolean
  type: 'sqlite' | 'postgres' | 'supabase'
  environment: 'local_dev' | 'test' | 'production'
  databasePath?: string
  totalTables: number
  tables: string[]
  appliedMigrationsCount: number
  pendingMigrationsCount: number
  error?: string
}

export interface SeedResult {
  success: boolean
  details: string
  recordsInserted?: Record<string, number>
  error?: string
  commandExecution?: ProcessExecutionResult
}

export interface BackendRouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  description: string
  controller?: string
  validationSchema?: Record<string, any>
  sampleRequestPayload?: Record<string, any>
  expectedResponseStatus?: number
}

export interface BackendServerStatus {
  running: boolean
  status: 'stopped' | 'starting' | 'running' | 'failed' | 'crashed'
  port?: number
  containerName?: string
  uptimeSeconds?: number
  startedAt?: string
  detectedRoutes: BackendRouteDefinition[]
  databaseStatus: DatabaseStatus
  recentLogs: string[]
  error?: string
}

export interface BackendStartOptions {
  port?: number
  environment?: 'local_dev' | 'test' | 'production'
  databaseUrl?: string
  timeoutMs?: number
  env?: Record<string, string>
}

export interface BackendTestResult {
  endpoint: string
  method: string
  expectedStatus: number
  actualStatus: number
  passed: boolean
  requestPayload?: any
  responseBody?: any
  durationMs: number
  error?: string
}

export interface BackendTestSuiteResult {
  success: boolean
  totalTests: number
  passed: number
  failed: number
  results: BackendTestResult[]
  summary: string
  durationMs: number
}

// ====================================================================
// SECTION 7: TESTING, CODE QUALITY, SECURITY & COVERAGE TYPES
// ====================================================================

export type TestFramework = 'vitest' | 'jest' | 'mocha' | 'custom' | null

export interface TestCaseResult {
  id: string
  name: string
  suite: string
  status: 'passed' | 'failed' | 'skipped'
  durationMs: number
  error?: {
    message: string
    stack?: string
    line?: number
    column?: number
    file?: string
  }
}

export interface CoverageMetric {
  total: number
  covered: number
  pct: number
}

export interface FileCoverageRecord {
  file: string
  linesPct: number
  branchesPct: number
  functionsPct: number
  statementsPct: number
  uncoveredLines?: number[]
}

export interface CoverageSummary {
  available: boolean
  reason?: string
  lines: CoverageMetric
  statements: CoverageMetric
  functions: CoverageMetric
  branches: CoverageMetric
  untestedFiles: string[]
  fileCoverage?: FileCoverageRecord[]
}

export interface TestSuiteRunResult {
  runId: string
  projectId: string
  framework: TestFramework
  frameworkDetected: boolean
  frameworkNotice?: string
  status:
    | 'passed'
    | 'failed'
    | 'timed_out'
    | 'cancelled'
    | 'unsupported_framework'
    | 'missing_dependencies'
  total: number
  passed: number
  failed: number
  skipped: number
  durationMs: number
  exitCode: number
  stdout: string
  stderr: string
  testCases: TestCaseResult[]
  coverageSummary?: CoverageSummary
  timestamp: string
  sandboxTier: 'container_isolated' | 'restricted_process_fallback'
}

export interface CodeQualityDiagnostic {
  file?: string
  line?: number
  column?: number
  code?: string
  message: string
}

export interface CodeQualityFinding {
  file: string
  line: number
  column: number
  rule: string
  message: string
  severity: 'error' | 'warning'
}

export interface CodeQualityResult {
  typeCheck: {
    status: 'passed' | 'failed' | 'not_configured'
    errorsCount: number
    diagnostics: CodeQualityDiagnostic[]
    durationMs: number
    output: string
  }
  linter: {
    status: 'passed' | 'failed' | 'not_configured'
    details: string
    errorsCount: number
    warningsCount: number
    findings: CodeQualityFinding[]
    output: string
  }
  build: {
    status: 'passed' | 'failed' | 'not_configured'
    exitCode: number
    durationMs: number
    output: string
    error?: string
  }
  overallStatus: 'passed' | 'failed' | 'warning'
  timestamp: string
}

export interface SecurityFinding {
  id: string
  category: 'secret' | 'dangerous_pattern' | 'insecure_config' | 'auth_flaw' | 'vulnerable_dependency'
  severity: 'critical' | 'high' | 'moderate' | 'low' | 'info'
  title: string
  description: string
  file?: string
  line?: number
  column?: number
  evidence?: string
  remediation: string
  ruleId: string
  heuristic: boolean
  cve?: string
  packageName?: string
  installedVersion?: string
  fixedVersion?: string
  advisoryUrl?: string
}

export interface SecurityScanResult {
  scanId: string
  projectId: string
  status: 'completed' | 'scanner_failed' | 'offline_restricted'
  scannerNotice?: string
  timestamp: string
  findings: SecurityFinding[]
  summary: {
    critical: number
    high: number
    moderate: number
    low: number
    info: number
    total: number
  }
  dependencyAuditStatus: 'completed' | 'scanner_failed' | 'not_available' | 'offline_restricted'
  dependencyAuditError?: string
}

export interface TestFixProposal {
  id: string
  targetFile: string
  explanation: string
  diff: string
  oldContent: string
  newContent: string
  approved: boolean
  fixType: 'test_failure' | 'security_finding' | 'quality_issue'
  findingId?: string
}

export interface TestRunHistoryEntry {
  id: string
  type: 'test_run' | 'quality_check' | 'security_scan' | 'coverage'
  timestamp: string
  status: string
  summaryText: string
  durationMs: number
  details: any
}

// ====================================================================
// SECTION 8: GITHUB, EXPORT & DEPLOYMENT TYPES
// ====================================================================

export interface GitHubUserStatus {
  connected: boolean
  username?: string
  avatarUrl?: string
  scopes?: string[]
  expiresAt?: string
  rateLimit?: {
    limit: number
    remaining: number
    reset: number
  }
}

export interface GitHubRepo {
  id: number
  name: string
  fullName: string
  private: boolean
  htmlUrl: string
  defaultBranch: string
  description: string | null
  updatedAt: string
}

export interface GitHubBranch {
  name: string
  commitSha: string
  protected: boolean
}

export interface GitHubCommit {
  sha: string
  message: string
  authorName: string
  authorDate: string
  url: string
}

export interface GitHubFileDiff {
  path: string
  status: 'added' | 'modified' | 'deleted'
  additions: number
  deletions: number
  patch?: string
}

export interface GitHubDiffSummary {
  branch: string
  baseSha?: string
  changedFilesCount: number
  totalAdditions: number
  totalDeletions: number
  files: GitHubFileDiff[]
}

export type GitHubConflictType =
  | 'modified_modified'
  | 'modified_deleted'
  | 'deleted_modified'
  | 'remote_only'
  | 'local_only'

export interface GitHubConflictFile {
  path: string
  type: GitHubConflictType
  localContent?: string
  remoteContent?: string
  conflictMarkers?: string
  description: string
}

export interface GitHubPushConflictDetails {
  conflict: true
  reason: 'REMOTE_ADVANCED' | 'NON_FAST_FORWARD' | 'CONCURRENT_UPDATE'
  branch: string
  expectedBaseSha: string
  currentRemoteSha: string
  remoteCommits?: {
    sha: string
    message: string
    authorName?: string
    authorDate?: string
  }[]
  conflicts: GitHubConflictFile[]
  summary: string
}

export type GitHubResolutionStrategy = 'ours' | 'theirs' | 'merge_resolved'

export interface GitHubFileResolution {
  path: string
  action: 'ours' | 'theirs' | 'custom'
  customContent?: string
}

export interface GitHubPushOptions {
  owner: string
  repo: string
  branch: string
  commitMessage: string
  confirmPush: boolean
  expectedBaseSha?: string
  resolutionStrategy?: GitHubResolutionStrategy
  resolvedFiles?: GitHubFileResolution[]
}

export interface GitHubPushResult {
  success: boolean
  commitSha: string
  commitUrl: string
  branch: string
  pushedFiles: string[]
  timestamp: string
}

export interface ExportInspectionResult {
  projectId: string
  totalFiles: number
  includedFiles: string[]
  excludedFiles: { path: string; reason: string }[]
  secretWarnings: string[]
  estimatedSizeBytes: number
  timestamp: string
}

export interface ExportArchiveValidation {
  valid: boolean
  entryCount: number
  hasPackageJson: boolean
  hasTraversalErrors: boolean
  errors: string[]
}

export type DeploymentProvider = 'vercel' | 'netlify' | 'cloudflare_pages' | 'docker_container'

export interface DeploymentConfig {
  framework: string
  buildCommand: string
  outputDir: string
  requiredEnvVars: string[]
  nodeVersion: string
}

export interface DeploymentPlan {
  provider: DeploymentProvider
  detectedConfig: DeploymentConfig
  filesCount: number
  estimatedSizeBytes: number
  expectedCostTier: string
  requiredPermissions: string[]
  hasCriticalSecurityFindings: boolean
  criticalFindings: string[]
  canDeploy: boolean
  blockers?: string[]
}

export interface DeploymentRecord {
  id: string
  projectId: string
  provider: DeploymentProvider
  status: 'queued' | 'building' | 'deploying' | 'ready' | 'failed' | 'cancelled' | 'rolled_back'
  deploymentUrl?: string
  previewUrl?: string
  buildCommand?: string
  outputDir?: string
  createdAt: string
  updatedAt: string
  error?: string
  logs: string[]
  rollbackAvailable: boolean
  previousDeploymentId?: string
}

