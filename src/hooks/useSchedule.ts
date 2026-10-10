import { useState, useEffect, useCallback } from 'react'
import { supabase, isConfiguredSupabase } from '../lib/supabase'
import {
  getSessionsFromDatedSessions,
  getCurrentSession,
  getNextSession,
  getExtendedScheduleStateFromSessions,
  type ExtendedScheduleResult,
} from '../lib/scheduleEngine'
import { nowIST, formatIST, todayIST } from '../lib/timeUtils'
import type { ResolvedSession, ClassSession, CampusEvent, CourseProgress } from '../types'
import { MOCK_CLASS_SESSIONS, MOCK_EVENTS, MOCK_COURSES } from '../lib/mockData'
import { calculateCourseProgress } from '../lib/courseProgress'

export function useSchedule() {
  const [classSessions, setClassSessions] = useState<ClassSession[]>(() => {
    try {
      const cached = localStorage.getItem('cache_class_sessions')
      if (cached) return JSON.parse(cached)
    } catch {}
    return MOCK_CLASS_SESSIONS
  })

  const [events, setEvents] = useState<CampusEvent[]>(() => {
    try {
      const cached = localStorage.getItem('cache_events')
      if (cached) return JSON.parse(cached)
    } catch {}
    return MOCK_EVENTS
  })

  const [courseProgressList, setCourseProgressList] = useState<CourseProgress[]>(() => {
    try {
      const cached = localStorage.getItem('cache_course_progress')
      if (cached) return JSON.parse(cached)
    } catch {}
    return []
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState<string>(() =>
    formatIST(nowIST(), 'HH:mm')
  )

  const fetchData = useCallback(async () => {
    if (!isConfiguredSupabase) {
      setClassSessions(MOCK_CLASS_SESSIONS)
      setEvents(MOCK_EVENTS)
      setCourseProgressList(calculateCourseProgress(MOCK_COURSES, MOCK_CLASS_SESSIONS, MOCK_EVENTS))
      setLoading(false)
      return
    }

    try {
      const [sessionsRes, eventsRes, progressRes, coursesRes] = await Promise.all([
        supabase
          .from('class_sessions')
          .select('*, course:courses(*)')
          .order('date', { ascending: true })
          .order('start_time', { ascending: true }),
        supabase
          .from('events')
          .select('*, course:courses(*)')
          .order('date', { ascending: true }),
        supabase
          .from('course_progress')
          .select('*'),
        supabase
          .from('courses')
          .select('*')
          .order('code', { ascending: true }),
      ])

      const fetchedSessions = sessionsRes.data || []
      const fetchedEvents = eventsRes.data || []

      if (fetchedSessions.length > 0) {
        setClassSessions(fetchedSessions)
        try { localStorage.setItem('cache_class_sessions', JSON.stringify(fetchedSessions)) } catch {}
      }

      if (fetchedEvents.length > 0) {
        setEvents(fetchedEvents)
        try { localStorage.setItem('cache_events', JSON.stringify(fetchedEvents)) } catch {}
      }

      if (progressRes.data && progressRes.data.length > 0) {
        setCourseProgressList(progressRes.data)
        try { localStorage.setItem('cache_course_progress', JSON.stringify(progressRes.data)) } catch {}
      } else if (coursesRes.data && coursesRes.data.length > 0) {
        const computed = calculateCourseProgress(coursesRes.data, fetchedSessions, fetchedEvents)
        setCourseProgressList(computed)
        try { localStorage.setItem('cache_course_progress', JSON.stringify(computed)) } catch {}
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sync schedule')
      console.warn('Schedule background sync notice:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Tick every 30 seconds and update on tab visibility or schedule update
  useEffect(() => {
    const tick = () => setCurrentTime(formatIST(nowIST(), 'HH:mm'))
    tick()
    const id = setInterval(tick, 30_000)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('schedule_updated', fetchData)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('schedule_updated', fetchData)
    }
  }, [fetchData])

  useEffect(() => { fetchData() }, [fetchData])

  const today = todayIST()
  const todaySessions = getSessionsFromDatedSessions(today, classSessions)
  const currentSession: ResolvedSession | null = getCurrentSession(currentTime, todaySessions)
  const nextSession: ResolvedSession | null = getNextSession(currentTime, todaySessions)
  const extendedState: ExtendedScheduleResult = getExtendedScheduleStateFromSessions(
    today,
    classSessions,
    currentTime,
    events
  )

  return {
    classSessions,
    events,
    courseProgressList,
    loading,
    error,
    refresh: fetchData,
    currentTime,
    todaySessions,
    currentSession,
    nextSession,
    extendedState,
    getSessionsForDate: (dateStr: string) => getSessionsFromDatedSessions(dateStr, classSessions),
  }
}
