/**
 * Flat Table Timetable Importer
 *
 * Imports 1:1 table-shaped Excel files using SheetJS (xlsx).
 * Supports: terms, courses, class_sessions, events, mess_menu.
 * Provides validation, diffing, transactional apply, rollback snapshots,
 * template generation, and live term export.
 */

import * as XLSX from 'xlsx'
import type {
  Term,
  Course,
  ClassSession,
  CampusEvent,
  MessMenu,
  MealType,
  SessionStatus,
  EventType,
  FlatTimetableParseResult,
  DiffItem,
} from '../types'
import { parseTime } from './timeUtils'

// ─── Constants & Helpers ──────────────────────────────────────────────────────

const VALID_SESSION_STATUSES = new Set<SessionStatus>(['scheduled', 'cancelled', 'rescheduled'])
const VALID_EVENT_TYPES = new Set<EventType>([
  'exam', 'quiz', 'holiday', 'campus_event', 'industry_talk',
  'workshop', 'placement', 'assignment', 'doubt_session',
  'guest_session', 'event', 'meeting', 'notice', 'placement_event'
])
const VALID_MEAL_TYPES = new Set<MealType>(['breakfast', 'lunch', 'snacks', 'dinner'])

export const DEFAULT_MEAL_TIMINGS: Record<MealType, { start: string; end: string }> = {
  breakfast: { start: '07:30:00', end: '09:30:00' },
  lunch: { start: '12:00:00', end: '14:30:00' },
  hi_tea: { start: '16:30:00', end: '18:00:00' },
  snacks: { start: '16:30:00', end: '18:00:00' },
  dinner: { start: '19:30:00', end: '21:30:00' },
}

/** Format Date object, Excel serial number, or string to YYYY-MM-DD */
export function normalizeDate(val: any): string | null {
  if (!val && val !== 0) return null
  // Handle Excel serial date numbers (e.g. 46286 = 2026-09-21)
  if (typeof val === 'number' && val > 1000) {
    const p = XLSX.SSF.parse_date_code(val)
    if (p && p.y) {
      return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
    }
  }
  if (val instanceof Date) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const str = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  // Match DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY
  const dateMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dateMatch) {
    const n1 = parseInt(dateMatch[1], 10)
    const n2 = parseInt(dateMatch[2], 10)
    const y = dateMatch[3]
    if (n1 > 12) {
      // DD/MM/YYYY
      return `${y}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`
    }
    // MM/DD/YYYY
    return `${y}-${String(n1).padStart(2, '0')}-${String(n2).padStart(2, '0')}`
  }
  // Try parsing Date string
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return null
}

/** Format Date object, Excel time fraction, or time string to HH:MM (24h) */
export function normalizeTime(val: any): string | null {
  if (!val && val !== 0) return null
  // Handle Excel time fraction (e.g. 0.375 = 09:00, 0.4479166 = 10:45)
  if (typeof val === 'number') {
    const p = XLSX.SSF.parse_date_code(val)
    if (p) {
      return `${String(p.H).padStart(2, '0')}:${String(p.M).padStart(2, '0')}`
    }
  }
  if (val instanceof Date) {
    const h = String(val.getHours()).padStart(2, '0')
    const m = String(val.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
  const str = String(val).trim()
  return parseTime(str)
}

function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':')
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10)
}

// ─── Main Importer Function ───────────────────────────────────────────────────

