import { describe, it, expect } from 'vitest'
import { formatInTimeZone } from 'date-fns-tz'

const IST = 'Asia/Kolkata'

// Types mirroring the database and edge function schemas
interface ClassSession {
  id: string
  course_id: string
  program: string
  batch_year: number
  date: string // YYYY-MM-DD
  start_time: string // HH:mm:ss
  status: 'scheduled' | 'rescheduled' | 'cancelled'
  room?: string
  session_no?: number
  course?: {
    code: string
    name: string
    total_sessions?: number
  }
}

interface EventItem {
  id: string
  date: string
  start_at?: string
  type: 'holiday' | 'campus_event' | 'interview' | 'exam'
  program?: string | null
  batch_year?: number | null
}

interface MessDayMeal {
  date: string
  meal: 'breakfast' | 'lunch' | 'hi_tea' | 'dinner'
  label: string
  start_time: string
  items: { name: string; diet: 'veg' | 'non_veg' | 'egg' }[]
  has_non_veg?: boolean
}

interface DueReminderRow {
  kind: 'class' | 'meal' | 'test'
  item_key: string
  program?: string | null
  batch_year?: number | null
  title: string
  body: string
  url: string
  tag: string
  meal_type?: string | null
}

interface UserProfile {
  id: string
  email: string
  program: string
  batch_year: number
}

interface NotificationPrefs {
  user_id: string
  classes: boolean
  meals: boolean
  meal_types: string[]
}

interface PushSubscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  failure_count: number
}

interface NotificationSent {
  id: string
  user_id: string
  kind: 'class' | 'meal' | 'test'
  item_key: string
  sent_at: string
}

/**
 * TypeScript pure implementation of PostgreSQL due_reminders(current_time_override)
 * Mirrors the exact SQL logic in supabase/migrations/0009_push_notification_reminders.sql
 */
function evaluateDueReminders(
  currentTimeOverride: Date,
  sessions: ClassSession[],
  events: EventItem[],
  meals: MessDayMeal[]
): DueReminderRow[] {
  // 1. Calculate now in IST and 1-minute window: [now_ist + 5m, now_ist + 6m)
  const nowIstStr = formatInTimeZone(currentTimeOverride, IST, "yyyy-MM-dd'T'HH:mm:ss")
  const baseTime = new Date(nowIstStr)
  const winStart = new Date(baseTime.getTime() + 5 * 60 * 1000)
  const winEnd = new Date(baseTime.getTime() + 6 * 60 * 1000)

  const results: DueReminderRow[] = []

  // Check Class Sessions
  for (const cs of sessions) {
    if (cs.status === 'cancelled') continue

    const classStart = new Date(`${cs.date}T${cs.start_time.length === 5 ? cs.start_time + ':00' : cs.start_time}`)
    if (classStart.getTime() >= winStart.getTime() && classStart.getTime() < winEnd.getTime()) {
      // Exclude dates that have a holiday or campus_event for this cohort
      const hasHoliday = events.some((ev) => {
        const evDate = ev.start_at
          ? formatInTimeZone(new Date(ev.start_at), IST, 'yyyy-MM-dd')
          : ev.date
        const isMatchDate = evDate === cs.date
        const isHolidayType = ev.type === 'holiday' || ev.type === 'campus_event'
        const isProgramMatch = !ev.program || ev.program === cs.program
        const isBatchMatch = !ev.batch_year || ev.batch_year === cs.batch_year
        return isMatchDate && isHolidayType && isProgramMatch && isBatchMatch
      })

      if (!hasHoliday) {
        const courseCode = cs.course?.code || 'Class'
        const courseName = cs.course?.name || 'Class Session'
        const timeFormatted = cs.start_time.slice(0, 5)

        let body = courseName
        if (cs.session_no != null && cs.course?.total_sessions != null) {
          body += ` · Session ${cs.session_no} of ${cs.course.total_sessions}`
        } else if (cs.session_no != null) {
          body += ` · Session ${cs.session_no}`
        }
        if (cs.room) {
          body += ` · ${cs.room}`
        }

        results.push({
          kind: 'class',
          item_key: cs.id,
          program: cs.program,
          batch_year: cs.batch_year,
          title: `${courseCode} in 5 min · ${timeFormatted}`,
          body,
          url: '/',
          tag: `class-${cs.id}`,
          meal_type: null,
        })
      }
    }
  }

  // Check Meals
  for (const m of meals) {
    if (!m.items || m.items.length === 0) continue

    const mealStart = new Date(`${m.date}T${m.start_time.length === 5 ? m.start_time + ':00' : m.start_time}`)
    if (mealStart.getTime() >= winStart.getTime() && mealStart.getTime() < winEnd.getTime()) {
      const vegDishes = m.items.filter((i) => i.diet === 'veg').slice(0, 3).map((i) => i.name)
      const specialDish = m.items.find((i) => i.diet === 'egg' || i.diet === 'non_veg')

      let body = vegDishes.length > 0 ? vegDishes.join(', ') : 'Campus Meal'
      if (specialDish) {
        body += ` · ${specialDish.name} (${specialDish.diet === 'non_veg' ? 'non-veg' : specialDish.diet})`
      }

      results.push({
        kind: 'meal',
        item_key: `meal:${m.date}:${m.meal}`,
        program: null,
        batch_year: null,
        title: `${m.label} in 5 min · ${m.start_time.slice(0, 5)}`,
        body,
        url: '/mess',
        tag: `meal-${m.date}-${m.meal}`,
        meal_type: m.meal,
      })
    }
  }

  return results
}

