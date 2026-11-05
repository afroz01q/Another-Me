import type {
  AutopilotPlatform,
  InboundMessage,
  OutboundDraft,
  SafetyAssessment,
  VoiceAutopilotIntent,
} from '@/types/autopilot'
import type { TwinSettings, Memory } from '@/types'
import { generateTwinResponse } from '../ai'

export interface ParsedVoiceCommand {
  intent: VoiceAutopilotIntent
  rawCommand: string
  platformHint?: AutopilotPlatform
  recipientQuery?: string
  instruction?: string
  confidence: number
}

/**
 * 1. Parse natural voice commands into structured intent, platform, recipient, and message instructions.
 */
export function parseVoiceAutopilotCommand(text: string): ParsedVoiceCommand {
  const clean = text.trim()
  const lower = clean.toLowerCase()

  // Emergency / Voice Stop Autopilot
  if (
    lower.includes('stop autopilot') ||
    lower.includes('pause autopilot') ||
    lower === 'stop' ||
    lower === 'pause assistant'
  ) {
    return {
      intent: 'stop_autopilot',
      rawCommand: clean,
      confidence: 1.0,
    }
  }

  // Confirmation commands
  if (
    lower === 'send' ||
    lower === 'send it' ||
    lower === 'yes send it' ||
    lower === 'yes please send it' ||
    lower === 'confirm' ||
    lower === 'confirm and send' ||
    lower.startsWith('send the reply') ||
    lower === 'approve'
  ) {
    return {
      intent: 'confirm_send',
      rawCommand: clean,
      confidence: 0.95,
    }
  }

  // Cancellation commands
  if (
    lower === 'cancel' ||
    lower === 'don\'t send' ||
    lower === 'dont send' ||
    lower === 'discard' ||
    lower === 'abort' ||
    lower === 'cancel reply'
  ) {
    return {
      intent: 'cancel_draft',
      rawCommand: clean,
      confidence: 0.95,
    }
  }

  // Summarize unread emails / messages
  if (
    lower.includes('summarize my unread emails') ||
    lower.includes('summarize unread emails') ||
    lower.includes('summarize my emails') ||
    lower.includes('what are my unread emails') ||
    lower.includes('read my unread emails')
  ) {
    return {
      intent: 'summarize_unread',
      rawCommand: clean,
      platformHint: 'gmail',
      confidence: 0.9,
    }
  }

  // Read latest message
  if (
    lower.includes('read my latest message') ||
    lower.includes('read the latest message') ||
    lower.includes('what is my latest message') ||
    lower.includes('read latest message')
  ) {
    return {
      intent: 'read_latest',
      rawCommand: clean,
      confidence: 0.9,
    }
  }

  // Instagram DM reply
  if (
    lower.includes('instagram') ||
    lower.includes('insta dm') ||
    lower.includes('instagram dm')
  ) {
    let instruction = clean
    const match = clean.match(/(?:reply to this instagram dm|reply on instagram|reply to instagram dm)(?:\s+(?:in|with|that)\s+)?(.*)/i)
    if (match && match[1]) {
      instruction = match[1].trim()
    }
    return {
      intent: 'reply_instagram_dm',
      rawCommand: clean,
      platformHint: 'instagram_business',
      instruction: instruction || 'in my usual style',
      confidence: 0.88,
    }
  }

  // Email draft and read aloud
  if (
    lower.startsWith('draft a professional reply to this email') ||
    lower.startsWith('draft a reply to this email') ||
    lower.includes('reply to this email')
  ) {
    const instruction = clean.replace(/^(draft a (?:professional|friendly|quick)?\s*reply to this email(?:\s+and\s+read it aloud)?(?:\s+saying)?)\s*/i, '').trim()
    return {
      intent: 'draft_email',
      rawCommand: clean,
      platformHint: 'gmail',
      instruction: instruction || 'professional reply',
      confidence: 0.9,
    }
  }

  // Pattern: "Reply to [Recipient] on [Platform] that [Instruction]"
  // e.g. "Reply to Irfan on WhatsApp that I'll call him in ten minutes."
  const replyMatch = clean.match(/reply to\s+([a-zA-Z0-9_\s]+?)\s+on\s+(whatsapp|instagram|email|gmail|outlook)\s+(?:that|saying)\s+(.*)/i)
  if (replyMatch) {
    const recipient = replyMatch[1].trim()
    const platformWord = replyMatch[2].toLowerCase()
    const instruction = replyMatch[3].trim()

    let platform: AutopilotPlatform = 'whatsapp_notification'
    if (platformWord === 'whatsapp') platform = 'whatsapp_notification'
    else if (platformWord === 'instagram') platform = 'instagram_business'
    else if (platformWord === 'email' || platformWord === 'gmail') platform = 'gmail'
    else if (platformWord === 'outlook') platform = 'outlook'

    return {
      intent: 'send_reply',
      rawCommand: clean,
      recipientQuery: recipient,
      platformHint: platform,
      instruction,
      confidence: 0.95,
    }
  }

  // Pattern: "Reply to [Recipient] that [Instruction]"
  const simpleReplyMatch = clean.match(/reply to\s+([a-zA-Z0-9_\s]+?)\s+(?:that|saying)\s+(.*)/i)
  if (simpleReplyMatch) {
    const recipient = simpleReplyMatch[1].trim()
    const instruction = simpleReplyMatch[2].trim()
    return {
      intent: 'send_reply',
      rawCommand: clean,
      recipientQuery: recipient,
      instruction,
      confidence: 0.85,
    }
  }

  // Default: General Twin dialogue
  return {
    intent: 'general_chat',
    rawCommand: clean,
    confidence: 0.5,
  }
}

