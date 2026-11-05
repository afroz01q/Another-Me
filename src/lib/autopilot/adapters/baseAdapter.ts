import type { AutopilotPlatform, InboundMessage, OutboundDraft, DeliveryResult } from '@/types/autopilot'

export interface MessagingAdapter {
  platform: AutopilotPlatform
  displayName: string

  /**
   * Verify authentication, credentials, and connection health
   */
  verifyConnection(): Promise<{ ok: boolean; status: string; error?: string }>

  /**
   * Fetch unread/latest authorized messages from provider
   */
  fetchMessages(): Promise<InboundMessage[]>

  /**
   * Send outbound reply message through provider
   */
  sendMessage(draft: OutboundDraft): Promise<DeliveryResult>
}
