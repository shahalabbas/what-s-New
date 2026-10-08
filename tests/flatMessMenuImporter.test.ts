import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import {
  parseFlatMessMenuWorkbook,
  generateMessMenuDiff,
  resolveMealTiming,
  buildDayMenus,
  generateBlankMessMenuTemplate,
  exportLiveMessMenuToExcel,
} from '../src/lib/flatMessMenuImporter'

describe('Flat Mess Menu Importer & Parser', () => {
  const fixturePath = 'fixtures/mess/Mess_Menu_2026-10-05_to_10-11_Import.xlsx'
  const fileBuffer = fs.readFileSync(fixturePath)

  it('parses the flat mess menu fixture with exact metrics', () => {
    const result = parseFlatMessMenuWorkbook(fileBuffer)

    // 0 errors
    expect(result.errors).toEqual([])

    // 1 week
    expect(result.mess_weeks).toHaveLength(1)
    expect(result.mess_weeks[0]).toEqual({
      id: 'mw-week_2026_10_05',
      week_key: 'week_2026_10_05',
      week_start: '2026-10-05',
      week_end: '2026-10-11',
      title: 'Mess Menu Oct 5 - Oct 11, 2026',
    })

    // Exactly 181 items
    expect(result.mess_menu_items).toHaveLength(181)

    // Breakdown by meal
    const breakfastItems = result.mess_menu_items.filter(i => i.meal === 'breakfast')
    const lunchItems = result.mess_menu_items.filter(i => i.meal === 'lunch')
    const hiTeaItems = result.mess_menu_items.filter(i => i.meal === 'hi_tea')
    const dinnerItems = result.mess_menu_items.filter(i => i.meal === 'dinner')

    expect(breakfastItems).toHaveLength(49)
    expect(lunchItems).toHaveLength(55)
    expect(hiTeaItems).toHaveLength(14)
    expect(dinnerItems).toHaveLength(63)

    // Sunday Lunch count
    const sundayLunchItems = result.mess_menu_items.filter(i => i.date === '2026-10-11' && i.meal === 'lunch')
    expect(sundayLunchItems).toHaveLength(7)

    // 21 non-veg / egg items
    const nonVegAndEgg = result.mess_menu_items.filter(i => i.diet === 'non_veg' || i.diet === 'egg')
    expect(nonVegAndEgg).toHaveLength(21)

    // 4 specials
    const specials = result.mess_menu_items.filter(i => i.is_special)
    expect(specials).toHaveLength(4)

    // First item
    const firstItem = result.mess_menu_items[0]
    expect(firstItem.date).toBe('2026-10-05')
    expect(firstItem.meal).toBe('breakfast')
    expect(firstItem.position).toBe(1)
    expect(firstItem.item_display).toBe('White & Brown Bread')

    // Last item
    const lastItem = result.mess_menu_items[result.mess_menu_items.length - 1]
    expect(lastItem.date).toBe('2026-10-11')
    expect(lastItem.meal).toBe('dinner')
    expect(lastItem.position).toBe(9)
    expect(lastItem.item_display).toBe('Ice Cream')

    // 4 meal timings
    expect(result.mess_meal_timings).toHaveLength(4)
    expect(result.mess_meal_timings.map(t => t.meal)).toEqual(['breakfast', 'lunch', 'hi_tea', 'dinner'])
  })

  it('audits spelling corrections properly', () => {
    const result = parseFlatMessMenuWorkbook(fileBuffer)
    expect(result.spellingFixes.length).toBeGreaterThanOrEqual(2)

    const chickenFix = result.spellingFixes.find(f => f.raw.includes('CHICKRN'))
    expect(chickenFix).toBeDefined()
    expect(chickenFix?.display).toBe('Chicken Curry')

    const manchurianFix = result.spellingFixes.find(f => f.raw.includes('Manchurain'))
    expect(manchurianFix).toBeDefined()
    expect(manchurianFix?.display).toBe('Veg Manchurian')
  })

  it('produces zero diff when re-importing the same dataset', () => {
    const result = parseFlatMessMenuWorkbook(fileBuffer)
    const diff = generateMessMenuDiff(result.mess_menu_items, result.mess_menu_items)

    const added = diff.filter(d => d.status === 'added')
    const modified = diff.filter(d => d.status === 'modified')
    const removed = diff.filter(d => d.status === 'removed')
    const unchanged = diff.filter(d => d.status === 'unchanged')

    expect(added).toHaveLength(0)
    expect(modified).toHaveLength(0)
    expect(removed).toHaveLength(0)
    expect(unchanged).toHaveLength(181)
  })

  it('correctly resolves meal timings preferring weekday/weekend over all', () => {
    const timings = [
      { id: '1', meal: 'breakfast' as const, label: 'Breakfast', applies_to: 'all' as const, start_time: '07:30', end_time: '09:30', effective_from: '2026-01-01' },
      { id: '2', meal: 'breakfast' as const, label: 'Sunday Brunch', applies_to: 'weekend' as const, start_time: '08:00', end_time: '10:30', effective_from: '2026-01-01' },
    ]

    // Weekday 2026-10-05 (Monday)
    const monTiming = resolveMealTiming('2026-10-05', 'breakfast', timings)
    expect(monTiming?.start_time).toBe('07:30')

    // Weekend 2026-10-11 (Sunday)
    const sunTiming = resolveMealTiming('2026-10-11', 'breakfast', timings)
    expect(sunTiming?.start_time).toBe('08:00')
    expect(sunTiming?.label).toBe('Sunday Brunch')
  })

  it('builds day menus with accurate aggregation flags', () => {
    const result = parseFlatMessMenuWorkbook(fileBuffer)
    const dayMenus = buildDayMenus('2026-10-05', result.mess_menu_items, result.mess_meal_timings)

    expect(dayMenus).toHaveLength(4)
    const lunch = dayMenus.find(m => m.meal === 'lunch')
    expect(lunch).toBeDefined()
    expect(lunch?.has_non_veg).toBe(true) // Chicken Curry is on 2026-10-05 lunch
    expect(lunch?.start_time).toBe('12:00')
    expect(lunch?.end_time).toBe('14:30')
  })

  it('generates a valid blank template and live export workbook', () => {
    const templateBytes = generateBlankMessMenuTemplate()
    expect(templateBytes.byteLength).toBeGreaterThan(1000)

    const result = parseFlatMessMenuWorkbook(fileBuffer)
    const exportBytes = exportLiveMessMenuToExcel(result.mess_weeks, result.mess_menu_items, result.mess_meal_timings)
    expect(exportBytes.byteLength).toBeGreaterThan(1000)

    // Verify exported workbook is re-parseable
    const reimported = parseFlatMessMenuWorkbook(exportBytes)
    expect(reimported.mess_menu_items).toHaveLength(181)
  })
})
