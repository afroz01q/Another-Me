import type { BuildPlan, GeneratedFile, BuildLogEntry } from './types'
import { workspaceClient } from './workspaceClient'
import { getAIKey } from '@/lib/ai'

export interface CoderCallbacks {
  onLog: (log: BuildLogEntry) => void
  onFileGenerated: (file: GeneratedFile) => void
  onTaskProgress: (taskId: string, status: 'in_progress' | 'completed' | 'failed') => void
}

export async function generateProjectCode(
  projectId: string,
  userId: string,
  plan: BuildPlan,
  userPrompt: string,
  callbacks: CoderCallbacks,
  _signal?: AbortSignal
): Promise<GeneratedFile[]> {
  const generatedFiles: GeneratedFile[] = []
  const existingFilesMap: Record<string, string> = {}
  const apiKey = getAIKey()

  const log = (type: BuildLogEntry['type'], message: string, detail?: string, command?: string, exitCode?: number) => {
    callbacks.onLog({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      detail,
      command,
      exitCode,
    })
  }

  log('agent', `Twin Coding Agent initialized for "${plan.projectName}"`)
  log('info', `Target Tech Stack: ${plan.techStack}`)
  log('info', `Scope: ${plan.pages.join(', ')} | Theme: ${plan.theme.description}`)

  // Execute each plan task sequentially with real AI generation and syntax validation
  for (let i = 0; i < plan.tasks.length; i++) {
    const task = plan.tasks[i]
    task.startTime = new Date().toISOString()
    callbacks.onTaskProgress(task.id, 'in_progress')
    log('agent', `[Phase ${i + 1}/${plan.tasks.length}] Executing: ${task.title}`, task.description)

    try {
      const codeResult = await workspaceClient.generateRealTaskCode(
        projectId,
        userId,
        plan,
        task,
        existingFilesMap,
        userPrompt,
        apiKey
      )

      for (const file of codeResult.files) {
        existingFilesMap[file.path] = file.content
        const existingIdx = generatedFiles.findIndex((f) => f.path === file.path)
        if (existingIdx >= 0) {
          generatedFiles[existingIdx] = file
        } else {
          generatedFiles.push(file)
        }
        callbacks.onFileGenerated(file)
        log('file', `Wrote ${file.path} (${file.content.length} chars)`, file.description)
      }

      // Log real syntax validation results
      for (const lint of codeResult.lintResults) {
        if (lint.valid) {
          log('exec', `✓ Syntax validation passed: ${lint.file}`)
        } else {
          log('error', `✗ Syntax issue detected in ${lint.file}`, lint.error)
        }
      }

      task.completedTime = new Date().toISOString()
      task.status = 'completed'
      callbacks.onTaskProgress(task.id, 'completed')
      log('success', `Completed task: ${task.title}`)
    } catch (err: any) {
      task.status = 'failed'
      callbacks.onTaskProgress(task.id, 'failed')
      log('error', `Task failed: ${task.title}`, err.message)
      throw err
    }
  }

  // Run final automated workspace verification and test suite
  try {
    log('agent', 'Running automated workspace verification and smoke tests...')
    const testResult = await workspaceClient.runWorkspaceCommand(projectId, userId, 'test')
    log('command', `$ workspace-test --all (exit code: ${testResult.exitCode})`, testResult.stdout, 'workspace-test', testResult.exitCode)
    if (testResult.exitCode === 0) {
      log('success', 'All workspace smoke tests PASSED! Project ready for live preview.')
    } else {
      log('error', 'Smoke tests reported warnings, check console output.', testResult.stderr)
    }
  } catch (err: any) {
    log('error', 'Failed to run automated test runner', err.message)
  }

  return generatedFiles
}
