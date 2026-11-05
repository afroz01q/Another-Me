// ====================================================================
// ANOTHER ME — SECTION 1: SERVER-SIDE AI PROVIDER ADAPTER
// Keeps provider credentials exclusively on the server.
// Robust timeout, rate limit, failure, and parse handling with ZERO fabrication.
// ====================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ProviderCallParams {
  messages: ChatMessage[]
  temperature?: number
  responseFormat?: 'json_object' | 'text'
  timeoutMs?: number
  apiKey?: string // Optional override, otherwise read from server env
}

export class ProviderError extends Error {
  statusCode: number
  code: string
  retryAfterSeconds?: number

  constructor(message: string, statusCode: number = 500, code: string = 'PROVIDER_ERROR', retryAfterSeconds?: number) {
    super(message)
    this.name = 'ProviderError'
    this.statusCode = statusCode
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

import fs from 'fs'
import path from 'path'

function readEnvFile(filename: string): Record<string, string> {
  try {
    const filePath = path.resolve(process.cwd(), filename)
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      const env: Record<string, string> = {}
      content.split('\n').forEach((line) => {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=')
          const key = trimmed.substring(0, idx).trim()
          let val = trimmed.substring(idx + 1).trim()
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1)
          }
          env[key] = val
        }
      })
      return env
    }
  } catch {
    // Ignore error
  }
  return {}
}

/**
 * Returns backend server-side OpenRouter API key.
 * Credentials remain exclusively on the backend.
 */
export function getServerAIKey(clientKeyOverride?: string): string {
  if (clientKeyOverride?.trim()) return clientKeyOverride.trim()
  if (process.env.OPENROUTER_API_KEY?.trim()) return process.env.OPENROUTER_API_KEY.trim()

  const localEnv = readEnvFile('.env.local')
  if (localEnv.OPENROUTER_API_KEY) return localEnv.OPENROUTER_API_KEY

  const standardEnv = readEnvFile('.env')
  if (standardEnv.OPENROUTER_API_KEY) return standardEnv.OPENROUTER_API_KEY

  return ''
}

/**
 * Checks if the server AI provider is configured with credentials.
 */
export function isServerAIConfigured(): boolean {
  const key = getServerAIKey()
  return Boolean(key && key !== 'placeholder-key' && key.length > 5)
}

/**
 * Returns configured LLM model
 */
export function getServerAIModel(): string {
  if (process.env.LLM_PROVIDER?.trim()) return process.env.LLM_PROVIDER.trim()
  if (process.env.VITE_LLM_PROVIDER?.trim()) return process.env.VITE_LLM_PROVIDER.trim()

  const localEnv = readEnvFile('.env.local')
  if (localEnv.LLM_PROVIDER) return localEnv.LLM_PROVIDER
  if (localEnv.VITE_LLM_PROVIDER) return localEnv.VITE_LLM_PROVIDER

  const standardEnv = readEnvFile('.env')
  if (standardEnv.LLM_PROVIDER) return standardEnv.LLM_PROVIDER
  if (standardEnv.VITE_LLM_PROVIDER) return standardEnv.VITE_LLM_PROVIDER

  return 'meta-llama/llama-3.3-70b-instruct'
}

/**
 * Executes a resilient server-side chat completion with OpenRouter / OpenAI-compatible endpoint.
 * Strictly avoids mock responses or fabricated output on failures.
 */
export async function executeServerChatCompletion(params: ProviderCallParams): Promise<{
  content: string
  model: string
  parsedJson?: any
}> {
  const apiKey = getServerAIKey(params.apiKey)

  if (!apiKey) {
    throw new ProviderError(
      'AI Provider credentials not configured on backend. Please configure OPENROUTER_API_KEY in server environment.',
      503,
      'PROVIDER_UNCONFIGURED'
    )
  }

  const model = getServerAIModel()
  const timeoutMs = params.timeoutMs || 45000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://anotherme.ai',
        'X-Title': 'Another Me AI Orchestrator',
      },
      body: JSON.stringify({
        model,
        messages: params.messages,
        temperature: params.temperature ?? 0.2,
        ...(params.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    // Handle rate limits (429)
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('Retry-After')
      const retrySec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 10
      throw new ProviderError(
        `AI provider rate limit reached. Please wait ${retrySec} seconds before retrying.`,
        429,
        'RATE_LIMITED',
        retrySec
      )
    }

    // Handle other HTTP errors with safe sanitization (no key or upstream headers exposed)
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      let safeDetail = response.statusText || 'Upstream Error'
      try {
        const parsed = JSON.parse(errorBody)
        if (parsed.error?.message && typeof parsed.error.message === 'string') {
          // Remove any potential key leakage from upstream message
          safeDetail = parsed.error.message.replace(/sk-[a-zA-Z0-9_\-]{10,}/g, '[REDACTED]')
        }
      } catch {
        safeDetail = (errorBody.slice(0, 120) || response.statusText).replace(/sk-[a-zA-Z0-9_\-]{10,}/g, '[REDACTED]')
      }

      throw new ProviderError(
        `AI provider request failed with HTTP ${response.status}: ${safeDetail}`,
        response.status >= 500 ? 502 : response.status,
        'UPSTREAM_HTTP_ERROR'
      )
    }

    const data = (await response.json()) as any
    const messageContent = data?.choices?.[0]?.message?.content

    if (!messageContent || typeof messageContent !== 'string' || !messageContent.trim()) {
      throw new ProviderError(
        'AI provider returned an empty or unparseable response.',
        502,
        'EMPTY_RESPONSE'
      )
    }

    let parsedJson: any = undefined
    if (params.responseFormat === 'json_object') {
      try {
        const cleaned = messageContent
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim()
        parsedJson = JSON.parse(cleaned)
      } catch (parseErr: any) {
        throw new ProviderError(
          `Failed to parse model JSON response: ${parseErr.message}. Raw output: ${messageContent.slice(0, 200)}...`,
          502,
          'INVALID_JSON'
        )
      }
    }

    return {
      content: messageContent,
      model,
      parsedJson,
    }
  } catch (err: any) {
    clearTimeout(timeoutId)

    if (err instanceof ProviderError) {
      throw err
    }

    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      throw new ProviderError(
        `AI provider request timed out after ${timeoutMs}ms. Please try again.`,
        504,
        'TIMEOUT'
      )
    }

    throw new ProviderError(
      `AI provider communication failed: ${err.message || 'Unknown network error'}`,
      502,
      'NETWORK_FAILURE'
    )
  }
}
