import type { TwinSettings, Memory, Message } from '@/types'

export function getAIKey(): string {
  return (
    localStorage.getItem('another-me-api-key') ||
    ''
  )
}

export function isAIConfigured(): boolean {
  const key = getAIKey()
  return Boolean(key && key.trim() && key !== 'placeholder-key')
}

export function getSelectedModel(): string {
  return (
    localStorage.getItem('another-me-model') ||
    'meta-llama/llama-3.3-70b-instruct'
  )
}

interface GenerateParams {
  userMessage: string
  twinSettings: TwinSettings | null
  memories: Memory[]
  conversationHistory: Message[]
  onChunk?: (chunk: string) => void
  signal?: AbortSignal
}

export async function generateTwinResponse({
  userMessage,
  twinSettings,
  memories,
  conversationHistory,
  onChunk,
  signal,
}: GenerateParams): Promise<{ content: string; model: string }> {
  const apiKey = getAIKey()

  if (!apiKey) {
    const notice = `AI Provider is not configured. To enable real-time inference for your digital twin, please add your OpenRouter or OpenAI API key in Settings.`
    return {
      content: notice,
      model: 'unconfigured',
    }
  }

  // Build system prompt injecting user's real twin persona and memories
  const activeMemories = memories
    .filter((m) => !m.is_archived)
    .map((m) => `- [${m.category}] ${m.title}: ${m.content}`)
    .join('\n')

  const systemPrompt = `You are ${twinSettings?.name || "the user's digital twin"}.
Tagline: ${twinSettings?.tagline || 'Personal AI twin'}
Communication Style: ${twinSettings?.communication_style || 'friendly'}
Formality: ${twinSettings?.formality_level || 'neutral'}
Response Length Preference: ${twinSettings?.response_length || 'balanced'}
Preferred Language: ${twinSettings?.preferred_language || 'English'}
${twinSettings?.interests?.length ? `Interests: ${twinSettings.interests.join(', ')}` : ''}
${twinSettings?.goals?.length ? `Goals: ${twinSettings.goals.join('; ')}` : ''}

USER MEMORY CONTEXT:
${activeMemories ? activeMemories : 'No personal memories stored yet.'}

INSTRUCTIONS:
Speak authentically as the user's digital twin reflecting their communication preferences and drawing upon their stored memories when relevant. Do not break character. Keep responses direct, warm, and natural.
Conversational Context: The user is speaking to you directly through voice speech recognition. Understand their spoken words and intent naturally, even if there are slight phonetic variances, colloquial Indian/global English phrasing, or minor speech-to-text transcript variations.
Spoken Audio Guidelines: Keep your responses conversational and concise (1 to 3 short sentences, under 45 words). Do not use markdown syntax, asterisks, bullet points, or list numbering so your reply can be voiced aloud cleanly and immediately.`

  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ]

  const model = getSelectedModel()

  try {
    const referer = typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('capacitor') && !window.location.origin.includes('localhost')
      ? window.location.origin
      : 'https://anotherme.ai'

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': referer,
        'X-Title': 'Another Me AI Twin',
      },
      body: JSON.stringify({
        model,
        messages: messagesPayload,
        temperature: 0.7,
        stream: Boolean(onChunk),
      }),
      signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`AI API request failed (${res.status}): ${errText}`)
    }

    if (onChunk && res.body) {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim()
            if (dataStr === '[DONE]') break
            try {
              const parsed = JSON.parse(dataStr)
              const text = parsed.choices?.[0]?.delta?.content || ''
              if (text) {
                fullContent += text
                onChunk(text)
              }
            } catch {
              // Ignore non-json stream markers
            }
          }
        }
      }
      return { content: fullContent, model }
    } else {
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content || 'No response generated.'
      return { content: text, model }
    }
  } catch (err: any) {
    if (signal?.aborted) {
      throw err
    }
    return {
      content: `Failed to generate response: ${err.message || 'Network error'}. Please verify your API key in Settings.`,
      model,
    }
  }
}
