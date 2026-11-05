// ====================================================================
// ANOTHER ME — SECTION 1: ORCHESTRATOR CLIENT SDK
// Provides typed client functions to communicate with the AI orchestrator backend.
// Enforces Bearer token authentication on all protected routes.
// ====================================================================

import type {
  RequirementAnalysisResult,
  OrchestratorProject,
  OrchestratorPlan,
  OrchestratorEvent,
  ExecutionBundle,
} from '@/types/orchestrator'
import { getClientAuthToken } from './authSession'

export interface AnalyzeResponse {
  analysis: RequirementAnalysisResult
}

export interface PlanResponse {
  project: OrchestratorProject
  plan?: OrchestratorPlan
  workflowState: string
  spokenSummary?: string
  needsClarification?: boolean
  clarificationQuestion?: string
}

export interface ApproveResponse {
  success: boolean
  workflowState: 'ready_for_execution'
  project: OrchestratorProject
  executionBundle: ExecutionBundle
  message: string
}

export interface RejectResponse {
  success: boolean
  workflowState: string
  project: OrchestratorProject
  plan?: OrchestratorPlan
  message: string
}

export class OrchestratorClientError extends Error {
  statusCode: number
  code?: string

  constructor(message: string, statusCode: number, code?: string) {
    super(message)
    this.name = 'OrchestratorClientError'
    this.statusCode = statusCode
    this.code = code
  }
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
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
    const message = errData.error || `Request failed with HTTP ${res.status}`
    throw new OrchestratorClientError(message, res.status, errData.code)
  }

  return res
}

export const orchestratorClient = {
  /**
   * Check orchestrator service health & status (public)
   */
  async getStatus(): Promise<{ status: string; providerConfigured: boolean; workflowStates: string[] }> {
    const res = await fetch('/api/orchestrator/status')
    if (!res.ok) throw new Error(`Orchestrator status check failed (HTTP ${res.status})`)
    return res.json()
  },

  /**
   * Run standalone requirement analysis on a prompt
   */
  async analyzeRequirement(prompt: string, conversationHistory: any[] = []): Promise<RequirementAnalysisResult> {
    const res = await fetchWithAuth('/api/orchestrator/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, conversationHistory }),
    })
    const data: AnalyzeResponse = await res.json()
    return data.analysis
  },

  /**
   * Formulate full dynamic project plan with DAG scheduling
   * Transitions: received → analyzing → planning → awaiting_approval
   */
  async orchestratePlan(params: {
    prompt: string
    userId?: string
    twinName?: string
    projectId?: string
    conversationHistory?: any[]
  }): Promise<PlanResponse> {
    const res = await fetchWithAuth('/api/orchestrator/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    return res.json()
  },

  /**
   * Fetch project details, plan, and tasks
   */
  async getProject(projectId: string, _userId?: string): Promise<OrchestratorProject> {
    const res = await fetchWithAuth(`/api/orchestrator/projects/${encodeURIComponent(projectId)}`)
    const data = await res.json()
    return data.project
  },

  /**
   * List all projects for authenticated user
   */
  async listProjects(_userId?: string): Promise<OrchestratorProject[]> {
    const res = await fetchWithAuth('/api/orchestrator/projects')
    const data = await res.json()
    return data.projects || []
  },

  /**
   * Approve plan and prepare execution request bundle
   * Transitions: awaiting_approval → approved → ready_for_execution
   */
  async approvePlan(projectId: string, _userId?: string): Promise<ApproveResponse> {
    const res = await fetchWithAuth(`/api/orchestrator/projects/${encodeURIComponent(projectId)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    return res.json()
  },

  /**
   * Reject plan or request modifications
   */
  async rejectPlan(projectId: string, _userId: string | undefined, reason: string, requestReplan = false): Promise<RejectResponse> {
    const res = await fetchWithAuth(`/api/orchestrator/projects/${encodeURIComponent(projectId)}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, requestReplan }),
    })
    return res.json()
  },

  /**
   * Get audit events and state transitions for a project
   */
  async getEvents(projectId: string, _userId?: string): Promise<OrchestratorEvent[]> {
    const res = await fetchWithAuth(`/api/orchestrator/projects/${encodeURIComponent(projectId)}/events`)
    const data = await res.json()
    return data.events || []
  },
}
