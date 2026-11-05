import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AutopilotPlatform,
  AutopilotMode,
  InboundMessage,
  OutboundDraft,
  TrustedContact,
  PlatformConnection,
  AutopilotSettings,
  AutopilotAuditLog,
  DeliveryResult,
} from '@/types/autopilot'
import {
  parseVoiceAutopilotCommand,
  generateAutopilotDraft,
  generateSpokenMessageSummary,
} from '@/lib/autopilot/engine'
import { getMessagingAdapter } from '@/lib/autopilot/adapters'
import {
  checkAndroidNotificationAccess,
  openAndroidNotificationSettings,
  onInboundNotification,
} from '@/lib/autopilot/nativeBridge'
import { useTwinStore, useMemoryStore } from '@/store'
import { generateId } from '@/lib/utils'

interface AutopilotState {
  settings: AutopilotSettings
  connections: PlatformConnection[]
  inboundMessages: InboundMessage[]
  activeDraft: OutboundDraft | null
  draftsQueue: OutboundDraft[]
  trustedContacts: TrustedContact[]
  auditLogs: AutopilotAuditLog[]

  // Core Actions
  handleVoiceCommand: (
    voiceText: string
  ) => Promise<{ handled: boolean; replySpoken: string; draft?: OutboundDraft }>
  confirmActiveDraft: () => Promise<DeliveryResult | null>
  cancelActiveDraft: () => void
  stopAutopilot: (reason?: string) => void
  resumeAutopilot: () => void
  setMode: (mode: AutopilotMode) => void
  setGlobalDailyLimit: (limit: number) => void
  togglePlatformAllowed: (platform: AutopilotPlatform) => void

  // Contact management
  addTrustedContact: (contact: Omit<TrustedContact, 'id' | 'sentToday' | 'createdAt'>) => void
  updateTrustedContact: (id: string, updates: Partial<TrustedContact>) => void
  deleteTrustedContact: (id: string) => void

  // Platform connections
  updatePlatformConfig: (platform: AutopilotPlatform, config: Record<string, any>) => void
  verifyPlatformConnection: (platform: AutopilotPlatform) => Promise<{ ok: boolean; status: string }>
  openNotificationAccessSettings: () => Promise<boolean>

  // Message & Notification ingestion
  addInboundMessage: (msg: InboundMessage) => void
  markMessageAsRead: (id: string) => void
  simulateInboundNotification: (opts?: {
    sender?: string
    platform?: AutopilotPlatform
    content?: string
  }) => void
  addAuditLog: (log: Omit<AutopilotAuditLog, 'id' | 'timestamp'>) => void
}

const DEFAULT_CONNECTIONS: PlatformConnection[] = [
  {
    platform: 'whatsapp_notification',
    displayName: 'WhatsApp (Android Notification Direct Reply)',
    iconName: 'MessageSquare',
    isConnected: true,
    authType: 'android_notification',
    requiresOfficialApproval: false,
    approvalStatus: 'configured',
    approvalNotes: 'Reads WhatsApp notifications & replies via Android RemoteInput. Works without WhatsApp Business API.',
    config: {},
  },
  {
    platform: 'whatsapp_business',
    displayName: 'WhatsApp Business Cloud API',
    iconName: 'Building2',
    isConnected: false,
    authType: 'api_key',
    requiresOfficialApproval: true,
    approvalStatus: 'not_configured',
    approvalNotes: 'Official Meta Cloud API v20.0 for WhatsApp Business phone numbers. Personal accounts unsupported by Meta.',
    config: {},
  },
  {
    platform: 'instagram_business',
    displayName: 'Instagram Messaging API',
    iconName: 'Instagram',
    isConnected: false,
    authType: 'oauth2',
    requiresOfficialApproval: true,
    approvalStatus: 'personal_restricted',
    approvalNotes: 'Meta Graph API v20.0 requires Instagram Professional/Creator account connected to a Facebook Page.',
    config: {},
  },
  {
    platform: 'gmail',
    displayName: 'Google Gmail API',
    iconName: 'Mail',
    isConnected: true,
    authType: 'oauth2',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'],
    requiresOfficialApproval: false,
    approvalStatus: 'configured',
    approvalNotes: 'Direct REST API using minimum necessary Gmail send & read scopes.',
    config: {},
  },
  {
    platform: 'outlook',
    displayName: 'Microsoft Outlook (Graph API)',
    iconName: 'AtSign',
    isConnected: false,
    authType: 'oauth2',
    scopes: ['Mail.Read', 'Mail.Send'],
    requiresOfficialApproval: false,
    approvalStatus: 'not_configured',
    approvalNotes: 'Microsoft 365 / Outlook mailbox access via Microsoft Graph v1.0.',
    config: {},
  },
]

