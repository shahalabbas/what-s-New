import { formatTime12 } from './timeUtils'
import type { ResolvedSession, MessMenu, MessMenuDay } from '../types'

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported'
  try {
    const result = await Notification.requestPermission()
    return result
  } catch (err) {
    console.error('Error requesting notification permission:', err)
    return 'denied'
  }
}

/**
 * Returns full URL to the official What's Next app logo
 */
export function getAppLogoUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/icons/icon-192.png`
  }
  return '/icons/icon-192.png'
}

export interface NotificationPayload {
  title: string
  body: string
  tag?: string
  icon?: string
  badge?: string
  data?: { url: string }
  vibrate?: number[]
}

/**
 * Format a rich notification dispatched before class starts (5 minutes prior or starting now)
 */
export function formatClassNotification(session: ResolvedSession, minsRemaining?: number): NotificationPayload {
  const courseName = session.course?.name || session.course_id || 'Class Session'
  const faculty = session.course?.faculty ? `with ${session.course.faculty.replace(/^Prof\.?\s*/i, 'Prof. ')}` : ''
  const room = session.room ? `Room ${session.room}` : 'CR'
  const sessionInfo = session.session_no
    ? `Session ${session.session_no}${session.course?.total_sessions ? ` of ${session.course.total_sessions}` : ''}`
    : ''
  const startTime = formatTime12(session.start_time)
  const logo = getAppLogoUrl()

  const bodyParts = [`Starts at ${startTime}`, room, sessionInfo, faculty].filter(Boolean)

  let titlePrefix = '📚 Class in 5 Mins'
  if (minsRemaining !== undefined) {
    if (minsRemaining <= 0) titlePrefix = '📚 Class Starting Now'
    else if (minsRemaining === 1) titlePrefix = '📚 Class in 1 Min'
    else titlePrefix = `📚 Class in ${minsRemaining} Mins`
  }

  return {
    title: `${titlePrefix}: ${courseName}`,
    body: bodyParts.join(' · '),
    tag: `class-5m-${session.id}`,
    icon: logo,
    badge: logo,
    data: { url: '/timetable' },
    vibrate: [150, 80, 150],
  }
}

/**
 * Format a rich notification dispatched before mess meal starts, including the food items!
 */
export function formatMessNotification(
  meal: MessMenu,
  dayMenu?: MessMenuDay | null,
  minsRemaining?: number
): NotificationPayload {
  const mealName =
    dayMenu?.label ||
    (meal.meal.charAt(0).toUpperCase() + meal.meal.slice(1)).replace(/_/g, ' ')

  const timeWindow = `${formatTime12(meal.start_time)} – ${formatTime12(meal.end_time)}`

  // Extract food items from dayMenu items or meal string items
  let dishesText = ''
  if (dayMenu && dayMenu.items && dayMenu.items.length > 0) {
    const itemNames = dayMenu.items.map((i) => {
      let suffix = ''
      if (i.is_special) suffix = ' (Special ⭐)'
      else if (i.diet === 'non_veg') suffix = ' (Non-Veg 🍗)'
      else if (i.diet === 'egg') suffix = ' (Egg 🥚)'
      return `${i.name}${suffix}`
    })
    dishesText = itemNames.join(', ')
  } else if (meal.items && meal.items.length > 0) {
    dishesText = meal.items.join(', ')
  } else {
    dishesText = 'Tap to view today’s full campus menu.'
  }

  // Cap food preview to 140 characters so it fits cleanly in iOS/Android lock screen banners
  if (dishesText.length > 140) {
    dishesText = dishesText.slice(0, 137) + '...'
  }

  const logo = getAppLogoUrl()

  let titlePrefix = `🍽️ ${mealName} Starts in 5 Mins`
  if (minsRemaining !== undefined) {
    if (minsRemaining <= 0) titlePrefix = `🍽️ ${mealName} is Now Serving`
    else if (minsRemaining === 1) titlePrefix = `🍽️ ${mealName} Starts in 1 Min`
    else titlePrefix = `🍽️ ${mealName} Starts in ${minsRemaining} Mins`
  }

  return {
    title: `${titlePrefix} (${timeWindow})`,
    body: dishesText,
    tag: `mess-5m-${meal.meal}-${meal.date || ''}`,
    icon: logo,
    badge: logo,
    data: { url: '/mess' },
    vibrate: [200, 100, 200],
  }
}

/**
 * Dispatch local notification via Service Worker registration (or fallback window Notification)
 * using the official What's Next app logo
 */
export async function sendLocalNotification(payload: NotificationPayload): Promise<boolean> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false
  }

  const logo = getAppLogoUrl()

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(payload.title, {
          body: payload.body,
          icon: payload.icon || logo,
          badge: payload.badge || logo,
          tag: payload.tag || 'whats-next-alert',
          data: payload.data || { url: '/' },
          // @ts-ignore vibrate in NotificationOptions
          vibrate: payload.vibrate || [150, 80, 150],
        })
        return true
      }
    }

    // Fallback for desktop browser without service worker
    new Notification(payload.title, {
      body: payload.body,
      icon: payload.icon || logo,
      tag: payload.tag,
      data: payload.data,
    })
    return true
  } catch (err) {
    console.error('Failed to dispatch notification:', err)
    return false
  }
}
