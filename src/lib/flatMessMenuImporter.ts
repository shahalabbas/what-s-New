/**
 * Flat Mess Menu Importer
 *
 * Imports 1:1 table-shaped Excel files for weekly mess menus:
 * - mess_weeks: week_key, week_start, week_end, title
 * - mess_menu_items: week_key, date, meal, position, item_raw, item_display, category, diet, is_special, note
 * - mess_meal_timings: meal, label, applies_to, start_time, end_time, effective_from
 *
 * Uses SheetJS without timezone offsets, verifies meal rules, generates visual diffs,
 * provides template generation, and live export.
 */

import * as XLSX from 'xlsx'
import type {
  MessWeek,
  MessMenuItem,
  MessMealTiming,
  MessMenuDay,
  MessMenuDayItem,
  MessDayAudit,
  MessSpellingFix,
  FlatMessMenuParseResult,
  MealType,
  DietType,
  DiffItem,
} from '../types'
import { normalizeDate, normalizeTime } from './flatTimetableImporter'

const VALID_MEALS = new Set<string>(['breakfast', 'lunch', 'hi_tea', 'dinner', 'snacks'])
const VALID_APPLIES_TO = new Set<string>(['all', 'weekday', 'weekend'])

export const DEFAULT_MESS_MEAL_TIMINGS: MessMealTiming[] = [
  { id: 'timing-bf', meal: 'breakfast', label: 'Breakfast', applies_to: 'all', start_time: '07:30', end_time: '09:30', effective_from: '2026-01-01' },
  { id: 'timing-lu', meal: 'lunch', label: 'Lunch', applies_to: 'all', start_time: '12:00', end_time: '14:30', effective_from: '2026-01-01' },
  { id: 'timing-ht', meal: 'hi_tea', label: 'Hi-Tea', applies_to: 'all', start_time: '16:30', end_time: '18:00', effective_from: '2026-01-01' },
  { id: 'timing-di', meal: 'dinner', label: 'Dinner', applies_to: 'all', start_time: '19:30', end_time: '21:30', effective_from: '2026-01-01' },
]

export function normalizeMeal(val: any): MealType | null {
  if (!val) return null
  const str = String(val).trim().toLowerCase().replace(/[\s\-]+/g, '_')
  if (str === 'snacks' || str === 'snack' || str === 'tea' || str === 'hi_tea' || str === 'hitea') {
    return 'hi_tea'
  }
  if (VALID_MEALS.has(str)) {
    return str as MealType
  }
  return null
}

export function normalizeDiet(val: any, rawItem?: string): DietType {
  if (val) {
    const str = String(val).trim().toLowerCase().replace(/[\s\-]+/g, '_')
    if (str === 'non_veg' || str === 'nonveg' || str === 'nv') return 'non_veg'
    if (str === 'egg' || str === 'eggetarian') return 'egg'
    if (str === 'veg' || str === 'vegetarian') return 'veg'
  }
  // Auto-guess diet from raw item text
  if (rawItem) {
    const lower = rawItem.toLowerCase()
    if (/(chicken|mutton|fish|prawn|keema|biryani.*chicken|butter.*chicken)/i.test(lower)) {
      return 'non_veg'
    }
    if (/(egg|omelette|omlet|bhurji|boiled.*egg)/i.test(lower)) {
      return 'egg'
    }
  }
  return 'veg'
}

