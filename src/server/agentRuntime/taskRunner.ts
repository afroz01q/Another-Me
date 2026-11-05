// ====================================================================
// ANOTHER ME — SECTION 2: TASK RUNNER ENGINE
// Consumes approved Section 1 ExecutionBundle and DAG tasks.
// Coordinates stage-by-stage execution, respects dependencies, prevents duplicate
// execution, records real logs and changes, handles cancellation and safe retry.
// ====================================================================

import fs from 'fs'
import path from 'path'
import { orchestratorStorage, getProjectStorageDir } from '../orchestrator/orchestratorStorage'
import { workspaceManager } from './workspaceManager'
import { safeFileOperations } from './fileOperations'
import { codingAgent } from './codingAgent'
import type { OrchestratorProject, OrchestratorTask } from '../../types/orchestrator'
import type {
  ProjectExecutionStatus,
  TaskExecutionRecord,
  RuntimeTerminalLogEntry,
} from './types'

export class TaskRunnerError extends Error {
  statusCode: number
  code: string

  constructor(message: string, statusCode: number = 400, code: string = 'TASK_RUNNER_ERROR') {
    super(message)
    this.name = 'TaskRunnerError'
    this.statusCode = statusCode
    this.code = code
  }
}

interface ActiveExecution {
  projectId: string
  userId: string
  abortController: AbortController
  promise: Promise<ProjectExecutionStatus>
}

export class TaskRunner {
  private activeExecutions = new Map<string, ActiveExecution>()
  private inMemoryLogs = new Map<string, RuntimeTerminalLogEntry[]>()
  private executionLocks = new Set<string>()

  private getExecutionFile(userId: string, projectId: string): string {
    return path.join(getProjectStorageDir(userId, projectId), 'execution_status.json')
  }

  private appendLog(
    projectId: string,
    type: RuntimeTerminalLogEntry['type'],
    message: string,
    detail?: string,
    taskId?: string
  ): RuntimeTerminalLogEntry {
    const entry: RuntimeTerminalLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      type,
      message,
      detail,
      taskId,
    }

    const logs = this.inMemoryLogs.get(projectId) || []
    logs.push(entry)
    // Keep last 1000 logs in memory
    if (logs.length > 1000) logs.shift()
    this.inMemoryLogs.set(projectId, logs)

