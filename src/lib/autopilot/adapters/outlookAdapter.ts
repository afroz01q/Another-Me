import type { InboundMessage, OutboundDraft, DeliveryResult } from '@/types/autopilot'
import type { MessagingAdapter } from './baseAdapter'

/**
 * Microsoft Graph Outlook Adapter
 *
 * Interacts with Microsoft Graph API v1.0 for Outlook/Office 365 mail.
 * Scopes: Mail.Read, Mail.Send
 */
export class OutlookAdapter implements MessagingAdapter {
  platform = 'outlook' as const
  displayName = 'Microsoft Outlook'

  private getToken(): string | null {
    return localStorage.getItem('another-me-outlook-token') || null
  }

  async verifyConnection(): Promise<{ ok: boolean; status: string; error?: string }> {
    const token = this.getToken()
    if (!token) {
      return {
        ok: false,
        status: 'Not Connected',
        error: 'Microsoft account connection required.',
      }
    }

    try {
      const res = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        return {
          ok: false,
          status: 'Token Expired',
          error: 'Microsoft OAuth2 access token expired or revoked.',
        }
      }

      const user = await res.json()
      return {
        ok: true,
        status: `Connected: ${user.userPrincipalName || user.mail}`,
      }
    } catch (err: any) {
      return {
        ok: false,
        status: 'Connection Error',
        error: err.message || 'Failed to reach Microsoft Graph API',
      }
    }
  }

  async fetchMessages(): Promise<InboundMessage[]> {
    const token = this.getToken()
    if (!token) return []

    try {
      const res = await fetch(
        'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=isRead eq false&$top=5',
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) return []

      const data = await res.json()
      return (data.value || []).map((m: any) => ({
        id: m.id,
        platform: 'outlook' as const,
        platformMessageId: m.id,
        senderId: m.from?.emailAddress?.address || 'unknown',
        senderName: m.from?.emailAddress?.name || m.from?.emailAddress?.address || 'Unknown',
        senderHandle: m.from?.emailAddress?.address,
        subject: m.subject,
        content: m.bodyPreview || '',
        timestamp: m.receivedDateTime,
        isRead: !!m.isRead,
        canDirectReply: true,
      }))
    } catch {
      return []
    }
  }

  async sendMessage(draft: OutboundDraft): Promise<DeliveryResult> {
    const token = this.getToken()
    if (!token) {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: 'Microsoft Outlook authorization token is missing.',
      }
    }

    try {
      const payload = {
        message: {
          subject: draft.subject || 'Re: Message',
          body: {
            contentType: 'Text',
            content: draft.proposedReply,
          },
          toRecipients: [
            {
              emailAddress: {
                address: draft.recipientAddress,
              },
            },
          ],
        },
        saveToSentItems: 'true',
      }

      const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return {
          success: false,
          timestamp: new Date().toISOString(),
          error: data.error?.message || `Microsoft Graph API error ${res.status}`,
        }
      }

      return {
        success: true,
        messageId: `outlook-${Date.now()}`,
        providerStatus: 'Sent via Microsoft Graph',
        timestamp: new Date().toISOString(),
      }
    } catch (err: any) {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: err.message || 'Microsoft Graph API failure',
      }
    }
  }
}