export function parseFlatMessMenuWorkbook(
  data: ArrayBuffer | Uint8Array | any
): FlatMessMenuParseResult {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data)
  const workbook = XLSX.read(u8, { type: 'array', cellDates: false, cellFormula: true })

  const errors: string[] = []
  const warnings: string[] = []

  const weeks: MessWeek[] = []
  const items: MessMenuItem[] = []
  const timings: MessMealTiming[] = []
  const auditSummary: MessDayAudit[] = []
  const spellingFixes: MessSpellingFix[] = []

  const result: FlatMessMenuParseResult = {
    mess_weeks: weeks,
    mess_menu_items: items,
    mess_meal_timings: timings,
    weeks,
    items,
    timings,
    auditSummary,
    daySummaries: auditSummary,
    spellingFixes,
    warnings,
    errors,
  }

  // Case-insensitive sheet lookup
  const sheetMap = new Map<string, XLSX.WorkSheet>()
  workbook.SheetNames.forEach((name) => {
    sheetMap.set(name.toLowerCase().trim(), workbook.Sheets[name])
  })

  const weeksWs = sheetMap.get('mess_weeks') || sheetMap.get('weeks')
  const itemsWs = sheetMap.get('mess_menu_items') || sheetMap.get('menu_items') || sheetMap.get('items')
  const timingsWs = sheetMap.get('mess_meal_timings') || sheetMap.get('meal_timings') || sheetMap.get('timings')

  if (!weeksWs) {
    errors.push('Missing required sheet: "mess_weeks"')
  }
  if (!itemsWs) {
    errors.push('Missing required sheet: "mess_menu_items"')
  }
  if (!timingsWs) {
    errors.push('Missing required sheet: "mess_meal_timings"')
  }

  if (errors.length > 0) {
    return result
  }

  // 1. Parse `mess_weeks`
  const weekRows: any[] = XLSX.utils.sheet_to_json(weeksWs!, { defval: null })
  if (weekRows.length === 0) {
    errors.push('"mess_weeks" sheet is empty. At least one week record is required.')
  }

  const weeksMap = new Map<string, MessWeek>()
  for (let i = 0; i < weekRows.length; i++) {
    const r = weekRows[i]
    const rowNum = i + 2
    const weekKey = String(r.week_key || '').trim()
    const weekStart = normalizeDate(r.week_start)
    const weekEnd = normalizeDate(r.week_end)
    const title = String(r.title || `Week ${weekKey}`).trim()

    if (!weekKey) {
      errors.push(`mess_weeks row ${rowNum}: missing "week_key"`)
      continue
    }
    if (!weekStart) {
      errors.push(`mess_weeks row ${rowNum} (${weekKey}): missing or invalid "week_start"`)
    }
    if (!weekEnd) {
      errors.push(`mess_weeks row ${rowNum} (${weekKey}): missing or invalid "week_end"`)
    }
    if (weekStart && weekEnd && weekStart > weekEnd) {
      errors.push(`mess_weeks row ${rowNum} (${weekKey}): week_end (${weekEnd}) is before week_start (${weekStart})`)
    }

    const weekObj: MessWeek = {
      id: `mw-${weekKey}`,
      week_key: weekKey,
      week_start: weekStart || '',
      week_end: weekEnd || '',
      title,
    }

    weeksMap.set(weekKey, weekObj)
    weeks.push(weekObj)
  }

  // 2. Parse `mess_meal_timings`
  const timingRows: any[] = XLSX.utils.sheet_to_json(timingsWs!, { defval: null })
  for (let i = 0; i < timingRows.length; i++) {
    const r = timingRows[i]
    const rowNum = i + 2
    const meal = normalizeMeal(r.meal)
    const label = String(r.label || r.meal || '').trim()
    const appliesTo = (String(r.applies_to || 'all').trim().toLowerCase()) as 'all' | 'weekday' | 'weekend'
    const startTime = normalizeTime(r.start_time)
    const endTime = normalizeTime(r.end_time)
    const effectiveFrom = normalizeDate(r.effective_from) || '2026-01-01'

    if (!meal) {
      errors.push(`mess_meal_timings row ${rowNum}: invalid meal "${r.meal}". Allowed: breakfast, lunch, hi_tea, dinner`)
      continue
    }
    if (!VALID_APPLIES_TO.has(appliesTo)) {
      errors.push(`mess_meal_timings row ${rowNum}: invalid applies_to "${r.applies_to}". Allowed: all, weekday, weekend`)
    }
    if (!startTime) {
      errors.push(`mess_meal_timings row ${rowNum} (${meal}): missing or invalid "start_time"`)
    }
    if (!endTime) {
      errors.push(`mess_meal_timings row ${rowNum} (${meal}): missing or invalid "end_time"`)
    }
    if (startTime && endTime && startTime >= endTime) {
      errors.push(`mess_meal_timings row ${rowNum} (${meal}): end_time (${endTime}) must be after start_time (${startTime})`)
    }

    const timingObj: MessMealTiming = {
      id: `timing-${meal}-${appliesTo}-${effectiveFrom}`,
      meal,
      label: label || meal,
      applies_to: appliesTo,
      start_time: startTime || '00:00',
      end_time: endTime || '00:00',
      effective_from: effectiveFrom,
    }

    timings.push(timingObj)
  }

  // 3. Parse `mess_menu_items`
  const itemRows: any[] = XLSX.utils.sheet_to_json(itemsWs!, { defval: null })
  if (itemRows.length === 0) {
    errors.push('"mess_menu_items" sheet is empty. Menu items are required.')
  }

  const seenItemKeys = new Set<string>()
  const itemsByDate = new Map<string, MessMenuItem[]>()

  for (let i = 0; i < itemRows.length; i++) {
    const r = itemRows[i]
    const rowNum = i + 2
    const weekKey = String(r.week_key || '').trim()
    const date = normalizeDate(r.date)
    const meal = normalizeMeal(r.meal)
    const position = Number(r.position)
    const itemRaw = r.item_raw !== null && r.item_raw !== undefined ? String(r.item_raw).trim() : ''
    const itemDisplay = r.item_display !== null && r.item_display !== undefined && String(r.item_display).trim() !== ''
      ? String(r.item_display).trim()
      : itemRaw
    const category = r.category ? String(r.category).trim() : null
    const diet = normalizeDiet(r.diet, itemRaw)
    const isSpecial = r.is_special === true || String(r.is_special).trim().toLowerCase() === 'true' || Number(r.is_special) === 1
    const note = r.note ? String(r.note).trim() : null

    // Validations
    if (!weekKey || !weeksMap.has(weekKey)) {
      errors.push(`mess_menu_items row ${rowNum}: unknown week_key "${weekKey}"`)
    }
    if (!date) {
      errors.push(`mess_menu_items row ${rowNum}: missing or invalid "date"`)
    }
    if (!meal) {
      errors.push(`mess_menu_items row ${rowNum}: invalid meal "${r.meal}". Allowed: breakfast, lunch, hi_tea, dinner`)
    }
    if (isNaN(position) || position < 1) {
      errors.push(`mess_menu_items row ${rowNum}: position must be a positive number (>= 1)`)
    }
    if (!itemRaw) {
      errors.push(`mess_menu_items row ${rowNum}: missing "item_raw"`)
    }

    // Check date falls in week
    const week = weeksMap.get(weekKey)
    if (week && date) {
      if (date < week.week_start || date > week.week_end) {
        errors.push(`mess_menu_items row ${rowNum}: date ${date} is outside week range (${week.week_start} to ${week.week_end})`)
      }
    }

    // Check unique (date, meal, position)
    if (date && meal && !isNaN(position)) {
      const uqKey = `${date}:${meal}:${position}`
      if (seenItemKeys.has(uqKey)) {
        errors.push(`mess_menu_items row ${rowNum}: duplicate item position ${position} for ${meal} on ${date}`)
      } else {
        seenItemKeys.add(uqKey)
      }
    }

    // Track spelling fixes
    if (itemRaw && itemDisplay && itemRaw !== itemDisplay) {
      spellingFixes.push({
        date: date || '',
        meal: meal || 'breakfast',
        raw: itemRaw,
        display: itemDisplay,
        count: 1,
      })
    }

    const itemObj: MessMenuItem = {
      id: `mmi-${date}-${meal}-${position}`,
      week_key: weekKey,
      date: date || '',
      day: r.day ? String(r.day).trim() : undefined,
      meal: meal || 'breakfast',
      position: position || 1,
      item_raw: itemRaw,
      item_display: itemDisplay,
      category,
      diet,
      is_special: isSpecial,
      note,
      fix_note: r.fix_note ? String(r.fix_note).trim() : null,
    }

    items.push(itemObj)

    if (date) {
      if (!itemsByDate.has(date)) {
        itemsByDate.set(date, [])
      }
      itemsByDate.get(date)!.push(itemObj)
    }
  }

  // 4. Audit & Day Summaries
  const sortedDates = Array.from(itemsByDate.keys()).sort()
  for (const dt of sortedDates) {
    const dayItems = itemsByDate.get(dt)!
    const bf = dayItems.filter(i => i.meal === 'breakfast')
    const lu = dayItems.filter(i => i.meal === 'lunch')
    const ht = dayItems.filter(i => i.meal === 'hi_tea')
    const di = dayItems.filter(i => i.meal === 'dinner')
    const eggOrNonVeg = dayItems.filter(i => i.diet === 'egg' || i.diet === 'non_veg')
    const specials = dayItems.filter(i => i.is_special)

    const dateObj = new Date(dt + 'T00:00:00')
    const dayName = dateObj.toLocaleDateString('en-IN', { weekday: 'long' })

    // Warnings for empty or short meals
    if (bf.length === 0) warnings.push(`${dt} (${dayName}) has 0 breakfast items`)
    if (lu.length === 0) warnings.push(`${dt} (${dayName}) has 0 lunch items`)
    if (ht.length === 0) warnings.push(`${dt} (${dayName}) has 0 hi-tea items`)
    if (di.length === 0) warnings.push(`${dt} (${dayName}) has 0 dinner items`)

    auditSummary.push({
      date: dt,
      day: dayName,
      dayName,
      breakfast: bf.length,
      lunch: lu.length,
      hi_tea: ht.length,
      dinner: di.length,
      total: dayItems.length,
      non_veg: eggOrNonVeg.length,
      specials: specials.length,
      breakfastCount: bf.length,
      lunchCount: lu.length,
      hiTeaCount: ht.length,
      dinnerCount: di.length,
      totalItems: dayItems.length,
      eggOrNonVegCount: eggOrNonVeg.length,
      specialsCount: specials.length,
    })
  }

  return result
}

