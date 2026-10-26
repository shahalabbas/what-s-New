import { supabase } from './supabase'

export type DevicePlatform = 'ios' | 'android' | 'desktop' | 'other'

export interface NotificationPrefs {
  classes: boolean
  meals: boolean
  meal_types: string[]
}

export const DEFAULT_PREFS: NotificationPrefs = {
  classes: true,
  meals: true,
  meal_types: ['breakfast', 'lunch', 'hi_tea', 'dinner'],
}

/**
 * Converts a base64 VAPID public key into a Uint8Array for PushManager
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Detects the client device platform
 */
export function getDevicePlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  if (/macintosh|windows|linux/.test(ua) && !/mobile/.test(ua)) return 'desktop'
  return 'other'
}

/**
 * Checks if the user is running in Safari on an iPhone/iPad without having installed the PWA
 * (iOS Web Push requires the PWA to be added to Home Screen on iOS 16.4+)
 */
export function isIosSafariNotInstalled(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isStandalone =
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  return isIos && !isStandalone
}

/**
 * Fetches the user's notification preferences from Supabase (or defaults)
 */
export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  try {
    const { data, error } = await supabase
      .from('notification_prefs')
      .select('classes, meals, meal_types')
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !data) {
      return DEFAULT_PREFS
    }

    return {
      classes: data.classes ?? true,
      meals: data.meals ?? true,
      meal_types: Array.isArray(data.meal_types) ? data.meal_types : DEFAULT_PREFS.meal_types,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

/**
 * Saves the user's notification preferences to Supabase
 */
export async function saveNotificationPrefs(
  userId: string,
  prefs: NotificationPrefs
): Promise<boolean> {
  try {
    const { error } = await supabase.from('notification_prefs').upsert({
      user_id: userId,
      classes: prefs.classes,
      meals: prefs.meals,
      meal_types: prefs.meal_types,
      updated_at: new Date().toISOString(),
    })
    return !error
  } catch {
    return false
  }
}

/**
 * Checks if this specific browser device is currently registered in push_subscriptions
 */
export async function getDevicePushSubscription(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.ready
    if (!reg || !reg.pushManager) return null
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

/**
 * Subscribes this device to Web Push and saves it to push_subscriptions
 */
export async function subscribeDeviceToPush(
  userId: string,
  vapidPublicKey: string
): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { success: false, error: 'Web Push is not supported on this browser' }
  }

  if (isIosSafariNotInstalled()) {
    return {
      success: false,
      error: 'To enable notifications on iPhone, please tap Safari’s Share button ⎋ and choose "Add to Home Screen".',
    }
  }

  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') {
      return { success: false, error: 'Notification permission was not granted' }
    }

    const reg = await navigator.serviceWorker.ready
    if (!reg.pushManager) {
      return { success: false, error: 'PushManager is not available on this device' }
    }

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey)
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey as unknown as BufferSource,
      })
    }

    const subJson = sub.toJSON()
    const endpoint = sub.endpoint
    const p256dh = subJson.keys?.p256dh
    const auth = subJson.keys?.auth

    if (!endpoint || !p256dh || !auth) {
      return { success: false, error: 'Failed to extract push credentials from browser' }
    }

    const platform = getDevicePlatform()
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        platform,
        user_agent: userAgent,
        last_success_at: new Date().toISOString(),
        failure_count: 0,
      },
      { onConflict: 'endpoint' }
    )

    if (error) {
      console.error('Error saving push subscription to Supabase:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err: any) {
    console.error('Failed to subscribe device to push:', err)
    return { success: false, error: err?.message || 'Failed to subscribe' }
  }
}

/**
 * Unsubscribes this device from Web Push and removes it from push_subscriptions
 */
export async function unsubscribeDeviceFromPush(userId: string): Promise<boolean> {
  try {
    const sub = await getDevicePushSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe().catch(() => {})
      await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    } else {
      await supabase.from('push_subscriptions').delete().eq('user_id', userId)
    }
    return true
  } catch (err) {
    console.warn('Error unsubscribing device:', err)
    return false
  }
}
