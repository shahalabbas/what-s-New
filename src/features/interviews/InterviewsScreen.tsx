import { useState } from 'react'
import { motion } from 'framer-motion'
import { useInterviews } from '../../hooks/useInterviews'
import { useAuth } from '../../hooks/useAuth'
import { fadeRise, stagger, spring } from '../../lib/motion'
import { BottomSheet } from '../../components/BottomSheet'
import { ListSkeleton } from '../../components/Skeleton'
import type { InterviewSubmission } from '../../types'

const DIFFICULTY_LABELS = ['', 'Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard']
const DIFFICULTY_COLORS = ['', '#34C759', '#34C759', '#FF9F0A', '#FF3B30', '#FF3B30']

export function InterviewsScreen() {
  const { submissions, loading, error, search, setSearch, addSubmission, deleteSubmission } = useInterviews()
  const { user } = useAuth()
  const [selected, setSelected] = useState<InterviewSubmission | null>(null)
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="min-h-screen bg-surface pb-tab-bar">
      {/* Header */}
      <div className="bg-white px-5 pt-safe-top pb-3 border-b border-border sticky top-0 z-20">
        <div className="pt-3 pb-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary-text tracking-tight">Interviews</h1>
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
            placeholder="Search company, role..."
            className="w-full bg-surface rounded-xl pl-9 pr-4 py-2.5 text-sm text-primary-text placeholder:text-secondary-text outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="px-4 py-4"><ListSkeleton count={5} /></div>
      ) : error ? (
        <ErrorState message={error} />
      ) : submissions.length === 0 ? (
        <EmptyInterviews onAdd={() => setShowForm(true)} />
      ) : (
        <motion.div
          variants={stagger}
          initial="initial"
          animate="animate"
          className="px-4 py-4 space-y-3"
        >
          {submissions.map((sub) => (
            <InterviewCard
              key={sub.id}
              submission={sub}
              onClick={() => setSelected(sub)}
            />
          ))}
        </motion.div>
      )}

      {/* Detail sheet */}
      <BottomSheet
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.company} — ${selected.role}` : undefined}
        fullHeight
      >
        {selected && (
          <InterviewDetail
            submission={selected}
            currentUserId={user?.id}
            onDelete={async () => {
              await deleteSubmission(selected.id)
              setSelected(null)
            }}
          />
        )}
      </BottomSheet>

      {/* Add form sheet */}
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

function InterviewCard({ submission, onClick }: { submission: InterviewSubmission; onClick: () => void }) {
  const diffColor = DIFFICULTY_COLORS[submission.difficulty ?? 0]

  return (
    <motion.button
      variants={fadeRise}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={spring}
      className="w-full bg-white rounded-2xl shadow-card p-4 text-left"
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
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              submission.outcome === 'selected' ? 'text-live bg-live/10' :
              submission.outcome === 'rejected' ? 'text-danger bg-danger/10' :
              'text-secondary-text bg-surface'
            }`}>
              {submission.outcome}
            </span>
          )}
        </div>
      </div>

      {submission.is_anonymous && (
        <p className="text-xs text-secondary-text mt-2">👤 Anonymous</p>
      )}
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
  const canDelete = currentUserId && submission.user_id === currentUserId
  const diffColor = DIFFICULTY_COLORS[submission.difficulty ?? 0]

  return (
    <div className="px-5 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-primary-text">{submission.company}</h2>
          <p className="text-secondary-text">{submission.role}</p>
        </div>
        {canDelete && (
          <button
            onClick={onDelete}
            className="text-danger text-sm font-medium px-3 py-1.5 bg-danger/10 rounded-xl"
          >
            Delete
          </button>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-2">
        {submission.round_type && (
          <span className="text-xs font-semibold text-accent bg-accent/10 px-3 py-1 rounded-full">
            {submission.round_type}
          </span>
        )}
        {submission.interview_date && (
          <span className="text-xs text-secondary-text bg-surface px-3 py-1 rounded-full">
            {new Date(submission.interview_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        )}
        {submission.outcome && (
          <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${
            submission.outcome === 'selected' ? 'text-live bg-live/10' :
            submission.outcome === 'rejected' ? 'text-danger bg-danger/10' :
            'text-secondary-text bg-surface'
          }`}>
            {submission.outcome}
          </span>
        )}
        {submission.is_anonymous && (
          <span className="text-xs text-secondary-text bg-surface px-3 py-1 rounded-full">
            Anonymous
          </span>
        )}
      </div>

      {/* Difficulty */}
      {submission.difficulty && (
        <div>
          <p className="text-xs text-secondary-text mb-1 uppercase tracking-wide font-semibold">Difficulty</p>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: i < submission.difficulty! ? diffColor : '#E5E5EA' }}
                />
              ))}
            </div>
            <span className="text-sm font-medium" style={{ color: diffColor }}>
              {DIFFICULTY_LABELS[submission.difficulty]}
            </span>
          </div>
        </div>
      )}

      {/* Questions */}
      {submission.questions && (
        <div>
          <p className="text-xs text-secondary-text mb-2 uppercase tracking-wide font-semibold">Questions Asked</p>
          <p className="text-sm text-primary-text leading-relaxed bg-surface rounded-2xl p-4">
            {submission.questions}
          </p>
        </div>
      )}

      {/* Experience */}
      {submission.experience && (
        <div>
          <p className="text-xs text-secondary-text mb-2 uppercase tracking-wide font-semibold">Experience</p>
          <p className="text-sm text-primary-text leading-relaxed">{submission.experience}</p>
        </div>
      )}

      {/* Tips */}
      {submission.tips && (
        <div>
          <p className="text-xs text-secondary-text mb-2 uppercase tracking-wide font-semibold">Tips</p>
          <div className="bg-soon/10 rounded-2xl p-4">
            <p className="text-sm text-primary-text leading-relaxed">💡 {submission.tips}</p>
          </div>
        </div>
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
  onSubmit: (data: Omit<InterviewSubmission, 'id' | 'created_at' | 'profile'>) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    company: '',
    role: '',
    round_type: '',
    interview_date: '',
    questions: '',
    experience: '',
    tips: '',
    difficulty: 3,
    outcome: '',
    is_anonymous: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company || !form.role) {
      setError('Company and role are required')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        ...form,
        user_id: form.is_anonymous ? null : userId,
        interview_date: form.interview_date || null,
        round_type: form.round_type || null,
        questions: form.questions || null,
        experience: form.experience || null,
        tips: form.tips || null,
        outcome: form.outcome || null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
      {error && (
        <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      <Field label="Company *">
        <input
          className="input"
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
          placeholder="e.g. McKinsey"
        />
      </Field>

      <Field label="Role *">
        <input
          className="input"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          placeholder="e.g. Strategy Intern"
        />
      </Field>

      <Field label="Round Type">
        <input
          className="input"
          value={form.round_type}
          onChange={(e) => setForm({ ...form, round_type: e.target.value })}
          placeholder="e.g. Case Interview, HR"
        />
      </Field>

      <Field label="Interview Date">
        <input
          type="date"
          className="input"
          value={form.interview_date}
          onChange={(e) => setForm({ ...form, interview_date: e.target.value })}
        />
      </Field>

      <Field label="Difficulty">
        <div className="flex gap-2 flex-wrap">
          {[1,2,3,4,5].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setForm({ ...form, difficulty: d })}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                form.difficulty === d
                  ? 'bg-accent text-white'
                  : 'bg-surface text-secondary-text'
              }`}
            >
              {DIFFICULTY_LABELS[d]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Outcome">
        <div className="flex gap-2">
          {['selected', 'rejected', 'waiting'].map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setForm({ ...form, outcome: o })}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium capitalize transition-colors ${
                form.outcome === o ? 'bg-accent text-white' : 'bg-surface text-secondary-text'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Questions Asked">
        <textarea
          className="input min-h-[80px] resize-none"
          value={form.questions}
          onChange={(e) => setForm({ ...form, questions: e.target.value })}
          placeholder="What were you asked?"
        />
      </Field>

      <Field label="Your Experience">
        <textarea
          className="input min-h-[80px] resize-none"
          value={form.experience}
          onChange={(e) => setForm({ ...form, experience: e.target.value })}
          placeholder="How did it go?"
        />
      </Field>

      <Field label="Tips for Others">
        <textarea
          className="input min-h-[60px] resize-none"
          value={form.tips}
          onChange={(e) => setForm({ ...form, tips: e.target.value })}
          placeholder="Any advice?"
        />
      </Field>

      {/* Anonymous toggle */}
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm font-medium text-primary-text">Post anonymously</p>
          <p className="text-xs text-secondary-text">Your name won't be shown</p>
        </div>
        <button
          type="button"
          onClick={() => setForm({ ...form, is_anonymous: !form.is_anonymous })}
          className={`w-12 h-6 rounded-full transition-colors ${
            form.is_anonymous ? 'bg-accent' : 'bg-border'
          } relative`}
        >
          <motion.div
            animate={{ x: form.is_anonymous ? 24 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow"
          />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2 pb-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 rounded-2xl text-secondary-text font-semibold bg-surface"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 py-3 rounded-2xl text-white font-semibold bg-accent disabled:opacity-50"
        >
          {submitting ? 'Posting...' : 'Share'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-secondary-text uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

function EmptyInterviews({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="text-4xl mb-3">💼</div>
      <h3 className="text-lg font-semibold text-primary-text">No experiences yet</h3>
      <p className="text-sm text-secondary-text mt-1 mb-4">Be the first to share your interview experience.</p>
      <button
        onClick={onAdd}
        className="px-5 py-2.5 bg-accent text-white rounded-2xl text-sm font-semibold"
      >
        Share Experience
      </button>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-sm text-secondary-text">{message}</p>
    </div>
  )
}
