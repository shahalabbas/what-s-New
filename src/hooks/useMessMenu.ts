import { useState, useEffect, useCallback } from 'react'
import { supabase, isConfiguredSupabase } from '../lib/supabase'
import {
  todayIST,
  dayOffsetIST,
  timeToMinutes,
  formatIST,
  nowIST,
  formatTime12,
  formatSmartCountdown,
} from '../lib/timeUtils'
import type { MessMenu, MessMenuDay, MealType } from '../types'
import { getMockMessMenus, getMockDayMenus } from '../lib/mockData'

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'hi_tea', 'dinner']

export interface DisplayMealInfo {
  meal: MessMenu
  dayMenu?: MessMenuDay
  isNowServing: boolean
  isTomorrow: boolean
  timingLabel: string
  hasNonVeg: boolean
  hasSpecial: boolean
}

export function useMessMenu() {
  const [todayMenus, setTodayMenus] = useState<MessMenu[]>(() => getMockMessMenus(todayIST()))
  const [tomorrowMenus, setTomorrowMenus] = useState<MessMenu[]>(() => getMockMessMenus(dayOffsetIST(1)))
  const [todayDayMenus, setTodayDayMenus] = useState<MessMenuDay[]>(() => getMockDayMenus(todayIST()))
  const [tomorrowDayMenus, setTomorrowDayMenus] = useState<MessMenuDay[]>(() => getMockDayMenus(dayOffsetIST(1)))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState<string>(() =>
    formatIST(nowIST(), 'HH:mm')
  )

  const fetchData = useCallback(async (date?: string) => {
    const targetDate = date ?? todayIST()
    const tmrwDate = dayOffsetIST(1)

    if (!isConfiguredSupabase) {
      const tdm = getMockDayMenus(targetDate)
      const tmdm = getMockDayMenus(tmrwDate)
      setTodayDayMenus(tdm)
      setTomorrowDayMenus(tmdm)
      setTodayMenus(getMockMessMenus(targetDate))
      setTomorrowMenus(getMockMessMenus(tmrwDate))
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      // 1. Query mess_menu_day view or items + timings
      const [todayRes, tmrwRes] = await Promise.all([
        supabase
          .from('mess_menu_day')
          .select('*')
          .eq('date', targetDate)
          .order('start_time'),
        supabase
          .from('mess_menu_day')
          .select('*')
          .eq('date', tmrwDate)
          .order('start_time'),
      ])

      if (todayRes.data && todayRes.data.length > 0) {
        const dms: MessMenuDay[] = todayRes.data
        setTodayDayMenus(dms)
        setTodayMenus(dms.map(dm => ({
          id: `m-${dm.meal}-${targetDate}`,
          date: targetDate,
          meal: dm.meal,
          items: dm.items.map(i => i.name),
          start_time: dm.start_time,
          end_time: dm.end_time,
        })))
      } else {
        const tdm = getMockDayMenus(targetDate)
        setTodayDayMenus(tdm)
        setTodayMenus(getMockMessMenus(targetDate))
      }

      if (tmrwRes.data && tmrwRes.data.length > 0) {
        const dms: MessMenuDay[] = tmrwRes.data
        setTomorrowDayMenus(dms)
        setTomorrowMenus(dms.map(dm => ({
          id: `m-${dm.meal}-${tmrwDate}`,
          date: tmrwDate,
          meal: dm.meal,
          items: dm.items.map(i => i.name),
          start_time: dm.start_time,
          end_time: dm.end_time,
        })))
      } else {
        const tmdm = getMockDayMenus(tmrwDate)
        setTomorrowDayMenus(tmdm)
        setTomorrowMenus(getMockMessMenus(tmrwDate))
      }
    } catch {
      const tdm = getMockDayMenus(targetDate)
      const tmdm = getMockDayMenus(tmrwDate)
      setTodayDayMenus(tdm)
      setTomorrowDayMenus(tmdm)
      setTodayMenus(getMockMessMenus(targetDate))
      setTomorrowMenus(getMockMessMenus(tmrwDate))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const tick = () => setCurrentTime(formatIST(nowIST(), 'HH:mm'))
    tick()
    const id = setInterval(tick, 30_000)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick()
      }
    }
    const handleMessUpdated = () => {
      fetchData()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('mess_updated', handleMessUpdated)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('mess_updated', handleMessUpdated)
    }
  }, [fetchData])

  useEffect(() => { fetchData() }, [fetchData])

  const currentMinutes = timeToMinutes(currentTime)

  // 1. Check if any meal is currently being served today
  const activeMeal = todayMenus.find((m) => {
    const start = timeToMinutes(m.start_time)
    const end = timeToMinutes(m.end_time)
    return currentMinutes >= start && currentMinutes < end
  }) ?? null

  // 2. Check for the next upcoming meal today
  const nextMealToday = [...todayMenus]
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
    .find((m) => timeToMinutes(m.start_time) > currentMinutes) ?? null

  // 3. Check for tomorrow's breakfast if past dinner
  const tomorrowBreakfast = tomorrowMenus.find((m) => m.meal === 'breakfast') ?? null

  let displayMeal: DisplayMealInfo | null = null

  if (activeMeal) {
    const activeDayMenu = todayDayMenus.find(dm => dm.meal === activeMeal.meal)
    displayMeal = {
      meal: activeMeal,
      dayMenu: activeDayMenu,
      isNowServing: true,
      isTomorrow: false,
      timingLabel: `Until ${formatTime12(activeMeal.end_time)}`,
      hasNonVeg: activeDayMenu?.has_non_veg ?? false,
      hasSpecial: activeDayMenu?.has_special ?? false,
    }
  } else if (nextMealToday) {
    const startMins = timeToMinutes(nextMealToday.start_time)
    const diffSecs = (startMins - currentMinutes) * 60
    const countdown = formatSmartCountdown(diffSecs)
    const nextDayMenu = todayDayMenus.find(dm => dm.meal === nextMealToday.meal)
    displayMeal = {
      meal: nextMealToday,
      dayMenu: nextDayMenu,
      isNowServing: false,
      isTomorrow: false,
      timingLabel: `at ${formatTime12(nextMealToday.start_time)} · ${countdown}`,
      hasNonVeg: nextDayMenu?.has_non_veg ?? false,
      hasSpecial: nextDayMenu?.has_special ?? false,
    }
  } else if (tomorrowBreakfast) {
    const startMinsTmrw = timeToMinutes(tomorrowBreakfast.start_time)
    const diffSecs = ((1440 - currentMinutes) + startMinsTmrw) * 60
    const countdown = formatSmartCountdown(diffSecs)
    const tmrwDayMenu = tomorrowDayMenus.find(dm => dm.meal === 'breakfast')
    displayMeal = {
      meal: tomorrowBreakfast,
      dayMenu: tmrwDayMenu,
      isNowServing: false,
      isTomorrow: true,
      timingLabel: `Tomorrow at ${formatTime12(tomorrowBreakfast.start_time)} · ${countdown}`,
      hasNonVeg: tmrwDayMenu?.has_non_veg ?? false,
      hasSpecial: tmrwDayMenu?.has_special ?? false,
    }
  }

  return {
    menus: todayMenus,
    tomorrowMenus,
    todayDayMenus,
    tomorrowDayMenus,
    displayMeal,
    loading,
    error,
    refresh: (date?: string) => fetchData(date),
    getCurrentMeal: () => activeMeal,
    getNextMeal: () => nextMealToday,
    mealOrder: MEAL_ORDER,
    getDayMenu: (dateStr: string) => {
      if (dateStr === todayIST()) return todayDayMenus
      if (dateStr === dayOffsetIST(1)) return tomorrowDayMenus
      return getMockDayMenus(dateStr)
    },
  }
}
