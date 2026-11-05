import type { InboundMessage, OutboundDraft, DeliveryResult } from '@/types/autopilot'
import type { MessagingAdapter } from './baseAdapter'
import {
  checkAndroidNotificationAccess,
  dispatchNativeDirectReply,
} from '../nativeBridge'

/**
 * WhatsApp Notification Direct Reply Adapter (Path A)
 *
 * Intercepts incoming WhatsApp notifications via Android NotificationListenerService
 * and sends replies through the native Android RemoteInput action.
 */
export class WhatsAppNotificationAdapter implements MessagingAdapter {
  platform = 'whatsapp_notification' as const
  displayName = 'WhatsApp (Android Notification Access)'

  async verifyConnection(): Promise<{ ok: boolean; status: string; error?: string }> {
    const status = await checkAndroidNotificationAccess()
    if (!status.notificationAccessGranted) {
      return {
        ok: false,
        status: 'Permission Required',
        error: 'Android Notification Access is disabled. Please enable it in system settings.',
      }
    }
    return {
      ok: true,
      status: 'Active (Listening for WhatsApp Notifications)',
    }
  }

  async fetchMessages(): Promise<InboundMessage[]> {
    // Intercepted notifications are piped into autopilotStore via onInboundNotification
    return []
  }

  async sendMessage(draft: OutboundDraft): Promise<DeliveryResult> {
    const notifKey = draft.inboundMessageId || (draft as any).replyActionKey

    if (!notifKey) {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: 'Cannot reply: Notification reference key is missing or expired. The WhatsApp notification may have been dismissed on your phone.',
      }
    }

    try {
      const res = await dispatchNativeDirectReply(notifKey, draft.proposedReply)
      if (res.success) {
        return {
          success: true,
          messageId: `notif-reply-${Date.now()}`,
          providerStatus: 'Dispatched via Android RemoteInput to WhatsApp',
          timestamp: new Date().toISOString(),
        }
      } else {
        return {
          success: false,
          timestamp: new Date().toISOString(),
          error: res.error || 'Failed to dispatch WhatsApp notification reply',
        }
      }
    } catch (err: any) {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: err.message || 'WhatsApp notification reply failed',
      }
    }
  }
}
