import { todayIST, dayOffsetIST, parseTime } from './timeUtils'
import type { Course, IngestItemType } from '../types'
import { calculateSimilarity } from './stringUtils'

export interface EmailMeta {
  subject?: string
  from?: string
  date?: string
  message_id?: string
  [key: string]: any
}

export interface EmailParseResult {
  itemType: IngestItemType
  title: string
  description: string
  deadline?: string
  startAt?: string
  endAt?: string
  venue?: string
  link?: string
  company?: string
  courseId?: string
  course?: Course
  groupSize?: number
  confidence: number
  extractedFields: {
    rawSubject?: string
    rawDate?: string
    foundLinks: string[]
    foundVenues: string[]
    matchedKeywords: string[]
  }
}

// ─── Header & Body Cleaning ──────────────────────────────────────────────────

export function cleanEmailBody(raw: string): { meta: EmailMeta; cleanBody: string } {
  const meta: EmailMeta = {}
  const lines = raw.split(/\r?\n/)
  const bodyLines: string[] = []
  let readingHeaders = true

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (readingHeaders) {
      const headerMatch = line.match(/^([A-Za-z-]+):\s*(.*)$/)
      if (headerMatch) {
        const headerName = headerMatch[1].toLowerCase()
        const headerVal = headerMatch[2].trim()

        if (headerName === 'subject') meta.subject = headerVal
        else if (headerName === 'from') meta.from = headerVal
        else if (headerName === 'date') meta.date = headerVal
        else if (headerName === 'message-id') meta.message_id = headerVal
        continue
      } else if (line.trim() === '') {
        readingHeaders = false
        continue
      }
    }

    // Filter out email reply quotes & signatures
    if (
      line.startsWith('>') ||
      /^On .+ wrote:$/i.test(line.trim()) ||
      /^Sent from my/i.test(line.trim()) ||
      /^Get Outlook for/i.test(line.trim()) ||
      /^--\s*$/.test(line.trim())
    ) {
      continue
    }

    bodyLines.push(line)
  }

  const cleanBody = bodyLines.join('\n').trim()
  return { meta, cleanBody }
}

// ─── Venue Detection ─────────────────────────────────────────────────────────

const VENUE_PATTERNS = [
  /\b(LH-[1-5]|LH\s*[1-5])\b/i,
  /\b(CR-[1-5]|CR\s*[1-5])\b/i,
  /\b(Auditorium|Audi)\b/i,
  /\b(MDP\s*Hall|MDP\s*Room)\b/i,
  /\b(Finance\s*Lab|Trading\s*Room)\b/i,
  /\b(Classroom\s*[1-5]|Room\s*[0-9A-Za-z-]+)\b/i,
  /\b(Meeting\s*Room\s*[0-9A-Za-z-]+)\b/i,
]

export function extractVenues(text: string): string[] {
  const venues: string[] = []
  for (const pattern of VENUE_PATTERNS) {
    const match = text.match(pattern)
    if (match && !venues.includes(match[1])) {
      venues.push(match[1])
    }
  }
  return venues
}

// ─── URL Detection ───────────────────────────────────────────────────────────

export function extractLinks(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s<>"()[\]]+)/g
  const matches = text.match(urlRegex) || []
  return Array.from(new Set(matches))
}

// ─── Company Detection ───────────────────────────────────────────────────────

const POPULAR_RECRUITERS = [
  'McKinsey & Company',
  'Boston Consulting Group',
  'Bain & Company',
  'Deloitte',
  'PwC',
  'EY',
  'KPMG',
  'Accenture Strategy',
  'Amazon',
  'Google',
  'Microsoft',
  'Flipkart',
  'Hindustan Unilever',
  'Procter & Gamble',
  'ITC',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Tata Sons',
  'Aditya Birla Group',
]

export function extractCompany(text: string): string | null {
  for (const comp of POPULAR_RECRUITERS) {
    const regex = new RegExp(`\\b${comp.replace('&', '\\&')}\\b`, 'i')
    if (regex.test(text)) return comp
  }

  // Regex patterns like "from XYZ", "PPT by XYZ"
  const pptMatch = text.match(/(?:PPT\s+(?:by|for)|presentation\s+by|hiring\s+by)\s+([A-Z][A-Za-z0-9\s&]{2,25})/i)
  if (pptMatch) {
    return pptMatch[1].trim()
  }

  return null
}

// ─── Date & Time Extraction in IST ───────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
}

const DAY_NAME_OFFSETS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
}

