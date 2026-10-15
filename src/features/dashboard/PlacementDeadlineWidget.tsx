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

  const handleMarkApplied = async (e: React.MouseEvent, oppId: string) => {
    e.stopPropagation()
    setAppliedMap((prev) => ({ ...prev, [oppId]: true }))
    await setApplicationStatus(oppId, 'applied')
  }

  if (sortedOpportunities.length === 0) {
    return (
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            Placement Opportunities
          </h2>
          <button
            type="button"
            onClick={() => navigate('/placements')}
            className="text-xs font-semibold text-slate-500 dark:text-[#8E8E93] hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1"
          >
            <span>View all</span>
            <span>→</span>
          </button>
        </div>
        <div className="py-7 text-center rounded-[22px] bg-white dark:bg-[#1C1C1E] border border-slate-200/80 dark:border-white/10 shadow-bento">
          <div className="w-9 h-9 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center mx-auto text-slate-400 dark:text-secondary-text mb-2">
            ✨
          </div>
          <p className="text-xs font-bold text-slate-800 dark:text-white">No open applications right now</p>
          <p className="text-[11px] text-slate-500 dark:text-secondary-text mt-0.5">All applications are either completed or closed.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2.5 pt-1">
        {/* Clean Section Header (Minimal, no awkward buttons, no desktop arrows) */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Placement Opportunities
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-white/10">
              {sortedOpportunities.length} active
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate('/placements')}
            className="text-xs font-semibold text-slate-500 dark:text-[#8E8E93] hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1"
          >
            <span>View all</span>
            <span>→</span>
          </button>
        </div>

        {/* Roller Container: Peek 3rd card naturally so users see there is more without arrows */}
        <div
          ref={scrollRef}
          className={`space-y-2.5 overflow-y-auto snap-y snap-mandatory scroll-smooth pr-0.5 scrollbar-none overscroll-contain ${
            sortedOpportunities.length > 2 ? 'max-h-[240px]' : ''
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
                badgeBg: 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-white/10 shadow-2xs',
                dotColor: 'bg-slate-400',
              },
              warm: {
                badgeBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 shadow-2xs',
                dotColor: 'bg-amber-500',
              },
              urgent: {
                badgeBg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60 shadow-2xs animate-pulse',
                dotColor: 'bg-rose-500',
              },
              closed: {
                badgeBg: 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-secondary-text border border-slate-200/60 dark:border-white/10',
                dotColor: 'bg-slate-400',
              },
            }[countdown.urgency]

            const companyInitial = opp.company ? opp.company.charAt(0).toUpperCase() : 'C'

            return (
              <motion.div
                key={opp.id}
                layout
                whileTap={{ scale: 0.985 }}
                onClick={() => {
                  if (onOpenDetail) onOpenDetail(opp)
                  else setSelectedOpp(opp)
                }}
                className="min-h-[104px] max-h-[104px] h-[104px] snap-start rounded-[22px] bg-white dark:bg-[#1C1C1E] border border-slate-200/80 dark:border-white/10 shadow-bento hover:border-slate-300 dark:hover:border-white/20 p-3.5 cursor-pointer flex flex-col justify-between transition-all select-none"
              >
                {/* Row 1: Company Monogram + Name + Tags + Countdown Chip */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Monogram Badge */}
                    <div className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-white/10 border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-xs font-bold text-slate-800 dark:text-white flex-shrink-0">
                      {companyInitial}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate leading-tight">
                          {opp.company}
                        </h4>
                        {opp.additional_details && opp.additional_details.length > 0 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-white/10 truncate max-w-[100px]">
                            {opp.additional_details[0].value}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-secondary-text truncate leading-tight mt-0.5" title={opp.role}>
                        {opp.role}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-tight flex items-center gap-1.5 ${urgencyStyles.badgeBg}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${urgencyStyles.dotColor}`} />
                    <span>{countdown.formatted}</span>
                  </span>
                </div>

                {/* Row 2: Deadline date + Direct Apply & Status Action */}
                <div className="flex items-center justify-between gap-2 text-[11px] pt-1.5 border-t border-slate-100 dark:border-white/10">
                  <span className="text-slate-500 dark:text-secondary-text font-medium truncate">
                    {opp.deadline_at ? formatPlacementDeadline(opp.deadline_at) : 'Open for applications'}
                  </span>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {opp.apply_url && (
                      <a
                        href={opp.apply_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-1 rounded-xl text-[10px] font-bold bg-slate-900 dark:bg-white text-white dark:text-black hover:bg-slate-800 dark:hover:bg-slate-200 transition-all flex items-center gap-0.5 shadow-2xs"
                      >
                        <span>Apply</span>
                        <span>↗</span>
                      </a>
                    )}

                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      onClick={(e) => handleMarkApplied(e, opp.id)}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1 shadow-2xs ${
                        isApplied
                          ? 'bg-emerald-600 text-white font-extrabold'
                          : 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/15 border border-slate-200/60 dark:border-white/10'
                      }`}
                    >
                      <span>✓</span>
                      <span>{isApplied ? 'Applied' : 'Mark Applied'}</span>
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

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
        className="w-full max-w-lg bg-white dark:bg-[#1C1C1E] rounded-t-[32px] sm:rounded-[32px] shadow-xl max-h-[90vh] flex flex-col overflow-hidden border border-transparent dark:border-white/10"
      >
        {/* Header */}
        <div className="p-5 border-b border-border flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary-text">
                {opportunity.source === 'superset' ? 'Job Profile' : 'Campus Opportunity'}
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
            className="w-8 h-8 rounded-full bg-surface dark:bg-white/10 flex items-center justify-center text-secondary-text hover:text-primary-text"
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
            <span className="px-3 py-1.5 rounded-full text-xs font-black bg-primary-text text-surface">
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
                <span>Apply</span>
                <span>↗</span>
              </a>
              <p className="text-[11px] text-center text-secondary-text mt-1.5">
                Opens application link in a new browser tab.
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
                  <div key={u.id} className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xs">
                    <div className="flex items-center justify-between text-[10px] text-secondary-text mb-1">
                      <span className="font-semibold uppercase">{(u.new_values?.stage as string)?.replace(/_/g, ' ') || 'Update'}</span>
                      <span>{new Date(u.created_at).toLocaleDateString()}</span>
                    </div>
                    {u.new_values?.deadline_at && (
                      <p className="font-medium text-slate-700 dark:text-slate-300">
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
