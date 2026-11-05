import type { InboundMessage, OutboundDraft, DeliveryResult } from '@/types/autopilot'
import type { MessagingAdapter } from './baseAdapter'

/**
 * Instagram Messaging API Adapter (Professional / Creator Accounts)
 *
 * Interacts with Meta's official Instagram Messaging Graph API v20.0.
 *
 * NOTE: Meta strictly restricts inbox messaging API access to Instagram Professional, Business,
 * or Creator accounts connected to a Facebook Page. Personal Instagram accounts are not supported
 * by Meta's API. This integration strictly complies with platform terms and does not scrape or store passwords.
 */
export class InstagramBusinessAdapter implements MessagingAdapter {
  platform = 'instagram_business' as const
  displayName = 'Instagram Messaging (Professional/Creator)'

  private getCredentials(): { pageAccessToken?: string; instagramAccountId?: string } {
    try {
      const stored = localStorage.getItem('another-me-instagram-config')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {}
    return {}
  }

  async verifyConnection(): Promise<{ ok: boolean; status: string; error?: string }> {
    const { pageAccessToken, instagramAccountId } = this.getCredentials()

    if (!pageAccessToken || !instagramAccountId) {
      return {
        ok: false,
        status: 'Professional Account Setup Required',
        error: 'Requires Meta Page Access Token and Instagram Business Account ID. (Personal IG accounts are unsupported by Meta API).',
      }
    }

    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${instagramAccountId}?fields=id,username,name`, {
        headers: {
          Authorization: `Bearer ${pageAccessToken}`,
        },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return {
          ok: false,
          status: 'Authentication Failed',
          error: data.error?.message || `Instagram Graph API returned HTTP ${res.status}`,
        }
      }

      const info = await res.json()
      return {
        ok: true,
        status: `Connected: @${info.username || instagramAccountId}`,
      }
    } catch (err: any) {
      return {
        ok: false,
        status: 'Network Error',
        error: err.message || 'Unable to connect to Instagram Graph API',
      }
    }
  }

  async fetchMessages(): Promise<InboundMessage[]> {
    // Inbound Instagram DMs arrive via Meta Webhooks or Graph API conversations endpoint
    return []
  }

  async sendMessage(draft: OutboundDraft): Promise<DeliveryResult> {
    const { pageAccessToken } = this.getCredentials()

    const recipientId = draft.recipientAddress

    if (!recipientId) {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: 'Instagram recipient ID or scoped user ID (IGSID) is missing.',
      }
    }

    if (!pageAccessToken) {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: 'Instagram Professional Page Access Token is not configured in Settings.',
      }
    }

    try {
      const payload = {
        recipient: { id: recipientId },
        message: { text: draft.proposedReply },
      }

      const res = await fetch('https://graph.facebook.com/v20.0/me/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pageAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        return {
          success: false,
          timestamp: new Date().toISOString(),
          error: data.error?.message || `Instagram Graph API error ${res.status}`,
        }
      }

      return {
        success: true,
        messageId: data.message_id || `igmid.${Date.now()}`,
        providerStatus: 'Delivered (Instagram Graph API)',
        timestamp: new Date().toISOString(),
      }
    } catch (err: any) {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: err.message || 'Instagram API network failure',
      }
    }
  }
}
