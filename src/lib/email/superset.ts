/**
 * Pure rule-based Superset email parser
 * Supports:
 * 1. .eml file upload (via postal-mime)
 * 2. Raw MIME source paste (Gmail "Show original")
 * 3. Visible text paste from Gmail
 * 
 * Always resolves deadlines in Asia/Kolkata (+05:30) without external AI.
 */
import PostalMime from 'postal-mime'
import { parseTime } from '../timeUtils'
import type { PlacementStage, PlacementAdditionalDetail } from '../../types'

export interface ParsedSupersetEmail {
  source: 'superset' | 'manual'
  is_superset: boolean
  stage: PlacementStage
  opportunity_type: PlacementStage // alias for backward compatibility
  email_type: PlacementStage // alias for backward compatibility
  company: string
  role: string
  category: string | null // alias
  deadline_at: string | null // e.g. "2026-10-09T23:59:00+05:30"
  additional_details: PlacementAdditionalDetail[]
  application_start: string // ISO string in IST (+05:30)
  posted_at: string // alias
  apply_url: string | null
  external_job_id: string | null
  message_id: string | null
  status: 'open' | 'extended' | 'closed'
  warnings: string[]
  clean_text: string
  html_text?: string
}

// ─── Subject Template Configuration Array ───────────────────────────────────

export interface SubjectTemplate {
  pattern: RegExp
  stage: PlacementStage
  extract?: (match: RegExpMatchArray) => { company?: string; role?: string }
}

export const SUPERSET_SUBJECT_TEMPLATES: SubjectTemplate[] = [
  {
    pattern: /^Open for application\s*(?:-|for)\s*(.+?)'s Job Profile\s*:\s*(.+)$/i,
    stage: 'open_for_application',
    extract: (m) => ({ company: m[1].trim(), role: m[2].trim() }),
  },
  {
    pattern: /^Deadline Extended\s*(?:-|for)\s*(.+?)'s Job Profile\s*:\s*(.+)$/i,
    stage: 'deadline_extended',
    extract: (m) => ({ company: m[1].trim(), role: m[2].trim() }),
  },
  {
    pattern: /^Application Closed\s*(?:-|for)\s*(.+?)'s Job Profile\s*:\s*(.+)$/i,
    stage: 'application_closed',
    extract: (m) => ({ company: m[1].trim(), role: m[2].trim() }),
  },
  {
    pattern: /^Shortlist (?:Out|Announced)\s*(?:-|for)\s*(.+?)'s Job Profile\s*:\s*(.+)$/i,
    stage: 'shortlist',
    extract: (m) => ({ company: m[1].trim(), role: m[2].trim() }),
  },
  {
    pattern: /^(?:Online )?Test Scheduled\s*(?:-|for)\s*(.+?)'s Job Profile\s*:\s*(.+)$/i,
    stage: 'test',
    extract: (m) => ({ company: m[1].trim(), role: m[2].trim() }),
  },
  {
    pattern: /^Interview Scheduled\s*(?:-|for)\s*(.+?)'s Job Profile\s*:\s*(.+)$/i,
    stage: 'interview',
    extract: (m) => ({ company: m[1].trim(), role: m[2].trim() }),
  },
  {
    pattern: /^Final Results? (?:Out|Announced)\s*(?:-|for)\s*(.+?)'s Job Profile\s*:\s*(.+)$/i,
    stage: 'result',
    extract: (m) => ({ company: m[1].trim(), role: m[2].trim() }),
  },
]

// ─── Header Unfolding & QP Decoding ─────────────────────────────────────────

export function unfoldHeaders(raw: string): string {
  return raw.replace(/\r?\n[ \t]+/g, ' ')
}

export function decodeQuotedPrintable(str: string): string {
  if (!str) return ''
  const unfolded = str.replace(/=\r?\n/g, '')
  return unfolded.replace(/(?:=[0-9A-Fa-f]{2})+/g, (match) => {
    try {
      const hexPairs = match.replace(/=/g, '%')
      return decodeURIComponent(hexPairs)
    } catch {
      return match.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
        return String.fromCharCode(parseInt(hex, 16))
      })
    }
  })
}

// ─── Forwarded Email Detection ──────────────────────────────────────────────

