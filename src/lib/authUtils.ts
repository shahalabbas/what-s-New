/**
 * Auth & Cohort Utilities
 * Strictly validates IIM Udaipur student email formats and cohort access.
 */

export interface ParsedCohort {
  isValid: boolean
  program: string | null
  batchYear: number | null
  isDomainValid: boolean
  errorReason?: string
}

export interface AllowedCohort {
  id: string
  program: string
  batch_year: number
  display_name: string
  is_active: boolean
}

/**
 * Case-insensitive regex matching <name>.<program><year>@iimu.ac.in
 * Group 1: program (e.g. "dem")
 * Group 2: year (e.g. "2026")
 */
export const IIMU_EMAIL_REGEX = /^[a-z0-9._-]+\.([a-z]+)(\d{4})@iimu\.ac\.in$/i

export const DEFAULT_ALLOWED_COHORTS: AllowedCohort[] = [
  {
    id: 'cohort-dem-2026',
    program: 'dem',
    batch_year: 2026,
    display_name: 'DEM 2026',
    is_active: true,
  },
]

export const DEFAULT_ADMIN_EMAILS: string[] = [
  'shahalabbasv.dem2026@iimu.ac.in',
]

/**
 * Parses an IIMU student email and extracts program and batch year.
 */
export function parseIIMUEmail(email: string): ParsedCohort {
  const clean = (email || '').trim().toLowerCase()

  // Domain check
  if (!clean.endsWith('@iimu.ac.in')) {
    return {
      isValid: false,
      program: null,
      batchYear: null,
      isDomainValid: false,
      errorReason: 'Email must end with @iimu.ac.in',
    }
  }

  // Regex pattern check
  const match = clean.match(IIMU_EMAIL_REGEX)
  if (!match) {
    return {
      isValid: false,
      program: null,
      batchYear: null,
      isDomainValid: true,
      errorReason: 'Invalid format. Must be <name>.<program><year>@iimu.ac.in',
    }
  }

  return {
    isValid: true,
    program: match[1].toLowerCase(),
    batchYear: parseInt(match[2], 10),
    isDomainValid: true,
  }
}

/**
 * Validates if an email's parsed cohort is in the allowed active cohorts list
 * or if the email is an authorized admin email.
 */
export function isCohortAllowed(
  email: string,
  allowedCohorts: AllowedCohort[] = DEFAULT_ALLOWED_COHORTS,
  adminEmails: string[] = DEFAULT_ADMIN_EMAILS
): { isAllowed: boolean; reason?: string; program?: string; batchYear?: number } {
  const clean = (email || '').trim().toLowerCase()

  // Admin emails are always allowed
  if (adminEmails.some((adm) => adm.toLowerCase() === clean)) {
    const parsed = parseIIMUEmail(clean)
    return {
      isAllowed: true,
      program: parsed.program ?? 'dem',
      batchYear: parsed.batchYear ?? 2026,
    }
  }

  const parsed = parseIIMUEmail(clean)
  if (!parsed.isDomainValid) {
    return { isAllowed: false, reason: 'This app is only available to IIM Udaipur students (@iimu.ac.in).' }
  }

  if (!parsed.isValid || !parsed.program || !parsed.batchYear) {
    return { isAllowed: false, reason: 'Invalid student email format. Must be <name>.<program><year>@iimu.ac.in.' }
  }

  const activeCohort = allowedCohorts.find(
    (c) => c.is_active && c.program.toLowerCase() === parsed.program && c.batch_year === parsed.batchYear
  )

  if (!activeCohort) {
    return {
      isAllowed: false,
      reason: 'This app is currently available only to DEM 2026 students.',
      program: parsed.program,
      batchYear: parsed.batchYear,
    }
  }

  return {
    isAllowed: true,
    program: parsed.program,
    batchYear: parsed.batchYear,
  }
}

/**
 * Checks if an email is an administrator.
 */
export function isAdminEmail(
  email: string,
  adminEmails: string[] = DEFAULT_ADMIN_EMAILS
): boolean {
  const clean = (email || '').trim().toLowerCase()
  return adminEmails.some((adm) => adm.toLowerCase() === clean)
}
