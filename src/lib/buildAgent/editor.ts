import type { BuildPlan, GeneratedFile } from './types'
import { workspaceClient } from './workspaceClient'
import { getAIKey } from '@/lib/ai'

export interface EditResult {
  modifiedFiles: GeneratedFile[]
  spokenSummary: string
  explanation: string
}

export async function editProjectFiles(
  projectId: string,
  userId: string,
  instruction: string,
  plan: BuildPlan,
  _signal?: AbortSignal
): Promise<EditResult> {
  const apiKey = getAIKey()

  try {
    const res = await workspaceClient.executeRealEdit(
      projectId,
      userId,
      instruction,
      plan,
      apiKey
    )

    return {
      modifiedFiles: res.modifiedFiles || [],
      spokenSummary: res.spokenSummary || 'I have applied your modifications to the website. Take a look at the live preview!',
      explanation: res.explanation || 'Applied updates to project files.',
    }
  } catch (err: any) {
    console.error('Real edit execution error:', err)
    throw new Error(err.message || 'Failed to edit project files with AI model.')
  }
}