// ─── Resolve Timings for a Given Date & Meal ──────────────────────────────────

export function resolveMealTiming(
  arg1: MealType | string,
  arg2: MealType | string,
  timings: MessMealTiming[] = DEFAULT_MESS_MEAL_TIMINGS
): { label: string; start_time: string; end_time: string } {
  let meal: MealType
  let dateStr: string

  if (String(arg1).includes('-')) {
    dateStr = String(arg1)
    meal = normalizeMeal(arg2) || 'breakfast'
  } else {
    meal = normalizeMeal(arg1) || 'breakfast'
    dateStr = String(arg2)
  }

  const dateObj = new Date(dateStr + 'T00:00:00')
  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6

  // Find matches with effective_from <= dateStr
  const applicable = (timings || []).filter(t => t.meal === meal && t.effective_from <= dateStr)

  // Sort by specificity (weekend/weekday match first, then 'all'), then latest effective_from
  applicable.sort((a, b) => {
    const aMatch = (isWeekend && a.applies_to === 'weekend') || (!isWeekend && a.applies_to === 'weekday')
    const bMatch = (isWeekend && b.applies_to === 'weekend') || (!isWeekend && b.applies_to === 'weekday')
    if (aMatch && !bMatch) return -1
    if (!aMatch && bMatch) return 1
    return b.effective_from.localeCompare(a.effective_from)
  })

  const matched = applicable[0]
  if (matched) {
    return {
      label: matched.label,
      start_time: matched.start_time.slice(0, 5),
      end_time: matched.end_time.slice(0, 5),
    }
  }

  const fallback = DEFAULT_MESS_MEAL_TIMINGS.find(t => t.meal === meal)
  return {
    label: fallback?.label || meal,
    start_time: fallback ? fallback.start_time.slice(0, 5) : '08:00',
    end_time: fallback ? fallback.end_time.slice(0, 5) : '10:00',
  }
}

