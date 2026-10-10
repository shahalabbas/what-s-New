import { useState, useEffect, useCallback, useRef } from 'react'
import { useOnAppResume } from '../lib/lifecycle'

/**
 * Shared app-wide clock hook:
 * - Ticks every 1s only when hasUrgentCountdown is true (i.e. at least one visible item < 1h away)
 * - Otherwise ticks every 30s to conserve CPU and battery
 * - Pauses on document.visibilitychange ('hidden')
 * - Immediately recalculates upon becoming visible again or on app resume
 */
export function useNow(hasUrgentCountdown: boolean = false): Date {
  const [now, setNow] = useState<Date>(() => new Date())
  const hasUrgentRef = useRef(hasUrgentCountdown)
  hasUrgentRef.current = hasUrgentCountdown

  const updateNow = useCallback(() => {
    setNow(new Date())
  }, [])

  useOnAppResume(() => {
    updateNow()
  })

  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null
    let isDocumentVisible = typeof document !== 'undefined' ? !document.hidden : true

    const startTimer = () => {
      if (timerId) clearInterval(timerId)
      if (!isDocumentVisible) return

      const intervalMs = hasUrgentRef.current ? 1000 : 30000
      timerId = setInterval(() => {
        if (isDocumentVisible) {
          updateNow()
        }
      }, intervalMs)
    }

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return
      isDocumentVisible = !document.hidden
      if (isDocumentVisible) {
        updateNow() // Immediately refresh clock
        startTimer()
      } else {
        if (timerId) {
          clearInterval(timerId)
          timerId = null
        }
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    startTimer()

    return () => {
      if (timerId) clearInterval(timerId)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [hasUrgentCountdown, updateNow])

  return now
}
