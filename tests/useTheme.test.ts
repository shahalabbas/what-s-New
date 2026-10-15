import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from '../src/hooks/useTheme'

describe('useTheme hook & automatic phone settings detection', () => {
  let listeners: Array<() => void> = []
  let matchesDark = false
  let store: Record<string, string> = {}

  beforeEach(() => {
    store = {}
    listeners = []
    matchesDark = false
    document.documentElement.className = ''

    // Ensure mock localStorage
    const mockStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { store = {} },
    }
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
    })

    // Ensure meta[name="theme-color"] exists in test DOM
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      meta.setAttribute('content', '#FFFFFF')
      document.head.appendChild(meta)
    }

    // Mock matchMedia for prefers-color-scheme: dark
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      return {
        get matches() {
          return matchesDark
        },
        media: query,
        onchange: null,
        addListener: vi.fn((fn) => listeners.push(fn)),
        removeListener: vi.fn(),
        addEventListener: vi.fn((_, fn) => listeners.push(fn)),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }
    })
  })

  it('defaults to system preference and applies dark class when phone is in night mode', () => {
    matchesDark = true

    const { result } = renderHook(() => useTheme())

    expect(result.current.themePref).toBe('system')
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    const meta = document.querySelector('meta[name="theme-color"]')
    expect(meta?.getAttribute('content')).toBe('#000000')
  })

  it('defaults to system preference and removes dark class when phone is in light mode', () => {
    matchesDark = false

    const { result } = renderHook(() => useTheme())

    expect(result.current.themePref).toBe('system')
    expect(result.current.isDark).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    const meta = document.querySelector('meta[name="theme-color"]')
    expect(meta?.getAttribute('content')).toBe('#FFFFFF')
  })

  it('automatically updates in real-time when the phone settings change to night mode', () => {
    matchesDark = false
    const { result } = renderHook(() => useTheme())

    expect(result.current.isDark).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    // Simulate user toggling night mode on their phone
    matchesDark = true
    act(() => {
      listeners.forEach((listener) => listener())
    })

    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    const meta = document.querySelector('meta[name="theme-color"]')
    expect(meta?.getAttribute('content')).toBe('#000000')
  })

  it('persists manual dark theme and light theme override when selected', () => {
    matchesDark = false
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.setTheme('dark')
    })

    expect(result.current.themePref).toBe('dark')
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem('whats_next_theme')).toBe('dark')

    act(() => {
      result.current.setTheme('light')
    })

    expect(result.current.themePref).toBe('light')
    expect(result.current.isDark).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem('whats_next_theme')).toBe('light')
  })
})
