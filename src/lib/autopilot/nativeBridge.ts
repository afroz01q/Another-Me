/**
 * Native Android Autopilot Bridge
 *
 * Interfaces with Android NotificationListenerService and RemoteInput via Capacitor,
 * or provides web fallback / simulator when running in desktop/mobile web browsers.
 */

export interface NativeNotificationPayload {
  id: string
  packageName: string
  sender: string
  content: string
  timestamp: number
  canDirectReply: boolean
}

export interface AndroidBridgeStatus {
  isNativeAndroid: boolean
  notificationAccessGranted: boolean
  packageName: string
  audioPermissionGranted: boolean
}

// In-memory callbacks for notification events
type InboundNotificationListener = (payload: NativeNotificationPayload) => void
const listeners = new Set<InboundNotificationListener>()

// Check if running in Capacitor Native Android
export function isCapacitorAndroid(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as any).Capacitor
  return !!(cap && cap.isNativePlatform && cap.isNativePlatform() && cap.getPlatform() === 'android')
}

/**
 * Check Android system notification access state
 */
export async function checkAndroidNotificationAccess(): Promise<AndroidBridgeStatus> {
  const isNative = isCapacitorAndroid()

  if (isNative) {
    try {
      const cap = (window as any).Capacitor
      const bridge = cap.Plugins?.AutopilotBridge
      if (bridge?.checkNotificationAccess) {
        const result = await bridge.checkNotificationAccess()
        return {
          isNativeAndroid: true,
          notificationAccessGranted: !!result.granted,
          packageName: result.packageName || 'com.anotherme.autopilot',
          audioPermissionGranted: true,
        }
      }
    } catch (e) {
      console.warn('Native notification check failed:', e)
    }
  }

  // Web / PWA fallback state from localStorage
  const savedState = localStorage.getItem('another-me-android-notif-access')
  const granted = savedState === 'granted'

  return {
    isNativeAndroid: isNative,
    notificationAccessGranted: granted,
    packageName: 'com.anotherme.autopilot',
    audioPermissionGranted: typeof navigator !== 'undefined' && !!navigator.mediaDevices,
  }
}

/**
 * Open Android system settings to grant Notification Access
 */
export async function openAndroidNotificationSettings(): Promise<boolean> {
  if (isCapacitorAndroid()) {
    try {
      const cap = (window as any).Capacitor
      const bridge = cap.Plugins?.AutopilotBridge
      if (bridge?.openNotificationSettings) {
        await bridge.openNotificationSettings()
        return true
      }
    } catch (e) {
      console.warn('Failed to open native settings:', e)
    }
  }

  // In Web/PWA mode: simulate or persist toggle
  const current = localStorage.getItem('another-me-android-notif-access') === 'granted'
  const next = !current
  localStorage.setItem('another-me-android-notif-access', next ? 'granted' : 'denied')
  return next
}

/**
 * Dispatch direct reply back to WhatsApp / Instagram / Gmail via Android RemoteInput
 */
export async function dispatchNativeDirectReply(
  notificationKey: string,
  replyText: string
): Promise<{ success: boolean; error?: string }> {
  if (isCapacitorAndroid()) {
    try {
      const cap = (window as any).Capacitor
      const bridge = cap.Plugins?.AutopilotBridge
      if (bridge?.sendDirectReply) {
        const res = await bridge.sendDirectReply({ notificationKey, replyText })
        return { success: !!res.success }
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Direct reply failed' }
    }
  }

  // In Web/PWA mode: log and verify successful mock reply dispatch
  console.log(`[Web Native Bridge] Simulated RemoteInput reply dispatched for ${notificationKey}: "${replyText}"`)
  return { success: true }
}

/**
 * Subscribe to inbound Android notification events
 */
export function onInboundNotification(listener: InboundNotificationListener): () => void {
  listeners.add(listener)

  if (isCapacitorAndroid()) {
    const cap = (window as any).Capacitor
    const bridge = cap.Plugins?.AutopilotBridge
    if (bridge?.addListener) {
      const handle = bridge.addListener('onInboundNotification', (data: NativeNotificationPayload) => {
        listener(data)
      })
      return () => {
        listeners.delete(listener)
        handle?.remove?.()
      }
    }
  }

  return () => {
    listeners.delete(listener)
  }
}

/**
 * Trigger an inbound notification (used by simulator and tests)
 */
export function emitInboundNotification(payload: NativeNotificationPayload): void {
  listeners.forEach((fn) => {
    try {
      fn(payload)
    } catch (e) {
      console.error('Error in notification listener:', e)
    }
  })
}

/**
 * Speak text natively using Android TextToSpeech engine via AutopilotBridgePlugin
 */
export async function speakNativeAndroidTTS(
  text: string,
  rate = 1.0,
  pitch = 1.0,
  onStart?: () => void,
  onDone?: () => void,
  onError?: (err: any) => void
): Promise<boolean> {
  if (!isCapacitorAndroid()) return false

  try {
    const cap = (window as any).Capacitor
    const bridge = cap?.Plugins?.AutopilotBridge
    if (!bridge?.speak) return false

    // Subscribe to native ttsEvent
    let handle: any = null
    if (bridge.addListener) {
      handle = await bridge.addListener('ttsEvent', (data: { event: string; utteranceId: string }) => {
        if (data.event === 'start') {
          onStart?.()
        } else if (data.event === 'done') {
          handle?.remove?.()
          onDone?.()
        } else if (data.event === 'error') {
          handle?.remove?.()
          onError?.(new Error('Native Android TTS error'))
        }
      })
    }

    const res = await bridge.speak({ text, rate, pitch })
    return !!res?.success
  } catch (e) {
    console.warn('Native Android TTS invocation failed:', e)
    return false
  }
}

/**
 * Stop native Android TextToSpeech engine
 */
export async function stopNativeAndroidTTS(): Promise<void> {
  if (!isCapacitorAndroid()) return
  try {
    const cap = (window as any).Capacitor
    const bridge = cap?.Plugins?.AutopilotBridge
    if (bridge?.stopSpeaking) {
      await bridge.stopSpeaking()
    }
  } catch (e) {
    // Ignore error
  }
}

