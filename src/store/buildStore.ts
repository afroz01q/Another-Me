import { create } from 'zustand'
import type {
  BuildPlan,
  BuildProjectState,
  BuildLogEntry,
  GeneratedFile,
  BuildTask,
  ExecutionState,
} from '@/lib/buildAgent/types'
import { generateBuildPlan } from '@/lib/buildAgent/planner'
import { generateProjectCode } from '@/lib/buildAgent/coder'
import { editProjectFiles } from '@/lib/buildAgent/editor'
import { workspaceClient } from '@/lib/buildAgent/workspaceClient'
import { orchestratorClient } from '@/lib/orchestratorClient'
import { agentRuntimeClient } from '@/lib/agentRuntimeClient'
import type {
  ProjectExecutionStatus,
  WorkspaceFileEntry,
  FileChangeRecord,
  TerminalSession,
  TerminalCommandRecord,
  PackageManagerResult,
  BackendServerStatus,
  DatabaseMigrationRecord,
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
} from '@/server/agentRuntime/types'
import { speakText } from '@/lib/voice'
import { getClientAuthToken } from '@/lib/authSession'
import toast from 'react-hot-toast'

interface BuildStore {
  // State
  currentProject: BuildProjectState | null
  projectsList: any[]
  isBuilding: boolean
  isEditing: boolean
  isTwinPiPOpen: boolean
  activeTab: 'preview' | 'code' | 'logs' | 'plan' | 'backend' | 'testing' | 'export_deploy'
  currentTaskId: string | null

  // Section 2 Runtime State
  runtimeStatus: ProjectExecutionStatus | null
  isRuntimeExecuting: boolean
  workspaceFiles: WorkspaceFileEntry[]
  fileChanges: FileChangeRecord[]
  runtimeActiveFileContent: string | null

  // Section 3 Terminal & Package Manager State
  terminalSessions: TerminalSession[]
  activeTerminalSessionId: string | null
  terminalHistory: TerminalCommandRecord[]
  isTerminalExecuting: boolean
  packageInfo: PackageManagerResult | null

  // Section 5 Real Backend & Database State
  backendStatus: BackendServerStatus | null
  migrations: DatabaseMigrationRecord[]
  backendTestResults: BackendTestSuiteResult | null
  isBackendLoading: boolean
  backendError: string | null

  // Actions
  setTwinPiPOpen: (open: boolean) => void
  setActiveTab: (tab: 'preview' | 'code' | 'logs' | 'plan' | 'backend' | 'testing' | 'export_deploy') => void
  setActiveFile: (path: string) => void
  setViewportMode: (mode: 'desktop' | 'tablet' | 'mobile') => void
  refreshPreview: () => void

  startNewProject: (prompt: string, userId: string, twinName?: string, autoExecute?: boolean) => Promise<void>
  approveAndBuild: () => Promise<void>
  requestPlanChanges: (reason: string) => Promise<void>
  rejectPlan: (reason?: string) => Promise<void>
  applyUserEdit: (instruction: string) => Promise<void>
  loadProject: (projectId: string, userId: string) => Promise<void>
  downloadProjectZip: () => void
  resetProject: () => void

  // Section 2 Runtime Actions
  startRuntimeExecution: () => Promise<void>
  cancelRuntimeExecution: () => Promise<void>
  retryRuntimeTask: (taskId: string) => Promise<void>
  fetchWorkspaceFiles: () => Promise<void>
  loadWorkspaceFileContent: (path: string) => Promise<void>

  // Section 3 Terminal & Package Manager Actions
  loadTerminalSessions: (projectId: string) => Promise<void>
  createTerminalSession: (name?: string) => Promise<void>
  setActiveTerminalSessionId: (sessionId: string) => void
  executeTerminalCommand: (command: string, args?: string[]) => Promise<TerminalCommandRecord | null>
  cancelTerminalCommand: (commandId?: string) => Promise<void>
  loadTerminalHistory: (sessionId?: string) => Promise<void>
  clearTerminalHistory: (sessionId?: string) => Promise<void>
  inspectPackages: (silent?: boolean) => Promise<PackageManagerResult | null>
  installPackage: (packageName?: string) => Promise<PackageManagerResult | null>
  buildProject: () => Promise<PackageManagerResult | null>

  // Section 5 Backend & Database Actions
  fetchBackendStatus: () => Promise<void>
  startBackendServer: () => Promise<void>
  stopBackendServer: () => Promise<void>
  fetchMigrations: () => Promise<void>
  applyMigrations: (confirmDestructive?: boolean) => Promise<MigrationResult | null>
  rollbackMigration: () => Promise<MigrationResult | null>
  seedDatabase: () => Promise<SeedResult | null>
  runBackendTests: () => Promise<BackendTestSuiteResult | null>
  generateBackendApi: (instruction: string) => Promise<void>

  // Section 6 Live Preview & Debugging State
  previewLifecycleState: 'ready' | 'building' | 'stopped' | 'failed' | 'not_built'
  previewLogs: Array<{ id: string; timestamp: string; level: string; message: string; source?: string }>
  previewNetworkErrors: Array<{ url: string; method: string; status: number; statusText: string; message: string; timestamp: string }>
  previewRuntimeErrors: Array<{ message: string; filename?: string; lineno?: number; colno?: number; timestamp: string }>
  activeDebugResult: any | null
  isDebugging: boolean

  // Section 6 Live Preview & Debugging Actions
  fetchPreviewStatus: () => Promise<void>
  startLivePreview: () => Promise<void>
  stopLivePreview: () => Promise<void>
  restartLivePreview: () => Promise<void>
  fetchPreviewLogs: () => Promise<void>
  debugLiveError: (errorContext: { error: string; errorType?: 'runtime' | 'build' | 'network'; file?: string; line?: number; column?: number; context?: string }) => Promise<any>
  addPreviewNetworkError: (err: any) => void
  addPreviewRuntimeError: (err: any) => void
  clearPreviewErrors: () => void

  // Section 7 Testing & Security State
  testSuiteResult: TestSuiteRunResult | null
  codeQualityResult: CodeQualityResult | null
  securityScanResult: SecurityScanResult | null
  coverageSummary: CoverageSummary | null
  testHistory: TestRunHistoryEntry[]
  activeTestFixProposal: TestFixProposal | null
  isTesting: boolean
  isQualityChecking: boolean
  isSecurityScanning: boolean
  isCoverageRunning: boolean
  isFixingTest: boolean

  // Section 7 Testing & Security Actions
  runProjectTests: (filter?: string) => Promise<TestSuiteRunResult | null>
  cancelProjectTests: () => Promise<void>
  fetchTestHistory: () => Promise<void>
  runCodeQualityAudit: () => Promise<CodeQualityResult | null>
  runSecurityAudit: () => Promise<SecurityScanResult | null>
  runCoverageAnalysis: () => Promise<CoverageSummary | null>
  proposeFixForFinding: (finding: { fixType?: 'test_failure' | 'security_finding' | 'quality_issue'; title?: string; description: string; file?: string; line?: number; errorStack?: string; evidence?: string }) => Promise<TestFixProposal | null>
  applyTestFixProposal: (proposal: TestFixProposal) => Promise<boolean>
  clearTestFixProposal: () => void

  // Section 8 GitHub, Export & Deployment State
  githubStatus: GitHubUserStatus | null
  githubRepos: GitHubRepo[]
  githubBranches: GitHubBranch[]
  githubCommits: GitHubCommit[]
  githubDiff: GitHubDiffSummary | null
  githubConflict: GitHubPushConflictDetails | null
  exportManifest: ExportInspectionResult | null
  exportValidation: ExportArchiveValidation | null
  deploymentConfig: DeploymentConfig | null
  configuredProviders: { provider: DeploymentProvider; configured: boolean }[]
  deploymentPlan: DeploymentPlan | null
  deploymentsList: DeploymentRecord[]
  activeDeployment: DeploymentRecord | null
  isGitHubLoading: boolean
  isExportLoading: boolean
  isDeployLoading: boolean

