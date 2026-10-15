import { useState, useEffect, useCallback } from 'react'

export type ThemePreference = 'system' | 'dark' | 'light'

const THEME_KEY = 'whats_next_theme'

export function useTheme() {
  const [themePref, setThemePref] = useState<ThemePreference>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY) as ThemePreference
      if (stored === 'dark' || stored === 'light' || stored === 'system') {
        return stored
      }
    } catch {}
    return 'system'
  })

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      const stored = localStorage.getItem(THEME_KEY)
      if (stored === 'dark') return true
      if (stored === 'light') return false
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch {
      return false
    }
  })

  // Apply theme to document element and meta theme-color
  const applyTheme = useCallback((isNight: boolean) => {
    setIsDark(isNight)
    if (isNight) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }

    // Update meta theme-color for iOS and Android browser chrome
    const metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', isNight ? '#000000' : '#FFFFFF')
    }
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const updateFromSystem = () => {
      try {
        const stored = localStorage.getItem(THEME_KEY)
        if (!stored || stored === 'system') {
          applyTheme(mediaQuery.matches)
        }
      } catch {
        applyTheme(mediaQuery.matches)
      }
    }

    if (themePref === 'dark') {
      applyTheme(true)
    } else if (themePref === 'light') {
      applyTheme(false)
    } else {
      applyTheme(mediaQuery.matches)
    }

    // Automatically follow phone settings changes in real time
    try {
      mediaQuery.addEventListener('change', updateFromSystem)
      return () => mediaQuery.removeEventListener('change', updateFromSystem)
    } catch {
      mediaQuery.addListener(updateFromSystem)
      return () => mediaQuery.removeListener(updateFromSystem)
    }
  }, [themePref, applyTheme])

  const setTheme = (pref: ThemePreference) => {
    setThemePref(pref)
    try {
      localStorage.setItem(THEME_KEY, pref)
    } catch {}
  }

  return {
    themePref,
    setTheme,
    isDark,
  }
}
