import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  parseSupersetEmail,
  unwrapTrackingUrl,
  extractAdditionalDetails,
  extractCompanyAndRole,
  parseSupersetDeadline,
} from '../src/lib/email/superset'
import { formatPlacementCountdown } from '../src/lib/timeUtils'

describe('Superset Email Parser — Section 7 Test Suite', () => {
  const fixturePath = path.resolve(__dirname, '../fixtures/email/superset_open_for_application_am.eml')
  const fixtureContent = fs.readFileSync(fixturePath, 'utf-8')

  it('1. Extracts all fields from superset_open_for_application_am.eml fixture exactly (as .eml / raw source)', async () => {
    const result = await parseSupersetEmail(fixtureContent)

    expect(result.source).toBe('superset')
    expect(result.is_superset).toBe(true)
    expect(result.stage).toBe('open_for_application')
    expect(result.company).toBe('Alvarez & Marsal (GCC)')
    expect(result.role).toBe('Consumer Retail Group - Senior Associate')
    expect(result.deadline_at).toBe('2026-10-09T23:59:00+05:30')
    expect(result.additional_details).toEqual([
      { label: 'Job Profile Category', value: '1' },
    ])
    // Date: Thu, 8 Oct 2026 20:04:04 +0000 -> 2026-10-09 01:34:04 IST
    expect(result.application_start).toBe('2026-10-09T01:34:04+05:30')
    expect(result.apply_url).toBe(
      'https://app.joinsuperset.com/students/jobprofiles?currentJobId=1f5e4406-fe26-4f67-aa6d-e7cdf83ef901'
    )
    expect(result.external_job_id).toBe('1f5e4406-fe26-4f67-aa6d-e7cdf83ef901')
    expect(result.message_id).toBe(
      '<010101a11d1da4d6-409baaad-c53b-4ad8-a543-bfa27a9ff5f0-000000@us-west-2.amazonses.com>'
    )

    // Ensure no header text (Received, ARC, DKIM, Delivered-To) polluted fields
    expect(result.company).not.toMatch(/Received|ARC|DKIM|Delivered-To/i)
    expect(result.role).not.toMatch(/Received|ARC|DKIM|Delivered-To/i)
  })

  it('2. Visible-text paste of the same email: same company, role, deadline, additional details with warning', async () => {
    const visibleText = `Team Superset
Applications are now being accepted for Alvarez & Marsal (GCC)'s Job Profile - Consumer Retail Group - Senior Associate in 1 category.

Additional Details :
Job Profile Category : 1

Deadline : Oct 09, 11:59 PM
Apply on Superset: https://app.joinsuperset.com/students/jobprofiles?currentJobId=1f5e4406-fe26-4f67-aa6d-e7cdf83ef901`

    const result = await parseSupersetEmail(visibleText)
    expect(result.company).toBe('Alvarez & Marsal (GCC)')
    expect(result.role).toBe('Consumer Retail Group - Senior Associate')
    expect(result.deadline_at).toContain('10-09T23:59:00+05:30')
    expect(result.additional_details).toEqual([
      { label: 'Job Profile Category', value: '1' },
    ])
    expect(result.warnings.some((w) => w.includes('Email headers not detected') || w.includes('inferred'))).toBe(true)
  })

  it('3. Additional Details with 3 rows preserves order and values containing colons (e.g. 10:30 AM)', () => {
    const htmlTable = `
      <p>Additional Details :</p>
      <table>
        <tr><td>Job Profile Category</td><td>1</td></tr>
        <tr><td>CTC</td><td>₹18 LPA</td></tr>
        <tr><td>Interview Time</td><td>10:30 AM</td></tr>
      </table>
    `
    const details = extractAdditionalDetails(htmlTable, '')
    expect(details).toEqual([
      { label: 'Job Profile Category', value: '1' },
      { label: 'CTC', value: '₹18 LPA' },
      { label: 'Interview Time', value: '10:30 AM' },
    ])
  })

  it("4. Company with an apostrophe (McDonald's India's Job Profile : Analyst) keeps McDonald's India intact", () => {
    const subject = "Open for application - McDonald's India's Job Profile : Data Analyst"
    const body = "Applications are now being accepted for McDonald's India's Job Profile - Data Analyst in 1 category."
    const { company, role } = extractCompanyAndRole(subject, body)
    expect(company).toBe("McDonald's India")
    expect(role).toBe('Data Analyst')
  })

  it('5. Deadline "Jan 05, 11:59 PM" in Dec 2026 rolls over to 2027; "Oct 09, 12:15 AM" -> 00:15', () => {
    const decDate = new Date('2026-12-20T10:00:00Z')
    const deadlineJan = parseSupersetDeadline('Deadline : Jan 05, 11:59 PM', decDate)
    expect(deadlineJan).toBe('2027-01-05T23:59:00+05:30')

    const baseOct = new Date('2026-10-08T10:00:00Z')
    const deadline1215AM = parseSupersetDeadline('Deadline : Oct 09, 12:15 AM', baseOct)
    expect(deadline1215AM).toBe('2026-10-09T00:15:00+05:30')
  })

  it('6. Forwarded email with Fwd: subject is parsed with forward warning', async () => {
    const fwdRaw = `From: user@gmail.com
Subject: Fwd: Open for application - McKinsey's Job Profile : Associate Consultant
Date: Fri, 9 Oct 2026 10:00:00 +0530
Message-ID: <fwd-msg-123@gmail.com>

---------- Forwarded message ---------
From: notifications@joinsuperset.com
Date: Thu, 8 Oct 2026 at 20:00
Subject: Open for application - McKinsey's Job Profile : Associate Consultant

Applications are now being accepted for McKinsey's Job Profile - Associate Consultant in 1 category.
Deadline : Oct 15, 11:59 PM
https://app.joinsuperset.com/students/jobprofiles?currentJobId=mckinsey-job-001`

    const result = await parseSupersetEmail(fwdRaw)
    expect(result.company).toBe('McKinsey')
    expect(result.role).toBe('Associate Consultant')
    expect(result.deadline_at).toBe('2026-10-15T23:59:00+05:30')
    expect(result.warnings.some((w) => w.includes('Forwarded email detected'))).toBe(true)
  })

  it('7. Non-Superset email marks is_superset as false', async () => {
    const nonSuperset = `From: hr@randomcompany.com
Subject: Random Newsletter
Date: Thu, 8 Oct 2026 10:00:00 +0530

Here is the weekly update.`

    const result = await parseSupersetEmail(nonSuperset)
    expect(result.is_superset).toBe(false)
  })

  it('8. Unwraps tracking redirects accurately', () => {
    const tracked =
      'https://awstrack.me/L0/https%3A%2F%2Fapp.joinsuperset.com%2Fstudents%2Fjobprofiles%3FcurrentJobId%3Dtest-123/1/abc'
    expect(unwrapTrackingUrl(tracked)).toBe(
      'https://app.joinsuperset.com/students/jobprofiles?currentJobId=test-123'
    )
  })

  it('9. Correctly sanitizes and extracts from raw HTML email without header lines', async () => {
    const rawHtml = `<!DOCTYPE html><html><body>
<p>Dear Student,</p>
<p>Applications are now being accepted for <strong>Alvarez &amp; Marsal (GCC)</strong>'s Job Profile - <strong>Consumer Retail Group - Senior Associate</strong>.</p>
<p>Job Profile Category : 1<br>
Deadline : Oct 09, 11:59 PM</p>
<p><a href="https://app.joinsuperset.com/students/jobprofiles?currentJobId=1f5e4406-fe26-4f67-aa6d-e7cdf83ef901">Click here to Apply on Superset</a></p>
</body></html>`

    const parsed = await parseSupersetEmail(rawHtml)
    expect(parsed.company).toBe('Alvarez & Marsal (GCC)')
    expect(parsed.role).toBe('Consumer Retail Group - Senior Associate')
    expect(parsed.category).toBe('1')
    expect(parsed.deadline_at).toContain('10-09T23:59:00+05:30')
    expect(parsed.clean_text).not.toContain('<p>')
    expect(parsed.clean_text).not.toContain('<!DOCTYPE')
    expect(parsed.clean_text).toContain('Applications are now being accepted')
  })
})

describe('Placement Countdown & Time Formatting', () => {
  it('formats countdown at 3 days', () => {
    const now = new Date('2026-10-06T23:59:00+05:30')
    const deadline = '2026-10-09T23:59:00+05:30'
    const res = formatPlacementCountdown(deadline, now)
    expect(res.formatted).toBe('3d 0h')
    expect(res.urgency).toBe('normal')
  })

  it('formats countdown at 18h 25m', () => {
    const now = new Date('2026-10-09T05:34:00+05:30')
    const deadline = '2026-10-09T23:59:00+05:30'
    const res = formatPlacementCountdown(deadline, now)
    expect(res.formatted).toBe('18h 25m')
    expect(res.urgency).toBe('warm')
  })

  it('formats closed state after deadline', () => {
    const now = new Date('2026-10-10T00:01:00+05:30')
    const deadline = '2026-10-09T23:59:00+05:30'
    const res = formatPlacementCountdown(deadline, now)
    expect(res.formatted).toBe('Closed')
    expect(res.urgency).toBe('closed')
  })
})
