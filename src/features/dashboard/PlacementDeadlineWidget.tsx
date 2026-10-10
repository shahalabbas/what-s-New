import React, { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { usePlacements } from '../../hooks/usePlacements'
import { useNow } from '../../hooks/useNow'
import { formatPlacementCountdown, formatPlacementDeadline } from '../../lib/timeUtils'
import { spring } from '../../lib/motion'
import type { PlacementOpportunity } from '../../types'

interface PlacementDeadlineWidgetProps {
  onOpenDetail?: (opportunity: PlacementOpportunity) => void
  onSwapOrder?: () => void
  isAtBottom?: boolean
}

export function PlacementDeadlineWidget({
  onOpenDetail,
  onSwapOrder,
  isAtBottom = false,
}: PlacementDeadlineWidgetProps) {
  const navigate = useNavigate()
  const { openOpportunities, setApplicationStatus } = usePlacements()
  const [selectedOpp, setSelectedOpp] = useState<PlacementOpportunity | null>(null)
  const [appliedMap, setAppliedMap] = useState<Record<string, boolean>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  // Sort open opportunities: nearest deadline first
  const sortedOpportunities = [...openOpportunities].sort((a, b) => {
    if (!a.deadline_at && !b.deadline_at) return 0
    if (!a.deadline_at) return 1
    if (!b.deadline_at) return -1
    return new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime()
  })

  // Determine if any deadline is under 1 hour for high-frequency 1s ticking
  const hasUrgentDeadline = sortedOpportunities.some((o) => {
    if (!o.deadline_at) return false
    const diff = new Date(o.deadline_at).getTime() - Date.now()
    return diff > 0 && diff < 3600000
  })
  const now = useNow(hasUrgentDeadline)

  const handleScrollUp = (e: React.MouseEvent) => {
    e.stopPropagation()
    scrollRef.current?.scrollBy({ top: -104, behavior: 'smooth' })
  }

  const handleScrollDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    scrollRef.current?.scrollBy({ top: 104, behavior: 'smooth' })
  }

  const handleMarkApplied = async (e: React.MouseEvent, oppId: string) => {
    e.stopPropagation()
    setAppliedMap((prev) => ({ ...prev, [oppId]: true }))
    await setApplicationStatus(oppId, 'applied')
  }

  if (sortedOpportunities.length === 0) {
    return (
      <section className="bg-white rounded-[26px] border border-slate-100 shadow-2xs p-4.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">💼</span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-secondary-text">
              Placement Opportunities
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            {onSwapOrder && (
              <button
                type="button"
                onClick={onSwapOrder}
                title={isAtBottom ? 'Move Placements to top' : 'Pull Placements to bottom (I am placed)'}
                className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-[10px] font-bold text-slate-600 transition-all flex items-center gap-0.5 shadow-2xs border border-slate-200/60"
              >
                <span>{isAtBottom ? '↑ Placed' : '↓ Placed'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/placements')}
              className="text-xs font-bold text-accent hover:opacity-80 transition-opacity flex items-center gap-0.5 ml-0.5"
            >
              <span>View all</span>
              <span>→</span>
            </button>
          </div>
        </div>
        <div className="py-6 text-center">
          <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-slate-400 mb-2">
            ✨
          </div>
          <p className="text-sm font-semibold text-primary-text">No open applications right now</p>
          <p className="text-xs text-secondary-text mt-0.5">All applications are either completed or closed.</p>
        </div>
      </section>
    )
  }

  return (
    <>
      <section className="bg-white rounded-[26px] border border-slate-100 shadow-2xs p-4.5 space-y-2.5">
        {/* Section Header with roller controls and layout swap */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">💼</span>
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Placement Opportunities
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/60">
              {sortedOpportunities.length} active
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Swap Position / Placed pull down button */}
            {onSwapOrder && (
              <button
                type="button"
                onClick={onSwapOrder}
                title={isAtBottom ? 'Move Placements above Projects' : 'Pull Placements to bottom (I am placed)'}
                className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-[10px] font-bold text-slate-600 transition-all flex items-center gap-0.5 shadow-2xs border border-slate-200/60"
              >
                <span>{isAtBottom ? '↑ Placed' : '↓ Placed'}</span>
              </button>
            )}

            {/* Roller Controls when > 2 items */}
            {sortedOpportunities.length > 2 && (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={handleScrollUp}
                  aria-label="Roll to previous placement"
                  title="Previous"
                  className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 flex items-center justify-center text-[10px] text-slate-600 font-bold transition-all shadow-2xs"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={handleScrollDown}
                  aria-label="Roll to next placement"
                  title="Next"
                  className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 flex items-center justify-center text-[10px] text-slate-600 font-bold transition-all shadow-2xs"
                >
                  ▼
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => navigate('/placements')}
              className="text-xs font-bold text-accent hover:opacity-80 transition-opacity flex items-center gap-0.5 ml-0.5"
            >
              <span>View all</span>
              <span>→</span>
            </button>
          </div>
        </div>

        {/* 2-Item Fixed Roller Container */}
        <div
          ref={scrollRef}
          className={`space-y-2 overflow-y-auto snap-y snap-mandatory scroll-smooth pr-0.5 scrollbar-none overscroll-contain ${
            sortedOpportunities.length > 1 ? 'max-h-[200px]' : ''
          }`}
          style={{ scrollSnapType: 'y mandatory' }}
        >
          {sortedOpportunities.map((opp) => {
            const isApplied =
              appliedMap[opp.id] ||
              opp.student_application?.status === 'applied'

            const countdown = formatPlacementCountdown(opp.deadline_at || '', now)

            const urgencyStyles = {
              normal: {
                cardBg: 'bg-slate-50/70 hover:bg-slate-50/95 border-slate-200/70',
                badgeBg: 'bg-slate-800 text-white',
                icon: '⏱️',
              },
              warm: {
                cardBg: 'bg-gradient-to-r from-amber-50/70 to-orange-50/40 hover:bg-amber-50 border-amber-200/90',
                badgeBg: 'bg-amber-500 text-white shadow-xs shadow-amber-500/20',
                icon: '⏳',
              },
              urgent: {
                cardBg: 'bg-gradient-to-r from-rose-50/80 to-amber-50/40 hover:bg-rose-50 border-rose-200/90',
                badgeBg: 'bg-rose-500 text-white shadow-xs shadow-rose-500/30 animate-pulse',
                icon: '🔥',
              },
              closed: {
                cardBg: 'bg-slate-50/50 border-slate-200 opacity-75',
                badgeBg: 'bg-slate-400 text-white',
                icon: '🔒',
              },
            }[countdown.urgency]

            return (
              <motion.div
                key={opp.id}
                layout
                whileTap={{ scale: 0.985 }}
                onClick={() => {
                  if (onOpenDetail) onOpenDetail(opp)
                  else setSelectedOpp(opp)
                }}
                className={`min-h-[96px] max-h-[96px] h-[96px] snap-start rounded-2xl border ${urgencyStyles.cardBg} p-3 cursor-pointer flex flex-col justify-between transition-all hover:shadow-xs select-none`}
              >
                {/* Row 1: Company + Extra Tags + Countdown */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <h4 className="text-xs font-black text-slate-900 tracking-tight truncate">
                      {opp.company}
                    </h4>
                    {opp.additional_details && opp.additional_details.length > 0 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/80 text-slate-600 border border-slate-200/60 truncate max-w-[120px]">
                        {opp.additional_details[0].value}
                      </span>
                    )}
                  </div>

                  <span
                    className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black tracking-tight flex items-center gap-1 ${urgencyStyles.badgeBg}`}
                  >
                    <span className="text-[9px]">{urgencyStyles.icon}</span>
                    <span>{countdown.formatted}</span>
                  </span>
                </div>

                {/* Row 2: Role */}
                <p className="text-[11px] font-medium text-slate-600 truncate leading-tight" title={opp.role}>
                  {opp.role}
                </p>

                {/* Row 3: Deadline + Mark Applied Action */}
                <div className="flex items-center justify-between gap-2 text-[10px] pt-0.5 border-t border-slate-200/50">
                  <div className="flex items-center gap-1 text-slate-500 truncate font-medium">
                    <span>📅</span>
                    <span className="truncate">
                      {opp.deadline_at ? formatPlacementDeadline(opp.deadline_at) : 'Open for applications'}
                    </span>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={(e) => handleMarkApplied(e, opp.id)}
                    className={`flex-shrink-0 px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 shadow-2xs ${
                      isApplied
                        ? 'bg-emerald-600 text-white font-extrabold'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <span>✓</span>
                    <span>{isApplied ? 'Applied' : 'Mark Applied'}</span>
                  </motion.button>
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Detail Modal if opened internally */}
      <AnimatePresence>
        {selectedOpp && (
          <PlacementDetailModal
            opportunity={selectedOpp}
            onClose={() => setSelectedOpp(null)}
            onStatusChange={(status) => setApplicationStatus(selectedOpp.id, status)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Placement Detail Sheet / Modal ──────────────────────────────────────────

export function PlacementDetailModal({
  opportunity,
  onClose,
  onStatusChange,
}: {
  opportunity: PlacementOpportunity
  onClose: () => void
  onStatusChange: (status: 'interested' | 'applied' | 'skipped') => void
}) {
  const currentStatus = opportunity.student_application?.status
  const countdown = formatPlacementCountdown(opportunity.deadline_at || '')

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={spring}
        className="w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-[32px] shadow-xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b border-border flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary-text">
                {opportunity.source === 'superset' ? 'Superset Job Profile' : 'Campus Opportunity'}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent/10 text-accent capitalize">
                {opportunity.stage.replace(/_/g, ' ')}
              </span>
            </div>
            <h2 className="text-xl font-black text-primary-text tracking-tight">
              {opportunity.company}
            </h2>
            <p className="text-sm font-semibold text-secondary-text mt-0.5">{opportunity.role}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-secondary-text hover:text-primary-text"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Live Deadline Card */}
          <div className="p-4 rounded-2xl bg-surface border border-border flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text">Application Deadline</p>
              <p className="text-sm font-bold text-primary-text mt-0.5">
                {opportunity.deadline_at
                  ? formatPlacementDeadline(opportunity.deadline_at)
                  : 'No deadline set'}
              </p>
            </div>
            <span className="px-3 py-1.5 rounded-full text-xs font-black bg-primary-text text-white">
              {countdown.formatted}
            </span>
          </div>

          {/* Additional Details Table */}
          {opportunity.additional_details && opportunity.additional_details.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-secondary-text uppercase tracking-wider">
                Additional Details
              </h4>
              <div className="bg-surface rounded-2xl p-3.5 border border-border divide-y divide-border/60">
                {opportunity.additional_details.map((d, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 first:pt-0 last:pb-0 text-xs">
                    <span className="font-semibold text-secondary-text">{d.label}</span>
                    <span className="font-bold text-primary-text text-right">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Student Status Toggles */}
          <div>
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wider block mb-2">
              My Application Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { key: 'interested', label: 'Interested', emoji: '⭐' },
                  { key: 'applied', label: 'Applied', emoji: '✓' },
                  { key: 'skipped', label: 'Skip', emoji: '✕' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => onStatusChange(opt.key)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    currentStatus === opt.key
                      ? 'bg-accent text-white shadow-sm'
                      : 'bg-surface text-secondary-text hover:text-primary-text border border-border'
                  }`}
                >
                  <span>{opt.emoji}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Apply Button */}
          {opportunity.apply_url && (
            <div>
              <a
                href={opportunity.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 rounded-2xl bg-accent text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm hover:opacity-95 transition-all"
              >
                <span>Apply on Superset</span>
                <span>↗</span>
              </a>
              <p className="text-[11px] text-center text-secondary-text mt-1.5">
                Opens external Superset job profile in a new browser tab.
              </p>
            </div>
          )}

          {/* Status Updates / History */}
          {opportunity.updates && opportunity.updates.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-secondary-text uppercase tracking-wider mb-2">
                Timeline & Updates
              </h4>
              <div className="space-y-2">
                {opportunity.updates.map((u) => (
                  <div key={u.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <div className="flex items-center justify-between text-[10px] text-secondary-text mb-1">
                      <span className="font-semibold uppercase">{(u.new_values?.stage as string)?.replace(/_/g, ' ') || 'Update'}</span>
                      <span>{new Date(u.created_at).toLocaleDateString()}</span>
                    </div>
                    {u.new_values?.deadline_at && (
                      <p className="font-medium text-slate-700">
                        Deadline changed to {formatPlacementDeadline(u.new_values.deadline_at)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
