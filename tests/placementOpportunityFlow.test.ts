import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  parseSupersetEmail,
  unwrapTrackingUrl,
  unfoldHeaders,
} from '../src/lib/email/superset'
import { formatPlacementCountdown } from '../src/lib/timeUtils'

describe('Superset Email Parser — Comprehensive Requirements', () => {
  const fixturePath = path.resolve(__dirname, '../fixtures/email/superset_open_for_application_am.eml')
  const fixtureContent = fs.readFileSync(fixturePath, 'utf-8')

  it('1. Parses the fixture .eml: every expected field exactly', async () => {
    const result = await parseSupersetEmail(fixtureContent)

    expect(result.source).toBe('superset')
    expect(result.email_type).toBe('open_for_application')
    expect(result.company).toBe('Alvarez & Marsal (GCC)')
    expect(result.role).toBe('Consumer Retail Group - Senior Associate')
    expect(result.category).toBe('1')
    expect(result.deadline_at).toBe('2026-10-09T23:59:00+05:30')
    expect(result.posted_at).toBe('2026-10-09T01:34:04+05:30')
    expect(result.apply_url).toBe(
      'https://app.joinsuperset.com/students/jobprofiles?currentJobId=1f5e4406-fe26-4f67-aa6d-e7cdf83ef901'
    )
    expect(result.external_job_id).toBe('1f5e4406-fe26-4f67-aa6d-e7cdf83ef901')
    expect(result.message_id).toBe(
      '<010101a11d1da4d6-409baaad-c53b-4ad8-a543-bfa27a9ff5f0-000000@us-west-2.amazonses.com>'
    )
    expect(result.status).toBe('open')
  })

  it('2. Same email pasted as visible text only with inferred year warning when now is 2026-10-09 05:30 IST', async () => {
    const visibleText = `Applications are now being accepted for Alvarez & Marsal (GCC)'s Job Profile - Consumer Retail Group - Senior Associate.
Job Profile Category : 1
Deadline : Oct 09, 11:59 PM
Apply on Superset: https://app.joinsuperset.com/students/jobprofiles?currentJobId=1f5e4406-fe26-4f67-aa6d-e7cdf83ef901`

    // Set system time to 2026-10-09 05:30 IST
    vi.setSystemTime(new Date('2026-10-09T05:30:00+05:30'))

    const result = await parseSupersetEmail(visibleText)
    expect(result.company).toBe('Alvarez & Marsal (GCC)')
    expect(result.role).toBe('Consumer Retail Group - Senior Associate')
    expect(result.category).toBe('1')
    expect(result.deadline_at).toBe('2026-10-09T23:59:00+05:30')
    expect(result.warnings.some((w) => w.includes('Email headers not detected') || w.includes('inferred'))).toBe(true)

    vi.useRealTimers()
  })

  it('3. Tracking-redirect unwrap gives clean apply URL', () => {
    const rawLink =
      'https://awstrack.me/L0/https%3A%2F%2Fapp.joinsuperset.com%2Fstudents%2Fjobprofiles%3FcurrentJobId%3D1f5e4406-fe26-4f67-aa6d-e7cdf83ef901/1/010101a11d1da4d6'
    expect(unwrapTrackingUrl(rawLink)).toBe(
      'https://app.joinsuperset.com/students/jobprofiles?currentJobId=1f5e4406-fe26-4f67-aa6d-e7cdf83ef901'
    )
  })

  it('4. Folded subject header is joined correctly across multiline breaks', () => {
    const headerStr = `Subject: Open for application - Alvarez & Marsal (GCC)'s Job Profile :\r\n Consumer Retail Group - Senior Associate\r\nDate: 2026-10-08`
    const unfolded = unfoldHeaders(headerStr)
    expect(unfolded).toContain(
      "Subject: Open for application - Alvarez & Marsal (GCC)'s Job Profile : Consumer Retail Group - Senior Associate"
    )
  })

  it('5. Second email with same currentJobId and new deadline updates deadline & status', async () => {
    const secondEmail = `Subject: Deadline extended for Alvarez & Marsal (GCC)'s Job Profile : Consumer Retail Group - Senior Associate
From: notifications@joinsuperset.com
Date: Fri, 09 Oct 2026 12:00:00 +0000
Message-ID: <update-am-02@amazonses.com>

Applications are now being accepted for Alvarez & Marsal (GCC)'s Job Profile - Consumer Retail Group - Senior Associate.
Job Profile Category : 1
Deadline : Oct 11, 11:59 PM
https://app.joinsuperset.com/students/jobprofiles?currentJobId=1f5e4406-fe26-4f67-aa6d-e7cdf83ef901`

    const result = await parseSupersetEmail(secondEmail)
    expect(result.external_job_id).toBe('1f5e4406-fe26-4f67-aa6d-e7cdf83ef901')
    expect(result.email_type).toBe('deadline_extended')
    expect(result.status).toBe('extended')
    expect(result.deadline_at).toBe('2026-10-11T23:59:00+05:30')
  })

  it('6. Formats countdown at 3 days, 18h 25m, 42m 17s, and after deadline', () => {
    const deadline = '2026-10-09T23:59:00+05:30'

    // 3 days
    const at3Days = new Date('2026-10-06T23:59:00+05:30')
    expect(formatPlacementCountdown(deadline, at3Days).formatted).toBe('3d 0h')

    // 18h 25m
    const at18h25m = new Date('2026-10-09T05:34:00+05:30')
    expect(formatPlacementCountdown(deadline, at18h25m).formatted).toBe('18h 25m')

    // 42m 17s
    const at42m17s = new Date('2026-10-09T23:16:43+05:30')
    expect(formatPlacementCountdown(deadline, at42m17s).formatted).toBe('42:17')

    // Closed
    const afterDeadline = new Date('2026-10-10T01:00:00+05:30')
    expect(formatPlacementCountdown(deadline, afterDeadline).formatted).toBe('Closed')
  })

  it('7. Build Check: confirms no serverless /api files or Vercel functions were added', () => {
    const apiDirExists = fs.existsSync(path.resolve(__dirname, '../api'))
    expect(apiDirExists).toBe(false)

    const vercelJsonPath = path.resolve(__dirname, '../vercel.json')
    if (fs.existsSync(vercelJsonPath)) {
      const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'))
      expect(vercelJson.functions).toBeUndefined()
    }
  })
})
