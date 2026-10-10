import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlacements } from '../../hooks/usePlacements'
import { useNow } from '../../hooks/useNow'
import { formatPlacementCountdown, formatPlacementDeadline } from '../../lib/timeUtils'
import { spring } from '../../lib/motion'
import type { PlacementOpportunity } from '../../types'

interface PlacementDeadlineWidgetProps {
  onOpenDetail?: (opportunity: PlacementOpportunity) => void
}

export function PlacementDeadlineWidget({ onOpenDetail }: PlacementDeadlineWidgetProps) {
  const { openOpportunities, nearestActionableOpportunity, setApplicationStatus } = usePlacements()
  const [selectedOpp, setSelectedOpp] = useState<PlacementOpportunity | null>(null)
  const [justApplied, setJustApplied] = useState(false)

  // Determine if nearest countdown is under 1 hour for high-frequency 1s ticking
  const now = useNow(
    nearestActionableOpportunity?.deadline_at
      ? (new Date(nearestActionableOpportunity.deadline_at).getTime() - Date.now()) < 3600000
      : false
  )

  const activeOpp = nearestActionableOpportunity

  // Count additional opportunities closing this week (next 7 days)
  const additionalClosingCount = openOpportunities.filter((o) => {
    if (!activeOpp || o.id === activeOpp.id) return false
    if (!o.deadline_at) return false
    const diff = new Date(o.deadline_at).getTime() - now.getTime()
    return diff > 0 && diff <= 7 * 86400000
  }).length

  if (!activeOpp) {
    return (
      <section className="bg-white rounded-[26px] border border-slate-100 shadow-2xs p-4.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">💼</span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-secondary-text">
              Placement Deadlines
            </h3>
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

  const countdown = formatPlacementCountdown(activeOpp.deadline_at || '', now)

  const urgencyStyles = {
    normal: {
      cardBorder: 'border-slate-100',
      badgeBg: 'bg-primary-text text-white',
      chipBg: 'bg-slate-100 text-slate-700',
      accentColor: 'text-primary-text',
      icon: '⏱️',
    },
    warm: {
      cardBorder: 'border-amber-200/80 bg-gradient-to-br from-white to-amber-50/40',
      badgeBg: 'bg-amber-500 text-white shadow-sm shadow-amber-500/20',
      chipBg: 'bg-amber-100 text-amber-900 border border-amber-200/60',
      accentColor: 'text-amber-600',
      icon: '⏳',
    },
    urgent: {
      cardBorder: 'border-rose-200/90 bg-gradient-to-br from-white to-rose-50/50',
      badgeBg: 'bg-rose-500 text-white shadow-sm shadow-rose-500/30 animate-pulse',
      chipBg: 'bg-rose-100 text-rose-900 border border-rose-200/60',
      accentColor: 'text-rose-600',
      icon: '🔥',
    },
    closed: {
      cardBorder: 'border-slate-200 bg-slate-50/60 opacity-80',
      badgeBg: 'bg-slate-400 text-white',
      chipBg: 'bg-slate-100 text-slate-500',
      accentColor: 'text-slate-500',
      icon: '🔒',
    },
  }[countdown.urgency]

  const handleMarkApplied = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setJustApplied(true)
    await setApplicationStatus(activeOpp.id, 'applied')
    setTimeout(() => setJustApplied(false), 2000)
  }

  return (
    <>
      <motion.section
        layout
        onClick={() => {
          if (onOpenDetail) onOpenDetail(activeOpp)
          else setSelectedOpp(activeOpp)
        }}
        className={`bg-white rounded-[26px] border ${urgencyStyles.cardBorder} shadow-2xs p-4.5 pb-4 cursor-pointer relative transition-all hover:shadow-sm active:scale-[0.99]`}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="text-xs">💼</span>
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Placement Opportunity
            </h3>
            {activeOpp.additional_details?.map((d, i) => (
              <span
                key={i}
                className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/80"
              >
                {d.label}: {d.value}
              </span>
            ))}
          </div>

          {/* Large prominent countdown pill */}
          <div className="flex-shrink-0">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-black tracking-tight flex items-center gap-1 ${urgencyStyles.badgeBg}`}
            >
              <span className="text-[10px]">{urgencyStyles.icon}</span>
              <span>{countdown.formatted}</span>
            </span>
          </div>
        </div>

        {/* Company & Role */}
        <div className="flex items-center justify-between gap-3 my-1">
          <div className="min-w-0 flex-1">
            <h4 className="text-base font-black text-slate-900 tracking-tight truncate leading-snug">
              {activeOpp.company}
            </h4>
            <p className="text-xs font-medium text-slate-500 truncate mt-0.5" title={activeOpp.role}>
              {activeOpp.role}
            </p>
          </div>

          {/* Quick "Applied" Action Button */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={handleMarkApplied}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs ${
              justApplied
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-slate-800 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {justApplied ? (
              <>
                <span>✓</span>
                <span>Applied</span>
              </>
            ) : (
              <>
                <span>✓</span>
                <span>Mark Applied</span>
              </>
            )}
          </motion.button>
        </div>

        {/* Deadline text & closing this week count */}
        <div className="flex items-center justify-between text-[11px] font-medium text-secondary-text mt-3 pt-2.5 border-t border-slate-100/90 leading-normal">
          <div className="flex items-center gap-1.5 truncate text-slate-600">
            <span className="text-xs">📅</span>
            <span className="font-semibold truncate">
              {activeOpp.deadline_at
                ? formatPlacementDeadline(activeOpp.deadline_at)
                : 'Open for applications'}
            </span>
          </div>
          {additionalClosingCount > 0 && (
            <span className="font-bold text-slate-700 whitespace-nowrap pl-2 text-[10px] bg-slate-100 px-2 py-0.5 rounded-full">
              +{additionalClosingCount} more
            </span>
          )}
        </div>
      </motion.section>

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

          {/* Linked Interview Experiences */}
          {opportunity.experiences && opportunity.experiences.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-secondary-text uppercase tracking-wider mb-2">
                Batch Interview Experiences ({opportunity.experiences.length})
              </h4>
              <div className="space-y-2">
                {opportunity.experiences.map((exp) => (
                  <div key={exp.id} className="p-3.5 rounded-xl bg-surface border border-border text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-primary-text">{exp.round_type || 'Interview Round'}</span>
                      <span className="text-[10px] font-semibold text-emerald-600">{exp.outcome || ''}</span>
                    </div>
                    {exp.questions && (
                      <p className="text-secondary-text mt-1 text-[11px] line-clamp-2">
                        <span className="font-semibold text-primary-text">Questions: </span>
                        {exp.questions}
                      </p>
                    )}
                    {exp.tips && (
                      <p className="text-secondary-text mt-1 text-[11px] line-clamp-2">
                        <span className="font-semibold text-primary-text">Tips: </span>
                        {exp.tips}
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
