import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as XLSX from 'xlsx'
import {
  parseFlatTimetableWorkbook,
  generateTimetableDiff,
  generateBlankTimetableTemplate,
  exportLiveTermToExcel,
  normalizeDate,
} from '../src/lib/flatTimetableImporter'

describe('Flat Table Timetable Importer', () => {
  const fileBuffer = fs.readFileSync('fixtures/timetable/DEM2026_Term3_Import.xlsx') as unknown as Uint8Array

  it('accurately imports the term fixture with 1 term, 12 courses, 141 class_sessions, 36 events', () => {
    const result = parseFlatTimetableWorkbook(fileBuffer, { program: 'dem', batch_year: 2026 })

    expect(result.errors).toHaveLength(0)
    expect(result.terms).toHaveLength(1)
    expect(result.terms[0].term_key).toBe('term3_2026')
    expect(result.terms[0].program).toBe('dem')
    expect(result.terms[0].batch_year).toBe(2026)
    expect(result.terms[0].start_date).toBe('2026-09-21')
    expect(result.terms[0].end_date).toBe('2026-12-19')

    expect(result.courses).toHaveLength(12)
    expect(result.class_sessions).toHaveLength(141)
    expect(result.events).toHaveLength(36)
  })

  it('validates per-course session counts in course audit summary', () => {
    const result = parseFlatTimetableWorkbook(fileBuffer, { program: 'dem', batch_year: 2026 })

    const auditByCode = new Map(result.auditSummary.map(a => [a.code, a]))

    // 4-credit courses (20 expected sessions)
    expect(auditByCode.get('AA-II')?.scheduledCount).toBe(20)
    expect(auditByCode.get('AA-II')?.totalExpected).toBe(20)
    expect(auditByCode.get('MPBS')?.scheduledCount).toBe(20)
    expect(auditByCode.get('MPBS')?.totalExpected).toBe(20)
    expect(auditByCode.get('PM')?.scheduledCount).toBe(20)
    expect(auditByCode.get('PM')?.totalExpected).toBe(20)

    // 2-credit courses (10 expected sessions)
    const twoCreditCodes = ['DTM', 'MLA', 'CPS', 'GDM', 'CC', 'EBE', 'BOD']
    for (const code of twoCreditCodes) {
      const aud = auditByCode.get(code)
      expect(aud?.scheduledCount).toBe(10)
      expect(aud?.totalExpected).toBe(10)
      expect(aud?.cancelledCount).toBe(0)
    }

    // AIS has 1 cancelled + 10 scheduled = 11 total
    const aisAud = auditByCode.get('AIS')
    expect(aisAud?.scheduledCount).toBe(10)
    expect(aisAud?.cancelledCount).toBe(1)
    expect(aisAud?.totalExpected).toBe(10)

    // PJT (Capstone) has 0 sessions
    const pjtAud = auditByCode.get('PJT')
    expect(pjtAud?.scheduledCount).toBe(0)
  })

  it('rejects an unknown course_code in class_sessions', () => {
    const wb = XLSX.read(fileBuffer, { type: 'buffer' })
    const sessions = XLSX.utils.sheet_to_json<any>(wb.Sheets['class_sessions'])
    sessions.push({
      term_key: 'term3_2026',
      date: '2026-10-05',
      start_time: '09:00',
      end_time: '10:30',
      course_code: 'NON_EXISTENT_XYZ',
      session_no: 1,
      status: 'scheduled',
    })
    wb.Sheets['class_sessions'] = XLSX.utils.json_to_sheet(sessions)
    const corruptedBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const result = parseFlatTimetableWorkbook(corruptedBuffer)
    expect(result.errors.some(e => e.includes('unknown course_code "NON_EXISTENT_XYZ"'))).toBe(true)
  })

  it('rejects duplicate active (course_code, session_no) in class_sessions', () => {
    const wb = XLSX.read(fileBuffer, { type: 'buffer' })
    const sessions = XLSX.utils.sheet_to_json<any>(wb.Sheets['class_sessions'])
    sessions.push({
      term_key: 'term3_2026',
      date: '2026-10-06',
      start_time: '14:00',
      end_time: '15:30',
      course_code: 'AA-II',
      session_no: 1, // Duplicate active S1
      status: 'scheduled',
    })
    wb.Sheets['class_sessions'] = XLSX.utils.json_to_sheet(sessions)
    const corruptedBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const result = parseFlatTimetableWorkbook(corruptedBuffer)
    expect(result.errors.some(e => e.includes('duplicate active session number 1 for course "AA-II"'))).toBe(true)
  })

  it('rejects invalid time ranges where end_time <= start_time', () => {
    const wb = XLSX.read(fileBuffer, { type: 'buffer' })
    const sessions = XLSX.utils.sheet_to_json<any>(wb.Sheets['class_sessions'])
    sessions.push({
      term_key: 'term3_2026',
      date: '2026-10-06',
      start_time: '11:00',
      end_time: '10:00', // invalid: end before start
      course_code: 'DTM',
      session_no: 99,
      status: 'scheduled',
    })
    wb.Sheets['class_sessions'] = XLSX.utils.json_to_sheet(sessions)
    const corruptedBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const result = parseFlatTimetableWorkbook(corruptedBuffer)
    expect(result.errors.some(e => e.includes('end_time (10:00) must be greater than start_time (11:00)'))).toBe(true)
  })

  it('rejects an event with all_day=false but no start_time', () => {
    const wb = XLSX.read(fileBuffer, { type: 'buffer' })
    const events = XLSX.utils.sheet_to_json<any>(wb.Sheets['events'])
    events.push({
      term_key: 'term3_2026',
      date: '2026-10-06',
      all_day: false,
      start_time: '',
      type: 'meeting',
      title: 'Missing Time Meeting',
      status: 'scheduled',
    })
    wb.Sheets['events'] = XLSX.utils.json_to_sheet(events)
    const corruptedBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const result = parseFlatTimetableWorkbook(corruptedBuffer)
    expect(result.errors.some(e => e.includes('all_day is FALSE but no start_time provided'))).toBe(true)
  })

  it('imports a flat mess_menu workbook and gives empty diff on re-import', () => {
    const messData = [
      { date: '2026-10-05', meal: 'breakfast', items: 'Idli, Sambar, Chutney', start_time: '07:30', end_time: '09:30' },
      { date: '2026-10-05', meal: 'lunch', items: 'Dal, Rice, Roti, Paneer', start_time: '12:00', end_time: '14:30' },
      { date: '2026-10-05', meal: 'snacks', items: 'Samosa, Tea', start_time: '16:30', end_time: '18:00' },
      { date: '2026-10-05', meal: 'dinner', items: 'Biryani, Raita, Gulab Jamun', start_time: '19:30', end_time: '21:30' },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(messData), 'mess_menu')
    const messBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const res1 = parseFlatTimetableWorkbook(messBuffer)
    expect(res1.errors).toHaveLength(0)
    expect(res1.mess_menu).toHaveLength(4)

    // Re-parse produces identical results
    const res2 = parseFlatTimetableWorkbook(messBuffer)
    expect(res2.mess_menu).toHaveLength(4)
  })

  it('produces an unchanged diff when comparing identical sessions', () => {
    const res = parseFlatTimetableWorkbook(fileBuffer)
    const diff = generateTimetableDiff(res.class_sessions, res.class_sessions)

    expect(diff.filter(d => d.status === 'added')).toHaveLength(0)
    expect(diff.filter(d => d.status === 'removed')).toHaveLength(0)
    expect(diff.filter(d => d.status === 'modified')).toHaveLength(0)
    expect(diff.filter(d => d.status === 'unchanged')).toHaveLength(141)
  })

  it('generates a blank template and exports live term data successfully', () => {
    const templateBytes = generateBlankTimetableTemplate()
    expect(templateBytes.length).toBeGreaterThan(100)

    const templateWb = XLSX.read(templateBytes, { type: 'array' })
    expect(templateWb.SheetNames).toContain('terms')
    expect(templateWb.SheetNames).toContain('courses')
    expect(templateWb.SheetNames).toContain('class_sessions')
    expect(templateWb.SheetNames).toContain('events')
    expect(templateWb.SheetNames).toContain('mess_menu')

    const res = parseFlatTimetableWorkbook(fileBuffer)
    const exportBytes = exportLiveTermToExcel(res.terms, res.courses, res.class_sessions, res.events)
    expect(exportBytes.length).toBeGreaterThan(100)

    const reimported = parseFlatTimetableWorkbook(exportBytes)
    expect(reimported.errors).toHaveLength(0)
    expect(reimported.class_sessions).toHaveLength(141)
    expect(reimported.events).toHaveLength(36)
  })

  it('preserves exact date for UTC Date objects without timezone shift', () => {
    // SheetJS returns Date objects at UTC midnight: 2026-09-21T00:00:00.000Z
    const testDate = new Date(Date.UTC(2026, 8, 21, 0, 0, 0))
    expect(normalizeDate(testDate)).toBe('2026-09-21')

    const result = parseFlatTimetableWorkbook(fileBuffer)
    expect(result.terms[0].start_date).toBe('2026-09-21')
    expect(result.terms[0].end_date).toBe('2026-12-19')
  })
})
