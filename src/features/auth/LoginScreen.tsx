import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { springGentle, spring } from '../../lib/motion'
import { AppLogo } from '../../components/AppLogo'

const DOMAIN = import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || 'iimu.ac.in'

interface LoginScreenProps {
  onLogin: () => Promise<{ success: boolean; error?: string } | void> | void
  onSimulateEmailLogin?: (email: string) => void
  domainError?: boolean
}

export function LoginScreen({ onLogin, onSimulateEmailLogin, domainError }: LoginScreenProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showAccountChooser, setShowAccountChooser] = useState(false)
  const [customEmail, setCustomEmail] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleGoogleClick = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const result = await onLogin()
      if (result && typeof result === 'object' && result.success === false) {
        // Live Supabase Google OAuth not configured or had error — open email input
        setIsLoading(false)
        setShowAccountChooser(true)
        if (result.error && result.error !== 'supabase_not_configured') {
          console.warn('Google sign-in notice:', result.error)
        }
      }
    } catch {
      setIsLoading(false)
      setShowAccountChooser(true)
    }
  }

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customEmail.trim()) return
    let emailToUse = customEmail.trim().toLowerCase()
    if (!emailToUse.includes('@')) {
      emailToUse = `${emailToUse}@${DOMAIN}`
    }
    setIsLoading(true)
    setShowAccountChooser(false)
    if (onSimulateEmailLogin) {
      onSimulateEmailLogin(emailToUse)
    }
  }

  const features = [
    {
      icon: '🎓',
      title: 'Live Timetable',
      desc: 'Real-time class progress, room numbers & faculty updates',
      color: 'from-blue-500/10 to-indigo-500/5',
      border: 'border-blue-500/10',
    },
    {
      icon: '🍽',
      title: 'Mess Menus',
      desc: "Today's dishes, live meal status & breakfast rollover",
      color: 'from-amber-500/10 to-orange-500/5',
      border: 'border-amber-500/10',
    },
    {
      icon: '📁',
      title: 'Project Deadlines',
      desc: 'Assignment countdowns, submission links & groups',
      color: 'from-emerald-500/10 to-teal-500/5',
      border: 'border-emerald-500/10',
    },
    {
      icon: '💼',
      title: 'Placement Hub',
      desc: 'Campus job openings, Superset deadlines & stage tracking',
      color: 'from-purple-500/10 to-pink-500/5',
      border: 'border-purple-500/10',
    },
  ]

  return (
    <div className="min-h-screen bg-[#FBFBFD] flex flex-col justify-between px-6 py-10 safe-top safe-bottom select-none">
      {/* ── TOP: Campus Badge & App Branding ── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springGentle}
        className="flex flex-col items-center text-center pt-2"
      >
        {/* Institute Pill */}
        <div className="inline-flex items-center gap-1.5 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-black/[0.04] px-3.5 py-1 rounded-full mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0A84FF]" />
          <span className="text-[11px] font-bold tracking-wider text-[#6E6E73] uppercase">
            IIM Udaipur
          </span>
        </div>

        {/* App Squircle Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...spring, delay: 0.05 }}
          className="relative mb-4"
        >
          <AppLogo size={78} className="shadow-[0_10px_28px_rgba(10,37,64,0.3)] rounded-[22px]" />
        </motion.div>

        {/* App Title & Tagline */}
        <h1 className="text-[32px] font-extrabold text-[#1D1D1F] tracking-tight leading-none">
          What's Next
        </h1>
        <p className="text-sm font-medium text-[#6E6E73] mt-2 max-w-[260px] leading-snug">
          Your daily campus companion for classes, meals & prep
        </p>
      </motion.div>

      {/* ── MIDDLE: Value Proposition Cards ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springGentle, delay: 0.12 }}
        className="grid grid-cols-2 gap-2.5 my-6 max-w-sm mx-auto w-full"
      >
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springGentle, delay: 0.15 + i * 0.04 }}
            className={`bg-white/80 backdrop-blur-md rounded-[20px] p-3.5 border ${f.border} shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[105px]`}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{f.icon}</span>
              <div className={`w-2 h-2 rounded-full bg-gradient-to-br ${f.color}`} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#1D1D1F] leading-tight">
                {f.title}
              </h3>
              <p className="text-[10px] font-medium text-[#86868B] leading-tight mt-1 line-clamp-2">
                {f.desc}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── BOTTOM: Sign In Action Area ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springGentle, delay: 0.25 }}
        className="w-full max-w-sm mx-auto flex flex-col gap-3"
      >
        {/* Error Notice */}
        <AnimatePresence>
          {(domainError || errorMessage) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-[#FF3B30]/10 border border-[#FF3B30]/20 rounded-2xl p-3.5 text-center"
            >
              <p className="text-xs font-semibold text-[#FF3B30]">
                {errorMessage || `Access restricted to @${DOMAIN} accounts only.`}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Primary Google Login Button */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          transition={spring}
          onClick={handleGoogleClick}
          disabled={isLoading}
          className="w-full h-[54px] bg-[#1D1D1F] hover:bg-[#2C2C2E] active:bg-[#000000] text-white rounded-[18px] font-semibold text-sm flex items-center justify-center gap-3 shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-all disabled:opacity-75 relative overflow-hidden cursor-pointer"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <GoogleLogo />
              <span>Continue with Google</span>
            </>
          )}
        </motion.button>

        {/* Alternative Direct Sign In */}
        <button
          type="button"
          onClick={() => setShowAccountChooser(true)}
          className="w-full text-center text-xs font-semibold text-[#007AFF] hover:underline pt-0.5 cursor-pointer"
        >
          Sign in with Email or Admin Account →
        </button>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#86868B]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-[#34C759]">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2"/>
          </svg>
          <span>Restricted to verified <strong className="text-[#1D1D1F]">@{DOMAIN}</strong> accounts</span>
        </div>
      </motion.div>

      {/* ── Official Google / Email Account Chooser Modal ── */}
      <AnimatePresence>
        {showAccountChooser && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.96 }}
              transition={springGentle}
              className="bg-white rounded-[28px] p-6 max-w-sm w-full shadow-2xl space-y-4 border border-border"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border/70 pb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#007AFF]/10 flex items-center justify-center text-sm font-bold text-[#007AFF]">
                    🎓
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[#1D1D1F]">IIM Udaipur Account</h3>
                    <p className="text-[11px] text-[#6E6E73]">Choose an account for What's Next</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAccountChooser(false)}
                  className="w-7 h-7 rounded-full bg-surface text-secondary-text hover:text-primary-text flex items-center justify-center text-xs font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Quick Profile Selectors */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Sign In</p>
                <button
                  type="button"
                  onClick={() => {
                    setShowAccountChooser(false)
                    onSimulateEmailLogin?.('shahalabbas.dem2026@iimu.ac.in')
                  }}
                  className="w-full text-left p-3 rounded-2xl bg-surface hover:bg-slate-100 transition-colors flex items-center gap-3 border border-border/50"
                >
                  <div className="w-9 h-9 rounded-full bg-[#007AFF] text-white flex items-center justify-center font-bold text-xs">
                    S
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 truncate">Shahal Abbas</p>
                    <p className="text-[10px] font-mono text-slate-500 truncate">shahalabbas.dem2026@iimu.ac.in</p>
                  </div>
                  <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">Student</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAccountChooser(false)
                    onSimulateEmailLogin?.('admin@iimu.ac.in')
                  }}
                  className="w-full text-left p-3 rounded-2xl bg-surface hover:bg-slate-100 transition-colors flex items-center gap-3 border border-border/50"
                >
                  <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                    A
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 truncate">Program Admin</p>
                    <p className="text-[10px] font-mono text-slate-500 truncate">admin@iimu.ac.in</p>
                  </div>
                  <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Admin</span>
                </button>
              </div>

              {/* Email Input Form */}
              <form onSubmit={handleCustomSubmit} className="space-y-3 pt-2 border-t border-border/50">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-secondary-text">
                    Or enter any IIMU email
                  </label>
                  <input
                    type="email"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="name.dem2026@iimu.ac.in"
                    className="w-full bg-surface rounded-xl px-3.5 py-2.5 text-xs text-primary-text font-mono outline-none focus:ring-2 focus:ring-accent/30 border border-border placeholder:text-secondary-text/60"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAccountChooser(false)}
                    className="flex-1 py-2.5 bg-surface text-secondary-text rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!customEmail.trim()}
                    className="flex-1 py-2.5 bg-accent text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50"
                  >
                    Continue
                  </button>
                </div>
              </form>

              {/* Privacy Footer */}
              <div className="pt-1 text-[10px] text-[#86868B] leading-relaxed text-center">
                Access is restricted to authorized DEM 2026 students and administrators of IIM Udaipur.
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="flex-shrink-0">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}