  // Section 8 GitHub, Export & Deployment Actions
  fetchGitHubStatus: () => Promise<void>
  connectGitHubToken: (token: string) => Promise<boolean>
  disconnectGitHubSession: () => Promise<void>
  loadGitHubRepos: () => Promise<void>
  createNewGitHubRepo: (name: string, description?: string, isPrivate?: boolean) => Promise<GitHubRepo | null>
  loadGitHubBranches: (owner: string, repo: string) => Promise<void>
  loadGitHubCommits: (owner: string, repo: string, branch?: string) => Promise<void>
  fetchGitHubDiff: (owner: string, repo: string, branch?: string) => Promise<void>
  pushToGitHubRepo: (
    owner: string,
    repo: string,
    branch: string,
    commitMessage: string,
    expectedBaseSha?: string,
    resolutionStrategy?: GitHubResolutionStrategy,
    resolvedFiles?: GitHubFileResolution[]
  ) => Promise<boolean>
  clearGitHubConflict: () => void
  resolveGitHubConflictAndPush: (
    owner: string,
    repo: string,
    branch: string,
    commitMessage: string,
    strategy: GitHubResolutionStrategy,
    resolvedFiles?: GitHubFileResolution[]
  ) => Promise<boolean>

  inspectProjectExport: () => Promise<ExportInspectionResult | null>
  validateProjectExport: () => Promise<ExportArchiveValidation | null>
  downloadCleanZip: () => void

  fetchDeploymentConfig: () => Promise<void>
  fetchDeploymentPlan: (provider: DeploymentProvider) => Promise<DeploymentPlan | null>
  triggerDeployment: (provider: DeploymentProvider, envVars?: Record<string, string>, overrideCritical?: boolean) => Promise<DeploymentRecord | null>
  cancelActiveDeployment: (deploymentId: string) => Promise<void>
  rollbackActiveDeployment: (targetId?: string) => Promise<void>
  fetchDeploymentHistory: () => Promise<void>
}