const INITIAL_INBOUND: InboundMessage[] = [
  {
    id: 'msg-whatsapp-irfan-1',
    platform: 'whatsapp_notification',
    platformMessageId: 'wa-notif-irfan-99',
    senderId: '+91 98765 43210',
    senderName: 'Irfan',
    senderHandle: 'Irfan',
    content: 'Hey! Are you free for a quick call regarding the project updates?',
    timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    isRead: false,
    canDirectReply: true,
    replyActionKey: 'wa-notif-irfan-99',
  },
  {
    id: 'msg-ig-sarah-1',
    platform: 'instagram_business',
    platformMessageId: 'ig-msg-101',
    senderId: 'sarah_creator',
    senderName: 'Sarah Jenkins',
    senderHandle: '@sarah_creator',
    content: 'Loved your latest digital twin demo! What tech stack are you using for lip-sync?',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    isRead: false,
    canDirectReply: true,
  },
  {
    id: 'msg-gmail-newsletter-1',
    platform: 'gmail',
    platformMessageId: 'gmail-msg-202',
    senderId: 'team@techdigest.io',
    senderName: 'Tech Digest',
    senderHandle: 'team@techdigest.io',
    subject: 'Weekly AI Twin Architecture Briefing',
    content: 'Here are the top three papers in voice-to-voice agents this week...',
    timestamp: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
    isRead: false,
    canDirectReply: true,
  },
]