/**
 * Simulates Edge Function dispatch targeting, preference filtering, and deduplication
 */
function simulateSendReminders({
  dueItems,
  users,
  prefs,
  subscriptions,
  sentLogs,
  cronSecret,
  providedSecret,
  webPushMock,
}: {
  dueItems: DueReminderRow[]
  users: UserProfile[]
  prefs: Record<string, NotificationPrefs>
  subscriptions: PushSubscription[]
  sentLogs: NotificationSent[]
  cronSecret: string
  providedSecret?: string
  webPushMock?: (sub: PushSubscription) => { status: number }
}) {
  // 1. Verify cron secret
  if (!providedSecret || providedSecret !== cronSecret) {
    return { status: 401, error: 'Unauthorized', sentCount: 0, remainingSubs: [...subscriptions], updatedLogs: [...sentLogs] }
  }

  let sentCount = 0
  const updatedSubs = [...subscriptions]
  const updatedLogs = [...sentLogs]

  for (const item of dueItems) {
    // 2. Identify candidate users
    let targetUsers: UserProfile[] = []
    if (item.kind === 'class') {
      targetUsers = users.filter(
        (u) =>
          (!item.program || u.program === item.program) &&
          (!item.batch_year || u.batch_year === item.batch_year)
      )
    } else {
      // meals are sent to all campus users
      targetUsers = [...users]
    }

    for (const user of targetUsers) {
      // 3. Check notification preferences
      const userPref = prefs[user.id] ?? {
        user_id: user.id,
        classes: true,
        meals: true,
        meal_types: ['breakfast', 'lunch', 'hi_tea', 'dinner'],
      }

      if (item.kind === 'class' && !userPref.classes) continue
      if (item.kind === 'meal') {
        if (!userPref.meals) continue
        if (item.meal_type && !userPref.meal_types.includes(item.meal_type)) continue
      }

      // 4. Check deduplication log (notifications_sent)
      const alreadySent = updatedLogs.some(
        (l) => l.user_id === user.id && l.kind === item.kind && l.item_key === item.item_key
      )
      if (alreadySent) continue

      // 5. Send to user's registered devices
      const userSubs = updatedSubs.filter((s) => s.user_id === user.id)
      let deliveredToAtLeastOne = false

      for (const sub of userSubs) {
        if (webPushMock) {
          const res = webPushMock(sub)
          const status = res.status
          if (status === 410 || status === 404) {
            // Delete defunct subscription
            const idx = updatedSubs.findIndex((s) => s.id === sub.id)
            if (idx !== -1) updatedSubs.splice(idx, 1)
            continue
          } else if (status >= 400) {
            sub.failure_count++
            if (sub.failure_count >= 5) {
              const idx = updatedSubs.findIndex((s) => s.id === sub.id)
              if (idx !== -1) updatedSubs.splice(idx, 1)
            }
            continue
          }
        }
        deliveredToAtLeastOne = true
        sentCount++
      }

      if (deliveredToAtLeastOne || userSubs.length === 0) {
        // Record sent log to prevent re-sending
        updatedLogs.push({
          id: `log-${Date.now()}-${Math.random()}`,
          user_id: user.id,
          kind: item.kind,
          item_key: item.item_key,
          sent_at: new Date().toISOString(),
        })
      }
    }
  }

  return {
    status: 200,
    sentCount,
    remainingSubs: updatedSubs,
    updatedLogs,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Test Suite
// ═════════════════════════════════════════════════════════════════════════════

describe('Push Notification Reminders (Database & Edge Function)', () => {
  const sampleClass: ClassSession = {
    id: 'cs-0900-dem',
    course_id: 'c-dtm',
    program: 'dem',
    batch_year: 2026,
    date: '2026-10-27',
    start_time: '09:00:00',
    status: 'scheduled',
    room: 'CR-7C-15',
    session_no: 9,
    course: {
      code: 'DTM',
      name: 'Digital Transformation Management',
      total_sessions: 10,
    },
  }

  const sampleLunch: MessDayMeal = {
    date: '2026-10-27',
    meal: 'lunch',
    label: 'Lunch',
    start_time: '12:30:00',
    items: [
      { name: 'Punjabi Chole', diet: 'veg' },
      { name: 'Corn Palak', diet: 'veg' },
      { name: 'Jeera Rice', diet: 'veg' },
      { name: 'Egg Bhurji', diet: 'egg' },
    ],
  }

  describe('1. due_reminders() SQL logic with mocked IST times', () => {
    it('returns the 09:00 class for dem/2026 at 2026-10-27 08:55:00 IST', () => {
      // 2026-10-27 08:55:00 IST is 2026-10-27 03:25:00 UTC
      const mockNow = new Date('2026-10-27T08:55:00+05:30')
      const due = evaluateDueReminders(mockNow, [sampleClass], [], [sampleLunch])

      expect(due).toHaveLength(1)
      expect(due[0].kind).toBe('class')
      expect(due[0].item_key).toBe('cs-0900-dem')
      expect(due[0].program).toBe('dem')
      expect(due[0].batch_year).toBe(2026)
      expect(due[0].title).toBe('DTM in 5 min · 09:00')
      expect(due[0].body).toBe('Digital Transformation Management · Session 9 of 10 · CR-7C-15')
      expect(due[0].tag).toBe('class-cs-0900-dem')
      expect(due[0].url).toBe('/')
    })

    it('returns nothing for that class at 08:54 and 08:56 (window is exactly 1 minute [now+5m, now+6m))', () => {
      // At 08:54, window is [08:59, 09:00) -> 09:00 is not < 09:00
      const now854 = new Date('2026-10-27T08:54:00+05:30')
      const due854 = evaluateDueReminders(now854, [sampleClass], [], [])
      expect(due854).toHaveLength(0)

      // At 08:56, window is [09:01, 09:02) -> 09:00 is not >= 09:01
      const now856 = new Date('2026-10-27T08:56:00+05:30')
      const due856 = evaluateDueReminders(now856, [sampleClass], [], [])
      expect(due856).toHaveLength(0)
    })

    it('never returns a cancelled class', () => {
      const mockNow = new Date('2026-10-27T08:55:00+05:30')
      const cancelledClass: ClassSession = { ...sampleClass, status: 'cancelled' }
      const due = evaluateDueReminders(mockNow, [cancelledClass], [], [])
      expect(due).toHaveLength(0)
    })

    it('returns no classes on 2026-10-20 when there is a holiday / campus_event', () => {
      const mockNow = new Date('2026-10-20T08:55:00+05:30')
      const holidayClass: ClassSession = { ...sampleClass, date: '2026-10-20' }
      const holidayEvent: EventItem = {
        id: 'holiday-diwali',
        date: '2026-10-20',
        type: 'holiday',
        program: null, // applies to all
        batch_year: null,
      }

      const due = evaluateDueReminders(mockNow, [holidayClass], [holidayEvent], [])
      expect(due).toHaveLength(0)
    })

    it('does not return a meal that has no items (empty items array)', () => {
      const mockNow = new Date('2026-10-27T12:25:00+05:30')
      const emptyLunch: MessDayMeal = {
        ...sampleLunch,
        items: [],
      }

      const due = evaluateDueReminders(mockNow, [], [], [emptyLunch])
      expect(due).toHaveLength(0)
    })

    it('returns meal reminders using start_time and formats veg + egg/non-veg dishes', () => {
      const mockNow = new Date('2026-10-27T12:25:00+05:30')
      const due = evaluateDueReminders(mockNow, [], [], [sampleLunch])

      expect(due).toHaveLength(1)
      expect(due[0].kind).toBe('meal')
      expect(due[0].item_key).toBe('meal:2026-10-27:lunch')
      expect(due[0].title).toBe('Lunch in 5 min · 12:30')
      expect(due[0].body).toBe('Punjabi Chole, Corn Palak, Jeera Rice · Egg Bhurji (egg)')
      expect(due[0].url).toBe('/mess')
      expect(due[0].tag).toBe('meal-2026-10-27-lunch')
    })
  })

  describe('2. Targeting, Preferences, and Deduplication', () => {
    const userDem: UserProfile = {
      id: 'user-dem',
      email: 'dem@iimu.ac.in',
      program: 'dem',
      batch_year: 2026,
    }
    const userMba: UserProfile = {
      id: 'user-mba',
      email: 'mba@iimu.ac.in',
      program: 'mba',
      batch_year: 2025,
    }

    const defaultPrefs: Record<string, NotificationPrefs> = {
      'user-dem': { user_id: 'user-dem', classes: true, meals: true, meal_types: ['breakfast', 'lunch', 'hi_tea', 'dinner'] },
      'user-mba': { user_id: 'user-mba', classes: true, meals: true, meal_types: ['breakfast', 'lunch', 'hi_tea', 'dinner'] },
    }

    const subscriptions: PushSubscription[] = [
      { id: 'sub-dem-1', user_id: 'user-dem', endpoint: 'https://push.apple.com/dem1', p256dh: 'k1', auth: 'a1', failure_count: 0 },
      { id: 'sub-mba-1', user_id: 'user-mba', endpoint: 'https://push.google.com/mba1', p256dh: 'k2', auth: 'a2', failure_count: 0 },
    ]

    it('cohort targeting: only sends DEM 2026 class reminder to DEM 2026 user', () => {
      const dueClassItem: DueReminderRow = {
        kind: 'class',
        item_key: 'cs-0900-dem',
        program: 'dem',
        batch_year: 2026,
        title: 'DTM in 5 min',
        body: 'Digital Transformation Management',
        url: '/',
        tag: 'class-cs-0900-dem',
      }

      const res = simulateSendReminders({
        dueItems: [dueClassItem],
        users: [userDem, userMba],
        prefs: defaultPrefs,
        subscriptions,
        sentLogs: [],
        cronSecret: 'secret123',
        providedSecret: 'secret123',
      })

      expect(res.sentCount).toBe(1)
      expect(res.updatedLogs).toHaveLength(1)
      expect(res.updatedLogs[0].user_id).toBe('user-dem')
    })

    it('meal reminders: broadcasts to all campus users', () => {
      const dueMealItem: DueReminderRow = {
        kind: 'meal',
        item_key: 'meal:2026-10-27:lunch',
        program: null,
        batch_year: null,
        title: 'Lunch in 5 min',
        body: 'Chole Bhature',
        url: '/mess',
        tag: 'meal-2026-10-27-lunch',
        meal_type: 'lunch',
      }

      const res = simulateSendReminders({
        dueItems: [dueMealItem],
        users: [userDem, userMba],
        prefs: defaultPrefs,
        subscriptions,
        sentLogs: [],
        cronSecret: 'secret123',
        providedSecret: 'secret123',
      })

      expect(res.sentCount).toBe(2)
      expect(res.updatedLogs.map((l) => l.user_id)).toEqual(['user-dem', 'user-mba'])
    })

    it('deduplication: calling dispatch twice for the same item sends once per user', () => {
      const dueClassItem: DueReminderRow = {
        kind: 'class',
        item_key: 'cs-0900-dem',
        program: 'dem',
        batch_year: 2026,
        title: 'DTM in 5 min',
        body: 'Digital Transformation Management',
        url: '/',
        tag: 'class-cs-0900-dem',
      }

      // First run
      const firstRun = simulateSendReminders({
        dueItems: [dueClassItem],
        users: [userDem],
        prefs: defaultPrefs,
        subscriptions,
        sentLogs: [],
        cronSecret: 'secret123',
        providedSecret: 'secret123',
      })
      expect(firstRun.sentCount).toBe(1)
      expect(firstRun.updatedLogs).toHaveLength(1)

      // Second run with updatedLogs passed back in
      const secondRun = simulateSendReminders({
        dueItems: [dueClassItem],
        users: [userDem],
        prefs: defaultPrefs,
        subscriptions,
        sentLogs: firstRun.updatedLogs,
        cronSecret: 'secret123',
        providedSecret: 'secret123',
      })
      expect(secondRun.sentCount).toBe(0) // Deduplicated!
      expect(secondRun.updatedLogs).toHaveLength(1)
    })

    it('preferences: user with meals disabled gets no meal reminder', () => {
      const prefsMealsOff: Record<string, NotificationPrefs> = {
        'user-dem': { user_id: 'user-dem', classes: true, meals: false, meal_types: ['breakfast', 'lunch'] },
      }

      const dueMealItem: DueReminderRow = {
        kind: 'meal',
        item_key: 'meal:2026-10-27:lunch',
        title: 'Lunch in 5 min',
        body: 'Chole',
        url: '/mess',
        tag: 'meal-lunch',
        meal_type: 'lunch',
      }

      const res = simulateSendReminders({
        dueItems: [dueMealItem],
        users: [userDem],
        prefs: prefsMealsOff,
        subscriptions,
        sentLogs: [],
        cronSecret: 'secret123',
        providedSecret: 'secret123',
      })
      expect(res.sentCount).toBe(0)
    })

    it('preferences: meal_types filters specific meals correctly', () => {
      const prefsNoLunch: Record<string, NotificationPrefs> = {
        'user-dem': { user_id: 'user-dem', classes: true, meals: true, meal_types: ['breakfast', 'dinner'] },
      }

      const dueLunch: DueReminderRow = {
        kind: 'meal',
        item_key: 'meal:2026-10-27:lunch',
        title: 'Lunch in 5 min',
        body: 'Chole',
        url: '/mess',
        tag: 'meal-lunch',
        meal_type: 'lunch',
      }
      const dueDinner: DueReminderRow = {
        kind: 'meal',
        item_key: 'meal:2026-10-27:dinner',
        title: 'Dinner in 5 min',
        body: 'Paneer Butter Masala',
        url: '/mess',
        tag: 'meal-dinner',
        meal_type: 'dinner',
      }

      // Lunch should be filtered out
      const resLunch = simulateSendReminders({
        dueItems: [dueLunch],
        users: [userDem],
        prefs: prefsNoLunch,
        subscriptions,
        sentLogs: [],
        cronSecret: 'secret123',
        providedSecret: 'secret123',
      })
      expect(resLunch.sentCount).toBe(0)

      // Dinner should be delivered
      const resDinner = simulateSendReminders({
        dueItems: [dueDinner],
        users: [userDem],
        prefs: prefsNoLunch,
        subscriptions,
        sentLogs: [],
        cronSecret: 'secret123',
        providedSecret: 'secret123',
      })
      expect(resDinner.sentCount).toBe(1)
    })

    it('subscription cleanup: 410 Gone removes defunct subscription', () => {
      const dueMealItem: DueReminderRow = {
        kind: 'meal',
        item_key: 'meal:2026-10-27:lunch',
        title: 'Lunch in 5 min',
        body: 'Chole',
        url: '/mess',
        tag: 'meal-lunch',
        meal_type: 'lunch',
      }

      const res = simulateSendReminders({
        dueItems: [dueMealItem],
        users: [userDem],
        prefs: defaultPrefs,
        subscriptions: [{ ...subscriptions[0] }],
        sentLogs: [],
        cronSecret: 'secret123',
        providedSecret: 'secret123',
        webPushMock: () => ({ status: 410 }), // Device unregistered / uninstalled
      })

      expect(res.remainingSubs).toHaveLength(0) // Deleted
    })

    it('security: wrong or missing x-cron-secret returns 401 Unauthorized', () => {
      const dueClassItem: DueReminderRow = {
        kind: 'class',
        item_key: 'cs-0900-dem',
        title: 'DTM in 5 min',
        body: 'DTM',
        url: '/',
        tag: 'class-1',
      }

      const resMissing = simulateSendReminders({
        dueItems: [dueClassItem],
        users: [userDem],
        prefs: defaultPrefs,
        subscriptions,
        sentLogs: [],
        cronSecret: 'expectedSecret',
        providedSecret: undefined,
      })
      expect(resMissing.status).toBe(401)
      expect(resMissing.sentCount).toBe(0)

      const resWrong = simulateSendReminders({
        dueItems: [dueClassItem],
        users: [userDem],
        prefs: defaultPrefs,
        subscriptions,
        sentLogs: [],
        cronSecret: 'expectedSecret',
        providedSecret: 'wrongSecret',
      })
      expect(resWrong.status).toBe(401)
      expect(resWrong.sentCount).toBe(0)
    })
  })

  describe('3. Timezone Invariance (Asia/Kolkata calculation in UTC vs IST)', () => {
    it('produces identical evaluation whether simulated time is parsed with UTC or IST offset', () => {
      // 08:55:00 IST is 03:25:00 UTC
      const timeInIST = new Date('2026-10-27T08:55:00+05:30')
      const timeInUTC = new Date('2026-10-27T03:25:00.000Z')

      expect(timeInIST.getTime()).toBe(timeInUTC.getTime())

      const resIST = evaluateDueReminders(timeInIST, [sampleClass], [], [])
      const resUTC = evaluateDueReminders(timeInUTC, [sampleClass], [], [])

      expect(resIST).toEqual(resUTC)
      expect(resIST).toHaveLength(1)
      expect(resIST[0].title).toBe('DTM in 5 min · 09:00')
    })
  })
})
