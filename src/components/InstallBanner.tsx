import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isInStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
}

function isSafariBrowser() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'wn-install-dismissed'

function getDismissed(): boolean {
  try { return localStorage.getItem(DISMISSED_KEY) === '1' } catch { return false }
}
function setDismissed() {
  try { localStorage.setItem(DISMISSED_KEY, '1') } catch { /* ignore */ }
}

export function InstallBanner() {
  const [androidPrompt, setAndroidPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOS, setShowIOS] = useState(false)
  const [dismissed, setDismissedState] = useState(getDismissed)

  useEffect(() => {
    if (dismissed || isInStandalone()) return

    const handler = (e: Event) => {
      e.preventDefault()
      setAndroidPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)

    if (isIOS() && isSafariBrowser()) {
      setShowIOS(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [dismissed])

  function dismiss() {
    setDismissed()
    setDismissedState(true)
    setAndroidPrompt(null)
    setShowIOS(false)
  }

  async function installAndroid() {
    if (!androidPrompt) return
    await androidPrompt.prompt()
    const { outcome } = await androidPrompt.userChoice
    if (outcome === 'accepted') dismiss()
    else setAndroidPrompt(null)
  }

  if (dismissed || isInStandalone()) return null

  return (
    <AnimatePresence>
      {androidPrompt && (
        <motion.div
          key="android-banner"
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-50 safe-top bg-white border-b border-border shadow-card"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <img src="/icons/icon-192.png" alt="App icon" className="w-10 h-10 rounded-xl" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary-text">Install What's Next</p>
              <p className="text-xs text-secondary-text">Add to your home screen for the best experience</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={dismiss}
                className="text-xs text-secondary-text px-2 py-1"
              >
                Later
              </button>
              <button
                onClick={installAndroid}
                className="text-xs font-semibold text-white bg-accent px-3 py-1.5 rounded-full"
              >
                Install
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {showIOS && !androidPrompt && (
        <motion.div
          key="ios-banner"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-20 left-4 right-4 z-50 bg-white rounded-2xl shadow-card-hover border border-border p-4"
        >
          <div className="flex items-start gap-3">
            <img src="/icons/icon-192.png" alt="App icon" className="w-12 h-12 rounded-2xl flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-primary-text mb-1">Install What's Next</p>
              <p className="text-xs text-secondary-text leading-relaxed">
                Tap{' '}
                <span className="inline-flex items-center gap-0.5 font-medium text-primary-text">
                  <ShareIcon /> Share
                </span>
                {' '}then{' '}
                <span className="font-medium text-primary-text">Add to Home Screen</span>
                {' '}for the full app experience.
              </p>
            </div>
            <button onClick={dismiss} className="text-secondary-text flex-shrink-0 p-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          {/* Arrow pointing down to tab bar */}
          <div className="mt-3 flex justify-center">
            <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-border" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="inline">
      <path d="M8.59 13.51L15.42 17.49M15.41 6.51L8.59 10.49M21 5C21 6.657 19.657 8 18 8C16.343 8 15 6.657 15 5C15 3.343 16.343 2 18 2C19.657 2 21 3.343 21 5ZM9 12C9 13.657 7.657 15 6 15C4.343 15 3 13.657 3 12C3 10.343 4.343 9 6 9C7.657 9 9 10.343 9 12ZM21 19C21 20.657 19.657 22 18 22C16.343 22 15 20.657 15 19C15 17.343 16.343 16 18 16C19.657 16 21 17.343 21 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}
