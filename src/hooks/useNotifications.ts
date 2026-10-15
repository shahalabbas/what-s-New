import { useState, useEffect, useCallback, useRef } from 'react'
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  sendLocalNotification,
  formatClassNotification,
  formatMessNotification,
  type NotificationPermissionState,
} from '../lib/notifications'
import { nowIST, formatIST, todayIST, timeToMinutes } from '../lib/timeUtils'
import type { ResolvedSession, MessMenu, MessMenuDay } from '../types'

const PREF_CLASS_ALERTS = 'whats_next_class_alerts'
const PREF_MESS_ALERTS = 'whats_next_mess_alerts'

export function useNotifications(options?: {
  sessions?: ResolvedSession[]
  messMenus?: MessMenu[]
  dayMenus?: MessMenuDay[]
  autoRequest?: boolean
}) {
  const [permission, setPermission] = useState<NotificationPermissionState>(getNotificationPermission)
  const [isSupported] = useState<boolean>(isNotificationSupported)

  // Default to enabled for all registered users without requiring manual setup
  const [classAlertsEnabled, setClassAlertsEnabledState] = useState<boolean>(() => {
    try {
      const val = localStorage.getItem(PREF_CLASS_ALERTS)
      return val === null ? true : val === 'true'
    } catch {
      return true
    }
  })

  const [messAlertsEnabled, setMessAlertsEnabledState] = useState<boolean>(() => {
    try {
      const val = localStorage.getItem(PREF_MESS_ALERTS)
      return val === null ? true : val === 'true'
    } catch {
      return true
    }
  })

  // Auto-request permission when user is registered/active
  useEffect(() => {
    if (options?.autoRequest && isNotificationSupported() && Notification.permission === 'default') {
      try {
        Notification.requestPermission()
          .then((res) => {
            setPermission(res)
          })
          .catch(() => {})
      } catch {}
    }
  }, [options?.autoRequest])

  // Update permission on visibility change or focus
  useEffect(() => {
    const updatePerm = () => {
      setPermission(getNotificationPermission())
    }
    window.addEventListener('focus', updatePerm)
    document.addEventListener('visibilitychange', updatePerm)
    return () => {
      window.removeEventListener('focus', updatePerm)
      document.removeEventListener('visibilitychange', updatePerm)
    }
  }, [])

  const setClassAlertsEnabled = useCallback((enabled: boolean) => {
    setClassAlertsEnabledState(enabled)
    try {
      localStorage.setItem(PREF_CLASS_ALERTS, String(enabled))
    } catch {}
  }, [])

  const setMessAlertsEnabled = useCallback((enabled: boolean) => {
    setMessAlertsEnabledState(enabled)
    try {
      localStorage.setItem(PREF_MESS_ALERTS, String(enabled))
    } catch {}
  }, [])

  const requestPermission = useCallback(async (): Promise<NotificationPermissionState> => {
    const result = await requestNotificationPermission()
    setPermission(result)
    return result
  }, [])

  // Send a realistic 5-min prior test notification for verification
  const sendTestNotification = useCallback(
    async (type: 'class' | 'mess'): Promise<boolean> => {
      if (permission !== 'granted') {
        const res = await requestPermission()
        if (res !== 'granted') return false
      }

      if (type === 'class') {
        // Starts 5 minutes from now
        const startTimeStr = formatIST(new Date(nowIST().getTime() + 5 * 60 * 1000), 'HH:mm')
        const endTimeStr = formatIST(new Date(nowIST().getTime() + 80 * 60 * 1000), 'HH:mm')

        const mockSession: ResolvedSession = {
          id: 'test-class',
          course_id: 'CS101',
          session_type: 'regular',
          start_time: startTimeStr,
          end_time: endTimeStr,
          room: 'CR-102',
          session_no: 12,
          course: {
            id: 'CS101',
            code: 'DPS',
            name: 'Digital Product Strategy',
            faculty: 'Prof. Rajesh Sharma',
            credits: 3,
            color_tag: '#0A84FF',
            total_sessions: 20,
          },
        }
        return await sendLocalNotification(formatClassNotification(mockSession))
      } else {
        const mockMeal: MessMenu = {
          id: 'test-mess',
          date: todayIST(),
          meal: 'lunch',
          start_time: formatIST(new Date(nowIST().getTime() + 5 * 60 * 1000), 'HH:mm'),
          end_time: formatIST(new Date(nowIST().getTime() + 125 * 60 * 1000), 'HH:mm'),
          items: ['Paneer Butter Masala', 'Dal Tadka', 'Jeera Rice', 'Tandoori Roti', 'Gulab Jamun'],
        }
        const mockDayMenu: MessMenuDay = {
          date: todayIST(),
          meal: 'lunch',
          label: 'Lunch',
          start_time: mockMeal.start_time,
          end_time: mockMeal.end_time,
          has_non_veg: false,
          has_special: true,
          items: [
            { position: 1, name: 'Paneer Butter Masala', raw: 'Paneer Butter Masala', diet: 'veg', is_special: true },
            { position: 2, name: 'Dal Tadka', raw: 'Dal Tadka', diet: 'veg', is_special: false },
            { position: 3, name: 'Jeera Rice', raw: 'Jeera Rice', diet: 'veg', is_special: false },
            { position: 4, name: 'Tandoori Roti', raw: 'Tandoori Roti', diet: 'veg', is_special: false },
            { position: 5, name: 'Gulab Jamun', raw: 'Gulab Jamun', diet: 'veg', is_special: true },
          ],
        }
        return await sendLocalNotification(formatMessNotification(mockMeal, mockDayMenu))
      }
    },
    [permission, requestPermission]
  )

  // Evaluates schedules against current time (triggers 5 minutes prior)
  const checkSchedules = useCallback(() => {
    if (permission !== 'granted') return

    const now = nowIST()
    const nowMinutes = timeToMinutes(formatIST(now, 'HH:mm'))
    const todayStr = todayIST()

    // 1. Check Class Sessions (5 minutes before start)
    if (classAlertsEnabled && options?.sessions && options.sessions.length > 0) {
      for (const session of options.sessions) {
        const startMin = timeToMinutes(session.start_time)
        const targetMin = startMin - 5
        const diff = nowMinutes - targetMin

        // Trigger if current time is within [targetMin, targetMin + 2]
        if (diff >= 0 && diff <= 2) {
          const dedupeKey = `whats_next_notified_5m_class_${session.id}_${todayStr}`
          try {
            if (!localStorage.getItem(dedupeKey)) {
              localStorage.setItem(dedupeKey, 'true')
              sendLocalNotification(formatClassNotification(session))
            }
          } catch {}
        }
      }
    }

    // 2. Check Mess Meals (5 minutes before start)
    if (messAlertsEnabled && options?.messMenus && options.messMenus.length > 0) {
      for (const meal of options.messMenus) {
        if (meal.date && meal.date !== todayStr) continue

        const startMin = timeToMinutes(meal.start_time)
        const targetMin = startMin - 5
        const diff = nowMinutes - targetMin

        // Trigger if current time is within [targetMin, targetMin + 2]
        if (diff >= 0 && diff <= 2) {
          const dedupeKey = `whats_next_notified_5m_mess_${meal.meal}_${todayStr}`
          try {
            if (!localStorage.getItem(dedupeKey)) {
              localStorage.setItem(dedupeKey, 'true')
              const matchingDayMenu = options.dayMenus?.find(
                (d) => d.meal.toLowerCase() === meal.meal.toLowerCase()
              )
              sendLocalNotification(formatMessNotification(meal, matchingDayMenu))
            }
          } catch {}
        }
      }
    }
  }, [permission, classAlertsEnabled, messAlertsEnabled, options?.sessions, options?.messMenus, options?.dayMenus])

  // Periodic heartbeat every 20 seconds to catch exact 5-minute pre-alert times
  const checkRef = useRef(checkSchedules)
  useEffect(() => {
    checkRef.current = checkSchedules
  }, [checkSchedules])

  useEffect(() => {
    if (permission !== 'granted') return

    // Run once immediately
    checkRef.current()

    const interval = setInterval(() => {
      checkRef.current()
    }, 20000)

    const handleResume = () => {
      checkRef.current()
    }
    document.addEventListener('visibilitychange', handleResume)
    window.addEventListener('focus', handleResume)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleResume)
      window.removeEventListener('focus', handleResume)
    }
  }, [permission])

  return {
    isSupported,
    permission,
    classAlertsEnabled,
    messAlertsEnabled,
    setClassAlertsEnabled,
    setMessAlertsEnabled,
    requestPermission,
    sendTestNotification,
    checkSchedules,
  }
}