export function parseFlatTimetableWorkbook(
  data: ArrayBuffer | Uint8Array,
  cohort: { program: string; batch_year: number } = { program: 'dem', batch_year: 2026 }
): FlatTimetableParseResult {
  const workbook = XLSX.read(data, { type: 'array', cellDates: false, cellFormula: true })

  const errors: string[] = []
  const warnings: string[] = []

  const result: FlatTimetableParseResult = {
    terms: [],
    courses: [],
    class_sessions: [],
    events: [],
    mess_menu: [],
    auditSummary: [],
    warnings,
    errors,
  }

  // Identify sheets
  const termsWs = workbook.Sheets['terms']
  const coursesWs = workbook.Sheets['courses']
  const sessionsWs = workbook.Sheets['class_sessions']
  const eventsWs = workbook.Sheets['events']
  const messWs = workbook.Sheets['mess_menu']

  // If this is a mess-only upload
  if (messWs && !termsWs && !sessionsWs) {
    const messRows: any[] = XLSX.utils.sheet_to_json(messWs, { defval: null })
    parseMessMenuSheet(messRows, result)
    return result
  }

  if (!termsWs) {
    errors.push('Missing required sheet: "terms"')
  }
  if (!coursesWs) {
    errors.push('Missing required sheet: "courses"')
  }
  if (!sessionsWs) {
    errors.push('Missing required sheet: "class_sessions"')
  }

  if (errors.length > 0) {
    return result
  }

  // 1. Parse `terms`
  const termRows: any[] = XLSX.utils.sheet_to_json(termsWs, { defval: null })
  if (termRows.length === 0) {
    errors.push('"terms" sheet is empty. At least one term record is required.')
  }

  const termsMap = new Map<string, Term>()
  for (let i = 0; i < termRows.length; i++) {
    const r = termRows[i]
    const rowNum = i + 2
    const termKey = String(r.term_key || '').trim()
    const startDate = normalizeDate(r.start_date)
    const endDate = normalizeDate(r.end_date)

    if (!termKey) {
      errors.push(`terms row ${rowNum}: missing "term_key"`)
      continue
    }
    if (!startDate) {
      errors.push(`terms row ${rowNum} (${termKey}): missing or invalid "start_date"`)
    }
    if (!endDate) {
      errors.push(`terms row ${rowNum} (${termKey}): missing or invalid "end_date"`)
    }
    if (startDate && endDate && startDate > endDate) {
      errors.push(`terms row ${rowNum} (${termKey}): end_date (${endDate}) is before start_date (${startDate})`)
    }

    const termObj: Term = {
      id: `term-${termKey}`,
      term_key: termKey,
      program: String(r.program || cohort.program).trim().toLowerCase(),
      batch_year: Number(r.batch_year || cohort.batch_year),
      term_name: String(r.term_name || termKey).trim(),
      start_date: startDate || '',
      end_date: endDate || '',
      default_venue: r.default_venue ? String(r.default_venue).trim() : null,
      updated_as_on: normalizeDate(r.updated_as_on),
    }

    termsMap.set(termKey, termObj)
    result.terms.push(termObj)
  }

  // 2. Parse `courses`
  const courseRows: any[] = XLSX.utils.sheet_to_json(coursesWs, { defval: null })
  if (courseRows.length === 0) {
    errors.push('"courses" sheet is empty. At least one course record is required.')
  }

  const courseMap = new Map<string, Course>()
  for (let i = 0; i < courseRows.length; i++) {
    const r = courseRows[i]
    const rowNum = i + 2
    const code = String(r.code || '').trim().toUpperCase()
    const name = String(r.name || '').trim()
    const credits = Number(r.credits)

    if (!code) {
      errors.push(`courses row ${rowNum}: missing "code"`)
      continue
    }
    if (!name) {
      errors.push(`courses row ${rowNum} (${code}): missing "name"`)
    }
    if (isNaN(credits) || credits <= 0) {
      errors.push(`courses row ${rowNum} (${code}): "credits" must be a positive number`)
    }

    // Evaluate total_sessions (could be integer or formula)
    let totalSessions: number | null = null
    if (r.total_sessions !== null && r.total_sessions !== undefined && r.total_sessions !== '') {
      const parsedTotal = Number(r.total_sessions)
      if (!isNaN(parsedTotal)) {
        totalSessions = parsedTotal
      }
    }
    if (totalSessions === null) {
      totalSessions = credits ? credits * 5 : 20
    }

    const courseObj: Course = {
      id: `course-${code}`,
      code,
      name: name || code,
      faculty: r.faculty ? String(r.faculty).trim() : null,
      credits: credits || 4,
      total_sessions: totalSessions,
      color_tag: r.color_tag ? String(r.color_tag).trim() : '#0A84FF',
      grid_label: r.grid_label ? String(r.grid_label).trim() : code,
      program: String(r.program || cohort.program).trim().toLowerCase(),
      batch_year: Number(r.batch_year || cohort.batch_year),
    }

    courseMap.set(code, courseObj)
    result.courses.push(courseObj)
  }

  // 3. Parse `class_sessions`
  const sessionRows: any[] = XLSX.utils.sheet_to_json(sessionsWs, { defval: null })
  const activeSessionKeySet = new Set<string>()

  for (let i = 0; i < sessionRows.length; i++) {
    const r = sessionRows[i]
    const rowNum = i + 2
    const termKey = String(r.term_key || '').trim()
    const courseCode = String(r.course_code || '').trim().toUpperCase()
    const date = normalizeDate(r.date)
    const startTime = normalizeTime(r.start_time)
    const endTime = normalizeTime(r.end_time)
    const status = String(r.status || 'scheduled').trim().toLowerCase() as SessionStatus
    const sessionNo = r.session_no !== null && r.session_no !== undefined && r.session_no !== '' ? Number(r.session_no) : null
    const note = r.note ? String(r.note).trim() : null
    const rawText = r.raw_text ? String(r.raw_text).trim() : null

    // Validations
    if (!termKey || !termsMap.has(termKey)) {
      errors.push(`class_sessions row ${rowNum}: unknown term_key "${termKey}"`)
    }
    if (!courseCode || !courseMap.has(courseCode)) {
      errors.push(`class_sessions row ${rowNum}: unknown course_code "${courseCode}"`)
    }
    if (!date) {
      errors.push(`class_sessions row ${rowNum}: missing or invalid "date"`)
    }
    if (!startTime) {
      errors.push(`class_sessions row ${rowNum}: missing or invalid "start_time"`)
    }
    if (!endTime) {
      errors.push(`class_sessions row ${rowNum}: missing or invalid "end_time"`)
    }
    if (startTime && endTime && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      errors.push(`class_sessions row ${rowNum} (${courseCode}): end_time (${endTime}) must be greater than start_time (${startTime})`)
    }
    if (!VALID_SESSION_STATUSES.has(status)) {
      errors.push(`class_sessions row ${rowNum}: invalid status "${status}". Allowed: scheduled, cancelled, rescheduled`)
    }

    // Check date within term range
    const term = termsMap.get(termKey)
    if (term && date) {
      if (date < term.start_date || date > term.end_date) {
        errors.push(`class_sessions row ${rowNum} (${courseCode}): date ${date} is outside term range (${term.start_date} to ${term.end_date})`)
      }
    }

    // Check duplicate non-cancelled (course_code, session_no)
    if (courseCode && sessionNo !== null && status !== 'cancelled') {
      const activeKey = `${courseCode}:${sessionNo}`
      if (activeSessionKeySet.has(activeKey)) {
        errors.push(`class_sessions row ${rowNum}: duplicate active session number ${sessionNo} for course "${courseCode}"`)
      } else {
        activeSessionKeySet.add(activeKey)
      }
    }

    // Warnings
    const course = courseMap.get(courseCode)
    if (course && course.total_sessions && sessionNo && sessionNo > course.total_sessions) {
      warnings.push(`class_sessions row ${rowNum}: session_no ${sessionNo} exceeds total expected sessions (${course.total_sessions}) for ${courseCode}`)
    }
    if (note && note.toUpperCase().startsWith('VERIFY')) {
      warnings.push(`class_sessions row ${rowNum} (${courseCode}): Note flagged for verification: "${note}"`)
    }

    const sessionObj: ClassSession = {
      id: `cs-${courseCode}-${date}-${startTime}`,
      program: term?.program || cohort.program,
      batch_year: term?.batch_year || cohort.batch_year,
      date: date || '',
      start_time: startTime ? `${startTime}:00` : '00:00:00',
      end_time: endTime ? `${endTime}:00` : '00:00:00',
      course_id: course?.id || null,
      session_no: sessionNo,
      faculty: r.faculty ? String(r.faculty).trim() : (course?.faculty || null),
      room: r.room ? String(r.room).trim() : (term?.default_venue || 'CR-7C-15'),
      session_type: 'lecture',
      status: status || 'scheduled',
      note,
      raw_text: rawText,
      course,
      term,
    }

    result.class_sessions.push(sessionObj)
  }

  // 4. Parse `events`
  if (eventsWs) {
    const eventRows: any[] = XLSX.utils.sheet_to_json(eventsWs, { defval: null })
    for (let i = 0; i < eventRows.length; i++) {
      const r = eventRows[i]
      const rowNum = i + 2
      const termKey = r.term_key ? String(r.term_key).trim() : null
      const courseCode = r.course_code ? String(r.course_code).trim().toUpperCase() : null
      const date = normalizeDate(r.date)
      const startTime = normalizeTime(r.start_time)
      const endTime = normalizeTime(r.end_time)
      const allDay = r.all_day === true || String(r.all_day).toLowerCase() === 'true'
      const type = String(r.type || 'campus_event').trim().toLowerCase() as EventType
      const title = String(r.title || '').trim()
      const status = String(r.status || 'scheduled').trim().toLowerCase() as SessionStatus
      const venue = r.venue ? String(r.venue).trim() : null
      const note = r.note ? String(r.note).trim() : null
      const rawText = r.raw_text ? String(r.raw_text).trim() : null

      if (termKey && !termsMap.has(termKey)) {
        errors.push(`events row ${rowNum}: unknown term_key "${termKey}"`)
      }
      if (courseCode && !courseMap.has(courseCode)) {
        errors.push(`events row ${rowNum}: unknown course_code "${courseCode}"`)
      }
      if (!date) {
        errors.push(`events row ${rowNum}: missing or invalid "date"`)
      }
      if (!title) {
        errors.push(`events row ${rowNum}: missing "title"`)
      }
      if (!allDay && !startTime) {
        errors.push(`events row ${rowNum} ("${title}"): all_day is FALSE but no start_time provided`)
      }
      if (startTime && endTime && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
        errors.push(`events row ${rowNum} ("${title}"): end_time (${endTime}) must be greater than start_time (${startTime})`)
      }
      if (!VALID_EVENT_TYPES.has(type)) {
        errors.push(`events row ${rowNum}: invalid event type "${type}"`)
      }

      const term = termKey ? termsMap.get(termKey) : undefined
      const course = courseCode ? courseMap.get(courseCode) : undefined

      const eventObj: CampusEvent = {
        id: `ev-${date}-${startTime || 'allday'}-${i}`,
        program: term?.program || cohort.program,
        batch_year: term?.batch_year || cohort.batch_year,
        type,
        title,
        date: date || '',
        start_time: startTime || null,
        end_time: endTime || null,
        start_at: date && startTime ? `${date}T${startTime}:00+05:30` : null,
        end_at: date && endTime ? `${date}T${endTime}:00+05:30` : null,
        all_day: allDay,
        course_id: course?.id || null,
        course_code: courseCode || null,
        status,
        venue,
        note,
        raw_text: rawText,
        course,
      }

      result.events.push(eventObj)
    }
  }

  // 5. Parse `mess_menu` (if present)
  if (messWs) {
    const messRows: any[] = XLSX.utils.sheet_to_json(messWs, { defval: null })
    parseMessMenuSheet(messRows, result)
  }

  // 6. Audit & Warnings Computation
  computeCourseAuditAndWarnings(result)

  return result
}

