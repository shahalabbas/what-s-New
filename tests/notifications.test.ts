import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  formatClassNotification,
  formatMessNotification,
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  getAppLogoUrl,
} from '../src/lib/notifications'
import { useNotifications } from '../src/hooks/useNotifications'
import type { ResolvedSession, MessMenu, MessMenuDay } from '../src/types'

describe('Push Notifications for Classes & Mess Food (5-Min Pre-Alerts)', () => {
  let store: Record<string, string> = {}

  beforeEach(() => {
    store = {}
    const mockStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        store = {}
      },
    }
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('formatClassNotification (5-Min Pre-Alert)', () => {
    const mockSession: ResolvedSession = {
      id: 'session-101',
      course_id: 'CS101',
      session_type: 'regular',
      start_time: '09:00',
      end_time: '10:15',
      room: 'CR-101',
      session_no: 8,
      course: {
        id: 'CS101',
        code: 'DPS',
        name: 'Digital Product Strategy',
        faculty: 'Prof. Rajesh Sharma',
        credits: 3,
        color_tag: '#0A84FF',
        total_sessions: 20,
      },
    }

    it('formats title and body for 5-min pre-alert with app logo and details', () => {
      const payload = formatClassNotification(mockSession)
      expect(payload.title).toBe('📚 Class in 5 Mins: Digital Product Strategy')
      expect(payload.body).toContain('Starts at 9:00 AM')
      expect(payload.body).toContain('Room CR-101')
      expect(payload.body).toContain('Session 8 of 20')
      expect(payload.body).toContain('with Prof. Rajesh Sharma')
      expect(payload.data?.url).toBe('/timetable')
      expect(payload.tag).toBe('class-5m-session-101')
      expect(payload.icon).toContain('/icons/icon-192.png')
      expect(payload.badge).toContain('/icons/icon-192.png')
    })

    it('handles fallback course name and missing faculty gracefully', () => {
      const minimalSession: ResolvedSession = {
        id: 'sess-minimal',
        course_id: 'UNKNOWN',
        session_type: 'regular',
        room: null,
        start_time: '14:00',
        end_time: '15:15',
      }
      const payload = formatClassNotification(minimalSession)
      expect(payload.title).toBe('📚 Class in 5 Mins: UNKNOWN')
      expect(payload.body).toContain('Starts at 2:00 PM')
      expect(payload.body).toContain('CR')
    })
  })

  describe('formatMessNotification (5-Min Pre-Alert with Food Items)', () => {
    const mockMeal: MessMenu = {
      id: 'lunch-1',
      date: '2026-10-15',
      meal: 'lunch',
      start_time: '12:30',
      end_time: '14:30',
      items: ['Paneer Makhani', 'Jeera Rice', 'Gulab Jamun'],
    }

    const mockDayMenu: MessMenuDay = {
      date: '2026-10-15',
      meal: 'lunch',
      label: 'Lunch',
      start_time: '12:30',
      end_time: '14:30',
      has_non_veg: true,
      has_special: true,
      items: [
        { position: 1, name: 'Paneer Butter Masala', raw: 'Paneer Butter Masala', diet: 'veg', is_special: true },
        { position: 2, name: 'Chicken Biryani', raw: 'Chicken Biryani', diet: 'non_veg', is_special: false },
        { position: 3, name: 'Egg Curry', raw: 'Egg Curry', diet: 'egg', is_special: false },
        { position: 4, name: 'Steamed Rice', raw: 'Steamed Rice', diet: 'veg', is_special: false },
      ],
    }

    it('includes 5-min notice, serving hours, full food item list, and app logo', () => {
      const payload = formatMessNotification(mockMeal, mockDayMenu)
      expect(payload.title).toBe('🍽️ Lunch Starts in 5 Mins (12:30 PM – 2:30 PM)')
      expect(payload.body).toContain('Paneer Butter Masala (Special ⭐)')
      expect(payload.body).toContain('Chicken Biryani (Non-Veg 🍗)')
      expect(payload.body).toContain('Egg Curry (Egg 🥚)')
      expect(payload.body).toContain('Steamed Rice')
      expect(payload.data?.url).toBe('/mess')
      expect(payload.tag).toBe('mess-5m-lunch-2026-10-15')
      expect(payload.icon).toContain('/icons/icon-192.png')
      expect(payload.badge).toContain('/icons/icon-192.png')
    })

    it('falls back to string items if dayMenu is omitted', () => {
      const payload = formatMessNotification(mockMeal)
      expect(payload.title).toContain('Lunch Starts in 5 Mins')
      expect(payload.body).toBe('Paneer Makhani, Jeera Rice, Gulab Jamun')
    })

    it('truncates food preview cleanly if items list is very long', () => {
      const longMeal: MessMenu = {
        id: 'dinner-long',
        date: '2026-10-15',
        meal: 'dinner',
        start_time: '19:30',
        end_time: '21:30',
        items: new Array(25).fill('Delicious Royal Delicacy Dish'),
      }
      const payload = formatMessNotification(longMeal)
      expect(payload.body.length).toBeLessThanOrEqual(140)
      expect(payload.body.endsWith('...')).toBe(true)
    })
  })

  describe('Permission & App Logo', () => {
    it('returns official app logo path', () => {
      const logo = getAppLogoUrl()
      expect(logo).toContain('/icons/icon-192.png')
    })

    it('returns unsupported when Notification is not in window', () => {
      const origNotification = (window as any).Notification
      // @ts-ignore
      delete (window as any).Notification
      expect(isNotificationSupported()).toBe(false)
      expect(getNotificationPermission()).toBe('unsupported')
      ;(window as any).Notification = origNotification
    })

    it('returns permission when Notification is in window', () => {
      ;(window as any).Notification = {
        permission: 'granted',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      }
      expect(isNotificationSupported()).toBe(true)
      expect(getNotificationPermission()).toBe('granted')
    })

    it('requests permission properly', async () => {
      const reqMock = vi.fn().mockResolvedValue('granted')
      ;(window as any).Notification = {
        permission: 'default',
        requestPermission: reqMock,
      }
      const result = await requestNotificationPermission()
      expect(reqMock).toHaveBeenCalled()
      expect(result).toBe('granted')
    })
  })

  describe('useNotifications hook', () => {
    beforeEach(() => {
      ;(window as any).Notification = {
        permission: 'granted',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      }
    })

    it('initializes as enabled by default for all registered users', () => {
      const { result } = renderHook(() => useNotifications())
      expect(result.current.classAlertsEnabled).toBe(true)
      expect(result.current.messAlertsEnabled).toBe(true)
      expect(result.current.permission).toBe('granted')
    })

    it('auto-requests permission when autoRequest option is true and permission is default', async () => {
      const reqMock = vi.fn().mockResolvedValue('granted')
      ;(window as any).Notification = {
        permission: 'default',
        requestPermission: reqMock,
      }

      await act(async () => {
        renderHook(() => useNotifications({ autoRequest: true }))
      })
      expect(reqMock).toHaveBeenCalled()
    })
  })
})
