import type { InboundMessage, OutboundDraft, DeliveryResult } from '@/types/autopilot'
import type { MessagingAdapter } from './baseAdapter'

/**
 * WhatsApp Business Cloud API Adapter (Path B)
 *
 * Interacts with Meta's official WhatsApp Business Cloud API (Graph API v20.0+).
 * Requires Meta Developer App, WhatsApp Business Account (WABA), Phone Number ID, and System User Access Token.
 */
export class WhatsAppBusinessAdapter implements MessagingAdapter {
  platform = 'whatsapp_business' as const
  displayName = 'WhatsApp Business Cloud API'

  private getCredentials(): { phoneNumberId?: string; accessToken?: string } {
    try {
      const stored = localStorage.getItem('another-me-whatsapp-business-config')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {}
    return {}
  }

  async verifyConnection(): Promise<{ ok: boolean; status: string; error?: string }> {
    const { phoneNumberId, accessToken } = this.getCredentials()

    if (!phoneNumberId || !accessToken) {
      return {
        ok: false,
        status: 'Configuration Required',
        error: 'WhatsApp Business Phone Number ID and Access Token are not configured.',
      }
    }

    try {
      // Verify Phone Number ID via Meta Graph API
      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return {
          ok: false,
          status: 'Authentication Failed',
          error: data.error?.message || `Meta Graph API returned HTTP ${res.status}`,
        }
      }

      const info = await res.json()
      return {
        ok: true,
        status: `Connected: ${info.display_phone_number || info.verified_name || phoneNumberId}`,
      }
    } catch (err: any) {
      return {
        ok: false,
        status: 'Network Error',
        error: err.message || 'Unable to connect to Meta Graph API',
      }
    }
  }

  async fetchMessages(): Promise<InboundMessage[]> {
    // In production, inbound messages arrive via Meta Webhooks (/api/webhooks/whatsapp)
    return []
  }

  async sendMessage(draft: OutboundDraft): Promise<DeliveryResult> {
    const { phoneNumberId, accessToken } = this.getCredentials()

    // Format phone number to clean E.164 digits without plus or dashes
    const cleanTo = draft.recipientAddress.replace(/[^0-9]/g, '')
    if (!cleanTo || cleanTo.length < 7) {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: `Invalid recipient phone number: "${draft.recipientAddress}". Must be a valid phone number with country code.`,
      }
    }

    if (!phoneNumberId || !accessToken) {
      // In sandbox/demo mode when token is omitted, simulate realistic verification failure
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: 'WhatsApp Business Cloud API requires configured Phone Number ID & Token in Settings.',
      }
    }

    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: {
          preview_url: false,
          body: draft.proposedReply,
        },
      }

      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        return {
          success: false,
          timestamp: new Date().toISOString(),
          error: data.error?.message || `WhatsApp API error ${res.status}`,
        }
      }

      const messageId = data.messages?.[0]?.id || `wamid.${Date.now()}`
      return {
        success: true,
        messageId,
        providerStatus: 'Sent (Meta Cloud API accepted)',
        timestamp: new Date().toISOString(),
      }
    } catch (err: any) {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: err.message || 'WhatsApp Cloud API network failure',
      }
    }
  }
}
