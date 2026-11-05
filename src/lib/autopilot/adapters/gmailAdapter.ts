import type { InboundMessage, OutboundDraft, DeliveryResult } from '@/types/autopilot'
import type { MessagingAdapter } from './baseAdapter'

/**
 * Gmail REST API Adapter
 *
 * Interacts with Google Gmail API v1 using authorized OAuth2 tokens.
 * Scopes: https://www.googleapis.com/auth/gmail.readonly, https://www.googleapis.com/auth/gmail.send
 */
export class GmailAdapter implements MessagingAdapter {
  platform = 'gmail' as const
  displayName = 'Google Gmail'

  private getToken(): string | null {
    return localStorage.getItem('another-me-gmail-token') || null
  }

  async verifyConnection(): Promise<{ ok: boolean; status: string; error?: string }> {
    const token = this.getToken()
    if (!token) {
      return {
        ok: false,
        status: 'Not Connected',
        error: 'Google OAuth2 connection required.',
      }
    }

    try {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        return {
          ok: false,
          status: 'Token Expired',
          error: 'Gmail authorization token is invalid or expired.',
        }
      }

      const profile = await res.json()
      return {
        ok: true,
        status: `Connected: ${profile.emailAddress}`,
      }
    } catch (err: any) {
      return {
        ok: false,
        status: 'Connection Error',
        error: err.message || 'Failed to reach Gmail API',
      }
    }
  }

  async fetchMessages(): Promise<InboundMessage[]> {
    const token = this.getToken()
    if (!token) return []

    try {
      const listRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=5',
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!listRes.ok) return []

      const listData = await listRes.json()
      const messages: InboundMessage[] = []

      for (const item of listData.messages || []) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!msgRes.ok) continue
        const detail = await msgRes.json()

        const headers = detail.payload?.headers || []
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender'
        const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '(No Subject)'
        const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || new Date().toISOString()

        messages.push({
          id: detail.id,
          platform: 'gmail',
          platformMessageId: detail.id,
          senderId: fromHeader,
          senderName: fromHeader.replace(/<.*>/, '').trim(),
          senderHandle: fromHeader,
          threadId: detail.threadId,
          subject: subjectHeader,
          content: detail.snippet || '',
          timestamp: new Date(dateHeader).toISOString(),
          isRead: false,
          canDirectReply: true,
        })
      }

      return messages
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
        error: 'Gmail authorization token is missing. Please connect your Google account.',
      }
    }

    try {
      const subject = draft.subject || 'Re: Message'
      const recipient = draft.recipientAddress

      // Build RFC 2822 email payload
      const rawEmail = [
        `To: ${recipient}`,
        `Subject: ${subject}`,
        draft.threadId ? `In-Reply-To: <${draft.threadId}>` : '',
        draft.threadId ? `References: <${draft.threadId}>` : '',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        draft.proposedReply,
      ]
        .filter(Boolean)
        .join('\r\n')

      // Base64url encoding
      const encoded = btoa(unescape(encodeURIComponent(rawEmail)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: encoded,
          threadId: draft.threadId,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        return {
          success: false,
          timestamp: new Date().toISOString(),
          error: data.error?.message || `Gmail API error ${res.status}`,
        }
      }

      return {
        success: true,
        messageId: data.id,
        providerStatus: 'Sent via Gmail API',
        timestamp: new Date().toISOString(),
      }
    } catch (err: any) {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: err.message || 'Gmail API network failure',
      }
    }
  }
}
