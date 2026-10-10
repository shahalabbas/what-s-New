import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlacements } from '../../hooks/usePlacements'
import { useNow } from '../../hooks/useNow'
import { fadeRise, stagger } from '../../lib/motion'
import { ListSkeleton } from '../../components/Skeleton'
import { formatPlacementCountdown, formatPlacementDeadline } from '../../lib/timeUtils'
import { PlacementDetailModal } from '../dashboard/PlacementDeadlineWidget'
import type { PlacementOpportunity, StudentApplicationStatus } from '../../types'

type PlacementTab = 'open' | 'applied' | 'closed'

export function PlacementsScreen() {
  const [activeTab, setActiveTab] = useState<PlacementTab>('open')
  const {
    openOpportunities,
    closedOpportunities,
    opportunities,
    loading,
    search,
    setSearch,
    setApplicationStatus,
    refresh,
  } = usePlacements()

  const [selectedOpening, setSelectedOpening] = useState<PlacementOpportunity | null>(null)

  // Clock for live countdown ticking
  const hasUrgent = openOpportunities.some((o) => {
    if (!o.deadline_at) return false
    const diff = new Date(o.deadline_at).getTime() - Date.now()
    return diff > 0 && diff < 3600000
  })
  const now = useNow(hasUrgent)

  // Applications where student marked 'applied' or 'interested'
  const appliedOpportunities = opportunities.filter((o) => {
    const status = o.student_application?.status
    return status === 'applied' || status === 'interested'
  })

  // Filter list based on selected tab
  const displayList =
    activeTab === 'open'
      ? openOpportunities
      : activeTab === 'applied'
      ? appliedOpportunities
      : closedOpportunities

  return (
    <div className="min-h-screen bg-surface pb-tab-bar select-none">
      {/* Header */}
      <div className="bg-white px-5 pt-safe-top pb-3 border-b border-border sticky top-0 z-20">
        <div className="pt-3 pb-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-primary-text tracking-tight">Placements</h1>
            <p className="text-xs text-secondary-text mt-0.5">Campus Opportunities & Deadlines</p>
          </div>
          <button
            onClick={() => refresh()}
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-xs text-secondary-text hover:text-primary-text transition-colors"
            title="Refresh"
          >
            🔄
          </button>
        </div>

        {/* Segmented Filter Tabs */}
        <div className="flex bg-surface p-1 rounded-xl mb-3 border border-border gap-1">
          <button
            onClick={() => setActiveTab('open')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'open'
                ? 'bg-white text-primary-text shadow-2xs'
                : 'text-secondary-text hover:text-primary-text'
            }`}
          >
            <span>💼 Open</span>
            {openOpportunities.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-accent/10 text-accent">
                {openOpportunities.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('applied')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'applied'
                ? 'bg-white text-primary-text shadow-2xs'
                : 'text-secondary-text hover:text-primary-text'
            }`}
          >
            <span>✓ Applied</span>
            {appliedOpportunities.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700">
                {appliedOpportunities.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('closed')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'closed'
                ? 'bg-white text-primary-text shadow-2xs'
                : 'text-secondary-text hover:text-primary-text'
            }`}
          >
            <span>🔒 Closed</span>
            {closedOpportunities.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                {closedOpportunities.length}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-text" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
            <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, role, category..."
            className="w-full bg-surface rounded-xl pl-9 pr-4 py-2 text-xs font-medium text-primary-text placeholder:text-secondary-text outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-4 py-4 max-w-xl mx-auto space-y-3">
        {loading ? (
          <ListSkeleton count={4} />
        ) : displayList.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-border p-6 space-y-2 shadow-2xs">
            <span className="text-3xl">💼</span>
            <h3 className="text-sm font-bold text-primary-text">No Opportunities Found</h3>
            <p className="text-xs text-secondary-text max-w-xs mx-auto">
              {search
                ? `No placements match "${search}". Try clearing search.`
                : activeTab === 'applied'
                ? "You haven't marked any applications as Applied or Interested yet."
                : activeTab === 'closed'
                ? 'No closed placement opportunities yet.'
                : 'No open placement opportunities right now. Check back soon!'}
            </p>
          </div>
        ) : (
          <motion.div
            variants={stagger}
            initial="initial"
            animate="animate"
            className="space-y-3"
          >
            {displayList.map((opp) => (
              <PlacementCard
                key={opp.id}
                opportunity={opp}
                now={now}
                onSelect={() => setSelectedOpening(opp)}
                onStatusChange={(status) => setApplicationStatus(opp.id, status)}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* Full Placement Detail Modal */}
      <AnimatePresence>
        {selectedOpening && (
          <PlacementDetailModal
            opportunity={selectedOpening}
            onClose={() => setSelectedOpening(null)}
            onStatusChange={(status) => setApplicationStatus(selectedOpening.id, status)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function PlacementCard({
  opportunity: opp,
  now,
  onSelect,
  onStatusChange,
}: {
  opportunity: PlacementOpportunity
  now: Date
  onSelect: () => void
  onStatusChange: (status: StudentApplicationStatus) => void
}) {
  const currentStatus = opp.student_application?.status
  const countdown = formatPlacementCountdown(opp.deadline_at || '', now)

  const urgencyStyles = {
    normal: {
      cardBg: 'bg-white border-slate-100 hover:border-slate-200',
      badgeBg: 'bg-slate-800 text-white',
      icon: '⏱️',
    },
    warm: {
      cardBg: 'bg-gradient-to-br from-white to-amber-50/50 border-amber-200/80 hover:border-amber-300',
      badgeBg: 'bg-amber-500 text-white shadow-xs shadow-amber-500/20',
      icon: '⏳',
    },
    urgent: {
      cardBg: 'bg-gradient-to-br from-white to-rose-50/60 border-rose-200/90 hover:border-rose-300',
      badgeBg: 'bg-rose-500 text-white shadow-xs shadow-rose-500/30 animate-pulse',
      icon: '🔥',
    },
    closed: {
      cardBg: 'bg-slate-50/60 border-slate-200 opacity-80',
      badgeBg: 'bg-slate-400 text-white',
      icon: '🔒',
    },
  }[countdown.urgency]

  return (
    <motion.div
      variants={fadeRise}
      whileTap={{ scale: 0.985 }}
      onClick={onSelect}
      className={`rounded-3xl border shadow-2xs p-4 cursor-pointer transition-all hover:shadow-sm ${urgencyStyles.cardBg}`}
    >
      {/* Header: Company + Tags + Countdown */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent/10 text-accent capitalize">
              {opp.stage.replace(/_/g, ' ')}
            </span>
            {opp.additional_details?.map((d, i) => (
              <span
                key={i}
                className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/60 truncate max-w-[150px]"
              >
                {d.label}: {d.value}
              </span>
            ))}
          </div>

          <h3 className="text-base font-black text-primary-text tracking-tight truncate">
            {opp.company}
          </h3>
          <p className="text-xs font-semibold text-secondary-text truncate mt-0.5" title={opp.role}>
            {opp.role}
          </p>
        </div>

        {/* Countdown badge */}
        <span
          className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-black tracking-tight flex items-center gap-1 ${urgencyStyles.badgeBg}`}
        >
          <span className="text-[10px]">{urgencyStyles.icon}</span>
          <span>{countdown.formatted}</span>
        </span>
      </div>

      {/* Footer: Deadline info & quick status action */}
      <div className="flex items-center justify-between gap-2 text-xs pt-2.5 mt-2 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-secondary-text truncate text-[11px] font-medium">
          <span>📅</span>
          <span className="truncate">
            {opp.deadline_at
              ? formatPlacementDeadline(opp.deadline_at)
              : 'Open for applications'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {currentStatus === 'applied' ? (
            <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1">
              <span>✓</span>
              <span>Applied</span>
            </span>
          ) : (
            <button
              onClick={() => onStatusChange('applied')}
              className="px-3 py-1 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs transition-all flex items-center gap-1"
            >
              <span>✓</span>
              <span>Mark Applied</span>
            </button>
          )}

          {opp.apply_url && (
            <a
              href={opp.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-xl text-xs font-bold bg-accent text-white hover:opacity-90 transition-all flex items-center gap-0.5 shadow-2xs"
            >
              <span>Superset</span>
              <span>↗</span>
            </a>
          )}
        </div>
      </div>
    </motion.div>
  )
}