function parseMessMenuSheet(rows: any[], result: FlatTimetableParseResult) {
  const seenDateMeals = new Set<string>()
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 2
    const date = normalizeDate(r.date)
    const meal = String(r.meal || '').trim().toLowerCase() as MealType

    if (!date) {
      result.errors.push(`mess_menu row ${rowNum}: missing or invalid "date"`)
      continue
    }
    if (!VALID_MEAL_TYPES.has(meal)) {
      result.errors.push(`mess_menu row ${rowNum}: invalid meal "${meal}". Allowed: breakfast, lunch, snacks, dinner`)
      continue
    }

    const key = `${date}:${meal}`
    if (seenDateMeals.has(key)) {
      result.errors.push(`mess_menu row ${rowNum}: duplicate entry for ${date} (${meal})`)
      continue
    }
    seenDateMeals.add(key)

    let items: string[] = []
    if (Array.isArray(r.items)) {
      items = r.items.map((s: any) => String(s).trim()).filter(Boolean)
    } else if (typeof r.items === 'string') {
      items = r.items.split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean)
    }

    const defaultTimes = DEFAULT_MEAL_TIMINGS[meal] || { start: '07:30:00', end: '09:30:00' }
    const startTime = normalizeTime(r.start_time) ? `${normalizeTime(r.start_time)}:00` : defaultTimes.start
    const endTime = normalizeTime(r.end_time) ? `${normalizeTime(r.end_time)}:00` : defaultTimes.end

    if (!result.mess_menu) result.mess_menu = []
    result.mess_menu.push({
      id: `mess-${date}-${meal}`,
      date,
      meal,
      items,
      start_time: startTime,
      end_time: endTime,
    })
  }
}

