import { describe, it, expect } from 'vitest'
import {
  getSessionsFromDatedSessions,
  getExtendedScheduleStateFromSessions,
  getCurrentSession,
  getNextSession,
  getSessionProgress,
  minutesUntilSession,
} from '../src/lib/scheduleEngine'
import type { ClassSession, CampusEvent } from '../src/types'

describe('Schedule Engine with Dated ClassSessions & Events', () => {
  const MONDAY = '2026-10-12'

  const mockSessions: ClassSession[] = [
    {
      id: 'cs-1',
      program: 'dem',
      batch_year: 2026,
      date: MONDAY,
      start_time: '09:00:00',
      end_time: '10:30:00',
      course_id: 'c-1',
      session_no: 1,
      room: 'CR-7C-15',
      session_type: 'lecture',
      status: 'scheduled',
    },
    {
      id: 'cs-2',
      program: 'dem',
      batch_year: 2026,
      date: MONDAY,
      start_time: '11:00:00',
      end_time: '12:30:00',
      course_id: 'c-2',
      session_no: 1,
      room: 'CR-7C-15',
      session_type: 'lecture',
      status: 'scheduled',
    },
    {
      id: 'cs-3',
      program: 'dem',
      batch_year: 2026,
      date: MONDAY,
      start_time: '14:00:00',
      end_time: '15:30:00',
      course_id: 'c-3',
      session_no: 1,
      room: 'CR-7C-15',
      session_type: 'lecture',
      status: 'cancelled',
    },
  ]

  const mockEvents: CampusEvent[] = [
    {
      id: 'ev-holiday',
      program: 'dem',
      batch_year: 2026,
      type: 'holiday',
      title: 'Mahatma Gandhi Jayanti',
      date: '2026-10-02',
      all_day: true,
      status: 'scheduled',
    },
  ]

  it('filters out cancelled sessions and sorts by start time', () => {
    const resolved = getSessionsFromDatedSessions(MONDAY, mockSessions)
    expect(resolved).toHaveLength(2)
    expect(resolved[0].id).toBe('cs-1')
    expect(resolved[1].id).toBe('cs-2')
  })

  it('identifies active class during class hours (09:45)', () => {
    const resolved = getSessionsFromDatedSessions(MONDAY, mockSessions)
    const current = getCurrentSession('09:45', resolved)
    expect(current?.id).toBe('cs-1')

    const progress = getSessionProgress('09:45', current!)
    expect(progress).toBe(50)

    const next = getNextSession('09:45', resolved)
    expect(next?.id).toBe('cs-2')

    const state = getExtendedScheduleStateFromSessions(MONDAY, mockSessions, '09:45')
    expect(state.state).toBe('active')
    expect(state.currentSession?.id).toBe('cs-1')
    expect(state.nextSession?.id).toBe('cs-2')
  })

  it('identifies between classes state (10:45)', () => {
    const state = getExtendedScheduleStateFromSessions(MONDAY, mockSessions, '10:45')
    expect(state.state).toBe('between')
    expect(state.currentSession).toBeNull()
    expect(state.nextSession?.id).toBe('cs-2')
    expect(state.gapText).toBe('Free for 15m')
  })

  it('identifies done today state in the evening (16:00)', () => {
    const state = getExtendedScheduleStateFromSessions(MONDAY, mockSessions, '16:00')
    expect(state.state).toBe('done_today')
    expect(state.gapText).toBe('Done for today')
  })

  it('identifies holiday / no classes state on holiday date', () => {
    const state = getExtendedScheduleStateFromSessions('2026-10-02', mockSessions, '10:00', mockEvents)
    expect(state.state).toBe('no_classes')
    expect(state.gapText).toBe('Mahatma Gandhi Jayanti')
  })

  it('calculates minutes until next session', () => {
    const resolved = getSessionsFromDatedSessions(MONDAY, mockSessions)
    const next = getNextSession('10:30', resolved)
    expect(minutesUntilSession('10:30', next!)).toBe(30)
  })
})
