import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useInterviews } from '../../hooks/useInterviews'
import { usePlacements } from '../../hooks/usePlacements'
import { useAuth } from '../../hooks/useAuth'
import { useNow } from '../../hooks/useNow'
import { fadeRise, stagger, spring } from '../../lib/motion'
import { BottomSheet } from '../../components/BottomSheet'
import { ListSkeleton } from '../../components/Skeleton'
import { formatPlacementCountdown, formatPlacementDeadline } from '../../lib/timeUtils'
import { PlacementDetailModal } from '../dashboard/PlacementDeadlineWidget'
import type { InterviewSubmission, PlacementOpportunity, StudentApplicationStatus } from '../../types'

const DIFFICULTY_LABELS = ['', 'Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard']
const DIFFICULTY_COLORS = ['', '#34C759', '#34C759', '#FF9F0A', '#FF3B30', '#FF3B30']

type InterviewTab = 'openings' | 'experiences'

export function InterviewsScreen() {
  const [activeTab, setActiveTab] = useState<InterviewTab>('openings')
  const { user } = useAuth()

  // Interviews data
  const {
    submissions,
    loading: loadingExp,
    error: errorExp,
    search: searchExp,
    setSearch: setSearchExp,
    addSubmission,
    deleteSubmission,
  } = useInterviews()

  // Placements data
  const {
    openOpportunities,
    closedOpportunities,
    loading: loadingPlacements,
    search: searchPlacements,
    setSearch: setSearchPlacements,
    setApplicationStatus,
  } = usePlacements()

  const [selectedSubmission, setSelectedSubmission] = useState<InterviewSubmission | null>(null)
  const [selectedOpening, setSelectedOpening] = useState<PlacementOpportunity | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Clock for live countdown ticking
  const hasUrgent = openOpportunities.some((o) => {
    if (!o.deadline_at) return false
    const diff = new Date(o.deadline_at).getTime() - Date.now()
    return diff > 0 && diff < 3600000
  })
  const now = useNow(hasUrgent)

  const currentSearch = activeTab === 'openings' ? searchPlacements : searchExp
  const handleSearchChange = (val: string) => {
    if (activeTab === 'openings') setSearchPlacements(val)
    else setSearchExp(val)
  }

  return (
    <div className="min-h-screen bg-surface pb-tab-bar">
      {/* Header */}
      <div className="bg-white px-5 pt-safe-top pb-3 border-b border-border sticky top-0 z-20">
        <div className="pt-3 pb-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary-text tracking-tight">Interviews & Jobs</h1>
            <p className="text-xs text-secondary-text mt-0.5">Opportunities & Senior Experiences</p>
          </div>

          {activeTab === 'experiences' && (
            <motion.button
              onClick={() => setShowForm(true)}
              whileTap={{ scale: 0.9 }}
              transition={spring}
              className="w-9 h-9 bg-accent rounded-full flex items-center justify-center shadow-card"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </motion.button>
          )}
        </div>

        {/* Segmented Control */}
        <div className="flex bg-surface p-1 rounded-xl mb-3 border border-border">
          <button
            onClick={() => setActiveTab('openings')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'openings'
                ? 'bg-white text-primary-text shadow-2xs'
                : 'text-secondary-text hover:text-primary-text'
            }`}
          >
            <span>💼</span>
            <span>Openings</span>
            {openOpportunities.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-accent/10 text-accent">
                {openOpportunities.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('experiences')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'experiences'
                ? 'bg-white text-primary-text shadow-2xs'
                : 'text-secondary-text hover:text-primary-text'
            }`}
          >
            <span>💬</span>
            <span>Experiences</span>
            {submissions.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                {submissions.length}
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
            value={currentSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={
              activeTab === 'openings'
                ? 'Search company, role, category...'
                : 'Search company, role, questions...'
            }
            className="w-full bg-surface rounded-xl pl-9 pr-4 py-2 text-xs font-medium text-primary-text placeholder:text-secondary-text outline-none"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-4 py-4 max-w-xl mx-auto space-y-4">
        {activeTab === 'openings' ? (
          loadingPlacements ? (
            <ListSkeleton count={4} />
          ) : openOpportunities.length === 0 && closedOpportunities.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-border p-6">
              <span className="text-3xl">💼</span>
              <h3 className="text-sm font-bold text-primary-text mt-2">No Openings Found</h3>
              <p className="text-xs text-secondary-text mt-1">
                Placement drives and Superset notifications will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Active Openings */}
              {openOpportunities.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-secondary-text">
                      Open for Application ({openOpportunities.length})
                    </h2>
                  </div>
                  {openOpportunities.map((opp) => (
                    <OpeningCard
                      key={opp.id}
                      opportunity={opp}
                      now={now}
                      onClick={() => setSelectedOpening(opp)}
                    />
                  ))}
                </div>
              )}

              {/* Closed Openings */}
              {closedOpportunities.length > 0 && (
                <div className="space-y-2.5 pt-3">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Closed Applications ({closedOpportunities.length})
                    </h2>
                  </div>
                  <div className="space-y-2 opacity-60">
                    {closedOpportunities.map((opp) => (
                      <OpeningCard
                        key={opp.id}
                        opportunity={opp}
                        now={now}
                        isDimmed
                        onClick={() => setSelectedOpening(opp)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          /* Experiences Tab */
          loadingExp ? (
            <ListSkeleton count={4} />
          ) : errorExp ? (
            <div className="text-center py-8 text-rose-500 text-xs font-semibold">{errorExp}</div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-border p-6">
              <span className="text-3xl">📝</span>
              <h3 className="text-sm font-bold text-primary-text mt-2">No Interview Experiences Yet</h3>
              <p className="text-xs text-secondary-text mt-1">
                Be the first to share questions and insights from your interview rounds.
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 px-4 py-2 bg-accent text-white text-xs font-bold rounded-xl shadow-sm"
              >
                Share Experience
              </button>
            </div>
          ) : (
            <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-3">
              {submissions.map((sub) => (
                <InterviewCard
                  key={sub.id}
                  submission={sub}
                  onClick={() => setSelectedSubmission(sub)}
                />
              ))}
            </motion.div>
          )
        )}
      </div>

      {/* Opening Detail Sheet */}
      <AnimatePresence>
        {selectedOpening && (
          <PlacementDetailModal
            opportunity={selectedOpening}
            onClose={() => setSelectedOpening(null)}
            onStatusChange={async (status: StudentApplicationStatus) => {
              await setApplicationStatus(selectedOpening.id, status)
            }}
          />
        )}
      </AnimatePresence>

      {/* Interview Detail Sheet */}
      <BottomSheet
        isOpen={!!selectedSubmission}
        onClose={() => setSelectedSubmission(null)}
        title={selectedSubmission ? `${selectedSubmission.company} — ${selectedSubmission.role}` : undefined}
        fullHeight
      >
        {selectedSubmission && (
          <InterviewDetail
            submission={selectedSubmission}
            currentUserId={user?.id}
            onDelete={async () => {
              await deleteSubmission(selectedSubmission.id)
              setSelectedSubmission(null)
            }}
          />
        )}
      </BottomSheet>

      {/* Add Interview Form Sheet */}
      <BottomSheet
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Share Your Experience"
        fullHeight
      >
        <InterviewForm
          userId={user?.id ?? ''}
          onSubmit={async (data) => {
            await addSubmission(data)
            setShowForm(false)
          }}
          onCancel={() => setShowForm(false)}
        />
      </BottomSheet>
    </div>
  )
}

// ─── Opening Card Component ──────────────────────────────────────────────────

function OpeningCard({
  opportunity,
  now,
  isDimmed = false,
  onClick,
}: {
  opportunity: PlacementOpportunity
  now: Date
  isDimmed?: boolean
  onClick: () => void
}) {
  const countdown = formatPlacementCountdown(opportunity.deadline_at || '', now)
  const appStatus = opportunity.student_application?.status

  const statusBadges: Record<StudentApplicationStatus, { label: string; bg: string }> = {
    interested: { label: '⭐ Interested', bg: 'bg-amber-100 text-amber-800' },
    applied: { label: '✓ Applied', bg: 'bg-emerald-100 text-emerald-800' },
    skipped: { label: '✕ Skipped', bg: 'bg-slate-100 text-slate-600' },
  }

  const urgencyPillStyles = {
    normal: 'bg-slate-100 text-slate-700 border-slate-200/60',
    warm: 'bg-amber-50 text-amber-700 border-amber-200/70 font-black',
    urgent: 'bg-rose-50 text-rose-700 border-rose-200/70 font-black animate-pulse',
    closed: 'bg-slate-100 text-slate-500 border-slate-200/40',
  }[countdown.urgency]

  return (
    <motion.button
      variants={fadeRise}
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      transition={spring}
      className={`w-full bg-white rounded-2xl border border-border shadow-2xs p-4 text-left transition-all hover:border-slate-300 ${
        isDimmed ? 'bg-slate-50/70' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-base font-bold text-primary-text tracking-tight truncate">
              {opportunity.company}
            </h3>
            {opportunity.additional_details?.map((d, i) => (
              <span key={i} className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {d.label}: {d.value}
              </span>
            ))}
            {appStatus && (
              <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full ${statusBadges[appStatus].bg}`}>
                {statusBadges[appStatus].label}
              </span>
            )}
          </div>
          <p className="text-xs font-semibold text-secondary-text truncate">{opportunity.role}</p>
        </div>

        {/* Countdown Badge */}
        <div className="flex-shrink-0">
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold tracking-tight border flex items-center gap-1 ${urgencyPillStyles}`}
          >
            <span>⏱️</span>
            <span>{countdown.formatted}</span>
          </span>
        </div>
      </div>

      {/* Footer / Deadline Text */}
      <div className="flex items-center justify-between text-[11px] font-medium text-secondary-text mt-3 pt-2.5 border-t border-slate-100">
        <span>
          {opportunity.deadline_at
            ? formatPlacementDeadline(opportunity.deadline_at)
            : 'Open on Superset'}
        </span>
        <span className="font-semibold text-accent flex items-center gap-0.5">
          View details <span>→</span>
        </span>
      </div>
    </motion.button>
  )
}

// ─── Existing Interview Experiences Components ───────────────────────────────

function InterviewCard({
  submission,
  onClick,
}: {
  submission: InterviewSubmission
  onClick: () => void
}) {
  const diffColor = DIFFICULTY_COLORS[submission.difficulty ?? 0]

  return (
    <motion.button
      variants={fadeRise}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={spring}
      className="w-full bg-white rounded-2xl shadow-card p-4 text-left border border-border"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-primary-text">{submission.company}</h3>
          <p className="text-sm text-secondary-text mt-0.5">{submission.role}</p>
          {submission.round_type && (
            <span className="inline-block text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full mt-1">
              {submission.round_type}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {submission.difficulty && (
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: i < submission.difficulty! ? diffColor : '#E5E5EA',
                  }}
                />
              ))}
            </div>
          )}
          {submission.outcome && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                submission.outcome.toLowerCase().includes('offer') ||
                submission.outcome.toLowerCase().includes('selected')
                  ? 'bg-system-green/10 text-system-green'
                  : submission.outcome.toLowerCase().includes('reject')
                  ? 'bg-system-red/10 text-system-red'
                  : 'bg-surface text-secondary-text'
              }`}
            >
              {submission.outcome}
            </span>
          )}
        </div>
      </div>

      {submission.questions && (
        <p className="text-xs text-secondary-text line-clamp-2 mt-2 pt-2 border-t border-border">
          {submission.questions}
        </p>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border text-xs text-secondary-text">
        <span>{submission.is_anonymous ? 'Anonymous' : submission.profile?.full_name ?? 'DEM Senior'}</span>
        {submission.interview_date && <span>{submission.interview_date}</span>}
      </div>
    </motion.button>
  )
}

function InterviewDetail({
  submission,
  currentUserId,
  onDelete,
}: {
  submission: InterviewSubmission
  currentUserId?: string
  onDelete: () => void
}) {
  const isAuthor = currentUserId && submission.user_id === currentUserId
  const diffLabel = DIFFICULTY_LABELS[submission.difficulty ?? 0]
  const diffColor = DIFFICULTY_COLORS[submission.difficulty ?? 0]

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent text-xl font-bold flex-shrink-0">
          {submission.company[0]}
        </div>
        <div>
          <h2 className="text-lg font-bold text-primary-text">{submission.company}</h2>
          <p className="text-sm text-secondary-text">{submission.role}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {submission.round_type && (
          <span className="text-xs bg-surface text-secondary-text px-2.5 py-1 rounded-lg">
            {submission.round_type}
          </span>
        )}
        {diffLabel && (
          <span className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ color: diffColor, backgroundColor: `${diffColor}15` }}>
            {diffLabel}
          </span>
        )}
        {submission.interview_date && (
          <span className="text-xs bg-surface text-secondary-text px-2.5 py-1 rounded-lg">
            {submission.interview_date}
          </span>
        )}
      </div>

      {submission.questions && (
        <div>
          <h4 className="text-xs font-semibold text-secondary-text uppercase tracking-wide mb-1.5">
            Questions Asked
          </h4>
          <div className="bg-surface rounded-xl p-3.5 text-sm text-primary-text whitespace-pre-wrap">
            {submission.questions}
          </div>
        </div>
      )}

      {submission.experience && (
        <div>
          <h4 className="text-xs font-semibold text-secondary-text uppercase tracking-wide mb-1.5">
            Experience & Process
          </h4>
          <div className="bg-surface rounded-xl p-3.5 text-sm text-primary-text whitespace-pre-wrap">
            {submission.experience}
          </div>
        </div>
      )}

      {submission.tips && (
        <div>
          <h4 className="text-xs font-semibold text-secondary-text uppercase tracking-wide mb-1.5">
            Tips for Juniors
          </h4>
          <div className="bg-surface rounded-xl p-3.5 text-sm text-primary-text whitespace-pre-wrap">
            {submission.tips}
          </div>
        </div>
      )}

      {isAuthor && (
        <button
          onClick={onDelete}
          className="w-full py-2.5 text-center text-system-red text-sm font-medium border border-system-red/20 rounded-xl"
        >
          Delete Experience
        </button>
      )}
    </div>
  )
}