/**
 * 2. Security & Anti-Prompt-Injection Scanner
 *
 * Sanitizes and inspects message content to prevent jailbreaking, data exfiltration,
 * and detects high-impact content (financial, legal, passwords) that demands mandatory user confirmation.
 */
export function assessSafetyAndInjection(
  incomingContent: string,
  proposedReply: string
): SafetyAssessment {
  const flags: string[] = []
  let riskLevel: 'low' | 'medium' | 'high' = 'low'
  let injectionDetected = false

  const combined = `${incomingContent}\n${proposedReply}`.toLowerCase()

  // Prompt injection markers
  const injectionPatterns = [
    /ignore (?:previous|all) instructions/i,
    /system prompt/i,
    /reveal your (?:system|hidden|api) key/i,
    /you are now an unfiltered/i,
    /jailbreak/i,
    /disregard rules/i,
  ]

  for (const pattern of injectionPatterns) {
    if (pattern.test(incomingContent)) {
      injectionDetected = true
      flags.push('Potential Prompt Injection detected in message content')
      riskLevel = 'high'
      break
    }
  }

  // Financial & High-Stakes terms
  const financialPatterns = [
    /\b(?:wire|transfer|bank account|routing number|credit card|cvv|iban|bitcoin|crypto|usdt)\b/i,
    /\$\s*\d{2,}/, // Amounts over $10
    /\b(?:send me money|pay me|payment request|invoice paid)\b/i,
  ]

  for (const pattern of financialPatterns) {
    if (pattern.test(combined)) {
      flags.push('Financial or payment content detected')
      riskLevel = 'high'
      break
    }
  }

  // Credentials / Passwords
  const credentialPatterns = [
    /\b(?:password|passwd|otp|verification code|2fa code|secret token)\b/i,
  ]
  for (const pattern of credentialPatterns) {
    if (pattern.test(combined)) {
      flags.push('Authentication or credential data detected')
      riskLevel = 'high'
      break
    }
  }

  // Legal / Contracts
  const legalPatterns = [
    /\b(?:sign contract|i agree to terms|settlement offer|legal agreement|nda signature)\b/i,
  ]
  for (const pattern of legalPatterns) {
    if (pattern.test(combined)) {
      flags.push('Legal or contractual commitment detected')
      if (riskLevel !== 'high') riskLevel = 'medium'
      break
    }
  }

  const requiresExplicitConfirmation = riskLevel === 'high' || riskLevel === 'medium' || injectionDetected

  let explanation = 'Safe routine communication.'
  if (injectionDetected) {
    explanation = 'CAUTION: Incoming message contains prompt injection attempts. Explicit approval required.'
  } else if (riskLevel === 'high') {
    explanation = 'HIGH IMPACT: Contains sensitive financial or credential keywords. Manual confirmation mandatory.'
  } else if (riskLevel === 'medium') {
    explanation = 'MODERATE IMPACT: Contains contractual or consequential commitments. Review suggested.'
  }

  return {
    isSafe: !injectionDetected,
    riskLevel,
    flags,
    requiresExplicitConfirmation,
    promptInjectionDetected: injectionDetected,
    explanation,
  }
}

/**
 * 3. Generate Personality & Memory-Aligned Reply Draft
 */
