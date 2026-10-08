import { describe, it, expect } from 'vitest'
import {
  parseIIMUEmail,
  isCohortAllowed,
  isAdminEmail,
  DEFAULT_ALLOWED_COHORTS,
  DEFAULT_ADMIN_EMAILS,
} from '../src/lib/authUtils'

describe('parseIIMUEmail', () => {
  it('correctly parses valid student emails', () => {
    const res1 = parseIIMUEmail('student.dem2026@iimu.ac.in')
    expect(res1.isValid).toBe(true)
    expect(res1.program).toBe('dem')
    expect(res1.batchYear).toBe(2026)
    expect(res1.isDomainValid).toBe(true)

    const res2 = parseIIMUEmail('shahalabbasv.dem2026@iimu.ac.in')
    expect(res2.isValid).toBe(true)
    expect(res2.program).toBe('dem')
    expect(res2.batchYear).toBe(2026)
  })

  it('handles case-insensitivity (uppercase emails)', () => {
    const res = parseIIMUEmail('A.B.DEM2026@IIMU.AC.IN')
    expect(res.isValid).toBe(true)
    expect(res.program).toBe('dem')
    expect(res.batchYear).toBe(2026)
  })

  it('parses emails with dots, hyphens and underscores in name', () => {
    const res1 = parseIIMUEmail('john_doe.dem2026@iimu.ac.in')
    expect(res1.isValid).toBe(true)
    expect(res1.program).toBe('dem')

    const res2 = parseIIMUEmail('mary-jane.dem2026@iimu.ac.in')
    expect(res2.isValid).toBe(true)
  })

  it('rejects non-iimu domain emails', () => {
    const res1 = parseIIMUEmail('student.dem2026@gmail.com')
    expect(res1.isValid).toBe(false)
    expect(res1.isDomainValid).toBe(false)

    const res2 = parseIIMUEmail('student.dem2026@iimu.ac.in.evil.com')
    expect(res2.isValid).toBe(false)
    expect(res2.isDomainValid).toBe(false)
  })

  it('rejects email missing name prefix', () => {
    const res = parseIIMUEmail('dem2026@iimu.ac.in')
    expect(res.isValid).toBe(false)
    expect(res.isDomainValid).toBe(true)
  })
})

describe('isCohortAllowed', () => {
  it('allows active DEM 2026 cohort', () => {
    const res = isCohortAllowed('student.dem2026@iimu.ac.in', DEFAULT_ALLOWED_COHORTS, DEFAULT_ADMIN_EMAILS)
    expect(res.isAllowed).toBe(true)
    expect(res.program).toBe('dem')
    expect(res.batchYear).toBe(2026)
  })

  it('allows admin email unconditionally', () => {
    const res = isCohortAllowed('shahalabbasv.dem2026@iimu.ac.in', DEFAULT_ALLOWED_COHORTS, DEFAULT_ADMIN_EMAILS)
    expect(res.isAllowed).toBe(true)
  })

  it('rejects non-active cohort years (e.g. DEM 2025)', () => {
    const res = isCohortAllowed('student.dem2025@iimu.ac.in', DEFAULT_ALLOWED_COHORTS, DEFAULT_ADMIN_EMAILS)
    expect(res.isAllowed).toBe(false)
    expect(res.reason).toContain('DEM 2026')
  })

  it('rejects non-active programs (e.g. PGP 2026)', () => {
    const res = isCohortAllowed('student.pgp2026@iimu.ac.in', DEFAULT_ALLOWED_COHORTS, DEFAULT_ADMIN_EMAILS)
    expect(res.isAllowed).toBe(false)
    expect(res.reason).toContain('DEM 2026')
  })

  it('rejects non-IIMU domain emails', () => {
    const res = isCohortAllowed('student.dem2026@gmail.com', DEFAULT_ALLOWED_COHORTS, DEFAULT_ADMIN_EMAILS)
    expect(res.isAllowed).toBe(false)
    expect(res.reason).toContain('iimu.ac.in')
  })
})

describe('isAdminEmail role assignment', () => {
  it('correctly identifies admin emails', () => {
    expect(isAdminEmail('shahalabbasv.dem2026@iimu.ac.in', DEFAULT_ADMIN_EMAILS)).toBe(true)
    expect(isAdminEmail('SHAHALABBASV.DEM2026@IIMU.AC.IN', DEFAULT_ADMIN_EMAILS)).toBe(true)
  })

  it('assigns regular student role to others', () => {
    expect(isAdminEmail('student.dem2026@iimu.ac.in', DEFAULT_ADMIN_EMAILS)).toBe(false)
  })
})