function computeCourseAuditAndWarnings(result: FlatTimetableParseResult) {
  // Check session overlaps
  const sessionsByDate = new Map<string, ClassSession[]>()
  for (const s of result.class_sessions) {
    if (s.status === 'cancelled') continue
    const list = sessionsByDate.get(s.date) || []
    list.push(s)
    sessionsByDate.set(s.date, list)
  }

  for (const [date, list] of sessionsByDate.entries()) {
    list.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
    for (let i = 0; i < list.length - 1; i++) {
      const cur = list[i]
      const next = list[i + 1]
      if (timeToMinutes(cur.end_time) > timeToMinutes(next.start_time)) {
        result.warnings.push(
          `Overlapping class sessions on ${date}: ${cur.course?.code || 'Class'} (${cur.start_time.slice(0, 5)}-${cur.end_time.slice(0, 5)}) and ${next.course?.code || 'Class'} (${next.start_time.slice(0, 5)}-${next.end_time.slice(0, 5)})`
        )
      }
    }
  }

  // Per-course audit summary
  for (const c of result.courses) {
    const courseSessions = result.class_sessions.filter(s => s.course?.code === c.code || s.course_id === c.id)
    const scheduled = courseSessions.filter(s => s.status !== 'cancelled')
    const cancelled = courseSessions.filter(s => s.status === 'cancelled')
    const totalExpected = c.total_sessions || (c.credits ? c.credits * 5 : 20)

    // Check gaps in session numbers
    const activeSessionNos = scheduled
      .map(s => s.session_no)
      .filter((n): n is number => typeof n === 'number')
      .sort((a, b) => a - b)

    for (let i = 0; i < activeSessionNos.length; i++) {
      const expected = i + 1
      if (activeSessionNos[i] !== expected && expected <= totalExpected) {
        result.warnings.push(`Course ${c.code}: missing session number S${expected} (found S${activeSessionNos[i]})`)
        break
      }
    }

    if (totalExpected > 0 && scheduled.length < totalExpected && c.code !== 'PJT') {
      result.warnings.push(`Course ${c.code}: only ${scheduled.length} scheduled out of ${totalExpected} expected sessions`)
    }

    let status: 'ok' | 'warning' | 'error' = 'ok'
    if (c.code !== 'PJT' && scheduled.length < totalExpected) {
      status = 'warning'
    }

    result.auditSummary.push({
      code: c.code,
      name: c.name,
      faculty: c.faculty,
      credits: c.credits,
      totalExpected,
      scheduledCount: scheduled.length,
      cancelledCount: cancelled.length,
      status,
    })
  }
}

