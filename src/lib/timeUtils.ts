/**
 * Time utilities — always in Asia/Kolkata (IST, UTC+5:30)
 * Uses date-fns-tz for all timezone-aware operations.
 */
import { toZonedTime, formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { format, parseISO, differenceInSeconds, addDays, startOfDay } from 'date-fns'

export const IST = 'Asia/Kolkata'

/** Returns the current Date object in IST */
export function nowIST(): Date {
  return toZonedTime(new Date(), IST)
}

/** Format a Date in IST using date-fns format string */
export function formatIST(date: Date, fmt: string): string {
  return formatInTimeZone(date, IST, fmt)
}

/** Parse an ISO string and return the time in IST */
export function parseISOtoIST(isoString: string): Date {
  return toZonedTime(parseISO(isoString), IST)
}

/** Get today's date string in IST as YYYY-MM-DD */
export function todayIST(): string {
  return formatIST(nowIST(), 'yyyy-MM-dd')
}

/** Convert a "HH:MM:SS" or "HH:MM" time string to minutes from midnight */
export function timeToMinutes(time: string): number {
  const parts = time.split(':').map(Number)
  const h = parts[0] || 0
  const m = parts[1] || 0
  return h * 60 + m
}

/** Parse any time string ("9:00 AM", "14:30", "2:30 PM", "09:00:00") to "HH:mm" */
export function parseTime(val: string): string | null {
  if (!val) return null
  const str = val.trim()

  // Match 12-hour format e.g. "9:30 AM", "2:30 PM", "9 AM", "11:59pm"
  const ampmMatch = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10)
    const min = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0
    const isPM = ampmMatch[3].toLowerCase() === 'pm'
    if (isPM && hour < 12) hour += 12
    if (!isPM && hour === 12) hour = 0
    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }

  // Match 24-hour format e.g. "09:30", "14:00", "09:30:00"
  const h24Match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (h24Match) {
    const hour = parseInt(h24Match[1], 10)
    const min = parseInt(h24Match[2], 10)
    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }

  return null
}


/** Format minutes from midnight to "HH:MM" */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Format a "HH:MM:SS" or "HH:MM" time string to 12-hour display */
export function formatTime12(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr, 10) || 0
  const m = parseInt(mStr, 10) || 0
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

/** Seconds until a future time (given as "HH:MM") from now in IST */
export function secondsUntil(timeStr: string): number {
  const now = nowIST()
  const [h, m] = timeStr.split(':').map(Number)
  const target = new Date(now)
  target.setHours(h, m, 0, 0)
  if (target <= now) target.setDate(target.getDate() + 1)
  return differenceInSeconds(target, now)
}

/**
 * Standardized countdown formatter:
 * - < 1h: "in 25m"
 * - < 24h: "in 5h 10m"
 * - 24h to 7d: "in 2d 11h"
 * - > 7d: "Due 16 Oct" (for deadlines) or "16 Oct"
 */
export function formatSmartCountdown(seconds: number, deadlineDateIso?: string): string {
  if (seconds <= 0) return 'Ended'

  const mins = Math.floor(seconds / 60)
  const hours = Math.floor(seconds / 3600)
  const days = Math.floor(seconds / 86400)

  if (mins < 60) {
    return `in ${Math.max(1, mins)}m`
  }

  if (hours < 24) {
    const remMins = mins % 60
    return remMins > 0 ? `in ${hours}h ${remMins}m` : `in ${hours}h`
  }

  if (days < 7) {
    const remHours = hours % 24
    return remHours > 0 ? `in ${days}d ${remHours}h` : `in ${days}d`
  }

  if (deadlineDateIso) {
    return formatInTimeZone(new Date(deadlineDateIso), IST, 'd MMM')
  }

  return `in ${days}d`
}

/** Format remaining duration in an active class: "38 min left" or "1h 12m left" */
export function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return 'Ending now'
  const mins = Math.floor(seconds / 60)
  const hours = Math.floor(seconds / 3600)

  if (hours < 1) {
    return `${Math.max(1, mins)} min left`
  }
  const remMins = mins % 60
  return remMins > 0 ? `${hours}h ${remMins}m left` : `${hours}h left`
}

/** Format duration for free gap: "Free for 1h 30m" or "Free for 45m" */
export function formatFreeGap(minutes: number): string {
  if (minutes <= 0) return 'Free now'
  const hours = Math.floor(minutes / 60)
  const remMins = minutes % 60

  if (hours < 1) {
    return `Free for ${remMins}m`
  }
  return remMins > 0 ? `Free for ${hours}h ${remMins}m` : `Free for ${hours}h`
}