export function extractDateAndTimes(
  text: string,
  referenceDateStr = todayIST()
): {
  date: string | null
  startTime: string | null
  endTime: string | null
  deadlineTime: string | null
} {
  let foundDate: string | null = null
  let foundStartTime: string | null = null
  let foundEndTime: string | null = null
  let foundDeadlineTime: string | null = null

  // 1. Check relative date keywords
  const lower = text.toLowerCase()
  if (/\btomorrow\b/.test(lower)) {
    foundDate = dayOffsetIST(1)
  } else if (/\btoday\b|\btonight\b/.test(lower)) {
    foundDate = referenceDateStr
  } else {
    // Check "this Friday", "next Monday"
    const dayMatch = lower.match(/\b(?:this|next|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|mon|tue|wed|thu|fri|sat|sun)\b/)
    if (dayMatch) {
      const targetDay = DAY_NAME_OFFSETS[dayMatch[1]]
      if (targetDay !== undefined) {
        // Calculate next occurrence
        for (let offset = 1; offset <= 7; offset++) {
          const checkDate = dayOffsetIST(offset)
          const dow = new Date(checkDate).getUTCDay()
          if (dow === targetDay) {
            foundDate = checkDate
            break
          }
        }
      }
    }
  }

  // 2. Check absolute dates like "15th October 2026", "15 Oct", "October 15"
  if (!foundDate) {
    const absDateMatch = text.match(
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/i
    )
    if (absDateMatch) {
      const day = absDateMatch[1].padStart(2, '0')
      const monthStr = absDateMatch[2].toLowerCase()
      const month = MONTH_NAMES[monthStr] || '10'
      const year = absDateMatch[3] || '2026'
      foundDate = `${year}-${month}-${day}`
    }
  }

  // 3. Time extraction
  // Check "by 11:59 PM", "due at 5:00 PM"
  const deadlineMatch = text.match(/\b(?:by|due|before|deadline[:\s]+)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i)
  if (deadlineMatch) {
    const parsed = parseTime(deadlineMatch[1])
    if (parsed) foundDeadlineTime = `${parsed}:00`
  }

  // Check time range like "2:00 PM - 4:00 PM" or "14:00 to 16:00"
  const rangeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i)
  if (rangeMatch) {
    const s = parseTime(rangeMatch[1])
    const e = parseTime(rangeMatch[2])
    if (s && e) {
      foundStartTime = `${s}:00`
      foundEndTime = `${e}:00`
    }
  } else {
    // Single time match
    const singleTime = text.match(/\b(?:at|from)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i)
    if (singleTime) {
      const parsed = parseTime(singleTime[1])
      if (parsed) foundStartTime = `${parsed}:00`
    }
  }

  return {
    date: foundDate,
    startTime: foundStartTime,
    endTime: foundEndTime,
    deadlineTime: foundDeadlineTime,
  }
}

// ─── Rule Classifier ─────────────────────────────────────────────────────────

export function parseEmailContent(
  rawContent: string,
  courses: Course[] = [],
  referenceDateStr = todayIST()
): EmailParseResult {
  const { meta, cleanBody } = cleanEmailBody(rawContent)
  const fullText = `${meta.subject || ''} \n ${cleanBody}`

  const matchedKeywords: string[] = []
  const hasKeyword = (pattern: RegExp, label: string) => {
    if (pattern.test(fullText)) {
      matchedKeywords.push(label)
      return true
    }
    return false
  }

  // 1. Classification
  const isPlacement = hasKeyword(/placement|internship|ppt\b|shortlist|interview|hiring|recruiter|recruitment/i, 'placement')
  const isAssignment = hasKeyword(/assignment|homework|problem\s*set|submission\s*link|due\s*date/i, 'assignment')
  const isProject = hasKeyword(/project|presentation|deliverable|milestone|capstone|group\s*work/i, 'project')
  const isMeeting = hasKeyword(/meeting|townhall|sync\b|committee|discussion|catch\s*up/i, 'meeting')
  const isNotice = hasKeyword(/notice|announcement|circular|important\s*update|reminder/i, 'notice')

  let itemType: IngestItemType = 'notice'
  if (isPlacement) itemType = 'placement_event'
  else if (isAssignment) itemType = 'assignment'
  else if (isProject) itemType = 'project'
  else if (isMeeting) itemType = 'meeting'
  else if (isNotice) itemType = 'notice'
  else itemType = 'other'

  // 2. Extractions
  const links = extractLinks(fullText)
  const venues = extractVenues(fullText)
  const company = extractCompany(fullText)
  const { date, startTime, endTime, deadlineTime } = extractDateAndTimes(fullText, referenceDateStr)

  // 3. Course Match
  let matchedCourse: Course | null = null
  for (const c of courses) {
    if (
      new RegExp(`\\b${c.code}\\b`, 'i').test(fullText) ||
      calculateSimilarity(c.name, meta.subject || '') > 0.6
    ) {
      matchedCourse = c
      break
    }
  }

  // 4. Group Size detection
  let groupSize = 1
  const groupMatch = fullText.match(/group\s*(?:size|of)\s*(\d+)/i)
  if (groupMatch) {
    groupSize = parseInt(groupMatch[1], 10)
  }

  // 5. Title & Description
  const title = meta.subject || cleanBody.split('\n')[0].slice(0, 80) || 'Campus Announcement'
  const description = cleanBody

  // 6. Timestamps
  const targetDate = date || dayOffsetIST(3) // Fallback 3 days
  let deadline: string | undefined
  let startAt: string | undefined
  let endAt: string | undefined

  if (itemType === 'assignment' || itemType === 'project') {
    const timeStr = deadlineTime || '23:59:00'
    deadline = `${targetDate}T${timeStr}+05:30`
  } else {
    const sTime = startTime || '18:00:00'
    startAt = `${targetDate}T${sTime}+05:30`
    if (endTime) {
      endAt = `${targetDate}T${endTime}+05:30`
    }
  }

  const confidence = matchedKeywords.length > 0 ? 0.85 : 0.6

  return {
    itemType,
    title,
    description,
    deadline,
    startAt,
    endAt,
    venue: venues[0] || (isPlacement ? 'Auditorium' : undefined),
    link: links[0],
    company: company || undefined,
    courseId: matchedCourse?.id,
    course: matchedCourse || undefined,
    groupSize,
    confidence,
    extractedFields: {
      rawSubject: meta.subject,
      rawDate: meta.date,
      foundLinks: links,
      foundVenues: venues,
      matchedKeywords,
    },
  }
}