function InterviewForm({
  userId,
  onSubmit,
  onCancel,
}: {
  userId: string
  onSubmit: (data: Omit<InterviewSubmission, 'id' | 'created_at' | 'profile'>) => void
  onCancel: () => void
}) {
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [roundType, setRoundType] = useState('')
  const [interviewDate, setInterviewDate] = useState('')
  const [questions, setQuestions] = useState('')
  const [experience, setExperience] = useState('')
  const [tips, setTips] = useState('')
  const [difficulty, setDifficulty] = useState<number>(3)
  const [outcome, setOutcome] = useState('Selected')
  const [isAnonymous, setIsAnonymous] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!company.trim() || !role.trim()) return
    onSubmit({
      user_id: userId || null,
      company: company.trim(),
      role: role.trim(),
      round_type: roundType.trim() || null,
      interview_date: interviewDate || null,
      questions: questions.trim() || null,
      experience: experience.trim() || null,
      tips: tips.trim() || null,
      difficulty,
      outcome: outcome || null,
      is_anonymous: isAnonymous,
      program: 'dem',
      batch_year: 2026,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-6">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-secondary-text block mb-1">Company *</label>
          <input
            type="text"
            required
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. McKinsey"
            className="w-full bg-surface rounded-xl px-3 py-2 text-sm text-primary-text outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary-text block mb-1">Role *</label>
          <input
            type="text"
            required
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Consultant"
            className="w-full bg-surface rounded-xl px-3 py-2 text-sm text-primary-text outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-secondary-text block mb-1">Round Type</label>
          <input
            type="text"
            value={roundType}
            onChange={(e) => setRoundType(e.target.value)}
            placeholder="e.g. Case + Fit"
            className="w-full bg-surface rounded-xl px-3 py-2 text-sm text-primary-text outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary-text block mb-1">Interview Date</label>
          <input
            type="date"
            value={interviewDate}
            onChange={(e) => setInterviewDate(e.target.value)}
            className="w-full bg-surface rounded-xl px-3 py-2 text-sm text-primary-text outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-secondary-text block mb-1">Difficulty (1-5)</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(parseInt(e.target.value, 10))}
            className="w-full bg-surface rounded-xl px-3 py-2 text-sm text-primary-text outline-none"
          >
            <option value="1">1 - Very Easy</option>
            <option value="2">2 - Easy</option>
            <option value="3">3 - Medium</option>
            <option value="4">4 - Hard</option>
            <option value="5">5 - Very Hard</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-secondary-text block mb-1">Outcome</label>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className="w-full bg-surface rounded-xl px-3 py-2 text-sm text-primary-text outline-none"
          >
            <option value="Selected">Selected</option>
            <option value="Waitlisted">Waitlisted</option>
            <option value="Rejected">Rejected</option>
            <option value="In Progress">In Progress</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-secondary-text block mb-1">Questions Asked</label>
        <textarea
          rows={2}
          value={questions}
          onChange={(e) => setQuestions(e.target.value)}
          placeholder="What technical or case questions were asked?"
          className="w-full bg-surface rounded-xl p-3 text-sm text-primary-text outline-none"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-secondary-text block mb-1">Process & Experience</label>
        <textarea
          rows={2}
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
          placeholder="Describe the interview flow and interviewer style"
          className="w-full bg-surface rounded-xl p-3 text-sm text-primary-text outline-none"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-secondary-text block mb-1">Tips for Juniors</label>
        <textarea
          rows={2}
          value={tips}
          onChange={(e) => setTips(e.target.value)}
          placeholder="Advice for juniors preparing for this company"
          className="w-full bg-surface rounded-xl p-3 text-sm text-primary-text outline-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="anon"
          checked={isAnonymous}
          onChange={(e) => setIsAnonymous(e.target.checked)}
          className="rounded text-accent"
        />
        <label htmlFor="anon" className="text-xs font-medium text-secondary-text">
          Post anonymously
        </label>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 bg-surface text-secondary-text rounded-xl text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!company.trim() || !role.trim()}
          className="flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50"
        >
          Publish
        </button>
      </div>
    </form>
  )
}