/** Legacy formatDuration (kept for backward compatibility) */
export function formatDuration(seconds: number): string {
  return formatSmartCountdown(seconds)
}

/** Format an ISO deadline into "Oct 15, 11:59 PM" in IST */
export function formatDeadline(iso: string): string {
  return formatInTimeZone(new Date(iso), IST, 'MMM d, h:mm a')
}

/** Seconds until an ISO deadline */
export function secondsUntilDeadline(iso: string): number {
  return differenceInSeconds(parseISO(iso), new Date())
}

/** Returns date string for day offset from today in IST */
export function dayOffsetIST(offset: number): string {
  const now = nowIST()
  const d = addDays(startOfDay(now), offset)
  return format(d, 'yyyy-MM-dd')
}

/** Get day-of-week (0=Sun) for a YYYY-MM-DD date string */
export function getDayOfWeek(dateStr: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d).getDay()
}

/** Convert an ISO timestamp to a zoned Date in IST */
export function toIST(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date
  return toZonedTime(d, IST)
}

/** Convert a local IST date back to UTC for storage */
export function fromIST(date: Date): Date {
  return fromZonedTime(date, IST)
}

/**
 * Format placement deadline for list: "Closes Fri 9 Oct, 11:59 PM"
 */
export function formatPlacementDeadline(iso: string): string {
  try {
    return formatInTimeZone(new Date(iso), IST, "'Closes' EEE d MMM, h:mm a")
  } catch {
    return iso
  }
}

export interface PlacementCountdownResult {
  formatted: string
  urgency: 'normal' | 'warm' | 'urgent' | 'closed'
  secondsRemaining: number
  isUnderOneHour: boolean
}

/**
 * Format live countdown according to specification:
 * - >= 2 days: "2d 14h"
 * - < 2 days: "18h 25m"
 * - < 1 hour: "42:17" (mm:ss)
 * - passed: "Closed"
 * Urgency levels:
 * - normal: >= 24h
 * - warm: < 24h
 * - urgent: < 3h
 */
export function formatPlacementCountdown(
  deadlineAt: string | Date,
  now: Date = new Date()
): PlacementCountdownResult {
  try {
    const target = typeof deadlineAt === 'string' ? new Date(deadlineAt) : deadlineAt
    const nowTime = now instanceof Date ? now : new Date(now)
    const secondsRemaining = differenceInSeconds(target, nowTime)

    if (secondsRemaining <= 0) {
      return {
        formatted: 'Closed',
        urgency: 'closed',
        secondsRemaining: 0,
        isUnderOneHour: false,
      }
    }

    if (secondsRemaining < 3600) {
      const mins = Math.floor(secondsRemaining / 60)
      const secs = secondsRemaining % 60
      return {
        formatted: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
        urgency: 'urgent',
        secondsRemaining,
        isUnderOneHour: true,
      }
    }

    if (secondsRemaining < 172800) {
      // < 2 days
      const hours = Math.floor(secondsRemaining / 3600)
      const mins = Math.floor((secondsRemaining % 3600) / 60)
      return {
        formatted: `${hours}h ${mins}m`,
        urgency: hours < 3 ? 'urgent' : hours < 24 ? 'warm' : 'normal',
        secondsRemaining,
        isUnderOneHour: false,
      }
    }

    // >= 2 days
    const days = Math.floor(secondsRemaining / 86400)
    const hours = Math.floor((secondsRemaining % 86400) / 3600)
    return {
      formatted: `${days}d ${hours}h`,
      urgency: 'normal',
      secondsRemaining,
      isUnderOneHour: false,
    }
  } catch {
    return {
      formatted: 'Closed',
      urgency: 'closed',
      secondsRemaining: 0,
      isUnderOneHour: false,
    }
  }
}

/** Format an ISO or Date string to "YYYY-MM-DDTHH:mm" in IST for datetime-local inputs */
export function toDatetimeLocalIST(isoStr?: string | null): string {
  if (!isoStr) return ''
  try {
    const d = parseISOtoIST(isoStr)
    return formatIST(d, "yyyy-MM-dd'T'HH:mm")
  } catch {
    return isoStr.slice(0, 16)
  }
}

/** Convert a datetime-local input string ("YYYY-MM-DDTHH:mm") to ISO string in IST (+05:30) */
export function fromDatetimeLocalToIST(localStr?: string | null): string | null {
  if (!localStr) return null
  const trimmed = localStr.trim()
  if (!trimmed) return null
  if (trimmed.includes('+') || trimmed.endsWith('Z')) return trimmed
  return `${trimmed}:00+05:30`
}