export const useAutopilotStore = create<AutopilotState>()(
  persist(
    (set, get) => ({
      settings: {
        mode: 'voice_autopilot',
        isPaused: false,
        dailyGlobalSendLimit: 25,
        sentTodayCount: 0,
        requireConfirmationForHighRisk: true,
        voiceReadbackReplies: true,
        allowedPlatforms: {
          whatsapp_notification: true,
          whatsapp_business: true,
          instagram_business: true,
          gmail: true,
          outlook: true,
        },
        notificationAccessGranted: true,
        microphonePermissionGranted: true,
      },
      connections: DEFAULT_CONNECTIONS,
      inboundMessages: INITIAL_INBOUND,
      activeDraft: null,
      draftsQueue: [],
      trustedContacts: [
        {
          id: 'contact-irfan-1',
          name: 'Irfan',
          identifier: '+91 98765 43210',
          platform: 'all',
          allowAutoReply: true,
          allowedCategories: ['scheduling', 'acknowledgement'],
          customInstructions: 'Be warm, collaborative, and friendly.',
          dailyLimit: 10,
          sentToday: 0,
          createdAt: new Date().toISOString(),
        },
      ],
      auditLogs: [
        {
          id: 'log-init-1',
          timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          eventType: 'mode_changed',
          summary: 'Autopilot initialized in Voice-Controlled mode',
          verifiedStatus: 'Verified',
        },
      ],

      addAuditLog: (log) => {
        const fullLog: AutopilotAuditLog = {
          ...log,
          id: `log-${Date.now()}-${generateId()}`,
          timestamp: new Date().toISOString(),
        }
        set((s) => ({ auditLogs: [fullLog, ...s.auditLogs].slice(0, 100) }))
      },

      setMode: (mode) => {
        set((s) => ({ settings: { ...s.settings, mode } }))
        get().addAuditLog({
          eventType: 'mode_changed',
          summary: `Autopilot mode set to ${mode.replace('_', ' ').toUpperCase()}`,
        })
      },

      setGlobalDailyLimit: (limit) => {
        set((s) => ({ settings: { ...s.settings, dailyGlobalSendLimit: limit } }))
      },

      togglePlatformAllowed: (platform) => {
        set((s) => ({
          settings: {
            ...s.settings,
            allowedPlatforms: {
              ...s.settings.allowedPlatforms,
              [platform]: !s.settings.allowedPlatforms[platform],
            },
          },
        }))
      },

      stopAutopilot: (reason) => {
        set((s) => ({
          settings: {
            ...s.settings,
            isPaused: true,
            pauseReason: reason || 'Stopped by user command',
          },
          activeDraft: null,
        }))
        get().addAuditLog({
          eventType: 'autopilot_paused',
          summary: `Autopilot paused: ${reason || 'User command'}`,
        })
      },

      resumeAutopilot: () => {
        set((s) => ({
          settings: {
            ...s.settings,
            isPaused: false,
            pauseReason: undefined,
          },
        }))
        get().addAuditLog({
          eventType: 'autopilot_resumed',
          summary: 'Autopilot resumed',
        })
      },

      openNotificationAccessSettings: async () => {
        const granted = await openAndroidNotificationSettings()
        set((s) => ({
          settings: { ...s.settings, notificationAccessGranted: granted },
        }))
        return granted
      },

      verifyPlatformConnection: async (platform) => {
        try {
          const adapter = getMessagingAdapter(platform)
          const result = await adapter.verifyConnection()
          set((s) => ({
            connections: s.connections.map((c) =>
              c.platform === platform
                ? {
                    ...c,
                    isConnected: result.ok,
                    approvalStatus: result.ok ? 'approved' : c.approvalStatus,
                    approvalNotes: result.status + (result.error ? ` (${result.error})` : ''),
                    lastSyncAt: new Date().toISOString(),
                  }
                : c
            ),
          }))
          return result
        } catch (e: any) {
          return { ok: false, status: e.message || 'Connection test failed' }
        }
      },

      updatePlatformConfig: (platform, config) => {
        set((s) => ({
          connections: s.connections.map((c) =>
            c.platform === platform
              ? { ...c, config: { ...c.config, ...config } }
              : c
          ),
        }))
      },

      addTrustedContact: (contact) => {
        const newContact: TrustedContact = {
          ...contact,
          id: `contact-${Date.now()}-${generateId()}`,
          sentToday: 0,
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ trustedContacts: [...s.trustedContacts, newContact] }))
      },

      updateTrustedContact: (id, updates) => {
        set((s) => ({
          trustedContacts: s.trustedContacts.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }))
      },

      deleteTrustedContact: (id) => {
        set((s) => ({
          trustedContacts: s.trustedContacts.filter((c) => c.id !== id),
        }))
      },

      addInboundMessage: (msg) => {
        set((s) => ({
          inboundMessages: [msg, ...s.inboundMessages.filter((m) => m.id !== msg.id)].slice(0, 50),
        }))
      },

      markMessageAsRead: (id) => {
        set((s) => ({
          inboundMessages: s.inboundMessages.map((m) =>
            m.id === id ? { ...m, isRead: true } : m
          ),
        }))
      },

      simulateInboundNotification: (opts) => {
        const sender = opts?.sender || 'Irfan'
        const platform = opts?.platform || 'whatsapp_notification'
        const content = opts?.content || "Hey! Are you free for a call in ten minutes?"
        const id = `sim-${Date.now()}`

        const simMsg: InboundMessage = {
          id,
          platform,
          platformMessageId: `msg-${id}`,
          senderId: sender.toLowerCase().includes('irfan') ? '+91 98765 43210' : `${sender.toLowerCase()}@example.com`,
          senderName: sender,
          senderHandle: sender,
          content,
          timestamp: new Date().toISOString(),
          isRead: false,
          canDirectReply: true,
          replyActionKey: id,
        }

        get().addInboundMessage(simMsg)
        get().addAuditLog({
          eventType: 'command_parsed',
          platform,
          recipient: sender,
          summary: `Inbound notification received from ${sender} on ${platform}`,
        })
      },

      /**
       * Core Voice Autopilot Dispatcher
       */
      handleVoiceCommand: async (voiceText: string) => {
        const state = get()
        const parsed = parseVoiceAutopilotCommand(voiceText)

        // 1. Check for Emergency Stop / Pause
        if (parsed.intent === 'stop_autopilot') {
          state.stopAutopilot('Voice stop command')
          return {
            handled: true,
            replySpoken: 'Autopilot has been paused. I will not draft or send any messages until you resume.',
          }
        }

        // If currently paused, refuse outbound actions unless command is resume
        if (state.settings.isPaused) {
          return {
            handled: true,
            replySpoken: 'Autopilot is currently paused. Would you like me to resume it?',
          }
        }

        // 2. Check for Voice Confirmation of Active Draft
        if (parsed.intent === 'confirm_send') {
          if (!state.activeDraft) {
            return {
              handled: true,
              replySpoken: 'There is no pending message draft to confirm.',
            }
          }
          const result = await state.confirmActiveDraft()
          if (result && result.success) {
            return {
              handled: true,
              replySpoken: `Reply confirmed and sent to ${state.activeDraft.recipientName} on ${state.activeDraft.platform.replace('_', ' ')}.`,
            }
          } else {
            return {
              handled: true,
              replySpoken: `Sorry, delivery failed: ${result?.error || 'Provider rejected request'}.`,
            }
          }
        }

        // 3. Check for Voice Cancellation of Active Draft
        if (parsed.intent === 'cancel_draft') {
          if (!state.activeDraft) {
            return {
              handled: true,
              replySpoken: 'No active message draft to cancel.',
            }
          }
          const recName = state.activeDraft.recipientName
          state.cancelActiveDraft()
          return {
            handled: true,
            replySpoken: `Draft reply to ${recName} has been cancelled.`,
          }
        }

        // 4. Summarize unread emails
        if (parsed.intent === 'summarize_unread') {
          const unread = state.inboundMessages.filter((m) => !m.isRead)
          const summary = generateSpokenMessageSummary(unread)
          state.addAuditLog({
            eventType: 'command_parsed',
            summary: `Summarized ${unread.length} unread messages via voice`,
          })
          return {
            handled: true,
            replySpoken: summary,
          }
        }

        // 5. Read latest message and suggest reply
        if (parsed.intent === 'read_latest') {
          const latest = state.inboundMessages[0]
          if (!latest) {
            return {
              handled: true,
              replySpoken: 'You do not have any incoming messages in your inbox.',
            }
          }

          const twinSettings = useTwinStore.getState().settings
          const memories = useMemoryStore.getState().memories

          const draft = await generateAutopilotDraft({
            userInstruction: 'Suggest a friendly reply acknowledging the message',
            incomingMessage: latest,
            twinSettings,
            memories,
            platform: latest.platform,
          })

          set({ activeDraft: draft })
          state.addAuditLog({
            eventType: 'draft_generated',
            platform: latest.platform,
            recipient: latest.senderName,
            summary: `Drafted reply to latest message from ${latest.senderName}`,
          })

          return {
            handled: true,
            draft,
            replySpoken: `Latest message is from ${latest.senderName}: "${latest.content}". I suggest replying: "${draft.proposedReply}". Shall I send it?`,
          }
        }

        // 6. Instagram DM reply
        if (parsed.intent === 'reply_instagram_dm') {
          const igMsg = state.inboundMessages.find((m) => m.platform === 'instagram_business') || state.inboundMessages[0]
          const twinSettings = useTwinStore.getState().settings
          const memories = useMemoryStore.getState().memories

          const draft = await generateAutopilotDraft({
            userInstruction: parsed.instruction || 'reply in my usual style',
            incomingMessage: igMsg,
            twinSettings,
            memories,
            platform: 'instagram_business',
          })

          set({ activeDraft: draft })
          return {
            handled: true,
            draft,
            replySpoken: `I've prepared this Instagram reply for ${draft.recipientName}: "${draft.proposedReply}". Would you like me to send it?`,
          }
        }

        // 7. Draft professional email reply and read aloud
        if (parsed.intent === 'draft_email') {
          const emailMsg = state.inboundMessages.find((m) => m.platform === 'gmail' || m.platform === 'outlook') || state.inboundMessages[0]
          const twinSettings = useTwinStore.getState().settings
          const memories = useMemoryStore.getState().memories

          const draft = await generateAutopilotDraft({
            userInstruction: parsed.instruction || 'draft a professional reply',
            incomingMessage: emailMsg,
            twinSettings,
            memories,
            platform: emailMsg?.platform || 'gmail',
          })

          set({ activeDraft: draft })
          return {
            handled: true,
            draft,
            replySpoken: `Here is the professional email reply: "${draft.proposedReply}". Say "Send it" to deliver, or "Cancel" to discard.`,
          }
        }

        // 8. Specific Reply: "Reply to [recipient] on [platform] that [instruction]"
        if (parsed.intent === 'send_reply' && parsed.recipientQuery) {
          const query = parsed.recipientQuery.toLowerCase()
          // Find matching message or contact
          const matchedMessage = state.inboundMessages.find(
            (m) => m.senderName.toLowerCase().includes(query) || m.senderHandle?.toLowerCase().includes(query)
          )

          const platform = parsed.platformHint || matchedMessage?.platform || 'whatsapp_notification'
          const twinSettings = useTwinStore.getState().settings
          const memories = useMemoryStore.getState().memories

          const draft = await generateAutopilotDraft({
            userInstruction: parsed.instruction || 'acknowledge message',
            incomingMessage: matchedMessage,
            twinSettings,
            memories,
            platform,
          })

          // Check automation mode & Trusted Contacts
          const trusted = state.trustedContacts.find((c) =>
            c.name.toLowerCase().includes(query) || query.includes(c.name.toLowerCase())
          )

          // Trusted Contacts auto-send if allowed & low risk
          if (
            state.settings.mode === 'trusted_contacts' &&
            trusted?.allowAutoReply &&
            draft.safetyAssessment.riskLevel === 'low' &&
            state.settings.sentTodayCount < state.settings.dailyGlobalSendLimit
          ) {
            set({ activeDraft: draft })
            const result = await state.confirmActiveDraft()
            if (result && result.success) {
              return {
                handled: true,
                replySpoken: `Auto-replied to trusted contact ${draft.recipientName} on ${platform.replace('_', ' ')}: "${draft.proposedReply}".`,
              }
            }
          }

          // Otherwise, set active draft and request confirmation
          set({ activeDraft: draft })
          state.addAuditLog({
            eventType: 'draft_generated',
            platform,
            recipient: draft.recipientName,
            summary: `Draft created for ${draft.recipientName}: "${draft.proposedReply.slice(0, 60)}"`,
          })

          return {
            handled: true,
            draft,
            replySpoken: `I've prepared a ${platform.replace('_', ' ')} reply for ${draft.recipientName}: "${draft.proposedReply}". Shall I send it?`,
          }
        }

        return {
          handled: false,
          replySpoken: '',
        }
      },

      /**
       * Confirm and execute outbound send
       */
      confirmActiveDraft: async () => {
        const state = get()
        const draft = state.activeDraft
        if (!draft) return null

        // Enforce daily send limit
        if (state.settings.sentTodayCount >= state.settings.dailyGlobalSendLimit) {
          const err = `Daily send limit reached (${state.settings.dailyGlobalSendLimit} messages). Outbound sending blocked.`
          state.addAuditLog({
            eventType: 'security_alert',
            summary: err,
          })
          return {
            success: false,
            timestamp: new Date().toISOString(),
            error: err,
          }
        }

        // Verify platform adapter
        try {
          const adapter = getMessagingAdapter(draft.platform)
          const result = await adapter.sendMessage(draft)

          if (result.success) {
            const updatedDraft: OutboundDraft = {
              ...draft,
              status: 'sent',
              sentAt: result.timestamp,
              deliveryResult: result,
            }

            set((s) => ({
              activeDraft: null,
              draftsQueue: [updatedDraft, ...s.draftsQueue],
              settings: { ...s.settings, sentTodayCount: s.settings.sentTodayCount + 1 },
              // Mark corresponding message as read
              inboundMessages: s.inboundMessages.map((m) =>
                m.id === draft.inboundMessageId ? { ...m, isRead: true } : m
              ),
            }))

            state.addAuditLog({
              eventType: 'message_sent',
              platform: draft.platform,
              recipient: draft.recipientName,
              summary: `Delivered reply to ${draft.recipientName} via ${draft.platform}`,
              verifiedStatus: result.providerStatus || 'Delivered',
            })

            return result
          } else {
            const failedDraft: OutboundDraft = {
              ...draft,
              status: 'failed',
              deliveryResult: result,
            }

            set((s) => ({
              activeDraft: null,
              draftsQueue: [failedDraft, ...s.draftsQueue],
            }))

            state.addAuditLog({
              eventType: 'message_failed',
              platform: draft.platform,
              recipient: draft.recipientName,
              summary: `Failed to deliver reply to ${draft.recipientName}: ${result.error}`,
              verifiedStatus: 'Failed',
            })

            return result
          }
        } catch (err: any) {
          const result: DeliveryResult = {
            success: false,
            timestamp: new Date().toISOString(),
            error: err.message || 'Adapter execution threw an error',
          }

          state.addAuditLog({
            eventType: 'message_failed',
            platform: draft.platform,
            recipient: draft.recipientName,
            summary: `Error executing adapter for ${draft.platform}: ${err.message}`,
            verifiedStatus: 'Failed',
          })

          return result
        }
      },

      cancelActiveDraft: () => {
        const draft = get().activeDraft
        if (draft) {
          const cancelled: OutboundDraft = {
            ...draft,
            status: 'cancelled',
          }
          set((s) => ({
            activeDraft: null,
            draftsQueue: [cancelled, ...s.draftsQueue],
          }))
          get().addAuditLog({
            eventType: 'draft_cancelled',
            platform: draft.platform,
            recipient: draft.recipientName,
            summary: `Draft to ${draft.recipientName} was cancelled.`,
          })
        }
      },
    }),
    {
      name: 'another-me-autopilot-store',
      partialize: (s) => ({
        settings: s.settings,
        connections: s.connections,
        inboundMessages: s.inboundMessages,
        activeDraft: s.activeDraft,
        trustedContacts: s.trustedContacts,
        draftsQueue: s.draftsQueue.slice(0, 20),
        auditLogs: s.auditLogs.slice(0, 50),
      }),
    }
  )
)

// Auto-wire incoming Android notifications to the store
if (typeof window !== 'undefined') {
  onInboundNotification((notif) => {
    let platform: AutopilotPlatform = 'whatsapp_notification'
    if (notif.packageName.includes('instagram')) platform = 'instagram_business'
    else if (notif.packageName.includes('gm')) platform = 'gmail'
    else if (notif.packageName.includes('outlook')) platform = 'outlook'

    useAutopilotStore.getState().addInboundMessage({
      id: notif.id,
      platform,
      platformMessageId: notif.id,
      senderId: notif.sender,
      senderName: notif.sender,
      senderHandle: notif.sender,
      content: notif.content,
      timestamp: new Date(notif.timestamp).toISOString(),
      isRead: false,
      canDirectReply: notif.canDirectReply,
      replyActionKey: notif.id,
    })
  })
}
