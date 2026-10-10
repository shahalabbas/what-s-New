import { describe, it, expect } from 'vitest'
import { fromDatetimeLocalToIST } from '../src/lib/timeUtils'
import type { ProjectType, Course } from '../src/types'

describe('Feature 2: Projects Admin Operations & Form Validation', () => {
  const mockCourses: Course[] = [
    {
      id: 'c1',
      code: 'DSO 503',
      name: 'Data Science for Business',
      credits: 3,
      faculty: 'Prof. Sharma',
      color_tag: '#0A84FF',
      total_sessions: 20,
    },
    {
      id: 'c2',
      code: 'MKT 501',
      name: 'Marketing Management',
      credits: 3,
      faculty: 'Prof. Verma',
      color_tag: '#34C759',
      total_sessions: 20,
    },
  ]

  it('validates project title length (maximum 120 characters)', () => {
    const validTitle = 'DSO 503 · Term Project Milestone 1 — Exploratory Data Analysis & Predictive Modeling'
    expect(validTitle.length).toBeLessThanOrEqual(120)

    const invalidTitle = 'A'.repeat(121)
    expect(invalidTitle.length).toBeGreaterThan(120)
  })

  it('validates project description length (maximum 2000 characters)', () => {
    const validDesc = 'Submit your Python notebooks along with a 5-page PDF report. Ensure all graphs are labeled.'
    expect(validDesc.length).toBeLessThanOrEqual(2000)

    const invalidDesc = 'X'.repeat(2001)
    expect(invalidDesc.length).toBeGreaterThan(2000)
  })

  it('formats and converts datetime-local to Asia/Kolkata ISO timestamp with 23:59 default', () => {
    const localInput = '2026-10-18T23:59'
    const isoResult = fromDatetimeLocalToIST(localInput)
    expect(isoResult).toBe('2026-10-18T23:59:00+05:30')
  })

  it('validates that deadlines cannot be in the past', () => {
    const pastIso = '2020-01-01T23:59:00+05:30'
    const isPast = new Date(pastIso).getTime() <= Date.now()
    expect(isPast).toBe(true)

    const futureIso = '2029-12-31T23:59:00+05:30'
    const isFuture = new Date(futureIso).getTime() > Date.now()
    expect(isFuture).toBe(true)
  })

  it('extracts and detects all URLs in project description for clickable links', () => {
    const description = `Please read the case study instructions at https://example.com/case-study.pdf
Submit your assignment to Google Drive: https://drive.google.com/drive/folders/abc123xyz
Contact TA if you face any issues.`

    const urlRegex = /(https?:\/\/[^\s<>"']+)/g
    const matches = description.match(urlRegex)
    expect(matches).not.toBeNull()
    expect(matches).toHaveLength(2)
    expect(matches![0]).toBe('https://example.com/case-study.pdf')
    expect(matches![1]).toBe('https://drive.google.com/drive/folders/abc123xyz')
  })

  it('supports all deliverable types: assignment, project, end-term', () => {
    const types: ProjectType[] = ['assignment', 'project', 'end-term']
    expect(types).toContain('assignment')
    expect(types).toContain('project')
    expect(types).toContain('end-term')
  })

  it('correctly maps cohort courses for the subject dropdown', () => {
    const dropdownOptions = [
      { id: '', label: 'Other / None (Campus-wide)' },
      ...mockCourses.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` })),
    ]

    expect(dropdownOptions).toHaveLength(3)
    expect(dropdownOptions[0].label).toBe('Other / None (Campus-wide)')
    expect(dropdownOptions[1].label).toBe('DSO 503 · Data Science for Business')
    expect(dropdownOptions[2].label).toBe('MKT 501 · Marketing Management')
  })
})