export function cleanForwardedSubject(subject: string): { subject: string; isForwarded: boolean } {
  if (!subject) return { subject: '', isForwarded: false }
  let s = subject.trim()
  let isForwarded = false
  while (/^(?:Fwd|FW|Fw):\s*/i.test(s)) {
    s = s.replace(/^(?:Fwd|FW|Fw):\s*/i, '').trim()
    isForwarded = true
  }
  return { subject: s, isForwarded }
}

export function extractForwardedBlock(text: string): {
  forwardDate?: string
  forwardSubject?: string
  forwardFrom?: string
} {
  const fwdHeaderMatch = text.match(
    /[-]{5,}\s*Forwarded message\s*[-]{5,}([\s\S]*?)(?:\r?\n\r?\n|$)/i
  )
  if (!fwdHeaderMatch) return {}

  const headerBlock = fwdHeaderMatch[1]
  const dateMatch = headerBlock.match(/Date:\s*([^\n\r]+)/i)
  const subjectMatch = headerBlock.match(/Subject:\s*([^\n\r]+)/i)
  const fromMatch = headerBlock.match(/From:\s*([^\n\r]+)/i)

  return {
    forwardDate: dateMatch ? dateMatch[1].trim() : undefined,
    forwardSubject: subjectMatch ? subjectMatch[1].trim() : undefined,
    forwardFrom: fromMatch ? fromMatch[1].trim() : undefined,
  }
}

// ─── Tracking URL Unwrapping & Link Extraction ──────────────────────────────

export function unwrapTrackingUrl(urlStr: string): string {
  if (!urlStr) return ''
  const trimmed = urlStr.trim().replace(/^<|>$/g, '')

  // AWS SES awstrack.me /L0/<url-encoded target>
  const awsMatch = trimmed.match(/awstrack\.me\/L0\/([^/]+)/i)
  if (awsMatch) {
    try {
      const decoded = decodeURIComponent(awsMatch[1])
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        return decoded
      }
    } catch {
      // ignore
    }
  }

  // Generic redirect ?target= or ?url=
  try {
    const parsed = new URL(trimmed)
    const target = parsed.searchParams.get('url') || parsed.searchParams.get('target') || parsed.searchParams.get('u')
    if (target && (target.startsWith('http://') || target.startsWith('https://'))) {
      return target
    }
  } catch {
    // ignore
  }

  return trimmed
}

export function extractUrls(raw: string): string[] {
  const urls: string[] = []
  const hrefRegex = /href=["'](https?:\/\/[^"'\s>]+)["']/gi
  let match: RegExpExecArray | null
  while ((match = hrefRegex.exec(raw)) !== null) {
    urls.push(unwrapTrackingUrl(match[1]))
  }

  const plainUrlRegex = /(https?:\/\/[^\s<>"']+)/gi
  while ((match = plainUrlRegex.exec(raw)) !== null) {
    const unwrapped = unwrapTrackingUrl(match[1])
    if (!urls.includes(unwrapped)) {
      urls.push(unwrapped)
    }
  }
  return urls
}

// ─── HTML Sanitization & Entity Decoding ────────────────────────────────────

export function decodeHtmlEntities(str: string): string {
  if (!str) return ''
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&rsquo;/gi, "’")
    .replace(/&lsquo;/gi, "‘")
    .replace(/&rdquo;/gi, "”")
    .replace(/&ldquo;/gi, "“")
    .replace(/&#8377;/g, '₹')
    .replace(/&inr;/gi, '₹')
}

export function sanitizeHtmlToText(html: string): string {
  if (!html) return ''
  let text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<img[\s\S]*?>/gi, '') // Never render remote images or tracking pixels
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>\s*<td[^>]*>/gi, ' ')
    .replace(/<\/th>\s*<th[^>]*>/gi, ' ')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(div|h[1-6]|li|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '')

  text = decodeHtmlEntities(text)

  return text
    .split('\n')
    .map((l) => l.trim().replace(/[ \t]+/g, ' '))
    .filter(Boolean)
    .join('\n')
}

// ─── Additional Details Table Extractor ──────────────────────────────────────

const EXCLUDED_ADDITIONAL_LABELS = new Set([
  'deadline',
  'apply on superset',
  'click to apply',
  'click here to apply',
  'apply link',
  'from',
  'to',
  'subject',
  'date',
])

