import { motion } from 'framer-motion'
import { springGentle, spring } from '../../lib/motion'

interface BlockedScreenProps {
  attemptedEmail: string | null
  reason: string
  onSwitchAccount: () => Promise<void> | void
}

export function BlockedScreen({ attemptedEmail, reason, onSwitchAccount }: BlockedScreenProps) {
  return (
    <div className="min-h-screen bg-[#FBFBFD] flex flex-col justify-between px-6 py-10 safe-top safe-bottom select-none">
      {/* ── TOP: Campus Badge & Warning Branding ── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springGentle}
        className="flex flex-col items-center text-center pt-6"
      >
        {/* Institute Pill */}
        <div className="inline-flex items-center gap-1.5 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-black/[0.04] px-3.5 py-1 rounded-full mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF9F0A]" />
          <span className="text-[11px] font-bold tracking-wider text-[#6E6E73] uppercase">
            IIM Udaipur
          </span>
        </div>

        {/* Lock/Warning Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...spring, delay: 0.05 }}
          className="relative mb-5"
        >
          <div className="w-[76px] h-[76px] bg-gradient-to-tr from-[#FF9F0A] to-[#FF3B30] rounded-[22px] flex items-center justify-center shadow-[0_8px_24px_rgba(255,159,10,0.25)] border border-white/20">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" className="text-white">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" strokeWidth="2.2"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2.2"/>
            </svg>
          </div>
        </motion.div>

        {/* Title & Reason */}
        <h1 className="text-[26px] font-extrabold text-[#1D1D1F] tracking-tight leading-tight">
          Access Restricted
        </h1>
        <p className="text-sm font-medium text-[#6E6E73] mt-2 max-w-[280px] leading-relaxed">
          {reason || 'This app is currently available only to DEM 2026 students.'}
        </p>
      </motion.div>

      {/* ── MIDDLE: Attempted Email Badge Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springGentle, delay: 0.12 }}
        className="max-w-sm mx-auto w-full"
      >
        <div className="bg-white rounded-[22px] p-4 border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#86868B] uppercase tracking-wider">
              Attempted Account
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF3B30]/10 text-[#FF3B30]">
              Not Authorized
            </span>
          </div>

          <div className="flex items-center gap-3 bg-[#F5F5F7] rounded-xl p-3">
            <div className="w-8 h-8 rounded-full bg-[#E5E5EA] flex items-center justify-center text-xs font-bold text-[#6E6E73]">
              {attemptedEmail ? attemptedEmail.charAt(0).toUpperCase() : '?'}
            </div>
            <p className="text-xs font-semibold text-[#1D1D1F] truncate flex-1 font-mono">
              {attemptedEmail || 'Unknown account'}
            </p>
          </div>

          <p className="text-[11px] text-[#86868B] leading-normal pt-1">
            If you are a student of IIM Udaipur DEM 2026, please sign in with your official <strong className="text-[#1D1D1F]">name.dem2026@iimu.ac.in</strong> email ID.
          </p>
        </div>
      </motion.div>

      {/* ── BOTTOM: Action Area ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springGentle, delay: 0.2 }}
        className="w-full max-w-sm mx-auto flex flex-col gap-3"
      >
        <motion.button
          whileTap={{ scale: 0.98 }}
          transition={spring}
          onClick={onSwitchAccount}
          className="w-full h-[52px] bg-[#1D1D1F] hover:bg-[#2C2C2E] text-white rounded-[18px] font-semibold text-sm flex items-center justify-center gap-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white">
            <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Use a different account</span>
        </motion.button>
      </motion.div>
    </div>
  )
}
