import { describe, it, expect } from 'vitest'
import { getMockDayMenus } from '../src/lib/mockData'
import { timeToMinutes } from '../src/lib/timeUtils'

describe('Mess Menu Live State & Timing Resolution', () => {
  const date = '2026-10-05'
  const dayMenus = getMockDayMenus(date)

  function computeActiveMealAtTime(timeStr: string) {
    const currentMinutes = timeToMinutes(timeStr)
    return dayMenus.find((m) => {
      const start = timeToMinutes(m.start_time)
      const end = timeToMinutes(m.end_time)
      return currentMinutes >= start && currentMinutes < end
    }) ?? null
  }

  function computeNextMealAtTime(timeStr: string) {
    const currentMinutes = timeToMinutes(timeStr)
    return [...dayMenus]
      .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
      .find((m) => timeToMinutes(m.start_time) > currentMinutes) ?? null
  }

  it('correctly identifies Breakfast as active at 2026-10-05 08:00', () => {
    const active = computeActiveMealAtTime('08:00')
    expect(active).toBeDefined()
    expect(active?.meal).toBe('breakfast')
    expect(active?.start_time).toBe('07:30')
    expect(active?.end_time).toBe('09:30')
    expect(active?.items.length).toBeGreaterThan(0)
  })

  it('correctly identifies Lunch as active at 2026-10-05 13:00', () => {
    const active = computeActiveMealAtTime('13:00')
    expect(active).toBeDefined()
    expect(active?.meal).toBe('lunch')
    expect(active?.start_time).toBe('12:00')
    expect(active?.end_time).toBe('14:30')
    expect(active?.has_non_veg).toBe(true)
  })

  it('correctly identifies Lunch as next meal at 2026-10-05 10:30', () => {
    const active = computeActiveMealAtTime('10:30')
    expect(active).toBeNull()

    const next = computeNextMealAtTime('10:30')
    expect(next).toBeDefined()
    expect(next?.meal).toBe('lunch')
    expect(next?.start_time).toBe('12:00')
  })

  it('correctly identifies Hi-Tea as next meal at 2026-10-05 15:00', () => {
    const next = computeNextMealAtTime('15:00')
    expect(next).toBeDefined()
    expect(next?.meal).toBe('hi_tea')
    expect(next?.start_time).toBe('16:30')
  })
})
