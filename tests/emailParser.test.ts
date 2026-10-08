import { describe, it, expect } from 'vitest'
import {
  cleanEmailBody,
  extractVenues,
  extractLinks,
  extractCompany,
  extractDateAndTimes,
  parseEmailContent,
} from '../src/lib/emailParser'
import type { Course } from '../src/types'

const mockCourses: Course[] = [
  { id: 'c-1', code: 'MKT501', name: 'Marketing Management', faculty: 'Prof. Anita Sharma', color_tag: '#0A84FF', credits: 2 },
  { id: 'c-2', code: 'FIN502', name: 'Financial Accounting', faculty: 'Prof. Rajesh Mehta', color_tag: '#34C759', credits: 2 },
  { id: 'c-3', code: 'OPS503', name: 'Operations Management', faculty: 'Prof. Sunita Patel', color_tag: '#FF9F0A', credits: 2 },
]

const ASSIGNMENT_FIXTURE = `Subject: Marketing Management (MKT501) — Case Study Submission & Group Assignment
From: prof.anita@iimu.ac.in
Date: 2026-10-12T10:30:00+05:30
Message-ID: <mkt501-assign-01@iimu.ac.in>

Dear DEM 2026 Batch,

Please find the details for your first group assignment on Consumer Behaviour Analysis.
You are required to work in a group of 3 members and submit your comprehensive deck.

Submission Deadline: 18th October 2026 by 11:59 PM.
Submission Link: https://forms.gle/MKT501AssignmentDeck

Please ensure only one submission per team.

Best regards,
Prof. Anita Sharma
Faculty, Marketing`

const PLACEMENT_FIXTURE = `Subject: Corporate Presentation & Shortlist Briefing: McKinsey & Company
From: placements@iimu.ac.in
Date: 2026-10-14T08:00:00+05:30
Message-ID: <placements-mckinsey-ppt-2026@iimu.ac.in>

Dear Batch of DEM 2026,

We are pleased to announce the Pre-Placement Talk by McKinsey & Company for Summer Associate 2027 internship roles.

Date: 16th October 2026
Time: 5:00 PM - 7:00 PM
Venue: Auditorium

Attendance is mandatory for all shortlisted candidates. Please join the Handshake event link for details:
https://iimu.joinhandshake.co/events/mckinsey-2026

Warm regards,
Corporate Relations & Placements Committee
IIM Udaipur`

const MEETING_FIXTURE = `Subject: DEM 2026 Batch Townhall with Program Chair
From: chair.dem@iimu.ac.in
Date: 2026-10-15T12:00:00+05:30
Message-ID: <dem-townhall-term1@iimu.ac.in>

Dear Students,

There will be a batch meeting to discuss term 2 electives, timetable scheduling, and campus feedback.

Date: 20th October 2026
Time: 6:00 PM - 7:30 PM
Venue: CR-1

Meeting link for hybrid participants:
https://teams.microsoft.com/l/meetup-join/dem2026townhall

Regards,
Academic Office`

describe('Email Parser — Header & Body Cleaner', () => {
  it('extracts headers and strips reply quotes', () => {
    const raw = `Subject: Important Assignment\nFrom: prof@iimu.ac.in\nDate: 2026-10-15\n\nHello Class,\nSubmit by Friday.\n> On Monday, Student wrote:\n> Can we get extension?`
    const { meta, cleanBody } = cleanEmailBody(raw)

    expect(meta.subject).toBe('Important Assignment')
    expect(meta.from).toBe('prof@iimu.ac.in')
    expect(cleanBody).toContain('Submit by Friday.')
    expect(cleanBody).not.toContain('Can we get extension?')
  })
})

describe('Email Parser — Extractions', () => {
  it('extracts venues accurately', () => {
    expect(extractVenues('Class is in LH-1 and tutorial in CR-3.')).toEqual(['LH-1', 'CR-3'])
    expect(extractVenues('The PPT will be conducted in the Auditorium.')).toEqual(['Auditorium'])
  })

  it('extracts URLs', () => {
    const links = extractLinks('Please submit at https://forms.gle/sample123 and review https://teams.microsoft.com/meet')
    expect(links).toContain('https://forms.gle/sample123')
    expect(links).toContain('https://teams.microsoft.com/meet')
  })

  it('extracts recruiter company', () => {
    expect(extractCompany('Pre-placement talk by McKinsey & Company')).toBe('McKinsey & Company')
    expect(extractCompany('Shortlist announced for Deloitte consulting roles')).toBe('Deloitte')
  })

  it('extracts dates and times', () => {
    const res = extractDateAndTimes('Due on 18th October 2026 by 11:59 PM', '2026-10-12')
    expect(res.date).toBe('2026-10-18')
    expect(res.deadlineTime).toBe('23:59:00')
  })
})

describe('Email Parser — Fixture Tests', () => {
  it('parses assignment fixture correctly', () => {
    const result = parseEmailContent(ASSIGNMENT_FIXTURE, mockCourses, '2026-10-12')

    expect(result.itemType).toBe('assignment')
    expect(result.courseId).toBe('c-1')
    expect(result.groupSize).toBe(3)
    expect(result.link).toBe('https://forms.gle/MKT501AssignmentDeck')
    expect(result.deadline).toContain('2026-10-18')
  })

  it('parses placement PPT fixture correctly', () => {
    const result = parseEmailContent(PLACEMENT_FIXTURE, mockCourses, '2026-10-12')

    expect(result.itemType).toBe('placement_event')
    expect(result.company).toBe('McKinsey & Company')
    expect(result.venue).toBe('Auditorium')
    expect(result.link).toBe('https://iimu.joinhandshake.co/events/mckinsey-2026')
    expect(result.startAt).toContain('2026-10-16')
  })

  it('parses townhall meeting fixture correctly', () => {
    const result = parseEmailContent(MEETING_FIXTURE, mockCourses, '2026-10-12')

    expect(result.itemType).toBe('meeting')
    expect(result.venue).toBe('CR-1')
    expect(result.link).toContain('teams.microsoft.com')
    expect(result.startAt).toContain('2026-10-20')
  })
})