    return entry
  }

  /**
   * Retrieves the current execution status (live or persisted).
   */
  async getStatus(userId: string, projectId: string): Promise<ProjectExecutionStatus> {
    const project = await orchestratorStorage.getProject(projectId, userId)
    if (!project) {
      throw new TaskRunnerError(`Project "${projectId}" not found or unauthorized.`, 404, 'PROJECT_NOT_FOUND')
    }

    const execFile = this.getExecutionFile(userId, projectId)
    let status: ProjectExecutionStatus

    if (fs.existsSync(execFile)) {
      try {
        status = JSON.parse(fs.readFileSync(execFile, 'utf-8'))
      } catch {
        status = this.createInitialStatus(project)
      }
    } else {
      status = this.createInitialStatus(project)
    }

    // Merge latest project tasks
    status.tasks = project.tasks || []

    // Attach in-memory logs and latest changed files
    const memLogs = this.inMemoryLogs.get(projectId) || []
    if (memLogs.length > 0) {
      status.terminalLogs = memLogs
    }

    const workspaceRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    if (fs.existsSync(workspaceRoot)) {
      status.changedFiles = safeFileOperations.getChanges(workspaceRoot)
    }

    // Update active running state
    if (this.activeExecutions.has(projectId)) {
      status.executionState = 'running'
    }

    return status
  }

  /**
   * Starts execution of an approved project plan.
   */
  async executeProject(
    userId: string,
    projectId: string,
    options?: { apiKeyOverride?: string }
  ): Promise<ProjectExecutionStatus> {
    const project = await orchestratorStorage.getProject(projectId, userId)
    if (!project) {
      throw new TaskRunnerError(`Project "${projectId}" not found.`, 404, 'PROJECT_NOT_FOUND')
    }

    // Must be in ready_for_execution or approved state
    if (project.workflowState !== 'ready_for_execution' && project.workflowState !== 'approved') {
      throw new TaskRunnerError(
        `Cannot execute project: Current state is "${project.workflowState}". Plan must be approved first.`,
        400,
        'INVALID_WORKFLOW_STATE'
      )
    }

    // If already running or locked, return current status
    if (this.executionLocks.has(projectId) || this.activeExecutions.has(projectId)) {
      return this.getStatus(userId, projectId)
    }

    this.executionLocks.add(projectId)

    try {
      // Initialize or reopen workspace
      const workspaceMeta = await workspaceManager.getOrCreateWorkspace(userId, projectId)
      const workspaceRoot = workspaceMeta.canonicalRoot

      const abortController = new AbortController()

      const executionPromise = this.runProjectTasks(project, workspaceRoot, abortController.signal, options?.apiKeyOverride)

      this.activeExecutions.set(projectId, {
        projectId,
        userId,
        abortController,
        promise: executionPromise,
      })

      // Remove from active map once complete
      executionPromise.finally(() => {
        this.activeExecutions.delete(projectId)
      })

      return this.getStatus(userId, projectId)
    } finally {
      this.executionLocks.delete(projectId)
    }
  }

  /**
   * Internal runner loop that executes tasks in DAG order.
   */
  private async runProjectTasks(
    project: OrchestratorProject,
    workspaceRoot: string,
    abortSignal: AbortSignal,
    apiKeyOverride?: string
  ): Promise<ProjectExecutionStatus> {
    const { id: projectId, userId } = project
    let status = await this.getStatus(userId, projectId)

    status.executionState = 'running'
    status.startedAt = status.startedAt || new Date().toISOString()
    await this.saveStatus(userId, projectId, status)

    this.appendLog(
      projectId,
      'system',
      `Starting coding runtime execution for project "${project.name}" (ID: ${projectId}).`
    )
    this.appendLog(projectId, 'system', `Isolated workspace initialized at: ${workspaceRoot}`)

    await orchestratorStorage.recordEvent(
      projectId,
      userId,
      project.workflowState,
      project.workflowState,
      `Coding agent runtime began executing task pipeline in isolated workspace.`
    )

    // Build stages from plan or derive from tasks
    const stages = project.plan?.executionStages || this.deriveStagesFromTasks(project.tasks)
    status.totalStages = stages.length

    const taskMap = new Map<string, OrchestratorTask>()
    project.tasks.forEach((t) => taskMap.set(t.id, t))

    const completedSet = new Set<string>(status.completedTaskIds || [])
    const failedSet = new Set<string>(status.failedTaskIds || [])

    try {
      for (const stage of stages) {
        if (abortSignal.aborted) {
          throw new Error('EXECUTION_CANCELLED')
        }

        status.currentStage = stage.stage
        this.appendLog(
          projectId,
          'system',
          `=== Starting Stage ${stage.stage}: ${stage.description || 'Executing tasks'} ===`
        )
        await this.saveStatus(userId, projectId, status)

        for (const taskId of stage.taskIds) {
          if (abortSignal.aborted) {
            throw new Error('EXECUTION_CANCELLED')
          }

          const task = taskMap.get(taskId)
          if (!task) continue

          // Skip if already completed (prevents duplicate execution)
          if (completedSet.has(taskId) && status.taskRecords[taskId]?.status === 'completed') {
            this.appendLog(
              projectId,
              'system',
              `Skipping task "${task.title}" (${taskId}) — already verified as completed.`,
              undefined,
              taskId
            )
            continue
          }

          // Skip if already failed in prior run and not explicitly reset for retry
          if (failedSet.has(taskId) && status.taskRecords[taskId]?.status === 'failed') {
            this.appendLog(
              projectId,
              'system',
              `Skipping task "${task.title}" (${taskId}) — marked as failed in prior execution.`,
              undefined,
              taskId
            )
            continue
          }

          // Check if any prerequisite dependency has failed
          const failedPrereq = (task.dependencies || []).find((depId) => failedSet.has(depId))
          if (failedPrereq) {
            const errNotice = `Task blocked: Prerequisite dependency "${failedPrereq}" failed.`
            this.appendLog(projectId, 'error', errNotice, undefined, taskId)
            task.status = 'failed'
            failedSet.add(taskId)
            status.failedTaskIds = Array.from(failedSet)
            status.taskRecords[taskId] = {
              taskId,
              status: 'failed',
              filesModified: [],
              changes: [],
              operationsCount: 0,
              commandExecutions: [],
              error: errNotice,
              verificationPassed: false,
            }
            await this.persistTaskUpdate(project, task)
            await this.saveStatus(userId, projectId, status)
            continue
          }

          // Execute task
          status.currentTaskId = taskId
          task.status = 'in_progress'
          await this.persistTaskUpdate(project, task)
          await this.saveStatus(userId, projectId, status)

          this.appendLog(
            projectId,
            'agent',
            `Executing Task [${taskId}] ${task.title}: ${task.description}`,
            undefined,
            taskId
          )

          // Invoke genuine coding agent
          const record: TaskExecutionRecord = await codingAgent.executeTask(
            {
              userId,
              projectId,
              projectName: project.name,
              techStack: project.plan?.techStack || 'React, TypeScript',
              plan: project.plan,
              task,
              workspaceRoot,
              apiKeyOverride,
            },
            abortSignal
          )

          // Log operations
          for (const change of record.changes) {
            const actionVerb = change.action === 'created' ? 'Created' : change.action === 'modified' ? 'Updated' : 'Deleted'
            this.appendLog(
              projectId,
              'agent',
              `${actionVerb}: ${change.relativePath} (+${change.additions} -${change.deletions} lines)`,
              change.diff,
              taskId
            )
          }

          // Log terminal execution output
          for (const cmdExec of record.commandExecutions) {
            this.appendLog(projectId, 'command', `$ ${cmdExec.command}`, undefined, taskId)
            if (cmdExec.stdout) {
              this.appendLog(projectId, 'stdout', cmdExec.stdout, undefined, taskId)
            }
            if (cmdExec.stderr) {
              this.appendLog(projectId, 'stderr', cmdExec.stderr, undefined, taskId)
            }
          }

          status.taskRecords[taskId] = record

          if (record.status === 'completed') {
            task.status = 'completed'
            completedSet.add(taskId)
            failedSet.delete(taskId)
            status.completedTaskIds = Array.from(completedSet)
            status.failedTaskIds = Array.from(failedSet)
            this.appendLog(
              projectId,
              'success',
              `Completed Task [${taskId}]: ${task.title} (${record.durationMs}ms)`,
              record.verificationDetails,
              taskId
            )
          } else if (record.status === 'cancelled') {
            task.status = 'failed'
            this.appendLog(projectId, 'error', `Task [${taskId}] was cancelled.`, undefined, taskId)
            throw new Error('EXECUTION_CANCELLED')
          } else {
            task.status = 'failed'
            failedSet.add(taskId)
            status.failedTaskIds = Array.from(failedSet)
            this.appendLog(
              projectId,
              'error',
              `Failed Task [${taskId}]: ${record.error || 'Verification criteria failed.'}`,
              record.verificationDetails,
              taskId
            )
            // Stop subsequent dependent tasks in DAG
            break
          }

          await this.persistTaskUpdate(project, task)
          await this.saveStatus(userId, projectId, status)
        }

        // If any task in this stage failed, mark dependent downstream tasks and halt execution
        if (failedSet.size > 0 && !stages.every((s) => s.taskIds.every((id) => completedSet.has(id)))) {
          const hasUnresolvedFailuresInStage = stage.taskIds.some((id) => failedSet.has(id))
          if (hasUnresolvedFailuresInStage) {
            // For all remaining stages, mark any task whose dependencies failed
            for (const remStage of stages.filter((s) => s.stage > stage.stage)) {
              for (const remTaskId of remStage.taskIds) {
                const remTask = taskMap.get(remTaskId)
                if (remTask) {
                  const failedDep = (remTask.dependencies || []).find((depId) => failedSet.has(depId))
                  if (failedDep) {
                    const blockNotice = `Task blocked: Prerequisite dependency "${failedDep}" failed.`
                    remTask.status = 'failed'
                    failedSet.add(remTaskId)
                    status.taskRecords[remTaskId] = {
                      taskId: remTaskId,
                      status: 'failed',
                      filesModified: [],
                      changes: [],
                      operationsCount: 0,
                      commandExecutions: [],
                      error: blockNotice,
                      verificationPassed: false,
                    }
                    this.appendLog(projectId, 'error', blockNotice, undefined, remTaskId)
                    await this.persistTaskUpdate(project, remTask)
                  }
                }
              }
            }
            status.failedTaskIds = Array.from(failedSet)
            await this.saveStatus(userId, projectId, status)
            this.appendLog(
              projectId,
              'error',
              `Stage ${stage.stage} experienced failure. Halting dependent stages until resolved.`
            )
            break
          }
        }
      }

      // Check final execution state
      const allTasksFinished = project.tasks.every((t) => completedSet.has(t.id))
      if (allTasksFinished) {
        status.executionState = 'completed'
        status.currentTaskId = null
        status.finishedAt = new Date().toISOString()
        this.appendLog(
          projectId,
          'success',
          `All ${project.tasks.length} tasks completed and verified successfully!`
        )
      } else if (failedSet.size > 0) {
        status.executionState = 'failed'
        status.currentTaskId = null
        status.finishedAt = new Date().toISOString()
      } else {
        status.executionState = completedSet.size > 0 ? 'completed' : 'idle'
        status.currentTaskId = null
        status.finishedAt = new Date().toISOString()
      }
    } catch (err: any) {
      console.error('[TASK RUNNER CAUGHT ERROR]:', err)
      const currentId = status.currentTaskId
      if (err.message === 'EXECUTION_CANCELLED' || abortSignal.aborted) {
        status.executionState = 'cancelled'
        if (currentId) {
          const t = taskMap.get(currentId)
          if (t) t.status = 'failed'
          failedSet.add(currentId)
          status.failedTaskIds = Array.from(failedSet)
        }
        status.currentTaskId = null
        status.finishedAt = new Date().toISOString()
        this.appendLog(projectId, 'error', 'Execution cancelled by user.')
      } else {
        status.executionState = 'failed'
        if (currentId) {
          const t = taskMap.get(currentId)
          if (t) t.status = 'failed'
          failedSet.add(currentId)
          status.failedTaskIds = Array.from(failedSet)
          status.taskRecords[currentId] = {
            taskId: currentId,
            status: 'failed',
            filesModified: [],
            changes: [],
            operationsCount: 0,
            commandExecutions: [],
            error: err.message,
            verificationPassed: false,
          }
        }
        status.currentTaskId = null
        status.finishedAt = new Date().toISOString()
        this.appendLog(projectId, 'error', `Execution runtime encountered error: ${err.message}`)
      }
    }

    status.changedFiles = safeFileOperations.getChanges(workspaceRoot)
    await this.saveStatus(userId, projectId, status)
    return status
  }

  /**
   * Cancels a currently running execution.
   */
  async cancelExecution(userId: string, projectId: string): Promise<boolean> {
    const active = this.activeExecutions.get(projectId)
    if (!active) {
      return false
    }

    if (active.userId !== userId) {
      throw new TaskRunnerError('Unauthorized to cancel this project execution.', 403, 'FORBIDDEN')
    }

    active.abortController.abort()
    this.appendLog(projectId, 'system', 'Cancellation signal transmitted to runtime.')

    // Update persisted status
    const status = await this.getStatus(userId, projectId)
    status.executionState = 'cancelled'
    status.currentTaskId = null
    status.finishedAt = new Date().toISOString()
    await this.saveStatus(userId, projectId, status)

    return true
  }

  /**
   * Retries an eligible failed or cancelled task without re-running completed tasks.
   */
  async retryTask(
    userId: string,
    projectId: string,
    taskId: string,
    options?: { apiKeyOverride?: string }
  ): Promise<ProjectExecutionStatus> {
    const project = await orchestratorStorage.getProject(projectId, userId)
    if (!project) {
      throw new TaskRunnerError(`Project "${projectId}" not found.`, 404, 'PROJECT_NOT_FOUND')
    }

    const task = project.tasks.find((t) => t.id === taskId)
    if (!task) {
      throw new TaskRunnerError(`Task "${taskId}" not found in project.`, 404, 'TASK_NOT_FOUND')
    }

    const status = await this.getStatus(userId, projectId)
    // Clear failure record for this task
    status.failedTaskIds = (status.failedTaskIds || []).filter((id) => id !== taskId)
    delete status.taskRecords[taskId]
    task.status = 'pending'

    await this.persistTaskUpdate(project, task)
    await this.saveStatus(userId, projectId, status)

    this.appendLog(
      projectId,
      'system',
      `Retrying task [${taskId}] "${task.title}". Previously completed tasks will be preserved.`
    )

    // Trigger execution
    return this.executeProject(userId, projectId, options)
  }

  private async persistTaskUpdate(project: OrchestratorProject, task: OrchestratorTask): Promise<void> {
    const idx = project.tasks.findIndex((t) => t.id === task.id)
    if (idx !== -1) {
      project.tasks[idx] = task
      await orchestratorStorage.saveProject(project)
    }
  }

  private async saveStatus(userId: string, projectId: string, status: ProjectExecutionStatus): Promise<void> {
    const filePath = this.getExecutionFile(userId, projectId)
    try {
      fs.writeFileSync(filePath, JSON.stringify(status, null, 2), 'utf-8')
    } catch {}
  }

  private createInitialStatus(project: OrchestratorProject): ProjectExecutionStatus {
    return {
      projectId: project.id,
      userId: project.userId,
      workflowState: project.workflowState,
      executionState: 'idle',
      currentStage: 1,
      totalStages: project.plan?.executionStages?.length || 1,
      currentTaskId: null,
      completedTaskIds: [],
      failedTaskIds: [],
      tasks: project.tasks || [],
      taskRecords: {},
      changedFiles: [],
      terminalLogs: [],
    }
  }

  private deriveStagesFromTasks(tasks: OrchestratorTask[]): { stage: number; taskIds: string[]; canRunInParallel: boolean; description: string }[] {
    const stageMap = new Map<number, string[]>()
    for (const t of tasks) {
      const stg = t.execution_stage || 1
      const arr = stageMap.get(stg) || []
      arr.push(t.id)
      stageMap.set(stg, arr)
    }

    const sortedStages = Array.from(stageMap.keys()).sort((a, b) => a - b)
    return sortedStages.map((stg) => ({
      stage: stg,
      taskIds: stageMap.get(stg) || [],
      canRunInParallel: false,
      description: `Stage ${stg} execution`,
    }))
  }

  isExecutionActive(projectId: string): boolean {
    return this.activeExecutions.has(projectId) || this.executionLocks.has(projectId)
  }
}

export const taskRunner = new TaskRunner()