// ─── Build Daily Menus (MessMenuDay) from Items & Timings ─────────────────────

export function buildDayMenus(
  dateStr: string,
  items: MessMenuItem[] = [],
  timings: MessMealTiming[] = DEFAULT_MESS_MEAL_TIMINGS
): MessMenuDay[] {
  const dayItems = (items || []).filter(i => i.date === dateStr)
  const meals: MealType[] = ['breakfast', 'lunch', 'hi_tea', 'dinner']

  return meals.map(meal => {
    const mealItems = dayItems
      .filter(i => i.meal === meal)
      .sort((a, b) => a.position - b.position)

    const timing = resolveMealTiming(meal, dateStr, timings)
    const formattedItems: MessMenuDayItem[] = mealItems.map(i => ({
      position: i.position,
      name: i.item_display,
      raw: i.item_raw,
      category: i.category,
      diet: i.diet,
      is_special: i.is_special,
      note: i.note,
    }))

    return {
      date: dateStr,
      meal,
      label: timing.label,
      start_time: timing.start_time,
      end_time: timing.end_time,
      items: formattedItems,
      has_non_veg: formattedItems.some(i => i.diet === 'non_veg' || i.diet === 'egg'),
      has_special: formattedItems.some(i => i.is_special),
    }
  })
}