export function extractAdditionalDetails(
  html: string,
  plainText: string
): PlacementAdditionalDetail[] {
  const details: PlacementAdditionalDetail[] = []
  const seenLabels = new Set<string>()

  // 1. Try HTML Table Extraction (each <tr> with <td>label</td><td>value</td>)
  if (html) {
    const tableMatches = Array.from(html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi))
    for (const tMatch of tableMatches) {
      const tableContent = tMatch[1]
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let rowMatch: RegExpExecArray | null
      while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
        const rowHtml = rowMatch[1]
        const cellMatches = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi))
        if (cellMatches.length >= 2) {
          const rawLabel = sanitizeHtmlToText(cellMatches[0][1]).replace(/:\s*$/, '').trim()
          const rawValue = cellMatches.length >= 3 && cellMatches[1][1].replace(/<[^>]+>/g, '').trim() === ':'
            ? sanitizeHtmlToText(cellMatches[2][1]).trim()
            : sanitizeHtmlToText(cellMatches[1][1]).trim()
          const labelNorm = rawLabel.toLowerCase()
          if (rawLabel && !EXCLUDED_ADDITIONAL_LABELS.has(labelNorm) && !seenLabels.has(labelNorm)) {
            details.push({ label: rawLabel, value: rawValue })
            seenLabels.add(labelNorm)
          }
        }
      }
    }
  }

  // 2. Parse from text under "Additional Details :" (if not already extracted from HTML table)
  const textToScan = plainText || (details.length === 0 ? sanitizeHtmlToText(html) : '')
  const addDetailsIndex = textToScan.search(/Additional Details\s*:/i)
  if (addDetailsIndex !== -1) {
    const afterSection = textToScan.slice(addDetailsIndex).replace(/^Additional Details\s*:\s*/i, '')
    const lines = afterSection.split(/\r?\n/)

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue
      // Stop delimiters
      if (
        /^(?:Click to Apply|Click here|Thanks,|Regards,|Team Superset|Disclaimer|This is an automatically)/i.test(
          line
        ) ||
        /^https?:\/\//i.test(line)
      ) {
        break
      }

      const colonIndex = line.indexOf(':')
      if (colonIndex !== -1) {
        const label = line.slice(0, colonIndex).trim()
        const value = line.slice(colonIndex + 1).trim()
        const labelNorm = label.toLowerCase()
        if (label && !EXCLUDED_ADDITIONAL_LABELS.has(labelNorm) && !seenLabels.has(labelNorm)) {
          details.push({ label, value })
          seenLabels.add(labelNorm)
        }
      }
    }
  }

  // 3. Pattern match standalone "Job Profile Category : <val>" if not yet captured
  const catMatch = textToScan.match(/Job Profile Category\s*:\s*([^\n\r<]+)/i)
  if (catMatch && !seenLabels.has('job profile category')) {
    const rawVal = catMatch[1].trim()
    const matchVal = rawVal.match(/^([0-9A-Za-z]+)/)
    const catVal = matchVal ? matchVal[1] : rawVal
    if (catVal) {
      details.unshift({ label: 'Job Profile Category', value: catVal })
      seenLabels.add('job profile category')
    }
  }

  return details
}

// ─── Company & Role Extractor (Splitting on LAST "'s Job Profile") ────────────

export function extractCompanyAndRole(
  subject: string,
  bodyText: string
): { company: string; role: string; warning?: string } {
  let subjectCompany = ''
  let subjectRole = ''

  // Normalize curly apostrophes to straight for standard matching
  const normSubject = subject.replace(/’/g, "'").trim()

  // Match subject: Open for application - {company}'s Job Profile : {role}
  // We use regex to find the LAST occurrence of "'s Job Profile" or "’s Job Profile"
  const subjJobProfileIdx = normSubject.lastIndexOf("'s Job Profile")
  if (subjJobProfileIdx !== -1) {
    const beforePart = normSubject.slice(0, subjJobProfileIdx)
    const afterPart = normSubject.slice(subjJobProfileIdx + "'s Job Profile".length)

    // Strip leading "Open for application - " or "Open for application for "
    subjectCompany = beforePart.replace(/^Open for application\s*(?:-|for)\s*/i, '').trim()
    subjectRole = afterPart.replace(/^\s*:\s*/, '').trim()
  }

  // Match body: "Applications are now being accepted for {company}'s Job Profile - {role} in {n} category"
  let bodyCompany = ''
  let bodyRole = ''

  const normBody = bodyText.replace(/’/g, "'")
  const acceptedMatch = normBody.match(
    /Applications are now being accepted for\s+([\s\S]+?)'s Job Profile\s*-\s*([^\n\r]+?)(?:\s+in\s+([^\n\r]+?)\s+category)?(?:\.|$)/i
  )
  if (acceptedMatch) {
    bodyCompany = acceptedMatch[1].trim()
    bodyRole = acceptedMatch[2].trim()
  }

  let finalCompany = subjectCompany
  let finalRole = subjectRole
  let warning: string | undefined

  if (!finalCompany && bodyCompany) {
    finalCompany = bodyCompany
  }
  if (!finalRole && bodyRole) {
    finalRole = bodyRole
  }

  if (subjectCompany && bodyCompany && subjectCompany.toLowerCase() !== bodyCompany.toLowerCase()) {
    finalCompany = bodyCompany // Use body when disagreement
    warning = `Subject company ("${subjectCompany}") differed from body ("${bodyCompany}"). Using body company.`
  }

  return { company: finalCompany, role: finalRole, warning }
}