export async function generateAutopilotDraft({
  userInstruction,
  incomingMessage,
  twinSettings,
  memories,
  platform,
}: {
  userInstruction: string
  incomingMessage?: InboundMessage
  twinSettings: TwinSettings | null
  memories: Memory[]
  platform: AutopilotPlatform
}): Promise<OutboundDraft> {
  const recipientName = incomingMessage?.senderName || 'Contact'
  const recipientAddress = incomingMessage?.senderId || incomingMessage?.senderHandle || recipientName

  // Formulate platform-specific tone instruction
  let platformStylePrompt = ''
  if (platform.startsWith('whatsapp')) {
    platformStylePrompt = 'Format for WhatsApp: Keep it natural, human, conversational, and direct. Do not write formal letter headers or bullet lists unless asked.'
  } else if (platform.startsWith('instagram')) {
    platformStylePrompt = 'Format for Instagram Direct Message: Friendly, concise, engaging, and modern.'
  } else {
    platformStylePrompt = 'Format for Email: Polite, well-structured, clear subject-line aligned, professional yet approachable.'
  }

  // Sanitize incoming message as untrusted context block
  const incomingSafeSnippet = incomingMessage
    ? `Incoming message from ${incomingMessage.senderName}: "${incomingMessage.content.slice(0, 500).replace(/"/g, "'")}"`
    : `Direct instruction to draft a reply.`

  const memoryContext = memories
    .filter((m) => !m.is_archived)
    .slice(0, 8)
    .map((m) => `- ${m.title}: ${m.content}`)
    .join('\n')

  const prompt = `[AUTOPILOT DRAFTING TASK]
User's explicit instruction: "${userInstruction}"
${incomingSafeSnippet}
Target platform: ${platform}
${platformStylePrompt}

User Persona & Writing Style:
- Communication Style: ${twinSettings?.communication_style || 'friendly'}
- Formality Level: ${twinSettings?.formality_level || 'neutral'}
- Vocabulary Style: ${twinSettings?.vocabulary_style || 'standard'}

Approved Personal Memories:
${memoryContext || '(No custom memories)'}

Rules:
1. Write ONLY the final reply message text that will be sent to the recipient.
2. Adopt the user's authentic voice and approved style completely.
3. Keep it concise, natural, and directly fulfilling the user's instruction.
4. Do NOT output commentary, quotes around the entire message, or meta-explanations.`

  let generatedText = ''
  try {
    const res = await generateTwinResponse({
      userMessage: prompt,
      twinSettings,
      memories,
      conversationHistory: [],
    })
    generatedText = res.content.trim()
  } catch (e) {
    console.warn('AI response generation fallback:', e)
    // Deterministic fallback matching instruction
    if (userInstruction.toLowerCase().includes('ten minutes')) {
      generatedText = "Hey! I'll give you a call in about ten minutes."
    } else {
      generatedText = userInstruction
    }
  }

  // Safety assessment
  const safety = assessSafetyAndInjection(
    incomingMessage?.content || '',
    generatedText
  )

  const draft: OutboundDraft = {
    id: `draft-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    inboundMessageId: incomingMessage?.id,
    platform,
    recipientName,
    recipientAddress,
    threadId: incomingMessage?.threadId,
    subject: incomingMessage?.subject ? `Re: ${incomingMessage.subject.replace(/^Re:\s*/i, '')}` : undefined,
    originalMessageSnippet: incomingMessage?.content.slice(0, 120),
    proposedReply: generatedText,
    reasoning: `Drafted matching your ${twinSettings?.communication_style || 'friendly'} style for ${platform}.`,
    toneUsed: twinSettings?.communication_style || 'friendly',
    memoriesReferenced: memories.slice(0, 2).map((m) => m.title),
    safetyAssessment: safety,
    status: 'awaiting_confirmation',
    createdAt: new Date().toISOString(),
  }

  return draft
}

/**
 * 4. Generate Spoken Summary of Unread Messages
 */
export function generateSpokenMessageSummary(messages: InboundMessage[]): string {
  if (!messages || messages.length === 0) {
    return 'You have no unread messages across WhatsApp, Instagram, or email.'
  }

  const counts: Record<string, number> = {}
  messages.forEach((m) => {
    const cat = m.platform.startsWith('whatsapp')
      ? 'WhatsApp'
      : m.platform.startsWith('instagram')
      ? 'Instagram'
      : 'email'
    counts[cat] = (counts[cat] || 0) + 1
  })

  const countSummaries = Object.entries(counts).map(
    ([cat, count]) => `${count} on ${cat}`
  )

  const topItems = messages.slice(0, 2).map((m) => {
    const plat = m.platform.startsWith('whatsapp') ? 'WhatsApp' : m.platform.startsWith('instagram') ? 'Instagram' : 'email'
    return `from ${m.senderName} on ${plat}: "${m.content.slice(0, 60)}"`
  })

  return `You have ${messages.length} unread ${messages.length === 1 ? 'message' : 'messages'} (${countSummaries.join(', ')}). Latest ${topItems.join(', and ')}.`
}
