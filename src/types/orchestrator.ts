// ====================================================================
// ANOTHER ME — SECTION 1: AI ORCHESTRATOR & PLANNING ENGINE TYPES
// ====================================================================

export type RequestClassificationType =
  | 'new_website'
  | 'modify_project'
  | 'frontend_feature'
  | 'backend_api'
  | 'database_connection'
  | 'install_dependencies'
  | 'debug_error'
  | 'run_tests'
  | 'deploy_app'
  | 'general_query'

export type WorkflowState =
  | 'received'
  | 'analyzing'
  | 'planning'
  | 'awaiting_approval'
  | 'approved'
  | 'ready_for_execution'
  | 'rejected'
  | 'failed'

export type OrchestratorTaskType =
  | 'architecture'
  | 'design_system'
  | 'frontend_ui'
  | 'backend_api'
  | 'database_setup'
  | 'dependency_install'
  | 'testing'
  | 'configuration'
  | 'debugging'
  | 'deployment'

export interface OrchestratorTask {
  id: string
  title: string
  description: string
  task_type: OrchestratorTaskType
  dependencies: string[]
  required_tools: string[]
  expected_files: string[]
  verification_criteria: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  execution_stage: number
  can_run_parallel: boolean
}

export interface RequirementAnalysisResult {
  classification: RequestClassificationType
  confidence: number
  summary: string
  extractedGoals: string[]
  detectedTechStack: string[]
  targetDomain: string
  needsClarification: boolean
  clarificationQuestion?: string
  requiresPlanning: boolean
}

export interface OrchestratorPlan {
  id: string
  projectId: string
  projectName: string
  tagline: string
  techStack: string
  architectureSummary: string
  classification: RequestClassificationType
  pages: string[]
  features: string[]
  theme: {
    primaryColor: string
    accentColor: string
    bgMode: 'dark' | 'light' | 'custom'
    description: string
  }
  externalServices: {
    service: string
    purpose: string
    credentialsRequired: string
  }[]
  packages: string[]
  databaseTables: string[]
  apiRoutes: string[]
  tasks: OrchestratorTask[]
  executionStages: {
    stage: number
    taskIds: string[]
    canRunInParallel: boolean
    description: string
  }[]
  spokenSummary: string
  needsClarification: boolean
  clarificationQuestion?: string
}

export interface OrchestratorEvent {
  id: string
  projectId: string
  userId: string
  eventType: string
  fromState?: WorkflowState
  toState: WorkflowState
  message: string
  timestamp: string
  metadata?: Record<string, any>
}

export interface ExecutionBundle {
  preparedAt: string
  totalTasks: number
  stages: {
    stage: number
    taskIds: string[]
    canRunInParallel: boolean
  }[]
  requiredTools: string[]
  boundaryNotice: string
  readyForRuntime: boolean
}

export interface OrchestratorProject {
  id: string
  userId: string
  name: string
  description: string
  userPrompt: string
  requestClassification: RequestClassificationType
  workflowState: WorkflowState
  analysis: RequirementAnalysisResult | null
  plan: OrchestratorPlan | null
  tasks: OrchestratorTask[]
  events: OrchestratorEvent[]
  executionBundle?: ExecutionBundle
  createdAt: string
  updatedAt: string
  approvedAt?: string
  readyAt?: string
}
