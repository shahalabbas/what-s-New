import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

interface InAppNotice {
  id: string
  title: string
  body: string
  url?: string
}

export function InAppNotificationBanner() {
  const [notice, setNotice] = useState<InAppNotice | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handleNotification = (e: Event) => {
      const customEvent = e as CustomEvent<{ title: string; body: string; url?: string }>
      if (customEvent.detail) {
        setNotice({
          id: String(Date.now()),
          title: customEvent.detail.title,
          body: customEvent.detail.body,
          url: customEvent.detail.url || '/',
        })
      }
    }

    window.addEventListener('whats_next_in_app_notification', handleNotification)
    return () => {
      window.removeEventListener('whats_next_in_app_notification', handleNotification)
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => {
      setNotice(null)
    }, 6000)
    return () => clearTimeout(timer)
  }, [notice])

  const handleClick = () => {
    if (notice?.url) {
      navigate(notice.url)
    }
    setNotice(null)
  }

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          key={notice.id}
          initial={{ opacity: 0, y: -40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 450, damping: 30 }}
          className="fixed top-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[420px] z-[9999] cursor-pointer select-none"
          onClick={handleClick}
        >
          <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.18)] flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0A84FF] to-[#0055B3] flex items-center justify-center shrink-0 shadow-sm">
              <span className="text-white text-base">🔔</span>
            </div>

            <div className="flex-1 min-w-0 pr-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-secondary-text mb-0.5">
                <span className="uppercase tracking-wider">What&apos;s Next</span>
                <span>now</span>
              </div>
              <div className="text-sm font-bold text-primary-text leading-snug line-clamp-1">
                {notice.title}
              </div>
              <div className="text-xs text-secondary-text line-clamp-2 mt-0.5 leading-relaxed">
                {notice.body}
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation()
                setNotice(null)
              }}
              className="text-secondary-text hover:text-primary-text p-1 text-xs shrink-0 rounded-lg"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