export const useBuildStore = create<BuildStore>((set, get) => ({
  currentProject: null,
  projectsList: [],
  isBuilding: false,
  isEditing: false,
  isTwinPiPOpen: true,
  activeTab: 'preview',
  currentTaskId: null,

  // Section 2 Runtime State
  runtimeStatus: null,
  isRuntimeExecuting: false,
  workspaceFiles: [],
  fileChanges: [],
  runtimeActiveFileContent: null,

  // Section 3 Terminal & Package Manager State
  terminalSessions: [],
  activeTerminalSessionId: null,
  terminalHistory: [],
  isTerminalExecuting: false,
  packageInfo: null,

  // Section 5 Real Backend & Database State
  backendStatus: null,
  migrations: [],
  backendTestResults: null,
  isBackendLoading: false,
  backendError: null,

  // Section 6 Live Preview & Debugging State
  previewLifecycleState: 'not_built',
  previewLogs: [],
  previewNetworkErrors: [],
  previewRuntimeErrors: [],
  activeDebugResult: null,
  isDebugging: false,

  // Section 7 Testing & Security State
  testSuiteResult: null,
  codeQualityResult: null,
  securityScanResult: null,
  coverageSummary: null,
  testHistory: [],
  activeTestFixProposal: null,
  isTesting: false,
  isQualityChecking: false,
  isSecurityScanning: false,
  isCoverageRunning: false,
  isFixingTest: false,

  // Section 8 GitHub, Export & Deployment State
  githubStatus: null,
  githubRepos: [],
  githubBranches: [],
  githubCommits: [],
  githubDiff: null,
  githubConflict: null,
  exportManifest: null,
  exportValidation: null,
  deploymentConfig: null,
  configuredProviders: [],
  deploymentPlan: null,
  deploymentsList: [],
  activeDeployment: null,
  isGitHubLoading: false,
  isExportLoading: false,
  isDeployLoading: false,

  setTwinPiPOpen: (open) => set({ isTwinPiPOpen: open }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  setActiveFile: (path) => {
    const { currentProject } = get()
    if (!currentProject) return
    set({
      currentProject: {
        ...currentProject,
        activeFilePath: path,
      },
    })
  },

  setViewportMode: (viewportMode) => {
    const { currentProject } = get()
    if (!currentProject) return
    set({
      currentProject: {
        ...currentProject,
        viewportMode,
      },
    })
  },

  refreshPreview: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    let previewToken = ''
    try {
      const res = await agentRuntimeClient.requestPreviewToken(currentProject.id)
      if (res.previewToken) previewToken = res.previewToken
    } catch {}
    const previewUrl = agentRuntimeClient.getPreviewUrl(currentProject.id, previewToken || undefined)
    set({
      currentProject: {
        ...currentProject,
        previewUrl,
        previewKey: Date.now(),
      },
    })
    toast.success('Live preview refreshed')
  },

  startNewProject: async (prompt, userId, twinName = 'Your Twin', autoExecute = false) => {
    const initialLogs: BuildLogEntry[] = [
      {
        id: `log_init_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'agent',
        message: `Workflow state: received — Request: "${prompt}"`,
      },
    ]

    // Create preliminary project container in 'received' state
    const tempId = `temp_planning_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    const initialProject: BuildProjectState = {
      id: tempId,
      userId,
      name: 'Formulating Blueprint...',
      prompt,
      description: prompt,
      techStack: 'HTML5, Modern CSS, Modular JavaScript',
      status: 'received',
      plan: null,
      files: {},
      activeFilePath: 'index.html',
      logs: initialLogs,
      previewUrl: '',
      previewKey: Date.now(),
      viewportMode: 'desktop',
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    set({ currentProject: initialProject, isBuilding: true, activeTab: 'plan' })

    try {
      // Step: analyzing
      set((state) => ({
        currentProject: state.currentProject
          ? {
              ...state.currentProject,
              status: 'analyzing',
              logs: [
                ...state.currentProject.logs,
                {
                  id: `log_analyze_${Date.now()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  type: 'agent',
                  message: 'Workflow state: analyzing — Requirement classification and tech stack scoping...',
                },
              ],
            }
          : null,
      }))

      // Step: planning via real AI orchestrator backend
      set((state) => ({
        currentProject: state.currentProject
          ? {
              ...state.currentProject,
              status: 'planning',
              logs: [
                ...state.currentProject.logs,
                {
                  id: `log_plan_${Date.now()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  type: 'agent',
                  message: 'Workflow state: planning — Generating dynamic DAG execution plan and dependency schedule...',
                },
              ],
            }
          : null,
      }))

      const response = await orchestratorClient.orchestratePlan({
        prompt,
        userId,
        twinName,
      })

      const proj = response.project
      const plan = response.plan || proj.plan

      // Convert OrchestratorPlan to BuildPlan format for backward-compatible UI consumption
      const buildTasks: BuildTask[] = (proj.tasks || []).map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status as any,
        files: t.expected_files || [],
        dependencies: t.dependencies || [],
        required_tools: t.required_tools || [],
        verification_criteria: t.verification_criteria || '',
        execution_stage: t.execution_stage,
        can_run_parallel: t.can_run_parallel,
      }))

      const buildPlan: BuildPlan = {
        projectName: plan?.projectName || 'Project Blueprint',
        tagline: plan?.tagline || prompt,
        techStack: plan?.techStack || 'Web',
        pages: plan?.pages || ['Home'],
        features: plan?.features || [],
        theme: {
          primaryColor: plan?.theme?.primaryColor || '#da7756',
          accentColor: plan?.theme?.accentColor || '#10b981',
          bgMode: (plan?.theme?.bgMode as any) || 'dark',
          description: plan?.theme?.description || 'Modern dark theme',
        },
        packages: plan?.packages || [],
        tasks: buildTasks,
        executionStages: plan?.executionStages?.map((s) => ({
          stage: s.stage,
          taskIds: s.taskIds,
          canRunInParallel: s.canRunInParallel,
          description: s.description,
        })) || [],
        spokenSummary: response.spokenSummary || plan?.spokenSummary || '',
        needsClarification: response.needsClarification || plan?.needsClarification,
        clarificationQuestion: response.clarificationQuestion || plan?.clarificationQuestion,
      }

      const planLogs: BuildLogEntry[] = [
        ...(get().currentProject?.logs || initialLogs),
        {
          id: `log_plan_done_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          type: 'success',
          message: `Workflow state: awaiting_approval — Architecture plan formulated with ${buildTasks.length} DAG tasks`,
          detail: response.spokenSummary,
        },
      ]

      localStorage.setItem('another-me-active-project-id', proj.id)

      set((state) => ({
        isBuilding: false,
        activeTab: 'plan',
        currentProject: {
          id: proj.id,
          userId: proj.userId,
          name: plan?.projectName || proj.name,
          prompt,
          description: plan?.tagline || proj.description,
          techStack: plan?.techStack || 'Web',
          status: (proj.workflowState as ExecutionState) || 'awaiting_approval',
          plan: buildPlan,
          orchestratorPlan: plan,
          analysis: proj.analysis || null,
          files: {},
          activeFilePath: 'index.html',
          logs: planLogs,
          previewUrl: '',
          previewKey: Date.now(),
          viewportMode: 'desktop',
          error: null,
          createdAt: proj.createdAt,
          updatedAt: proj.updatedAt,
        },
      }))

      // Eagerly populate workspace files and folder tree
      get().fetchWorkspaceFiles().catch(() => {})

      if (response.needsClarification && response.clarificationQuestion) {
        speakText(`I have a quick question before finalizing the architecture: ${response.clarificationQuestion}`).catch(() => {})
        toast(response.clarificationQuestion, { icon: '🤔', duration: 7000 })
      } else if (response.spokenSummary) {
        speakText(response.spokenSummary).catch(() => {})
        toast.success('Architecture Blueprint ready for review')
      }
    } catch (err: any) {
      console.error('Orchestration error:', err)
      set((state) => ({
        isBuilding: false,
        currentProject: state.currentProject
          ? {
              ...state.currentProject,
              status: 'failed',
              error: err.message || 'Planning failed',
              logs: [
                ...state.currentProject.logs,
                {
                  id: `log_err_${Date.now()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  type: 'error',
                  message: `Planning engine error: ${err.message}`,
                },
              ],
            }
          : null,
      }))
      toast.error(err.message || 'AI Orchestrator encountered an error')
    }
  },

  approveAndBuild: async () => {
    const { currentProject } = get()
    if (!currentProject || !currentProject.plan) {
      toast.error('No project plan to execute')
      return
    }

    const { id: projectId, userId } = currentProject

    set((state) => ({
      isBuilding: true,
      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            logs: [
              ...state.currentProject.logs,
              {
                id: `log_appr_prep_${Date.now()}`,
                timestamp: new Date().toLocaleTimeString(),
                type: 'agent',
                message: 'Recording blueprint approval and assembling execution package...',
              },
            ],
          }
        : null,
    }))

    try {
      // Transition awaiting_approval -> approved -> ready_for_execution on server
      const response = await orchestratorClient.approvePlan(projectId, userId)

      const approvalLog: BuildLogEntry = {
        id: `log_appr_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'success',
        message: 'Workflow state: approved — Architecture blueprint approved by user.',
      }

      const readyLog: BuildLogEntry = {
        id: `log_ready_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'agent',
        message: 'Workflow state: ready_for_execution — Section 1 Planning & DAG validated. Prepared for Section 2 Coding Runtime.',
        detail: `Project: ${response.project.name} | Tasks: ${response.project.tasks?.length || 0} DAG tasks staged`,
      }

      set((state) => ({
        isBuilding: false,
        activeTab: 'plan',
        currentProject: state.currentProject
          ? {
              ...state.currentProject,
              status: 'ready_for_execution',
              executionBundle: response.executionBundle,
              logs: [...state.currentProject.logs, approvalLog, readyLog],
            }
          : null,
      }))

      speakText('Blueprint approved. The architecture and dependency graph are validated and ready for coding execution.').catch(() => {})
      toast.success('Blueprint approved! Ready for execution runtime.')
    } catch (err: any) {
      console.error('Approval error:', err)
      set({ isBuilding: false })
      toast.error(err.message || 'Failed to approve plan')
    }
  },

  requestPlanChanges: async (reason: string) => {
    const { currentProject } = get()
    if (!currentProject) {
      toast.error('No project active')
      return
    }

    set({ isBuilding: true })

    const requestLog: BuildLogEntry = {
      id: `log_replan_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'agent',
      message: `Workflow state: analyzing revision — Requesting changes: "${reason}"`,
    }

    set((state) => ({
      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            status: 'planning',
            logs: [...state.currentProject.logs, requestLog],
          }
        : null,
    }))

    try {
      const response = await orchestratorClient.rejectPlan(
        currentProject.id,
        currentProject.userId,
        reason,
        true // requestReplan
      )

      const proj = response.project
      const newPlan = response.plan || proj.plan

      const buildTasks: BuildTask[] = (proj.tasks || []).map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status as any,
        files: t.expected_files || [],
        dependencies: t.dependencies || [],
        required_tools: t.required_tools || [],
        verification_criteria: t.verification_criteria || '',
        execution_stage: t.execution_stage,
        can_run_parallel: t.can_run_parallel,
      }))

      const revisedBuildPlan: BuildPlan = {
        projectName: newPlan?.projectName || currentProject.name,
        tagline: newPlan?.tagline || currentProject.description,
        techStack: newPlan?.techStack || currentProject.techStack,
        pages: newPlan?.pages || ['Home'],
        features: newPlan?.features || [],
        theme: {
          primaryColor: newPlan?.theme?.primaryColor || '#da7756',
          accentColor: newPlan?.theme?.accentColor || '#10b981',
          bgMode: (newPlan?.theme?.bgMode as any) || 'dark',
          description: newPlan?.theme?.description || 'Revised theme',
        },
        packages: newPlan?.packages || [],
        tasks: buildTasks,
        executionStages: newPlan?.executionStages?.map((s) => ({
          stage: s.stage,
          taskIds: s.taskIds,
          canRunInParallel: s.canRunInParallel,
          description: s.description,
        })) || [],
        spokenSummary: newPlan?.spokenSummary || 'Plan revised based on your feedback.',
      }

      const revisedLog: BuildLogEntry = {
        id: `log_revised_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'success',
        message: 'Workflow state: awaiting_approval — Revised architecture formulated with your modifications.',
      }

      set((state) => ({
        isBuilding: false,
        activeTab: 'plan',
        currentProject: state.currentProject
          ? {
              ...state.currentProject,
              name: revisedBuildPlan.projectName,
              description: revisedBuildPlan.tagline,
              techStack: revisedBuildPlan.techStack,
              status: 'awaiting_approval',
              plan: revisedBuildPlan,
              orchestratorPlan: newPlan,
              logs: [...state.currentProject.logs, revisedLog],
            }
          : null,
      }))

      speakText(revisedBuildPlan.spokenSummary).catch(() => {})
      toast.success('Blueprint revised with your modifications!')
    } catch (err: any) {
      console.error('Plan modification error:', err)
      set({ isBuilding: false })
      toast.error(err.message || 'Failed to modify plan')
    }
  },

  rejectPlan: async (reason?: string) => {
    const { currentProject } = get()
    if (!currentProject) return

    try {
      await orchestratorClient.rejectPlan(
        currentProject.id,
        currentProject.userId,
        reason || 'User cancelled blueprint',
        false
      )

      set((state) => ({
        currentProject: state.currentProject
          ? {
              ...state.currentProject,
              status: 'rejected',
              logs: [
                ...state.currentProject.logs,
                {
                  id: `log_rej_${Date.now()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  type: 'error',
                  message: `Plan rejected: ${reason || 'User cancelled'}`,
                },
              ],
            }
          : null,
      }))

      toast('Plan rejected', { icon: '❌' })
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject plan')
    }
  },

  applyUserEdit: async (instruction) => {
    const { currentProject } = get()
    if (!currentProject || !currentProject.plan) {
      toast.error('No active website to edit')
      return
    }

    set({ isEditing: true })

    const editLog: BuildLogEntry = {
      id: `log_edit_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'agent',
      message: `Analyzing edit request: "${instruction}"`,
    }

    set((state) => ({
      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            logs: [...state.currentProject.logs, editLog],
          }
        : null,
    }))

    try {
      const result = await agentRuntimeClient.editProject(
        currentProject.id,
        instruction
      )

      const [files, changes, token] = await Promise.all([
        agentRuntimeClient.listFiles(currentProject.id).catch(() => []),
        agentRuntimeClient.getChanges(currentProject.id).catch(() => []),
        getClientAuthToken(),
      ])

      const updatedFiles = { ...currentProject.files }
      for (const mod of result.modifiedFiles) {
        if (mod.content) {
          updatedFiles[mod.path] = mod.content
        }
      }

      for (const f of files) {
        if (!f.isDirectory && !updatedFiles[f.relativePath]) {
          try {
            const fileData = await agentRuntimeClient.readFile(currentProject.id, f.relativePath)
            updatedFiles[f.relativePath] = fileData.content
          } catch {}
        }
      }

      let previewToken = ''
      try {
        const pRes = await agentRuntimeClient.requestPreviewToken(currentProject.id)
        if (pRes.previewToken) previewToken = pRes.previewToken
      } catch {}
      const previewUrl = agentRuntimeClient.getPreviewUrl(currentProject.id, previewToken || undefined)

      const successLog: BuildLogEntry = {
        id: `log_edit_ok_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'success',
        message: result.explanation,
        detail: `Modified files: ${result.modifiedFiles.map((f) => f.path).join(', ')}${
          result.buildResult ? ` | Docker build: ${result.buildResult.success ? 'succeeded' : 'failed'}` : ''
        }`,
      }

      set((state) => ({
        isEditing: false,
        activeTab: 'preview',
        workspaceFiles: files,
        fileChanges: changes,
        currentProject: state.currentProject
          ? {
              ...state.currentProject,
              files: updatedFiles,
              previewUrl,
              previewKey: Date.now(),
              logs: [...state.currentProject.logs, successLog],
            }
          : null,
      }))

      if (result.buildResult && !result.buildResult.success) {
        toast.error(`Build warning: ${result.buildResult.details || 'Compilation issues reported'}`)
      } else {
        toast.success('Website updated and rebuilt successfully')
      }
      speakText(result.spokenSummary).catch(() => {})
    } catch (err: any) {
      console.error('Edit error:', err)
      set((state) => ({
        isEditing: false,
        currentProject: state.currentProject
          ? {
              ...state.currentProject,
              logs: [
                ...state.currentProject.logs,
                {
                  id: `log_edit_err_${Date.now()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  type: 'error',
                  message: `Modification error: ${err.message}`,
                },
              ],
            }
          : null,
      }))
      toast.error(`Edit failed: ${err.message}`)
    }
  },

  loadProject: async (projectId: string, userId: string) => {
    try {
      // 1. Fetch from orchestrator API with server-side authentication
      const orchProj = await orchestratorClient.getProject(projectId, userId)
      if (orchProj && orchProj.plan) {
        const buildTasks: BuildTask[] = (orchProj.tasks || []).map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status as any,
          files: t.expected_files || [],
          dependencies: t.dependencies || [],
          required_tools: t.required_tools || [],
          verification_criteria: t.verification_criteria || '',
          execution_stage: t.execution_stage,
          can_run_parallel: t.can_run_parallel,
        }))

        const buildPlan: BuildPlan = {
          projectName: orchProj.plan.projectName || orchProj.name,
          tagline: orchProj.plan.tagline || orchProj.description,
          techStack: orchProj.plan.techStack || 'Web',
          pages: orchProj.plan.pages || ['Home'],
          features: orchProj.plan.features || [],
          theme: {
            primaryColor: orchProj.plan.theme?.primaryColor || '#da7756',
            accentColor: orchProj.plan.theme?.accentColor || '#10b981',
            bgMode: (orchProj.plan.theme?.bgMode as any) || 'dark',
            description: orchProj.plan.theme?.description || 'Theme',
          },
          packages: orchProj.plan.packages || [],
          tasks: buildTasks,
          executionStages: orchProj.plan.executionStages?.map((s) => ({
            stage: s.stage,
            taskIds: s.taskIds,
            canRunInParallel: s.canRunInParallel,
            description: s.description,
          })) || [],
          spokenSummary: orchProj.plan.spokenSummary || '',
        }

        const project: BuildProjectState = {
          id: orchProj.id,
          userId: orchProj.userId,
          name: orchProj.name,
          prompt: orchProj.description,
          description: orchProj.description,
          techStack: orchProj.plan.techStack || 'Web',
          status: (orchProj.workflowState as ExecutionState) || 'awaiting_approval',
          plan: buildPlan,
          orchestratorPlan: orchProj.plan,
          analysis: orchProj.analysis || null,
          files: {},
          activeFilePath: 'index.html',
          logs: [
            {
              id: `log_load_${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              type: 'info',
              message: `Restored project "${orchProj.name}" (Status: ${orchProj.workflowState})`,
            },
          ],
          previewUrl: '',
          previewKey: Date.now(),
          viewportMode: 'desktop',
          error: null,
          createdAt: orchProj.createdAt,
          updatedAt: orchProj.updatedAt,
        }

        localStorage.setItem('another-me-active-project-id', project.id)
        set({ currentProject: project, activeTab: 'plan' })

        // Restore runtime status, preview URL, and workspace files if project is ready or in-progress
        if (orchProj.workflowState === 'ready_for_execution' || orchProj.workflowState === 'approved' || (orchProj.workflowState as string) === 'completed') {
          try {
            const status = await agentRuntimeClient.getStatus(orchProj.id)
            const files = await agentRuntimeClient.listFiles(orchProj.id).catch(() => [])
            const changes = await agentRuntimeClient.getChanges(orchProj.id).catch(() => [])
            let previewToken = ''
            try {
              const pRes = await agentRuntimeClient.requestPreviewToken(orchProj.id)
              if (pRes.previewToken) previewToken = pRes.previewToken
            } catch {}
            const previewUrl = agentRuntimeClient.getPreviewUrl(orchProj.id, previewToken || undefined)
            set({
              runtimeStatus: status,
              workspaceFiles: files,
              fileChanges: changes,
              currentProject: {
                ...project,
                previewUrl,
              },
            })
          } catch {}
        }
        return
      }

      // 2. Fallback to workspace client for legacy projects
      const data = await workspaceClient.getProject(projectId, userId)
      if (!data) {
        localStorage.removeItem('another-me-active-project-id')
        toast.error('Project not found')
        throw new Error(`Project ${projectId} not found`)
      }

      const filesMap: Record<string, string> = {}
      data.files.forEach((f) => {
        filesMap[f.path] = f.content
      })

      const project: BuildProjectState = {
        id: data.project.id,
        userId: data.project.userId,
        name: data.project.name,
        prompt: data.project.description,
        description: data.project.description,
        techStack: data.project.techStack,
        status: (data.project.status as any) || 'completed',
        plan: data.project.plan || null,
        files: filesMap,
        activeFilePath: 'index.html',
        logs: data.project.logs || [],
        previewUrl: workspaceClient.getPreviewUrl(data.project.id, data.project.userId, 'index.html'),
        previewKey: Date.now(),
        viewportMode: 'desktop',
        error: null,
        createdAt: data.project.createdAt,
        updatedAt: data.project.updatedAt,
      }

      localStorage.setItem('another-me-active-project-id', project.id)
      set({ currentProject: project, activeTab: 'preview' })
    } catch (err: any) {
      console.warn(`Failed to load project: ${err.message}`)
      localStorage.removeItem('another-me-active-project-id')
      set({ currentProject: null })
      throw err
    }
  },

  downloadProjectZip: () => {
    const { currentProject } = get()
    if (!currentProject) {
      toast.error('No project to export')
      return
    }

    const exportUrl = workspaceClient.getExportZipUrl(currentProject.id, currentProject.userId)
    const a = document.createElement('a')
    a.href = exportUrl
    a.download = `${currentProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.success('Downloading project ZIP archive...')
  },

  resetProject: () => {
    localStorage.removeItem('another-me-active-project-id')
    set({
      currentProject: null,
      isBuilding: false,
      isEditing: false,
      runtimeStatus: null,
      isRuntimeExecuting: false,
      workspaceFiles: [],
      fileChanges: [],
      runtimeActiveFileContent: null,
      terminalSessions: [],
      activeTerminalSessionId: null,
      terminalHistory: [],
      isTerminalExecuting: false,
      packageInfo: null,
    })
  },

  startRuntimeExecution: async () => {
    const { currentProject } = get()
    if (!currentProject) {
      toast.error('No active project found')
      return
    }

    set({ isRuntimeExecuting: true, activeTab: 'logs' })
    toast.success('Starting Coding Agent Runtime...')
    speakText('Starting coding agent runtime in isolated workspace. Inspecting files and executing roadmap tasks.').catch(() => {})

    try {
      const res = await agentRuntimeClient.executeProject(currentProject.id)
      set({ runtimeStatus: res.status })

      const pollInterval = window.setInterval(async () => {
        try {
          const status = await agentRuntimeClient.getStatus(currentProject.id)
          const changes = await agentRuntimeClient.getChanges(currentProject.id).catch(() => [])
          const files = await agentRuntimeClient.listFiles(currentProject.id).catch(() => [])

          const updatedFiles: Record<string, string> = { ...get().currentProject?.files }
          for (const f of files) {
            if (!f.isDirectory && !updatedFiles[f.relativePath]) {
              try {
                const fileData = await agentRuntimeClient.readFile(currentProject.id, f.relativePath)
                updatedFiles[f.relativePath] = fileData.content
              } catch {}
            }
          }

          const updatedTasks = (get().currentProject?.tasks || []).map((t) => {
            const matchingStatusTask = status.tasks?.find((st) => st.id === t.id)
            return matchingStatusTask ? { ...t, status: matchingStatusTask.status as any } : t
          })

          set((state) => ({
            runtimeStatus: status,
            fileChanges: changes,
            workspaceFiles: files,
            currentProject: state.currentProject
              ? {
                  ...state.currentProject,
                  tasks: updatedTasks,
                  files: updatedFiles,
                }
              : null,
          }))

          if (status.executionState === 'completed') {
            clearInterval(pollInterval)
            let previewToken = ''
            try {
              const pRes = await agentRuntimeClient.requestPreviewToken(currentProject.id)
              if (pRes.previewToken) previewToken = pRes.previewToken
            } catch {}
            const previewUrl = agentRuntimeClient.getPreviewUrl(currentProject.id, previewToken || undefined)
            set((state) => ({
              isRuntimeExecuting: false,
              activeTab: 'preview',
              currentProject: state.currentProject
                ? {
                    ...state.currentProject,
                    previewUrl,
                    previewKey: Date.now(),
                  }
                : null,
            }))
            toast.success('All coding tasks verified and completed!')
            speakText('All coding tasks have been verified and built successfully in your workspace.').catch(() => {})
          } else if (status.executionState === 'failed') {
            clearInterval(pollInterval)
            set({ isRuntimeExecuting: false })
            toast.error('A coding task failed during execution or verification.')
          } else if (status.executionState === 'cancelled') {
            clearInterval(pollInterval)
            set({ isRuntimeExecuting: false })
            toast('Coding execution was cancelled.', { icon: '⚠️' })
          }
        } catch (pollErr) {
          console.warn('Status poll error:', pollErr)
        }
      }, 1500)
    } catch (err: any) {
      set({ isRuntimeExecuting: false })
      toast.error(err.message || 'Failed to start coding runtime')
    }
  },

  cancelRuntimeExecution: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      await agentRuntimeClient.cancelExecution(currentProject.id)
      toast('Cancellation requested...', { icon: '🛑' })
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel execution')
    }
  },

  retryRuntimeTask: async (taskId: string) => {
    const { currentProject } = get()
    if (!currentProject) return
    set({ isRuntimeExecuting: true, activeTab: 'logs' })
    toast.success(`Retrying task ${taskId}...`)
    try {
      const res = await agentRuntimeClient.retryTask(currentProject.id, taskId)
      set({ runtimeStatus: res.status })
      get().startRuntimeExecution()
    } catch (err: any) {
      set({ isRuntimeExecuting: false })
      toast.error(err.message || 'Retry failed')
    }
  },

  fetchWorkspaceFiles: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      const files = await agentRuntimeClient.listFiles(currentProject.id)
      const changes = await agentRuntimeClient.getChanges(currentProject.id)
      set({ workspaceFiles: files, fileChanges: changes })
    } catch {}
  },

  loadWorkspaceFileContent: async (path: string) => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      const res = await agentRuntimeClient.readFile(currentProject.id, path)
      set({
        runtimeActiveFileContent: res.content,
        currentProject: {
          ...currentProject,
          activeFilePath: path,
          files: {
            ...currentProject.files,
            [path]: res.content,
          },
        },
      })
    } catch (err: any) {
      toast.error(`Cannot read file: ${err.message}`)
    }
  },

  // Section 3 Terminal & Package Manager Actions
  loadTerminalSessions: async (projectId: string) => {
    if (!projectId || projectId.startsWith('temp_')) return
    try {
      const sessions = await agentRuntimeClient.listTerminalSessions(projectId)
      const activeId = get().activeTerminalSessionId || sessions[0]?.id || null
      set({ terminalSessions: sessions, activeTerminalSessionId: activeId })
      if (activeId) {
        const history = await agentRuntimeClient.getTerminalHistory(projectId, activeId)
        set({ terminalHistory: history })
      }
    } catch (err: any) {
      console.warn(`[buildStore] Failed to load terminal sessions: ${err.message}`)
      set({
        terminalSessions: [],
        activeTerminalSessionId: null,
        terminalHistory: [],
      })
    }
  },

  createTerminalSession: async (name?: string) => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      const session = await agentRuntimeClient.createTerminalSession(currentProject.id, name)
      const currentSessions = get().terminalSessions
      set({
        terminalSessions: [...currentSessions, session],
        activeTerminalSessionId: session.id,
        terminalHistory: session.commands || [],
      })
      toast.success(`Terminal session "${session.name}" created`)
    } catch (err: any) {
      toast.error(`Cannot create terminal session: ${err.message}`)
    }
  },

  setActiveTerminalSessionId: (sessionId: string) => {
    const { currentProject } = get()
    set({ activeTerminalSessionId: sessionId })
    if (currentProject) {
      agentRuntimeClient.getTerminalHistory(currentProject.id, sessionId)
        .then((history) => set({ terminalHistory: history }))
        .catch(() => {})
    }
  },

  executeTerminalCommand: async (command: string, args?: string[]) => {
    const { currentProject, activeTerminalSessionId } = get()
    if (!currentProject) {
      toast.error('No active project found')
      return null
    }

    let sessionId = activeTerminalSessionId
    if (!sessionId) {
      const sessions = await agentRuntimeClient.listTerminalSessions(currentProject.id).catch(() => [])
      sessionId = sessions[0]?.id || 'default'
      set({ activeTerminalSessionId: sessionId })
    }

    set({ isTerminalExecuting: true })

    try {
      const record = await agentRuntimeClient.executeTerminalCommand(
        currentProject.id,
        sessionId,
        command,
        args
      )

      const history = await agentRuntimeClient.getTerminalHistory(currentProject.id, sessionId).catch(() => [])
      set({
        terminalHistory: history.length > 0 ? history : [...get().terminalHistory, record],
        isTerminalExecuting: false,
      })

      if (record.status === 'blocked_sandbox_required') {
        toast.error(`Command blocked: Sandbox container required for "${command}"`)
      } else if (record.status === 'succeeded') {
        // Success
      } else if (record.status === 'failed') {
        toast.error(`Command exited with error code ${record.exitCode}`)
      } else if (record.status === 'timed_out') {
        toast.error(`Command timed out`)
      } else if (record.status === 'cancelled') {
        toast('Command cancelled by user', { icon: '🛑' })
      }

      return record
    } catch (err: any) {
      set({ isTerminalExecuting: false })
      toast.error(`Terminal error: ${err.message}`)
      return null
    }
  },

  cancelTerminalCommand: async (commandId?: string) => {
    const { currentProject, activeTerminalSessionId } = get()
    if (!currentProject || !activeTerminalSessionId) return
    try {
      await agentRuntimeClient.cancelTerminalCommand(currentProject.id, activeTerminalSessionId, commandId)
      set({ isTerminalExecuting: false })
      const history = await agentRuntimeClient.getTerminalHistory(currentProject.id, activeTerminalSessionId)
      set({ terminalHistory: history })
      toast.success('Terminal command cancelled')
    } catch (err: any) {
      toast.error(`Failed to cancel command: ${err.message}`)
    }
  },

  loadTerminalHistory: async (sessionId?: string) => {
    const { currentProject, activeTerminalSessionId } = get()
    if (!currentProject) return
    const targetSessionId = sessionId || activeTerminalSessionId || undefined
    try {
      const history = await agentRuntimeClient.getTerminalHistory(currentProject.id, targetSessionId)
      set({ terminalHistory: history })
    } catch {}
  },

  clearTerminalHistory: async (sessionId?: string) => {
    const { currentProject, activeTerminalSessionId } = get()
    if (!currentProject) return
    const targetSessionId = sessionId || activeTerminalSessionId
    if (!targetSessionId) return
    try {
      await agentRuntimeClient.clearTerminalHistory(currentProject.id, targetSessionId)
      set({ terminalHistory: [] })
      toast.success('Terminal history cleared')
    } catch (err: any) {
      toast.error(`Cannot clear history: ${err.message}`)
    }
  },

  inspectPackages: async (silent = false) => {
    const { currentProject } = get()
    if (!currentProject || currentProject.id.startsWith('temp_')) {
      if (!silent && !currentProject?.id.startsWith('temp_')) toast.error('No active project found')
      return null
    }
    try {
      const result = await agentRuntimeClient.listProjectPackages(currentProject.id)
      set({ packageInfo: result })
      if (!silent) {
        if (result.success) {
          toast.success(`Inspected ${Object.keys(result.packages || {}).length} packages`)
        } else {
          toast.error(result.details || 'Failed to inspect packages')
        }
      }
      return result
    } catch (err: any) {
      if (!silent) {
        toast.error(`Package inspection error: ${err.message}`)
      } else {
        console.warn(`[buildStore] Package inspection: ${err.message}`)
      }
      return null
    }
  },

  installPackage: async (packageName?: string) => {
    const { currentProject } = get()
    if (!currentProject) {
      toast.error('No active project found')
      return null
    }
    try {
      const result = await agentRuntimeClient.installProjectPackage(currentProject.id, packageName)
      if (result.status === 'blocked_missing_sandbox') {
        toast.error(result.details)
      } else if (result.success) {
        toast.success(result.details)
        await get().inspectPackages()
      } else {
        toast.error(result.details)
      }
      return result
    } catch (err: any) {
      toast.error(`Install error: ${err.message}`)
      return null
    }
  },

  buildProject: async () => {
    const { currentProject } = get()
    if (!currentProject) {
      toast.error('No active project found')
      return null
    }
    try {
      const result = await agentRuntimeClient.buildProject(currentProject.id)
      if (result.status === 'blocked_missing_sandbox') {
        toast.error(result.details)
      } else if (result.success) {
        toast.success('Project build succeeded inside container!')
      } else {
        toast.error(result.details || 'Build failed')
      }
      return result
    } catch (err: any) {
      toast.error(`Build error: ${err.message}`)
      return null
    }
  },

  // Section 5 Backend & Database Actions
  fetchBackendStatus: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      set({ isBackendLoading: true, backendError: null })
      const status = await agentRuntimeClient.getBackendStatus(currentProject.id)
      set({ backendStatus: status, isBackendLoading: false })
    } catch (err: any) {
      set({ backendError: err.message, isBackendLoading: false })
    }
  },

  startBackendServer: async () => {
    const { currentProject } = get()
    if (!currentProject) {
      toast.error('No active project found')
      return
    }
    try {
      set({ isBackendLoading: true, backendError: null })
      toast.loading('Starting isolated backend container...', { id: 'backend-start' })
      const status = await agentRuntimeClient.startBackend(currentProject.id)
      set({ backendStatus: status, isBackendLoading: false })
      if (status.running) {
        toast.success(`Backend server running on 127.0.0.1:${status.port}!`, { id: 'backend-start' })
      } else {
        toast.error(`Backend start failed: ${status.error || 'Server did not respond'}`, { id: 'backend-start' })
      }
    } catch (err: any) {
      set({ backendError: err.message, isBackendLoading: false })
      toast.error(`Failed to start backend: ${err.message}`, { id: 'backend-start' })
    }
  },

  stopBackendServer: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      set({ isBackendLoading: true })
      await agentRuntimeClient.stopBackend(currentProject.id)
      await get().fetchBackendStatus()
      toast.success('Backend server container stopped.')
    } catch (err: any) {
      toast.error(`Error stopping backend: ${err.message}`)
      set({ isBackendLoading: false })
    }
  },

  fetchMigrations: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      const res = await agentRuntimeClient.getMigrations(currentProject.id)
      set({ migrations: res.migrations || [] })
    } catch (err: any) {
      console.error('Error fetching migrations:', err)
    }
  },

  applyMigrations: async (confirmDestructive?: boolean) => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isBackendLoading: true })
      const result = await agentRuntimeClient.applyMigrations(currentProject.id, { confirmDestructive })
      if (result.status === 'destructive_blocked') {
        toast.error(result.details, { duration: 6000 })
      } else if (result.success) {
        toast.success(result.details)
        await get().fetchMigrations()
        await get().fetchBackendStatus()
      } else {
        toast.error(result.details || 'Migration failed')
      }
      set({ isBackendLoading: false })
      return result
    } catch (err: any) {
      toast.error(`Migration error: ${err.message}`)
      set({ isBackendLoading: false })
      return null
    }
  },

  rollbackMigration: async () => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isBackendLoading: true })
      const result = await agentRuntimeClient.rollbackMigration(currentProject.id)
      if (result.success) {
        toast.success(result.details)
        await get().fetchMigrations()
        await get().fetchBackendStatus()
      } else {
        toast.error(result.details)
      }
      set({ isBackendLoading: false })
      return result
    } catch (err: any) {
      toast.error(`Rollback error: ${err.message}`)
      set({ isBackendLoading: false })
      return null
    }
  },

  seedDatabase: async () => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isBackendLoading: true })
      const result = await agentRuntimeClient.seedDatabase(currentProject.id)
      if (result.success) {
        toast.success(result.details)
        await get().fetchBackendStatus()
      } else {
        toast.error(result.details || 'Seeding failed')
      }
      set({ isBackendLoading: false })
      return result
    } catch (err: any) {
      toast.error(`Seed error: ${err.message}`)
      set({ isBackendLoading: false })
      return null
    }
  },

  runBackendTests: async () => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isBackendLoading: true })
      toast.loading('Running automated endpoint tests against backend container...', { id: 'backend-test' })
      const suite = await agentRuntimeClient.testBackend(currentProject.id)
      set({ backendTestResults: suite, isBackendLoading: false })
      if (suite.success) {
        toast.success(suite.summary, { id: 'backend-test' })
      } else {
        toast.error(suite.summary, { id: 'backend-test' })
      }
      return suite
    } catch (err: any) {
      toast.error(`Backend test error: ${err.message}`, { id: 'backend-test' })
      set({ isBackendLoading: false })
      return null
    }
  },

  generateBackendApi: async (instruction: string) => {
    const { currentProject } = get()
    if (!currentProject) {
      toast.error('No active project found')
      return
    }
    try {
      set({ isBackendLoading: true })
      toast.loading('Generating real backend source files and database migrations...', { id: 'backend-gen' })
      const res = await agentRuntimeClient.generateBackend(currentProject.id, instruction)
      if (res.success) {
        toast.success(res.explanation, { id: 'backend-gen' })
        await get().fetchWorkspaceFiles()
        await get().fetchMigrations()
        await get().fetchBackendStatus()
      } else {
        toast.error('Backend generation failed.', { id: 'backend-gen' })
      }
      set({ isBackendLoading: false })
    } catch (err: any) {
      toast.error(`Generation error: ${err.message}`, { id: 'backend-gen' })
      set({ isBackendLoading: false })
    }
  },

  // ------------------------------------------------------------------
  // SECTION 6: LIVE PREVIEW & DEBUGGING ACTIONS
  // ------------------------------------------------------------------

  fetchPreviewStatus: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      const res = await agentRuntimeClient.getPreviewStatus(currentProject.id)
      if (res?.status) {
        set({
          previewLifecycleState: res.status.state,
          previewLogs: (res.status.recentLogs as any) || [],
        })
      }
    } catch {}
  },

  startLivePreview: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      set({ previewLifecycleState: 'building' })
      toast.loading('Starting project preview in isolated Docker sandbox...', { id: 'preview-start' })
      const res = await agentRuntimeClient.startPreview(currentProject.id)
      set({ previewLifecycleState: res.status?.state || 'ready' })
      await get().refreshPreview()
      toast.success('Live preview started', { id: 'preview-start' })
    } catch (err: any) {
      toast.error(`Preview start error: ${err.message}`, { id: 'preview-start' })
      set({ previewLifecycleState: 'failed' })
    }
  },

  stopLivePreview: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      await agentRuntimeClient.stopPreview(currentProject.id)
      set({ previewLifecycleState: 'stopped' })
      await get().refreshPreview()
      toast.success('Live preview stopped')
    } catch (err: any) {
      toast.error(`Preview stop error: ${err.message}`)
    }
  },

  restartLivePreview: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      set({ previewLifecycleState: 'building' })
      toast.loading('Rebuilding project in Docker sandbox...', { id: 'preview-restart' })
      const res = await agentRuntimeClient.restartPreview(currentProject.id)
      set({ previewLifecycleState: res.status?.state || 'ready' })
      await get().refreshPreview()
      toast.success('Live preview restarted', { id: 'preview-restart' })
    } catch (err: any) {
      toast.error(`Preview restart error: ${err.message}`, { id: 'preview-restart' })
      set({ previewLifecycleState: 'failed' })
    }
  },

  fetchPreviewLogs: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      const res = await agentRuntimeClient.getPreviewLogs(currentProject.id)
      if (res.logs) {
        set({ previewLogs: res.logs as any })
      }
    } catch {}
  },

  debugLiveError: async (errorContext) => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isDebugging: true })
      toast.loading('AI Twin is diagnosing the error and preparing a fix...', { id: 'debug-live' })
      const res = await agentRuntimeClient.debugProject(currentProject.id, {
        ...errorContext,
        autoApply: true,
      })
      set({ activeDebugResult: res, isDebugging: false })
      if (res.success) {
        toast.success(res.diagnosis || 'Fix applied successfully!', { id: 'debug-live' })
        await get().fetchWorkspaceFiles()
        await get().refreshPreview()
        get().clearPreviewErrors()
      } else {
        toast.error(res.error || 'Debugging could not fix the issue automatically.', { id: 'debug-live' })
      }
      return res
    } catch (err: any) {
      set({ isDebugging: false })
      toast.error(`Debugging failed: ${err.message}`, { id: 'debug-live' })
      return null
    }
  },

  addPreviewNetworkError: (err) => {
    set((state) => ({
      previewNetworkErrors: [
        ...state.previewNetworkErrors.slice(-19),
        { ...err, timestamp: new Date().toLocaleTimeString() },
      ],
    }))
  },

  addPreviewRuntimeError: (err) => {
    set((state) => ({
      previewRuntimeErrors: [
        ...state.previewRuntimeErrors.slice(-19),
        { ...err, timestamp: new Date().toLocaleTimeString() },
      ],
    }))
  },

  clearPreviewErrors: () => {
    set({ previewRuntimeErrors: [], previewNetworkErrors: [], activeDebugResult: null })
  },

  // Section 7 Testing & Security Actions
  runProjectTests: async (filter) => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isTesting: true })
      toast.loading('Running tests inside isolated Docker sandbox...', { id: 'run-tests' })
      const res = await agentRuntimeClient.runTests(currentProject.id, { filter })
      set({ testSuiteResult: res, isTesting: false })
      if (res.status === 'passed') {
        toast.success(`Tests passed: ${res.passed}/${res.total} tests`, { id: 'run-tests' })
      } else if (res.status === 'timed_out') {
        toast.error('Tests timed out in container sandbox.', { id: 'run-tests' })
      } else {
        toast.error(`Tests failed: ${res.failed} failure(s)`, { id: 'run-tests' })
      }
      await get().fetchTestHistory()
      return res
    } catch (err: any) {
      set({ isTesting: false })
      toast.error(`Test run error: ${err.message}`, { id: 'run-tests' })
      return null
    }
  },

  cancelProjectTests: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      await agentRuntimeClient.cancelTests(currentProject.id)
      set({ isTesting: false })
      toast.success('Test run cancelled.', { id: 'run-tests' })
    } catch (err: any) {
      toast.error(`Cancellation failed: ${err.message}`)
    }
  },

  fetchTestHistory: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      const res = await agentRuntimeClient.getTestHistory(currentProject.id)
      if (res.history) {
        set({ testHistory: res.history })
      }
    } catch {}
  },

  runCodeQualityAudit: async () => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isQualityChecking: true })
      toast.loading('Analyzing TypeScript types, linter, and build...', { id: 'code-quality' })
      const res = await agentRuntimeClient.runQualityChecks(currentProject.id)
      set({ codeQualityResult: res, isQualityChecking: false })
      if (res.overallStatus === 'passed') {
        toast.success('Code quality checks passed!', { id: 'code-quality' })
      } else {
        toast.error(`Code quality issues detected: ${res.typeCheck.errorsCount + res.linter.errorsCount} error(s)`, { id: 'code-quality' })
      }
      return res
    } catch (err: any) {
      set({ isQualityChecking: false })
      toast.error(`Quality check failed: ${err.message}`, { id: 'code-quality' })
      return null
    }
  },

  runSecurityAudit: async () => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isSecurityScanning: true })
      toast.loading('Scanning secrets, dependencies, and code security...', { id: 'sec-scan' })
      const res = await agentRuntimeClient.runSecurityScan(currentProject.id)
      set({ securityScanResult: res, isSecurityScanning: false })
      if (res.summary.total === 0) {
        toast.success('Automated security scan completed with 0 detected issues.', { id: 'sec-scan' })
      } else {
        toast.error(`Security scan flagged ${res.summary.total} potential issue(s).`, { id: 'sec-scan' })
      }
      return res
    } catch (err: any) {
      set({ isSecurityScanning: false })
      toast.error(`Security scan failed: ${err.message}`, { id: 'sec-scan' })
      return null
    }
  },

  runCoverageAnalysis: async () => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isCoverageRunning: true })
      toast.loading('Measuring test coverage...', { id: 'test-coverage' })
      const res = await agentRuntimeClient.runCoverage(currentProject.id)
      set({ coverageSummary: res.coverage, isCoverageRunning: false })
      if (res.coverage && res.coverage.available) {
        toast.success(`Coverage measured: ${res.coverage.lines.pct}% lines`, { id: 'test-coverage' })
      } else {
        toast('Coverage tooling not configured in project.', { icon: 'ℹ️', id: 'test-coverage' })
      }
      return res.coverage
    } catch (err: any) {
      set({ isCoverageRunning: false })
      toast.error(`Coverage run failed: ${err.message}`, { id: 'test-coverage' })
      return null
    }
  },

  proposeFixForFinding: async (finding) => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isFixingTest: true })
      toast.loading('AI Twin is generating a targeted fix proposal...', { id: 'test-fix' })
      const res = await agentRuntimeClient.proposeTestFix(currentProject.id, {
        fixType: finding.fixType || 'test_failure',
        title: finding.title || 'AI Fix Proposal',
        description: finding.description,
        file: finding.file,
        line: finding.line,
        errorStack: finding.errorStack,
        evidence: finding.evidence,
      })
      set({ activeTestFixProposal: res.proposal, isFixingTest: false })
      toast.success('Fix proposal generated! Review the diff before applying.', { id: 'test-fix' })
      return res.proposal
    } catch (err: any) {
      set({ isFixingTest: false })
      toast.error(`Failed to propose fix: ${err.message}`, { id: 'test-fix' })
      return null
    }
  },

  applyTestFixProposal: async (proposal: TestFixProposal) => {
    const { currentProject } = get()
    if (!currentProject) return false
    try {
      toast.loading('Applying user-approved fix...', { id: 'apply-fix' })
      const res = await agentRuntimeClient.applyTestFix(currentProject.id, proposal)
      if (res.success) {
        toast.success('Fix applied successfully!', { id: 'apply-fix' })
        set({ activeTestFixProposal: null })
        await get().fetchWorkspaceFiles()
        if (res.rerunResult) {
          set({ testSuiteResult: res.rerunResult })
        }
        return true
      } else {
        toast.error('Failed to apply fix.', { id: 'apply-fix' })
        return false
      }
    } catch (err: any) {
      toast.error(`Failed to apply fix: ${err.message}`, { id: 'apply-fix' })
      return false
    }
  },

  clearTestFixProposal: () => {
    set({ activeTestFixProposal: null })
  },

  // ==================================================================
  // SECTION 8: GITHUB, EXPORT & DEPLOYMENT ACTIONS
  // ==================================================================

  fetchGitHubStatus: async () => {
    try {
      set({ isGitHubLoading: true })
      const status = await agentRuntimeClient.getGitHubStatus()
      set({ githubStatus: status, isGitHubLoading: false })
    } catch {
      set({ isGitHubLoading: false })
    }
  },

  connectGitHubToken: async (token: string) => {
    try {
      set({ isGitHubLoading: true })
      toast.loading('Connecting GitHub account...', { id: 'gh-conn' })
      const status = await agentRuntimeClient.connectGitHub(token)
      set({ githubStatus: status, isGitHubLoading: false })
      toast.success(`Connected to GitHub as @${status.username}!`, { id: 'gh-conn' })
      get().loadGitHubRepos().catch(() => {})
      return true
    } catch (err: any) {
      set({ isGitHubLoading: false })
      toast.error(`GitHub connection failed: ${err.message}`, { id: 'gh-conn' })
      return false
    }
  },

  disconnectGitHubSession: async () => {
    try {
      await agentRuntimeClient.disconnectGitHub()
      set({
        githubStatus: { connected: false },
        githubRepos: [],
        githubBranches: [],
        githubCommits: [],
        githubDiff: null,
      })
      toast.success('GitHub disconnected.')
    } catch (err: any) {
      toast.error(`Failed to disconnect GitHub: ${err.message}`)
    }
  },

  loadGitHubRepos: async () => {
    const { currentProject, githubStatus } = get()
    if (!currentProject) return
    if (!githubStatus?.connected) return
    try {
      set({ isGitHubLoading: true })
      const res = await agentRuntimeClient.listGitHubRepos(currentProject.id)
      set({ githubRepos: res.repos || [], isGitHubLoading: false })
    } catch (err: any) {
      set({ isGitHubLoading: false })
      if (err.statusCode !== 401 && !err.message?.includes('connection required') && !err.message?.includes('401')) {
        toast.error(`Failed to load repositories: ${err.message}`)
      }
    }
  },

  createNewGitHubRepo: async (name: string, description?: string, isPrivate: boolean = true) => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isGitHubLoading: true })
      toast.loading(`Creating repository "${name}" on GitHub...`, { id: 'create-repo' })
      const res = await agentRuntimeClient.createGitHubRepo(currentProject.id, {
        name,
        description,
        private: isPrivate,
        confirmCreate: true,
      })
      toast.success(`Repository created: ${res.repo.fullName}`, { id: 'create-repo' })
      await get().loadGitHubRepos()
      set({ isGitHubLoading: false })
      return res.repo
    } catch (err: any) {
      set({ isGitHubLoading: false })
      toast.error(`Failed to create repository: ${err.message}`, { id: 'create-repo' })
      return null
    }
  },

  loadGitHubBranches: async (owner: string, repo: string) => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      const res = await agentRuntimeClient.listGitHubBranches(currentProject.id, owner, repo)
      set({ githubBranches: res.branches || [] })
    } catch (err: any) {
      toast.error(`Failed to load branches: ${err.message}`)
    }
  },

  loadGitHubCommits: async (owner: string, repo: string, branch = 'main') => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      const res = await agentRuntimeClient.getGitHubCommits(currentProject.id, owner, repo, branch)
      set({ githubCommits: res.commits || [] })
    } catch (err: any) {
      toast.error(`Failed to load commits: ${err.message}`)
    }
  },

  fetchGitHubDiff: async (owner: string, repo: string, branch = 'main') => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      set({ isGitHubLoading: true })
      const diff = await agentRuntimeClient.getGitHubDiff(currentProject.id, owner, repo, branch)
      set({ githubDiff: diff, isGitHubLoading: false })
    } catch (err: any) {
      set({ isGitHubLoading: false })
      toast.error(`Failed to calculate diff: ${err.message}`)
    }
  },

  pushToGitHubRepo: async (
    owner: string,
    repo: string,
    branch: string,
    commitMessage: string,
    expectedBaseSha?: string,
    resolutionStrategy?: GitHubResolutionStrategy,
    resolvedFiles?: GitHubFileResolution[]
  ) => {
    const { currentProject, githubDiff } = get()
    if (!currentProject) return false
    try {
      set({ isGitHubLoading: true })
      toast.loading(`Pushing changes to ${owner}/${repo}:${branch}...`, { id: 'gh-push' })
      const baseSha = expectedBaseSha || githubDiff?.baseSha
      const res = await agentRuntimeClient.pushToGitHub(currentProject.id, {
        owner,
        repo,
        branch,
        commitMessage,
        confirmPush: true,
        expectedBaseSha: baseSha,
        resolutionStrategy,
        resolvedFiles,
      })
      set({ isGitHubLoading: false, githubConflict: null })
      toast.success(`Pushed ${res.pushedFiles.length} file(s) successfully! (${res.commitSha.slice(0, 7)})`, { id: 'gh-push' })
      await get().loadGitHubCommits(owner, repo, branch)
      await get().fetchGitHubDiff(owner, repo, branch)
      return true
    } catch (err: any) {
      set({ isGitHubLoading: false })
      if (err.code === 'GITHUB_PUSH_CONFLICT' && err.details) {
        set({ githubConflict: err.details })
        toast.error(`Push conflict: Remote branch "${branch}" has diverged. Review resolution below.`, { id: 'gh-push' })
        return false
      }
      toast.error(`Push rejected: ${err.message}`, { id: 'gh-push' })
      return false
    }
  },

  clearGitHubConflict: () => set({ githubConflict: null }),

  resolveGitHubConflictAndPush: async (
    owner: string,
    repo: string,
    branch: string,
    commitMessage: string,
    strategy: GitHubResolutionStrategy,
    resolvedFiles?: GitHubFileResolution[]
  ) => {
    const { githubConflict } = get()
    if (!githubConflict) return false
    return get().pushToGitHubRepo(
      owner,
      repo,
      branch,
      commitMessage || 'Merge remote changes and resolve conflicts',
      githubConflict.currentRemoteSha,
      strategy,
      resolvedFiles
    )
  },

  inspectProjectExport: async () => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isExportLoading: true })
      const manifest = await agentRuntimeClient.inspectExport(currentProject.id)
      set({ exportManifest: manifest, isExportLoading: false })
      return manifest
    } catch (err: any) {
      set({ isExportLoading: false })
      toast.error(`Export inspection failed: ${err.message}`)
      return null
    }
  },

  validateProjectExport: async () => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isExportLoading: true })
      const val = await agentRuntimeClient.validateExport(currentProject.id)
      set({ exportValidation: val, isExportLoading: false })
      if (val.valid) {
        toast.success(`Archive validated: ${val.entryCount} clean files verified.`)
      } else {
        toast.error(`Archive validation failed: ${val.errors.join(', ')}`)
      }
      return val
    } catch (err: any) {
      set({ isExportLoading: false })
      toast.error(`Validation error: ${err.message}`)
      return null
    }
  },

  downloadCleanZip: () => {
    const { currentProject } = get()
    if (!currentProject) {
      toast.error('No project to export')
      return
    }
    const exportUrl = agentRuntimeClient.getExportDownloadUrl(currentProject.id)
    const a = document.createElement('a')
    a.href = exportUrl
    a.download = `${currentProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-clean.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.success('Downloading clean project ZIP (secrets & caches excluded)...')
  },

  fetchDeploymentConfig: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      set({ isDeployLoading: true })
      const res = await agentRuntimeClient.getDeploymentConfig(currentProject.id)
      set({
        deploymentConfig: res.config,
        configuredProviders: res.providers || [],
        isDeployLoading: false,
      })
    } catch (err: any) {
      set({ isDeployLoading: false })
      toast.error(`Failed to detect deployment config: ${err.message}`)
    }
  },

  fetchDeploymentPlan: async (provider: DeploymentProvider) => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isDeployLoading: true })
      const plan = await agentRuntimeClient.getDeploymentPlan(currentProject.id, provider)
      set({ deploymentPlan: plan, isDeployLoading: false })
      return plan
    } catch (err: any) {
      set({ isDeployLoading: false })
      toast.error(`Failed to generate deployment plan: ${err.message}`)
      return null
    }
  },

  triggerDeployment: async (
    provider: DeploymentProvider,
    envVars?: Record<string, string>,
    overrideCritical?: boolean
  ) => {
    const { currentProject } = get()
    if (!currentProject) return null
    try {
      set({ isDeployLoading: true })
      toast.loading(`Deploying to ${provider.toUpperCase()} (containerized build & publish)...`, { id: 'deploy-run' })
      const record = await agentRuntimeClient.executeDeployment(currentProject.id, {
        provider,
        confirmDeploy: true,
        approved: true,
        envVars,
        overrideCriticalSecurity: overrideCritical,
      })
      set({ activeDeployment: record, isDeployLoading: false })
      if (record.status === 'ready') {
        toast.success(`Deployment live at ${record.deploymentUrl}!`, { id: 'deploy-run' })
      } else if (record.status === 'failed') {
        toast.error(`Deployment failed: ${record.error || 'Check build logs'}`, { id: 'deploy-run' })
      }
      await get().fetchDeploymentHistory()
      return record
    } catch (err: any) {
      set({ isDeployLoading: false })
      toast.error(`Deployment error: ${err.message}`, { id: 'deploy-run' })
      return null
    }
  },

  cancelActiveDeployment: async (deploymentId: string) => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      const record = await agentRuntimeClient.cancelDeployment(currentProject.id, deploymentId)
      set({ activeDeployment: record })
      toast('Deployment cancelled by user.', { icon: '🛑' })
      await get().fetchDeploymentHistory()
    } catch (err: any) {
      toast.error(`Failed to cancel: ${err.message}`)
    }
  },

  rollbackActiveDeployment: async (targetId?: string) => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      set({ isDeployLoading: true })
      toast.loading('Initiating instant deployment rollback...', { id: 'rollback' })
      const record = await agentRuntimeClient.rollbackDeployment(currentProject.id, targetId)
      set({ activeDeployment: record, isDeployLoading: false })
      toast.success(`Rolled back! Traffic restored to ${record.deploymentUrl}`, { id: 'rollback' })
      await get().fetchDeploymentHistory()
    } catch (err: any) {
      set({ isDeployLoading: false })
      toast.error(`Rollback failed: ${err.message}`, { id: 'rollback' })
    }
  },

  fetchDeploymentHistory: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    try {
      const res = await agentRuntimeClient.getDeploymentHistory(currentProject.id)
      set({ deploymentsList: res.deployments || [] })
    } catch {}
  },
}))