// ─── Diff Generator ───────────────────────────────────────────────────────────

export function generateMessMenuDiff(
  currentItems: MessMenuItem[] = [],
  incomingItems: MessMenuItem[] = []
): DiffItem<MessMenuItem>[] {
  const currentList = currentItems || []
  const incomingList = incomingItems || []

  const currentMap = new Map<string, MessMenuItem>()
  currentList.forEach(i => currentMap.set(`${i.date}:${i.meal}:${i.position}`, i))

  const incomingMap = new Map<string, MessMenuItem>()
  incomingList.forEach(i => incomingMap.set(`${i.date}:${i.meal}:${i.position}`, i))

  const diffs: DiffItem<MessMenuItem>[] = []

  // Check incoming items against current
  incomingList.forEach(inc => {
    const key = `${inc.date}:${inc.meal}:${inc.position}`
    const curr = currentMap.get(key)
    if (!curr) {
      diffs.push({ status: 'added', incoming: inc })
    } else {
      const changes: string[] = []
      if (curr.item_display !== inc.item_display) changes.push(`item: "${curr.item_display}" -> "${inc.item_display}"`)
      if (curr.diet !== inc.diet) changes.push(`diet: ${curr.diet} -> ${inc.diet}`)
      if (curr.is_special !== inc.is_special) changes.push(`special: ${curr.is_special} -> ${inc.is_special}`)
      if (curr.note !== inc.note) changes.push(`note: "${curr.note}" -> "${inc.note}"`)

      if (changes.length > 0) {
        diffs.push({ status: 'modified', current: curr, incoming: inc, changes })
      } else {
        diffs.push({ status: 'unchanged', current: curr, incoming: inc })
      }
    }
  })

  // Check removed items
  currentList.forEach(curr => {
    const key = `${curr.date}:${curr.meal}:${curr.position}`
    if (!incomingMap.has(key)) {
      diffs.push({ status: 'removed', current: curr })
    }
  })

  return diffs
}

// ─── Blank Template & Export ──────────────────────────────────────────────────

