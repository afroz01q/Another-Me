import type { AutopilotPlatform } from '@/types/autopilot'
import type { MessagingAdapter } from './baseAdapter'
import { WhatsAppNotificationAdapter } from './whatsappNotificationAdapter'
import { WhatsAppBusinessAdapter } from './whatsappBusinessAdapter'
import { InstagramBusinessAdapter } from './instagramBusinessAdapter'
import { GmailAdapter } from './gmailAdapter'
import { OutlookAdapter } from './outlookAdapter'

export * from './baseAdapter'
export * from './whatsappNotificationAdapter'
export * from './whatsappBusinessAdapter'
export * from './instagramBusinessAdapter'
export * from './gmailAdapter'
export * from './outlookAdapter'

const adapterRegistry: Record<AutopilotPlatform, MessagingAdapter> = {
  whatsapp_notification: new WhatsAppNotificationAdapter(),
  whatsapp_business: new WhatsAppBusinessAdapter(),
  instagram_business: new InstagramBusinessAdapter(),
  gmail: new GmailAdapter(),
  outlook: new OutlookAdapter(),
}

export function getMessagingAdapter(platform: AutopilotPlatform): MessagingAdapter {
  const adapter = adapterRegistry[platform]
  if (!adapter) {
    throw new Error(`Unsupported messaging platform adapter: "${platform}"`)
  }
  return adapter
}
