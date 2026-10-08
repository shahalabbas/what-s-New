/**
 * Schedule Engine — Pure functions, no side effects, fully unit-testable.
 *
 * Computes sorted list of ResolvedSessions, handles holidays and campus events,
 * and determines intelligent schedule states for the Dashboard widget.
 */
import type { ResolvedSession, ClassSession, CampusEvent } from '../types'
import {
  getDayOfWeek,
  timeToMinutes,
  formatRemainingTime,
  formatFreeGap,
  formatSmartCountdown,
  dayOffsetIST,
} from './timeUtils'

/**
 * Resolves dated ClassSessions for a specific date string (YYYY-MM-DD).
 * Filters out cancelled sessions and sorts by start_time ascending.
 */
export function getSessionsFromDatedSessions(
  dateStr: string,
  sessions: ClassSession[]
): ResolvedSession[] {
  const daySessions = sessions.filter((s) => s.date === dateStr && s.status !== 'cancelled')

  const resolved: ResolvedSession[] = daySessions.map((s) => ({
    id: s.id,
    course_id: s.course_id ?? '',
    course: s.course,
    start_time: s.start_time.slice(0, 5),
    end_time: s.end_time.slice(0, 5),
    room: s.room,
    session_type: s.session_type,
    status: s.status,
    session_no: s.session_no,
    note: s.note,
  }))

  return resolved.sort(
    (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
  )
}

/**
 * Returns the currently active session for a given time (as "HH:MM").
 * Null if no session is currently active.
 */
export function getCurrentSession(
  currentTime: string, // "HH:MM"
  sessions: ResolvedSession[]
): ResolvedSession | null {
  const current = timeToMinutes(currentTime)
  return (
    sessions.find((s) => {
      const start = timeToMinutes(s.start_time)
      const end = timeToMinutes(s.end_time)
      return current >= start && current < end
    }) ?? null
  )
}

/**
 * Returns the next upcoming session after currentTime.
 * Null if no future session today.
 */
export function getNextSession(
  currentTime: string, // "HH:MM"
  sessions: ResolvedSession[]
): ResolvedSession | null {
  const current = timeToMinutes(currentTime)
  return (
    sessions.find((s) => timeToMinutes(s.start_time) > current) ?? null
  )
}

/**
 * Returns progress percentage (0–100) through the current session.
 * Returns 0 if no session is active.
 */
export function getSessionProgress(
  currentTime: string,
  session: ResolvedSession
): number {
  const current = timeToMinutes(currentTime)
  const start = timeToMinutes(session.start_time)
  const end = timeToMinutes(session.end_time)
  const total = end - start
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, ((current - start) / total) * 100))
}

/**
 * Returns minutes until a session starts from currentTime.
 */
export function minutesUntilSession(
  currentTime: string,
  session: ResolvedSession
): number {
  return timeToMinutes(session.start_time) - timeToMinutes(currentTime)
}

/**
 * Extended schedule state representing full context for the dashboard widget:
 */
export type ScheduleWidgetState =
  | 'active'      // Currently in class
  | 'between'     // Free now, class coming later today
  | 'done_today'  // Classes finished for today
  | 'no_classes'  // No classes scheduled today (weekend/holiday/off)

export interface ExtendedScheduleResult {
  state: ScheduleWidgetState
  currentSession: ResolvedSession | null
  nextSession: ResolvedSession | null
  progress: number
  remainingTimeText: string | null     // e.g. "38 min left"
  gapText: string | null               // e.g. "Free for 1h 30m" or holiday name
  nextCountdownText: string | null     // e.g. "in 1h 30m"
  futureDayInfo: {
    dayLabel: string                   // e.g. "Tomorrow" or "Monday"
    session: ResolvedSession
  } | null
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Computes complete high-level schedule state from dated ClassSessions and Events.
 */
export function getExtendedScheduleStateFromSessions(
  dateStr: string,
  allSessions: ClassSession[],
  currentTime: string,
  events: CampusEvent[] = []
): ExtendedScheduleResult {
  const todaySessions = getSessionsFromDatedSessions(dateStr, allSessions)
  const current = getCurrentSession(currentTime, todaySessions)
  const next = getNextSession(currentTime, todaySessions)
  const currentMinutes = timeToMinutes(currentTime)

  // 1. Check for full-day holiday / campus event today
  const holidayEvent = events.find(
    (e) => e.date === dateStr && (e.type === 'holiday' || e.type === 'campus_event' || e.all_day)
  )

  // Helper to find the next class across upcoming 14 days
  function findNextFutureSession(): { dayLabel: string; session: ResolvedSession } | null {
    for (let offset = 1; offset <= 14; offset++) {
      const nextDate = dayOffsetIST(offset)
      const daySessions = getSessionsFromDatedSessions(nextDate, allSessions)
      if (daySessions.length > 0) {
        const dayOfWeek = getDayOfWeek(nextDate)
        const label = offset === 1 ? 'Tomorrow' : DAY_NAMES[dayOfWeek]
        return {
          dayLabel: label,
          session: daySessions[0],
        }
      }
    }
    return null
  }

  const futureClass = findNextFutureSession()

  // 2. ACTIVE CLASS
  if (current) {
    const endMins = timeToMinutes(current.end_time)
    const remSeconds = (endMins - currentMinutes) * 60
    const progress = getSessionProgress(currentTime, current)
    const nextCountdown = next ? formatSmartCountdown((timeToMinutes(next.start_time) - currentMinutes) * 60) : null

    return {
      state: 'active',
      currentSession: current,
      nextSession: next,
      progress,
      remainingTimeText: formatRemainingTime(remSeconds),
      gapText: null,
      nextCountdownText: nextCountdown,
      futureDayInfo: null,
    }
  }

  // 3. BETWEEN CLASSES (or morning before first class)
  if (next) {
    const nextMins = timeToMinutes(next.start_time)
    const gapMins = nextMins - currentMinutes
    const nextCountdown = formatSmartCountdown(gapMins * 60)

    return {
      state: 'between',
      currentSession: null,
      nextSession: next,
      progress: 0,
      remainingTimeText: null,
      gapText: formatFreeGap(gapMins),
      nextCountdownText: nextCountdown,
      futureDayInfo: null,
    }
  }

  // 4. DONE FOR TODAY (had classes earlier, now finished)
  if (todaySessions.length > 0) {
    return {
      state: 'done_today',
      currentSession: null,
      nextSession: null,
      progress: 0,
      remainingTimeText: null,
      gapText: 'Done for today',
      nextCountdownText: null,
      futureDayInfo: futureClass,
    }
  }

  // 5. NO CLASSES TODAY (Holiday or Weekend)
  return {
    state: 'no_classes',
    currentSession: null,
    nextSession: null,
    progress: 0,
    remainingTimeText: null,
    gapText: holidayEvent ? holidayEvent.title : 'No classes today',
    nextCountdownText: null,
    futureDayInfo: futureClass,
  }
}