// ─── Deadline Parser in Asia/Kolkata (+05:30) ────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

export function parseSupersetDeadline(bodyText: string, baseDate: Date): string | null {
  const m = bodyText.match(
    /Deadline\s*:\s*([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\s*,?\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?|\d{1,2}:\d{2})/i
  )
  if (!m) return null

  const monthStr = m[1].toLowerCase().slice(0, 3)
  const day = parseInt(m[2], 10)
  const explicitYear = m[3] ? parseInt(m[3], 10) : null
  const timeStr = m[4]

  const monthIdx = MONTH_MAP[monthStr]
  if (monthIdx === undefined || isNaN(day)) return null

  const parsedTime = parseTime(timeStr) || '23:59'
  const [hour, min] = parsedTime.split(':').map(Number)

  let year = explicitYear || baseDate.getFullYear()

  // If no explicit year and candidate is > 60 days before baseDate, roll over to next year
  if (!explicitYear) {
    const candidateUtc = new Date(Date.UTC(year, monthIdx, day, hour - 5, min - 30))
    const diffDays = (baseDate.getTime() - candidateUtc.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > 60) {
      year += 1
    }
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(monthIdx + 1)}-${pad(day)}T${pad(hour)}:${pad(min)}:00+05:30`
}

// ─── Format Application Start in IST ────────────────────────────────────────

export function formatIsoIST(d: Date): string {
  const istMillis = d.getTime() + 5.5 * 3600 * 1000
  const istDate = new Date(istMillis)
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = istDate.getUTCFullYear()
  const m = pad(istDate.getUTCMonth() + 1)
  const day = pad(istDate.getUTCDate())
  const h = pad(istDate.getUTCHours())
  const min = pad(istDate.getUTCMinutes())
  const sec = pad(istDate.getUTCSeconds())
  return `${y}-${m}-${day}T${h}:${min}:${sec}+05:30`
}

// ─── Main Superset Email Parser (Async PostalMime + Sync Fallback) ──────────

export async function parseSupersetEmail(rawInput: string): Promise<ParsedSupersetEmail> {
  const warnings: string[] = []

  let fromHeader = ''
  let subjectHeader = ''
  let dateHeader = ''
  let messageIdHeader = ''
  let bodyHtml = ''
  let bodyText = ''
  let isMime = false

  const isLikelyMime =
    /^(?:From|Received|Return-Path|MIME-Version|Content-Type):/im.test(rawInput) ||
    /--[a-zA-Z0-9_-]+\r?\nContent-Type:/i.test(rawInput)

  const isHtml = /<[a-z][\s\S]*>/i.test(rawInput)

  if (isLikelyMime) {
    try {
      const email = await PostalMime.parse(rawInput)
      isMime = true
      fromHeader = email.from?.address || (email.from as any)?.value?.[0]?.address || ''
      subjectHeader = email.subject || ''
      dateHeader = email.date || ''
      messageIdHeader = email.messageId || ''
      bodyHtml = email.html || ''
      bodyText = email.text || ''
    } catch {
      isMime = false
    }
  }

  if (!isMime) {
    if (isHtml) {
      bodyHtml = rawInput
      bodyText = sanitizeHtmlToText(rawInput)
    } else {
      bodyText = rawInput
      bodyHtml = ''
    }
    warnings.push('Email headers not detected. Year and application start time were inferred.')
  }

  // Ensure clean text is completely stripped of HTML tags
  let cleanText = bodyText ? bodyText.trim() : ''
  if (bodyHtml && (!cleanText || /<[a-z][\s\S]*>/i.test(cleanText))) {
    cleanText = sanitizeHtmlToText(bodyHtml)
  } else if (/<[a-z][\s\S]*>/i.test(cleanText)) {
    cleanText = sanitizeHtmlToText(cleanText)
  }

  // 1. Check for Forwarded Header Block
  const { isForwarded, subject: unfwdSubject } = cleanForwardedSubject(subjectHeader)
  const fwdBlock = extractForwardedBlock(cleanText)

  if (isForwarded) {
    warnings.push('Forwarded email detected. Verify that start time corresponds to original email.')
  }

  const effectiveSubject = fwdBlock.forwardSubject || unfwdSubject || ''
  const effectiveDateStr = fwdBlock.forwardDate || dateHeader || ''

  // 2. Identify Superset
  const isFromSuperset =
    /notifications@joinsuperset\.com/i.test(fromHeader) ||
    /joinsuperset\.com/i.test(fromHeader) ||
    /notifications@joinsuperset\.com/i.test(fwdBlock.forwardFrom || '')

  const isBodySuperset =
    /Team Superset/i.test(cleanText) ||
    /joinsuperset\.com/i.test(cleanText) ||
    /joinsuperset\.com/i.test(rawInput) ||
    /Job Profile/i.test(effectiveSubject)

  const isSuperset = isFromSuperset || isBodySuperset

  // 3. Application Start Time
  let emailDateObj = new Date()
  if (effectiveDateStr) {
    try {
      const parsedD = new Date(effectiveDateStr)
      if (!isNaN(parsedD.getTime())) {
        emailDateObj = parsedD
      }
    } catch {
      // ignore
    }
  }
  const applicationStart = formatIsoIST(emailDateObj)

  // 4. Stage & Subject Template Matching
  let stage: PlacementStage = 'open_for_application'
  let matchedTemplate = false

  for (const t of SUPERSET_SUBJECT_TEMPLATES) {
    if (t.pattern.test(effectiveSubject)) {
      stage = t.stage
      matchedTemplate = true
      break
    }
  }

  if (!matchedTemplate && isSuperset) {
    stage = 'other'
  }

  // 5. Company & Role Extraction
  const { company, role, warning: compWarning } = extractCompanyAndRole(
    effectiveSubject,
    cleanText
  )
  if (compWarning) warnings.push(compWarning)

  // 6. Deadline Extraction
  const deadlineAt = parseSupersetDeadline(cleanText, emailDateObj)

  // 7. Additional Details Extraction
  const additionalDetails = extractAdditionalDetails(bodyHtml, cleanText)
  const category = additionalDetails.find((d) => /category/i.test(d.label))?.value || null

  // 8. Apply URL & External Job ID
  const allUrls = extractUrls(rawInput + '\n' + bodyHtml + '\n' + cleanText)
  let applyUrl: string | null = null
  let externalJobId: string | null = null

  for (const u of allUrls) {
    if (
      u.includes('joinsuperset.com') &&
      (u.includes('/students/jobprofiles') || u.includes('currentJobId='))
    ) {
      applyUrl = u
      try {
        const parsedUrl = new URL(u)
        externalJobId = parsedUrl.searchParams.get('currentJobId')
      } catch {
        const idMatch = u.match(/currentJobId=([a-f0-9-]+)/i)
        if (idMatch) externalJobId = idMatch[1]
      }
      if (applyUrl) break
    }
  }

  const status =
    stage === 'deadline_extended'
      ? 'extended'
      : stage === 'application_closed'
      ? 'closed'
      : 'open'

  return {
    source: 'superset',
    is_superset: isSuperset,
    stage,
    opportunity_type: stage,
    email_type: stage,
    company,
    role,
    category,
    deadline_at: deadlineAt,
    additional_details: additionalDetails,
    application_start: applicationStart,
    posted_at: applicationStart,
    apply_url: applyUrl,
    external_job_id: externalJobId,
    message_id: messageIdHeader || null,
    status,
    warnings,
    clean_text: cleanText,
    html_text: bodyHtml,
  }
}
