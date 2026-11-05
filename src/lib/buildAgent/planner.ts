import { getAIKey } from '@/lib/ai'
import { workspaceClient } from './workspaceClient'
import type { BuildPlan } from './types'

export async function generateBuildPlan(
  userPrompt: string,
  twinName: string = 'Your Twin',
  _signal?: AbortSignal
): Promise<BuildPlan> {
  const apiKey = getAIKey()

  try {
    const plan = await workspaceClient.generateRealPlan(userPrompt, twinName, apiKey)
    return plan
  } catch (err: any) {
    console.error('Plan generation error:', err)
    throw new Error(err.message || 'Failed to generate website architecture plan with AI model.')
  }
}
