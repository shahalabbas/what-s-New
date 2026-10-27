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
import { nowIST, formatIST, todayIST, timeToMinutes, currentISTMinutes } from '../lib/timeUtils'
import { supabase, isConfiguredSupabase } from '../lib/supabase'
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
    if ((options?.autoRequest !== false) && isNotificationSupported() && Notification.permission === 'default') {
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

  // ─── Realtime Cross-Device Broadcast Listener ───────────────────────
  useEffect(() => {
    if (!isConfiguredSupabase) return
    const channel = supabase.channel('campus_notifications')

    channel
      .on('broadcast', { event: 'sample_reminder' }, async (msg: any) => {
        const payload = msg?.payload
        if (!payload) return

        try {
          const { data } = await supabase.auth.getUser()
          const currentUserId = data?.user?.id
          if (payload.target === 'all' || (currentUserId && payload.target === currentUserId)) {
            await sendLocalNotification({
              title: payload.title || "🔔 What's Next · Notification Trial",
              body: payload.body || "Sample reminder delivered across all your connected devices!",
              tag: `broadcast-notif-${Date.now()}`,
              data: { url: payload.url || '/' },
            })
          }
        } catch (e) {
          console.warn('Realtime broadcast handler error:', e)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
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

  // Evaluates schedules against current time (triggers 5 minutes prior up to start/early session)
  const checkSchedules = useCallback(() => {
    if (permission !== 'granted') return

    const nowMinutes = currentISTMinutes()
    const todayStr = todayIST()

    // 1. Check Class Sessions (5 minutes before start up to 5 minutes into class)
    if (classAlertsEnabled && options?.sessions && options.sessions.length > 0) {
      for (const session of options.sessions) {
        if (!session.start_time) continue
        const startMin = timeToMinutes(session.start_time)
        const targetMin = startMin - 5

        // Window: from 5 mins before start up to 5 mins into class
        if (nowMinutes >= targetMin && nowMinutes <= startMin + 5) {
          const dedupeKey = `whats_next_notified_5m_class_${session.id}_${todayStr}`
          try {
            if (!localStorage.getItem(dedupeKey)) {
              localStorage.setItem(dedupeKey, 'true')
              const minsRemaining = startMin - nowMinutes
              sendLocalNotification(formatClassNotification(session, minsRemaining))
            }
          } catch {}
        }
      }
    }

    // 2. Check Mess Meals (5 minutes before start up to 15 minutes into meal)
    if (messAlertsEnabled && options?.messMenus && options.messMenus.length > 0) {
      for (const meal of options.messMenus) {
        if (meal.date && meal.date !== todayStr) continue
        if (!meal.start_time) continue

        const startMin = timeToMinutes(meal.start_time)
        const endMin = timeToMinutes(meal.end_time || '') || (startMin + 120)
        const targetMin = startMin - 5

        // Window: from 5 mins before start up to 15 mins into meal
        if (nowMinutes >= targetMin && nowMinutes <= Math.min(startMin + 15, endMin)) {
          const dedupeKey = `whats_next_notified_5m_mess_${meal.meal}_${todayStr}`
          try {
            if (!localStorage.getItem(dedupeKey)) {
              localStorage.setItem(dedupeKey, 'true')
              const matchingDayMenu = options.dayMenus?.find(
                (d) => d.meal.toLowerCase() === meal.meal.toLowerCase()
              )
              const minsRemaining = startMin - nowMinutes
              sendLocalNotification(formatMessNotification(meal, matchingDayMenu, minsRemaining))
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

  // Exact millisecond scheduling for today's upcoming 5-min pre-alerts
  useEffect(() => {
    if (permission !== 'granted') return

    const nowMinutes = currentISTMinutes()
    const nowSecs = new Date().getSeconds()
    const activeTimeouts: NodeJS.Timeout[] = []

    const scheduleTimer = (targetMin: number) => {
      if (targetMin <= nowMinutes) return
      const diffMinutes = targetMin - nowMinutes
      const delayMs = diffMinutes * 60 * 1000 - nowSecs * 1000
      if (delayMs > 0 && delayMs < 24 * 3600 * 1000) {
        const t = setTimeout(() => {
          checkRef.current()
        }, delayMs)
        activeTimeouts.push(t)
      }
    }

    if (classAlertsEnabled && options?.sessions) {
      for (const session of options.sessions) {
        if (session.start_time) {
          const startMin = timeToMinutes(session.start_time)
          scheduleTimer(startMin - 5)
        }
      }
    }

    if (messAlertsEnabled && options?.messMenus) {
      for (const meal of options.messMenus) {
        if (meal.start_time) {
          const startMin = timeToMinutes(meal.start_time)
          scheduleTimer(startMin - 5)
        }
      }
    }

    return () => {
      activeTimeouts.forEach((t) => clearTimeout(t))
    }
  }, [permission, classAlertsEnabled, messAlertsEnabled, options?.sessions, options?.messMenus])

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