// ─── Diff Generation ──────────────────────────────────────────────────────────

export function generateTimetableDiff(
  currentSessions: ClassSession[],
  incomingSessions: ClassSession[]
): DiffItem<ClassSession>[] {
  const currentMap = new Map<string, ClassSession>()
  for (const s of currentSessions) {
    const key = `${s.date}:${s.start_time.slice(0, 5)}:${s.course?.code || s.course_id}`
    currentMap.set(key, s)
  }

  const diff: DiffItem<ClassSession>[] = []
  const matchedCurrentKeys = new Set<string>()

  for (const incoming of incomingSessions) {
    const key = `${incoming.date}:${incoming.start_time.slice(0, 5)}:${incoming.course?.code || incoming.course_id}`
    const existing = currentMap.get(key)

    if (!existing) {
      diff.push({ status: 'added', incoming })
    } else {
      matchedCurrentKeys.add(key)
      const changes: string[] = []
      if (existing.status !== incoming.status) {
        changes.push(`Status: ${existing.status} → ${incoming.status}`)
      }
      if (existing.room !== incoming.room) {
        changes.push(`Room: ${existing.room || 'None'} → ${incoming.room || 'None'}`)
      }
      if (existing.session_no !== incoming.session_no) {
        changes.push(`Session No: S${existing.session_no} → S${incoming.session_no}`)
      }
      if (existing.end_time.slice(0, 5) !== incoming.end_time.slice(0, 5)) {
        changes.push(`End Time: ${existing.end_time.slice(0, 5)} → ${incoming.end_time.slice(0, 5)}`)
      }

      if (changes.length > 0) {
        diff.push({ status: 'modified', current: existing, incoming, changes })
      } else {
        diff.push({ status: 'unchanged', current: existing, incoming })
      }
    }
  }

  for (const [key, current] of currentMap.entries()) {
    if (!matchedCurrentKeys.has(key)) {
      diff.push({ status: 'removed', current })
    }
  }

  return diff
}

// ─── Template Generation & Live Term Export ───────────────────────────────────

