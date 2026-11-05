import type {
  RequirementAnalysisResult,
  OrchestratorPlan,
  OrchestratorTask,
  ExecutionBundle,
  WorkflowState,
} from '@/types/orchestrator'

export type ExecutionState =
  | 'idle'
  | 'received'
  | 'analyzing'
  | 'planning'
  | 'awaiting_approval'
  | 'approved'
  | 'ready_for_execution'
  | 'preparing_workspace'
  | 'implementing'
  | 'installing_dependencies'
  | 'building'
  | 'testing'
  | 'fixing_errors'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'cancelled'

export interface BuildTask {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  files: string[]
  startTime?: string
  completedTime?: string
  commands?: { command: string; exitCode: number; output: string; timestamp: string }[]
  buildResults?: { success: boolean; message?: string }
  errors?: string[]
  outcome?: string
  dependencies?: string[]
  required_tools?: string[]
  verification_criteria?: string
  execution_stage?: number
  can_run_parallel?: boolean
}

export interface BuildPlan {
  projectName: string
  tagline: string
  techStack: string
  pages: string[]
  features: string[]
  theme: {
    primaryColor: string
    accentColor: string
    bgMode: 'dark' | 'light' | 'custom'
    description: string
  }
  externalServices?: { service: string; purpose: string; credentialsRequired: string }[]
  packages?: string[]
  databaseTables?: string[]
  apiRoutes?: string[]
  tasks: BuildTask[]
  executionStages?: {
    stage: number
    taskIds: string[]
    canRunInParallel: boolean
    description: string
  }[]
  spokenSummary: string
  needsClarification?: boolean
  clarificationQuestion?: string
}

export interface GeneratedFile {
  path: string
  content: string
  description?: string
  action?: 'created' | 'modified' | 'deleted'
  size?: number
  syntaxValid?: boolean
  syntaxError?: string
}

export interface BuildLogEntry {
  id: string
  timestamp: string
  type: 'info' | 'agent' | 'file' | 'error' | 'success' | 'exec' | 'command'
  message: string
  detail?: string
  command?: string
  exitCode?: number
}

export interface BuildProjectState {
  id: string
  userId: string
  name: string
  prompt: string
  description: string
  techStack: string
  status: ExecutionState
  plan: BuildPlan | null
  orchestratorPlan?: OrchestratorPlan | null
  analysis?: RequirementAnalysisResult | null
  executionBundle?: ExecutionBundle | null
  tasks?: OrchestratorTask[]
  files: Record<string, string> // path -> content
  activeFilePath: string
  logs: BuildLogEntry[]
  previewUrl: string
  previewKey: number
  viewportMode: 'desktop' | 'tablet' | 'mobile'
  error: string | null
  createdAt: string
  updatedAt: string
}

