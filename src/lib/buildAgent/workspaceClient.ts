import type { BuildProject, ProjectFile } from '@/server/buildAgentApi'
import type { BuildPlan, BuildTask, GeneratedFile } from './types'

export interface LintResult {
  file: string
  valid: boolean
  error?: string
}

export interface ExecResult {
  command: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

export interface EditResponse {
  success: boolean
  modifiedFiles: GeneratedFile[]
  spokenSummary: string
  explanation: string
  lintResults?: LintResult[]
}

export const workspaceClient = {
  async listProjects(userId: string): Promise<BuildProject[]> {
    const res = await fetch(`/api/build-agent/projects?userId=${encodeURIComponent(userId)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.projects || []
  },

  async createOrUpdateProject(project: Partial<BuildProject>): Promise<BuildProject> {
    const res = await fetch('/api/build-agent/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    const data = await res.json()
    return data.project
  },

  async getProject(projectId: string, userId: string): Promise<{ project: BuildProject; files: ProjectFile[] } | null> {
    const res = await fetch(`/api/build-agent/projects/${encodeURIComponent(projectId)}?userId=${encodeURIComponent(userId)}`)
    if (!res.ok) return null
    return await res.json()
  },

  async saveBatchFiles(
    projectId: string,
    userId: string,
    files: { path: string; content: string }[],
    status?: string,
    plan?: BuildPlan,
    tasks?: BuildTask[]
  ): Promise<boolean> {
    const res = await fetch(`/api/build-agent/projects/${encodeURIComponent(projectId)}/batch-files?userId=${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, status, plan, tasks }),
    })
    return res.ok
  },

  async saveFile(projectId: string, userId: string, path: string, content: string): Promise<boolean> {
    const res = await fetch(`/api/build-agent/projects/${encodeURIComponent(projectId)}/files?userId=${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    })
    return res.ok
  },

  async deleteFile(projectId: string, userId: string, path: string): Promise<boolean> {
    const res = await fetch(`/api/build-agent/projects/${encodeURIComponent(projectId)}/files?userId=${encodeURIComponent(userId)}&path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    })
    return res.ok
  },

  getPreviewUrl(projectId: string, userId: string, subPath: string = 'index.html'): string {
    return `/api/build-agent/projects/${encodeURIComponent(projectId)}/preview/${subPath}?userId=${encodeURIComponent(userId)}`
  },

  getExportZipUrl(projectId: string, userId: string): string {
    return `/api/build-agent/projects/${encodeURIComponent(projectId)}/export?userId=${encodeURIComponent(userId)}`
  },

  // 1. Real AI Architecture Planning
  async generateRealPlan(prompt: string, twinName: string = 'Your Twin', apiKey?: string): Promise<BuildPlan> {
    const res = await fetch('/api/build-agent/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, twinName, apiKey }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `Plan generation failed with HTTP ${res.status}`)
    }
    const data = await res.json()
    return data.plan
  },

  // 2. Real AI Code Generation for Task
  async generateRealTaskCode(
    projectId: string,
    userId: string,
    plan: BuildPlan,
    task: BuildTask,
    existingFiles: Record<string, string>,
    userPrompt: string,
    apiKey?: string
  ): Promise<{ files: GeneratedFile[]; lintResults: LintResult[] }> {
    const res = await fetch('/api/build-agent/ai/generate-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, userId, plan, task, existingFiles, userPrompt, apiKey }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `Code generation failed with HTTP ${res.status}`)
    }
    const data = await res.json()
    return {
      files: data.files || [],
      lintResults: data.lintResults || [],
    }
  },

  // 3. Real AI Conversational Editing
  async executeRealEdit(
    projectId: string,
    userId: string,
    instruction: string,
    plan: BuildPlan,
    apiKey?: string
  ): Promise<EditResponse> {
    const res = await fetch('/api/build-agent/ai/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, userId, instruction, plan, apiKey }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `Edit execution failed with HTTP ${res.status}`)
    }
    return await res.json()
  },

  // 4. Real Workspace Command & Test Execution
  async runWorkspaceCommand(projectId: string, userId: string, command: 'validate' | 'lint' | 'test'): Promise<ExecResult> {
    const res = await fetch(`/api/build-agent/projects/${encodeURIComponent(projectId)}/exec?userId=${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `Command execution failed with HTTP ${res.status}`)
    }
    return await res.json()
  },
}
