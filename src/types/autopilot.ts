// Autopilot Voice-Controlled Messaging Types for Another Me

export type AutopilotPlatform =
  | 'whatsapp_notification'
  | 'whatsapp_business'
  | 'instagram_business'
  | 'gmail'
  | 'outlook'

export type AutopilotMode =
  | 'manual'          // Require confirmation for every outbound message
  | 'trusted_contacts'// Narrowly scoped auto-replies for approved contacts only
  | 'voice_autopilot'  // Voice commands trigger actions with configured safety rules

export type MessageRiskLevel = 'low' | 'medium' | 'high'

export interface InboundMessage {
  id: string
  platform: AutopilotPlatform
  platformMessageId: string
  senderId: string
  senderName: string
  senderHandle?: string
  recipientId?: string
  threadId?: string
  subject?: string
  content: string
  timestamp: string
  isRead: boolean
  canDirectReply: boolean
  replyActionKey?: string
  rawMetadata?: Record<string, unknown>
}

export interface SafetyAssessment {
  isSafe: boolean
  riskLevel: MessageRiskLevel
  flags: string[]
  requiresExplicitConfirmation: boolean
  promptInjectionDetected: boolean
  explanation: string
}

export interface DeliveryResult {
  success: boolean
  messageId?: string
  providerStatus?: string
  timestamp: string
  error?: string
}

export interface OutboundDraft {
  id: string
  inboundMessageId?: string
  platform: AutopilotPlatform
  recipientName: string
  recipientAddress: string
  threadId?: string
  subject?: string
  originalMessageSnippet?: string
  proposedReply: string
  reasoning: string
  toneUsed: string
  memoriesReferenced: string[]
  safetyAssessment: SafetyAssessment
  status: 'draft' | 'awaiting_confirmation' | 'sending' | 'sent' | 'cancelled' | 'failed'
  createdAt: string
  sentAt?: string
  deliveryResult?: DeliveryResult
}

export interface TrustedContact {
  id: string
  name: string
  identifier: string // Phone number, email, or handle
  platform: AutopilotPlatform | 'all'
  allowAutoReply: boolean
  allowedCategories: string[] // e.g. 'scheduling', 'acknowledgement', 'casual_chat'
  customInstructions?: string
  dailyLimit: number
  sentToday: number
  lastSentAt?: string
  createdAt: string
}

export interface PlatformConnection {
  platform: AutopilotPlatform
  displayName: string
  iconName: string
  isConnected: boolean
  authType: 'android_notification' | 'oauth2' | 'api_key'
  accountIdentifier?: string
  scopes?: string[]
  requiresOfficialApproval: boolean
  approvalStatus: 'approved' | 'pending' | 'personal_restricted' | 'configured' | 'not_configured'
  approvalNotes: string
  config: Record<string, string | boolean | number>
  lastSyncAt?: string
}

export interface AutopilotSettings {
  mode: AutopilotMode
  isPaused: boolean
  pauseReason?: string
  dailyGlobalSendLimit: number
  sentTodayCount: number
  requireConfirmationForHighRisk: boolean
  voiceReadbackReplies: boolean
  allowedPlatforms: Record<AutopilotPlatform, boolean>
  notificationAccessGranted: boolean
  microphonePermissionGranted: boolean
}

export interface AutopilotAuditLog {
  id: string
  timestamp: string
  eventType:
    | 'command_parsed'
    | 'draft_generated'
    | 'confirmation_requested'
    | 'draft_confirmed'
    | 'draft_cancelled'
    | 'message_sent'
    | 'message_failed'
    | 'autopilot_paused'
    | 'autopilot_resumed'
    | 'security_alert'
    | 'mode_changed'
  platform?: AutopilotPlatform
  recipient?: string
  summary: string
  details?: Record<string, unknown>
  verifiedStatus?: string
}

export type VoiceAutopilotIntent =
  | 'send_reply'           // "Reply to Irfan on WhatsApp that..."
  | 'read_latest'          // "Read my latest message and suggest a reply"
  | 'reply_instagram_dm'   // "Reply to this Instagram DM in my usual style"
  | 'summarize_unread'     // "Summarize my unread emails"
  | 'draft_email'          // "Draft a professional reply to this email and read it aloud"
  | 'confirm_send'         // "Send the reply after I confirm", "Yes send it", "Confirm"
  | 'cancel_draft'         // "Cancel", "Don't send"
  | 'stop_autopilot'       // "Stop autopilot"
  | 'general_chat'         // Regular twin dialogue
