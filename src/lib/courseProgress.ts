import type { Course, ClassSession, CourseProgress, CampusEvent } from '../types'
import { nowIST, formatIST } from './timeUtils'

/**
 * Pure function to calculate progress for each course:
 * - Completed sessions (distinct session numbers, non-cancelled, (date + end_time) < now IST)
 * - Total sessions (credits * 5, or total_sessions override)
 * - Next session & exam date
 */
export function calculateCourseProgress(
  courses: Course[],
  sessions: ClassSession[],
  events: CampusEvent[] = [],
  currentTimeIST: Date = nowIST()
): CourseProgress[] {
  const currentDateStr = formatIST(currentTimeIST, 'yyyy-MM-dd')
  const currentTimeOnly = formatIST(currentTimeIST, 'HH:mm:ss')

  const progressList: CourseProgress[] = []

  for (const course of courses) {
    // Exclude non-class courses like Capstone / PJT with 6 credits and no regular lectures
    if (course.code === 'PJT' || (course.credits && course.credits >= 6)) {
      continue
    }

    const totalSessions = course.total_sessions || (course.credits ? course.credits * 5 : 20)

    // Filter all sessions for this course
    const courseSessions = sessions.filter(
      (s) =>
        s.course_id === course.id ||
        (s.course && s.course.code === course.code) ||
        (s.raw_text && s.raw_text.includes(course.code)) ||
        (s.note && s.note.includes(course.code))
    )

    // Sort chronologically
    courseSessions.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date)
      if (cmp !== 0) return cmp
      return a.start_time.localeCompare(b.start_time)
    })

    // Track completed distinct session numbers
    const completedSessionNos = new Set<number>()
    let genericCompletedCount = 0

    let currentSessionNo: number | null = null
    let nextSessionDate: string | null = null
    let nextSessionNo: number | null = null

    for (const s of courseSessions) {
      if (s.status === 'cancelled') continue

      const sStart = s.start_time.length === 5 ? `${s.start_time}:00` : s.start_time
      const sEnd = s.end_time.length === 5 ? `${s.end_time}:00` : s.end_time

      const isPast =
        s.date < currentDateStr ||
        (s.date === currentDateStr && sEnd <= currentTimeOnly)

      const isCurrent =
        s.date === currentDateStr &&
        sStart <= currentTimeOnly &&
        sEnd > currentTimeOnly

      if (isPast) {
        if (s.session_no) {
          completedSessionNos.add(s.session_no)
        } else {
          genericCompletedCount++
        }
      } else if (isCurrent) {
        currentSessionNo = s.session_no || (completedSessionNos.size + genericCompletedCount + 1)
      } else {
        // Future session
        if (!nextSessionDate) {
          nextSessionDate = s.date
          nextSessionNo = s.session_no || (completedSessionNos.size + genericCompletedCount + 1)
        }
      }
    }

    const completedCount = completedSessionNos.size > 0
      ? completedSessionNos.size
      : genericCompletedCount

    const scheduledCount = courseSessions.filter(s => s.status !== 'cancelled').length
    const remainingSessions = Math.max(0, totalSessions - completedCount)
    const percentComplete = totalSessions > 0
      ? Math.min(100, Math.round((completedCount / totalSessions) * 100))
      : 0

    // Check for exam date in events
    let examDate: string | null = null
    const courseExam = events.find(
      (e) =>
        e.type === 'exam' &&
        e.status !== 'cancelled' &&
        (e.course_id === course.id || e.course_code === course.code || (e.title && e.title.toUpperCase().includes(course.code)))
    )
    if (courseExam) {
      examDate = courseExam.date || (courseExam.start_at ? courseExam.start_at.slice(0, 10) : null)
    }

    progressList.push({
      course_id: course.id,
      program: course.program || 'dem',
      batch_year: course.batch_year || 2026,
      course_code: course.code,
      course_name: course.name,
      faculty: course.faculty,
      color_tag: course.color_tag || '#0A84FF',
      credits: course.credits || 2,
      total_sessions: totalSessions,
      completed_sessions: completedCount,
      scheduled_sessions: scheduledCount,
      remaining_sessions: remainingSessions,
      percent_complete: percentComplete,
      current_session_no: currentSessionNo,
      next_session_date: nextSessionDate,
      next_session_no: nextSessionNo,
      exam_date: examDate,
    })
  }

  return progressList
}

/**
 * Returns formatted progress label for current class widget:
 * e.g. "Session 6 of 20"
 */
export function formatSessionProgressBadge(
  sessionNo?: number | null,
  totalSessions = 20
): string {
  if (!sessionNo) return ''
  return `Session ${sessionNo} of ${totalSessions}`
}

/**
 * Returns short chip label for timetable card:
 * e.g. "S6 of 20"
 */
export function formatShortSessionBadge(
  sessionNo?: number | null,
  totalSessions = 20
): string {
  if (!sessionNo) return ''
  return `S${sessionNo} of ${totalSessions}`
}