export function generateBlankTimetableTemplate(): Uint8Array {
  const wb = XLSX.utils.book_new()

  const readme = [
    ['DEM 2026 Term Timetable Flat Import Template'],
    ['Instructions:'],
    ['1. Fill the "terms" sheet with term details (start_date, end_date, default_venue).'],
    ['2. Fill the "courses" sheet with course codes, credits, and faculty.'],
    ['3. Fill "class_sessions" with dated lectures/tutorials.'],
    ['4. Fill "events" with exams, quizzes, workshops, holidays, and campus events.'],
    ['5. (Optional) Fill "mess_menu" with date, meal, and comma-separated items.'],
  ]

  const sampleTerms: Partial<Term>[] = [
    {
      term_key: 'term3_2026',
      program: 'dem',
      batch_year: 2026,
      term_name: 'Term-III',
      start_date: '2026-09-21',
      end_date: '2026-12-19',
      default_venue: 'CR-7C-15',
      updated_as_on: '2026-09-18',
    },
  ]

  const sampleCourses: Partial<Course>[] = [
    {
      code: 'AA-II',
      name: 'Advanced Analytics - II',
      faculty: 'Prof. Debanjan Mitra',
      credits: 4,
      total_sessions: 20,
      color_tag: '#0A84FF',
      grid_label: 'AA-II',
      program: 'dem',
      batch_year: 2026,
    },
  ]

  const sampleSessions = [
    {
      term_key: 'term3_2026',
      date: '2026-09-21',
      start_time: '09:00',
      end_time: '10:30',
      course_code: 'AA-II',
      session_no: 1,
      room: 'CR-7C-15',
      status: 'scheduled',
      note: '',
      raw_text: 'AA-II - S1',
    },
  ]

  const sampleEvents = [
    {
      term_key: 'term3_2026',
      date: '2026-10-02',
      start_time: '',
      end_time: '',
      all_day: true,
      type: 'holiday',
      title: 'Mahatma Gandhi Jayanti',
      course_code: '',
      status: 'scheduled',
      venue: '',
      note: '',
      raw_text: 'Mahatma Gandhi Jayanti',
    },
  ]

  const sampleMess = [
    {
      date: '2026-09-21',
      meal: 'breakfast',
      items: 'Idli, Sambar, Coconut Chutney, Tea, Coffee',
      start_time: '07:30',
      end_time: '09:30',
    },
  ]

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), 'README')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sampleTerms), 'terms')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sampleCourses), 'courses')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sampleSessions), 'class_sessions')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sampleEvents), 'events')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sampleMess), 'mess_menu')

  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

export function exportLiveTermToExcel(
  terms: Term[],
  courses: Course[],
  classSessions: ClassSession[],
  events: CampusEvent[],
  messMenu: MessMenu[] = []
): Uint8Array {
  const wb = XLSX.utils.book_new()

  const termsData = terms.map(t => ({
    term_key: t.term_key,
    program: t.program,
    batch_year: t.batch_year,
    term_name: t.term_name,
    start_date: t.start_date,
    end_date: t.end_date,
    default_venue: t.default_venue || '',
    updated_as_on: t.updated_as_on || '',
  }))

  const coursesData = courses.map(c => ({
    code: c.code,
    name: c.name,
    faculty: c.faculty || '',
    credits: c.credits,
    total_sessions: c.total_sessions || (c.credits * 5),
    color_tag: c.color_tag,
    grid_label: c.grid_label || c.code,
    program: c.program || 'dem',
    batch_year: c.batch_year || 2026,
  }))

  const sessionsData = classSessions.map(s => ({
    term_key: s.term?.term_key || 'term3_2026',
    date: s.date,
    start_time: s.start_time.slice(0, 5),
    end_time: s.end_time.slice(0, 5),
    course_code: s.course?.code || '',
    session_no: s.session_no ?? '',
    room: s.room || '',
    status: s.status,
    note: s.note || '',
    raw_text: s.raw_text || '',
  }))

  const eventsData = events.map(e => ({
    term_key: e.term_id || 'term3_2026',
    date: e.date,
    start_time: e.start_time ? e.start_time.slice(0, 5) : '',
    end_time: e.end_time ? e.end_time.slice(0, 5) : '',
    all_day: e.all_day,
    type: e.type,
    title: e.title,
    course_code: e.course?.code || e.course_code || '',
    status: e.status,
    venue: e.venue || '',
    note: e.note || '',
    raw_text: e.raw_text || '',
  }))

  const messData = messMenu.map(m => ({
    date: m.date,
    meal: m.meal,
    items: Array.isArray(m.items) ? m.items.join(', ') : m.items,
    start_time: m.start_time.slice(0, 5),
    end_time: m.end_time.slice(0, 5),
  }))

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(termsData), 'terms')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(coursesData), 'courses')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessionsData), 'class_sessions')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eventsData), 'events')
  if (messData.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(messData), 'mess_menu')
  }

  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}
