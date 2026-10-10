import { useEffect, useRef } from 'react'
import { supabase, isConfiguredSupabase } from './supabase'

type ResumeCallback = () => void | Promise<void>

const resumeListeners = new Set<ResumeCallback>()
let lastTriggerTime = 0
const THROTTLE_MS = 1500 // Don't trigger multiple syncs within 1.5s

let isInitialized = false

function notifyResumeListeners(force: boolean = false) {
  const now = Date.now()
  if (!force && now - lastTriggerTime < THROTTLE_MS) {
    return
  }
  lastTriggerTime = now

  // Silently check/refresh Supabase auth session on app resume
  if (isConfiguredSupabase) {
    try {
      supabase.auth.getSession().catch(() => {})
    } catch {}
  }

  // Notify all registered hook listeners
  resumeListeners.forEach((callback) => {
    try {
      callback()
    } catch (e) {
      console.warn('Error in resume listener:', e)
    }
  })

  // Also dispatch window event for any independent listener
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('app_resume_sync'))
    } catch {}
  }
}

function initLifecycleListeners() {
  if (isInitialized || typeof window === 'undefined') return
  isInitialized = true

  // 1. Visibility change (user unlocks phone, switches tabs or apps)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        notifyResumeListeners()
      }
    })
  }

  // 2. Window focus (user focuses browser window or PWA)
  window.addEventListener('focus', () => {
    notifyResumeListeners()
  })

  // 3. Pageshow (critical for iOS Safari bfcache restore when reopening minimized PWA/tab)
  window.addEventListener('pageshow', () => {
    notifyResumeListeners()
  })

  // 4. Online (phone re-establishes Wi-Fi/cellular connection after sleep or deadzone)
  window.addEventListener('online', () => {
    notifyResumeListeners()
  })

  // 5. Mobile webview / Cordova / Capacitor resume event
  window.addEventListener('resume', () => {
    notifyResumeListeners()
  })
}

/**
 * Register a callback to run whenever the app is restored from background,
 * focused, or brought to the foreground.
 * Returns an unregister function.
 */
export function onAppResume(callback: ResumeCallback): () => void {
  initLifecycleListeners()
  resumeListeners.add(callback)
  return () => {
    resumeListeners.delete(callback)
  }
}

/**
 * React hook that triggers the given callback whenever the user brings the app
 * back to the foreground after minimizing or locking their phone.
 */
export function useOnAppResume(callback: ResumeCallback) {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    return onAppResume(() => {
      cbRef.current()
    })
  }, [])
}

/**
 * Manually trigger app-wide synchronization across all hooks.
 */
export function triggerAppSync(force: boolean = true) {
  notifyResumeListeners(force)
}

export function _resetLifecycleThrottleForTest() {
  lastTriggerTime = 0
}