export function generateBlankMessMenuTemplate(): Uint8Array {
  const wb = XLSX.utils.book_new()

  const sampleWeeks = [
    { week_key: 'week_2026_10_12', week_start: '2026-10-12', week_end: '2026-10-18', title: 'Mess Menu Oct 12 - Oct 18, 2026' },
  ]
  const sampleItems = [
    { week_key: 'week_2026_10_12', date: '2026-10-12', day: 'Monday', meal: 'breakfast', position: 1, item_raw: 'Idli & Sambar', item_display: 'Idli & Sambar', category: 'Main', diet: 'veg', is_special: false, note: null, fix_note: null },
    { week_key: 'week_2026_10_12', date: '2026-10-12', day: 'Monday', meal: 'lunch', position: 1, item_raw: 'Dal Tadka', item_display: 'Dal Tadka', category: 'Dal', diet: 'veg', is_special: false, note: null, fix_note: null },
    { week_key: 'week_2026_10_12', date: '2026-10-12', day: 'Monday', meal: 'hi_tea', position: 1, item_raw: 'Samosa', item_display: 'Samosa (1 pc)', category: 'Snack', diet: 'veg', is_special: false, note: null, fix_note: null },
    { week_key: 'week_2026_10_12', date: '2026-10-12', day: 'Monday', meal: 'dinner', position: 1, item_raw: 'Phulka Roti', item_display: 'Phulka Roti', category: 'Breads', diet: 'veg', is_special: false, note: null, fix_note: null },
  ]
  const sampleTimings = [
    { meal: 'breakfast', label: 'Breakfast', applies_to: 'all', start_time: '07:30', end_time: '09:30', effective_from: '2026-01-01' },
    { meal: 'lunch', label: 'Lunch', applies_to: 'all', start_time: '12:00', end_time: '14:30', effective_from: '2026-01-01' },
    { meal: 'hi_tea', label: 'Hi-Tea', applies_to: 'all', start_time: '16:30', end_time: '18:00', effective_from: '2026-01-01' },
    { meal: 'dinner', label: 'Dinner', applies_to: 'all', start_time: '19:30', end_time: '21:30', effective_from: '2026-01-01' },
  ]

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sampleWeeks), 'mess_weeks')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sampleItems), 'mess_menu_items')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sampleTimings), 'mess_meal_timings')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Mess Menu Import Instructions'],
    ['1. Sheets: mess_weeks, mess_menu_items, mess_meal_timings'],
    ['2. Meals allowed: breakfast, lunch, hi_tea, dinner'],
    ['3. Diets allowed: veg, egg, non_veg'],
  ]), 'README')

  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

export function exportLiveMessMenuToExcel(
  weeks: MessWeek[],
  items: MessMenuItem[],
  timings: MessMealTiming[] = DEFAULT_MESS_MEAL_TIMINGS
): Uint8Array {
  const wb = XLSX.utils.book_new()

  const weeksData = (weeks || []).map(w => ({
    week_key: w.week_key,
    week_start: w.week_start,
    week_end: w.week_end,
    title: w.title,
  }))

  const itemsData = (items || []).map(i => ({
    week_key: i.week_key || 'week_current',
    date: i.date,
    day: i.day || new Date(i.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long' }),
    meal: i.meal,
    position: i.position,
    item_raw: i.item_raw,
    item_display: i.item_display,
    category: i.category || '',
    diet: i.diet,
    is_special: i.is_special,
    note: i.note || '',
    fix_note: i.fix_note || '',
  }))

  const timingsData = (timings || []).map(t => ({
    meal: t.meal,
    label: t.label,
    applies_to: t.applies_to,
    start_time: t.start_time.slice(0, 5),
    end_time: t.end_time.slice(0, 5),
    effective_from: t.effective_from,
  }))

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weeksData), 'mess_weeks')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemsData), 'mess_menu_items')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(timingsData), 'mess_meal_timings')

  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

export const exportMessWeekToExcel = exportLiveMessMenuToExcel
