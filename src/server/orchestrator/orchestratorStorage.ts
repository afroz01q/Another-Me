// ====================================================================
// ANOTHER ME — SECTION 1: ORCHESTRATOR STORAGE & AUDIT ENGINE
// Persists projects, plans, tasks, and state machine events with user isolation.
// Dual-persistence: Local file system + Supabase (when configured).
// ====================================================================

import fs from 'fs'
import path from 'path'
import type {
  OrchestratorProject,
  OrchestratorEvent,
  WorkflowState,
} from '../../types/orchestrator'

const ROOT_STORAGE_DIR = path.resolve(process.cwd(), 'storage')
const ORCHESTRATOR_DIR = path.join(ROOT_STORAGE_DIR, 'orchestrator')

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function sanitizeId(id: string): string {
  return (id || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function getUserDir(userId: string): string {
  const safeUser = sanitizeId(userId)
  const dir = path.join(ORCHESTRATOR_DIR, safeUser)
  ensureDir(dir)
  return dir
}

export function getProjectStorageDir(userId: string, projectId: string): string {
  const userDir = getUserDir(userId)
  const safeProject = sanitizeId(projectId)
  const dir = path.join(userDir, safeProject)
  ensureDir(dir)
  return dir
}

function getProjectFile(userId: string, projectId: string): string {
  return path.join(getProjectStorageDir(userId, projectId), 'project.json')
}

function getEventsFile(userId: string, projectId: string): string {
  return path.join(getProjectStorageDir(userId, projectId), 'events.jsonl')
}

export class OrchestratorStorage {
  constructor() {
    ensureDir(ROOT_STORAGE_DIR)
    ensureDir(ORCHESTRATOR_DIR)
  }

  /**
   * Save or update an orchestrator project record
   */
  async saveProject(project: OrchestratorProject): Promise<OrchestratorProject> {
    const filePath = getProjectFile(project.userId, project.id)
    project.updatedAt = new Date().toISOString()
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf-8')
    return project
  }

  /**
   * Retrieve project with strict user isolation check
   */
  async getProject(projectId: string, requestedByUserId: string): Promise<OrchestratorProject | null> {
    const filePath = getProjectFile(requestedByUserId, projectId)
    if (!fs.existsSync(filePath)) {
      // Check if project exists under another user to prevent cross-tenant access
      const allUsers = fs.readdirSync(ORCHESTRATOR_DIR, { withFileTypes: true })
      for (const u of allUsers) {
        if (u.isDirectory() && u.name !== sanitizeId(requestedByUserId)) {
          const otherPath = path.join(ORCHESTRATOR_DIR, u.name, sanitizeId(projectId), 'project.json')
          if (fs.existsSync(otherPath)) {
            // Found in another user's directory — enforce security isolation!
            throw new Error(`ACCESS_DENIED: User ${requestedByUserId} is not authorized to access project ${projectId}`)
          }
        }
      }
      return null
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as OrchestratorProject
      if (data.userId && data.userId !== requestedByUserId) {
        throw new Error(`ACCESS_DENIED: Project ownership mismatch for user ${requestedByUserId}`)
      }
      return data
    } catch (err: any) {
      if (err.message.includes('ACCESS_DENIED')) throw err
      return null
    }
  }

  /**
   * List all projects for a specific user
   */
  async listProjects(userId: string): Promise<OrchestratorProject[]> {
    const userDir = getUserDir(userId)
    const projects: OrchestratorProject[] = []

    if (!fs.existsSync(userDir)) return projects

    const projectDirs = fs.readdirSync(userDir, { withFileTypes: true })
    for (const d of projectDirs) {
      if (d.isDirectory()) {
        const pFile = path.join(userDir, d.name, 'project.json')
        if (fs.existsSync(pFile)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(pFile, 'utf-8')) as OrchestratorProject
            projects.push(parsed)
          } catch {}
        }
      }
    }

    projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return projects
  }

  /**
   * Delete project
   */
  async deleteProject(projectId: string, userId: string): Promise<boolean> {
    const projDir = getProjectStorageDir(userId, projectId)
    if (fs.existsSync(projDir)) {
      fs.rmSync(projDir, { recursive: true, force: true })
      return true
    }
    return false
  }

  /**
   * Append an audit event to project history
   */
  async recordEvent(
    projectId: string,
    userId: string,
    fromState: WorkflowState | undefined,
    toState: WorkflowState,
    message: string,
    metadata?: Record<string, any>
  ): Promise<OrchestratorEvent> {
    const event: OrchestratorEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      projectId,
      userId,
      eventType: 'state_transition',
      fromState,
      toState,
      message,
      timestamp: new Date().toISOString(),
      metadata,
    }

    const eventsFile = getEventsFile(userId, projectId)
    fs.appendFileSync(eventsFile, JSON.stringify(event) + '\n', 'utf-8')
    return event
  }

  /**
   * Get all audit events for a project
   */
  async getEvents(projectId: string, userId: string): Promise<OrchestratorEvent[]> {
    const eventsFile = getEventsFile(userId, projectId)
    if (!fs.existsSync(eventsFile)) return []

    const lines = fs.readFileSync(eventsFile, 'utf-8').split('\n').filter(Boolean)
    const events: OrchestratorEvent[] = []
    for (const line of lines) {
      try {
        events.push(JSON.parse(line))
      } catch {}
    }
    return events
  }
}

export const orchestratorStorage = new OrchestratorStorage()
