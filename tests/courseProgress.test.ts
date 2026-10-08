import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import { calculateCourseProgress, formatSessionProgressBadge, formatShortSessionBadge } from '../src/lib/courseProgress'
import { parseFlatTimetableWorkbook } from '../src/lib/flatTimetableImporter'

describe('Course Progress Engine', () => {
  const fileBuffer = fs.readFileSync('fixtures/timetable/DEM2026_Term3_Import.xlsx') as unknown as Uint8Array
  const parsed = parseFlatTimetableWorkbook(fileBuffer, { program: 'dem', batch_year: 2026 })

  it('calculates 0 completed sessions at the start of term (21 Sept 08:00 IST)', () => {
    // 21 Sept 2026 08:00 IST = 02:30 UTC
    const mockNow = new Date('2026-09-21T02:30:00Z')
    const progressList = calculateCourseProgress(parsed.courses, parsed.class_sessions, parsed.events, mockNow)

    expect(progressList.length).toBe(11) // 11 regular courses, PJT excluded
    for (const prog of progressList) {
      expect(prog.completed_sessions).toBe(0)
      expect(prog.percent_complete).toBe(0)
      expect(prog.remaining_sessions).toBe(prog.total_sessions)
    }
  })

  it('calculates completed sessions on 1 Oct 18:00 IST', () => {
    // 1 Oct 2026 18:00 IST = 12:30 UTC
    const mockNow = new Date('2026-10-01T12:30:00Z')
    const progressList = calculateCourseProgress(parsed.courses, parsed.class_sessions, parsed.events, mockNow)

    const ais = progressList.find(p => p.course_code === 'AIS')
    expect(ais).toBeDefined()
    // AIS had S1, S2, cancelled S3 on 28th, and rescheduled S3 on 30th -> 3 completed sessions held by Oct 1
    expect(ais?.completed_sessions).toBeGreaterThanOrEqual(3)
    expect(ais?.scheduled_sessions).toBe(10)
  })

  it('calculates 100% complete for all courses at the end of term (19 Dec 23:59 IST)', () => {
    // 19 Dec 2026 23:59 IST = 18:29 UTC
    const mockNow = new Date('2026-12-19T18:29:00Z')
    const progressList = calculateCourseProgress(parsed.courses, parsed.class_sessions, parsed.events, mockNow)

    expect(progressList.length).toBe(11)
    for (const prog of progressList) {
      expect(prog.completed_sessions).toBe(prog.total_sessions)
      expect(prog.remaining_sessions).toBe(0)
      expect(prog.percent_complete).toBe(100)
    }
  })

  it('excludes Capstone Project (PJT) from course progress', () => {
    const mockNow = new Date('2026-10-01T12:30:00Z')
    const progressList = calculateCourseProgress(parsed.courses, parsed.class_sessions, parsed.events, mockNow)

    expect(progressList.some(p => p.course_code === 'PJT')).toBe(false)
  })

  it('formats session badge labels correctly', () => {
    expect(formatSessionProgressBadge(6, 20)).toBe('Session 6 of 20')
    expect(formatSessionProgressBadge(null, 20)).toBe('')
    expect(formatShortSessionBadge(6, 20)).toBe('S6 of 20')
    expect(formatShortSessionBadge(null, 20)).toBe('')
  })
})
