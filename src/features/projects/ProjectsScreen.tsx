import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { useProjects } from '../../hooks/useProjects'
import { useSchedule } from '../../hooks/useSchedule'
import { useAuth } from '../../hooks/useAuth'
import {
  formatDeadline,
  secondsUntilDeadline,
  formatDuration,
  dayOffsetIST,
  toDatetimeLocalIST,
  fromDatetimeLocalToIST,
} from '../../lib/timeUtils'
import { calculateCourseProgress } from '../../lib/courseProgress'
import { fadeRise, stagger, spring } from '../../lib/motion'
import { BottomSheet } from '../../components/BottomSheet'
import { ListSkeleton } from '../../components/Skeleton'
import { supabase, isConfiguredSupabase } from '../../lib/supabase'
import { MOCK_COURSES } from '../../lib/mockData'
import type { Project, ProjectType, Course, CourseProgress } from '../../types'

const TYPE_LABELS: Record<ProjectType | 'all', string> = {
  all: 'All',
  assignment: 'Assignments',
  project: 'Projects',
  'end-term': 'End-term',
}

const TYPE_COLORS: Record<string, string> = {
  assignment: '#0A84FF',
  project: '#34C759',
  'end-term': '#FF3B30',
}

type MainTab = 'deadlines' | 'progress'

export function ProjectsScreen() {
  const { projects, loading, error, filter, setFilter, refresh } = useProjects()
  const { classSessions, events, courseProgressList } = useSchedule()
  const { isAdmin, profile } = useAuth()
  const [mainTab, setMainTab] = useState<MainTab>('deadlines')
  const [courses, setCourses] = useState<Course[]>(MOCK_COURSES)
  const [selected, setSelected] = useState<Project | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [deletingProject, setDeletingProject] = useState<Project | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isConfiguredSupabase) {
      supabase.from('courses').select('*').order('code').then(({ data }) => {
        if (data && data.length > 0) setCourses(data)
      })
    }
  }, [])

  const filters: Array<ProjectType | 'all'> = ['all', 'assignment', 'project', 'end-term']
  const progressList = courseProgressList.length > 0
    ? courseProgressList
    : calculateCourseProgress(courses, classSessions, events)

  async function handleSaveProject(data: {
    id?: string
    title: string
    description: string
    type: ProjectType
    course_id: string | null
    deadline: string
    submission_link: string | null
    group_size: number
  }) {
    setSubmitting(true)
    try {
      if (isConfiguredSupabase) {
        if (data.id) {
          // Update
          const { error: err } = await supabase
            .from('projects')
            .update({
              title: data.title,
              description: data.description || null,
              type: data.type,
              course_id: data.course_id || null,
              deadline: data.deadline,
              submission_link: data.submission_link || null,
              group_size: data.group_size,
              updated_at: new Date().toISOString(),
            })
            .eq('id', data.id)
          if (err) throw err
          toast.success('Project updated successfully!')
        } else {
          // Insert
          const { error: err } = await supabase
            .from('projects')
            .insert({
              title: data.title,
              description: data.description || null,
              type: data.type,
              course_id: data.course_id || null,
              deadline: data.deadline,
              submission_link: data.submission_link || null,
              group_size: data.group_size,
              program: profile?.program || 'dem',
              batch_year: profile?.batch_year || 2026,
            })
          if (err) throw err
          toast.success('Project added successfully!')
        }
      } else {
        toast.success(data.id ? 'Project updated (demo mode)' : 'Project added (demo mode)')
      }

      setShowAddModal(false)
      setEditingProject(null)
      setSelected(null)
      await refresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save project')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteProject(project: Project) {
    setSubmitting(true)
    try {
      if (isConfiguredSupabase) {
        const { error: err } = await supabase
          .from('projects')
          .delete()
          .eq('id', project.id)
        if (err) throw err
      }
      toast.success('Project deleted')
      setDeletingProject(null)
      setSelected(null)
      await refresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete project')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface pb-tab-bar">
      {/* Header */}
      <div className="bg-white px-5 pt-safe-top pb-3 border-b border-border sticky top-0 z-20">
        <div className="pt-3 pb-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary-text tracking-tight">Academics</h1>
            <p className="text-xs text-secondary-text mt-0.5">Assignments, projects & course tracking</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => {
                setEditingProject(null)
                setShowAddModal(true)
              }}
              className="px-3 py-1.5 bg-accent text-white font-semibold text-xs rounded-xl shadow-sm hover:opacity-95 flex items-center gap-1 transition-all"
            >
              <span>+</span> Add Project
            </button>
          )}
        </div>

        {/* Main tabs */}
        <div className="flex bg-surface p-1 rounded-xl mb-2.5">
          <button
            onClick={() => setMainTab('deadlines')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              mainTab === 'deadlines' ? 'bg-white text-primary-text shadow-sm' : 'text-secondary-text'
            }`}
          >
            Deadlines ({projects.length})
          </button>
          <button
            onClick={() => setMainTab('progress')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              mainTab === 'progress' ? 'bg-white text-primary-text shadow-sm' : 'text-secondary-text'
            }`}
          >
            Course Progress ({progressList.length})
          </button>
        </div>

        {/* Filter chips (only in deadlines tab) */}
        {mainTab === 'deadlines' && (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {filters.map((f) => (
              <motion.button
                key={f}
                onClick={() => setFilter(f)}
                whileTap={{ scale: 0.94 }}
                transition={spring}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-accent text-white'
                    : 'bg-surface text-secondary-text'
                }`}
              >
                {TYPE_LABELS[f]}
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {mainTab === 'progress' ? (
        <motion.div
          key="progress"
          variants={stagger}
          initial="initial"
          animate="animate"
          className="px-4 py-4 space-y-3"
        >
          {progressList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="text-4xl mb-3">📚</div>
              <h3 className="text-lg font-semibold text-primary-text">No courses found</h3>
              <p className="text-sm text-secondary-text mt-1">Course progress will appear once timetable is loaded.</p>
            </div>
          ) : (
            progressList.map((prog) => (
              <CourseProgressCard key={prog.course_id || prog.course_code} progress={prog} />
            ))
          )}
        </motion.div>
      ) : loading ? (
        <div className="px-4 py-4"><ListSkeleton count={4} /></div>
      ) : error ? (
        <ErrorState message={error} />
      ) : projects.length === 0 ? (
        <EmptyProjects onAddClick={isAdmin ? () => setShowAddModal(true) : undefined} />
      ) : (
        <motion.div
          key={filter}
          variants={stagger}
          initial="initial"
          animate="animate"
          className="px-4 py-4 space-y-3"
        >
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => setSelected(project)}
            />
          ))}
        </motion.div>
      )}

      {/* Detail sheet */}
      <BottomSheet
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title}
        fullHeight
      >
        {selected && (
          <ProjectDetail
            project={selected}
            isAdmin={isAdmin}
            onEdit={() => {
              setEditingProject(selected)
              setShowAddModal(true)
            }}
            onDelete={() => setDeletingProject(selected)}
          />
        )}
      </BottomSheet>

      {/* Add / Edit Project Modal */}
      <AnimatePresence>
        {showAddModal && (
          <ProjectFormModal
            project={editingProject}
            courses={courses}
            submitting={submitting}
            onSave={handleSaveProject}
            onClose={() => {
              setShowAddModal(false)
              setEditingProject(null)
            }}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingProject && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-modal space-y-3"
            >
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl font-bold">
                ⚠️
              </div>
              <h3 className="text-base font-bold text-primary-text">Delete Project?</h3>
              <p className="text-xs text-secondary-text leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-primary-text">"{deletingProject.title}"</span>? This action cannot be undone.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setDeletingProject(null)}
                  className="flex-1 py-2.5 bg-surface text-secondary-text rounded-xl text-xs font-semibold hover:bg-border/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDeleteProject(deletingProject)}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition-colors"
                >
                  {submitting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CourseProgressCard({ progress }: { progress: CourseProgress }) {
  const isComplete = progress.completed_sessions >= progress.total_sessions

  return (
    <motion.div
      variants={fadeRise}
      className="w-full bg-white rounded-2xl shadow-card overflow-hidden p-4 text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-accent bg-accent/10 px-2.5 py-0.5 rounded-full">
              {progress.course_code}
            </span>
            <span className="text-xs text-secondary-text">
              {progress.credits} Credits · {progress.total_sessions} Sessions
            </span>
          </div>
          <h3 className="text-base font-semibold text-primary-text mt-1.5 leading-snug">
            {progress.course_name}
          </h3>
          {progress.faculty && (
            <p className="text-xs text-secondary-text mt-0.5">{progress.faculty}</p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <span className={`text-base font-bold ${isComplete ? 'text-live' : 'text-primary-text'}`}>
            {progress.percent_complete}%
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="w-full bg-surface h-2 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress.percent_complete}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className={`h-full rounded-full ${isComplete ? 'bg-live' : 'bg-accent'}`}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-secondary-text mt-1.5 font-medium">
          <span>
            {progress.completed_sessions} of {progress.total_sessions} done · {progress.remaining_sessions} left
          </span>
          {progress.next_session_date && (
            <span className="text-accent">
              Next: S{progress.next_session_no || progress.completed_sessions + 1} ({progress.next_session_date})
            </span>
          )}
        </div>
      </div>

      {progress.exam_date && (
        <div className="mt-2.5 pt-2 border-t border-border flex items-center gap-2 text-xs text-secondary-text">
          <span>📝 Exam:</span>
          <span className="font-semibold text-primary-text">{progress.exam_date}</span>
        </div>
      )}
    </motion.div>
  )
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const secs = secondsUntilDeadline(project.deadline)
  const isPast = secs <= 0
  const isUrgent = secs > 0 && secs < 86400 * 2

  return (
    <motion.button
      variants={fadeRise}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={spring}
      className="w-full bg-white rounded-2xl shadow-card overflow-hidden text-left"
    >
      <div className="flex">
        <div
          className="w-1.5 flex-shrink-0 rounded-l-2xl"
          style={{ backgroundColor: TYPE_COLORS[project.type] ?? '#6E6E73' }}
        />
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-primary-text">{project.title}</h3>
              {project.course && (
                <p className="text-xs text-secondary-text mt-0.5">{project.course.code} · {project.course.name}</p>
              )}
            </div>
            <div className="flex-shrink-0 flex flex-col items-end gap-1">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isPast
                    ? 'text-secondary-text bg-surface'
                    : isUrgent
                    ? 'text-danger bg-danger/10'
                    : 'text-soon bg-soon/10'
                }`}
              >
                {isPast ? 'Past' : formatDuration(secs)}
              </span>
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{
                  color: TYPE_COLORS[project.type],
                  backgroundColor: `${TYPE_COLORS[project.type]}15`,
                }}
              >
                {TYPE_LABELS[project.type]}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-secondary-text">
              Due {formatDeadline(project.deadline)}
            </span>
            {project.group_size > 1 && (
              <span className="text-xs text-secondary-text">
                👥 Group of {project.group_size}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  )
}

function Linkify({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s<>"']+)/g
  const parts = text.split(urlRegex)
  return (
    <span>
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline font-medium hover:opacity-80 break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          )
        }
        return part
      })}
    </span>
  )
}

function FormattedDescription({ text }: { text: string }) {
  const paragraphs = text.split(/\r?\n/)
  return (
    <div className="space-y-2 text-sm text-primary-text leading-relaxed">
      {paragraphs.map((para, i) => (
        <p key={i} className="min-h-[1em]">
          <Linkify text={para} />
        </p>
      ))}
    </div>
  )
}

function ProjectDetail({
  project,
  isAdmin,
  onEdit,
  onDelete,
}: {
  project: Project
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const secs = secondsUntilDeadline(project.deadline)
  const isPast = secs <= 0

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Type + course */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-xs font-semibold px-3 py-1 rounded-full capitalize"
            style={{
              color: TYPE_COLORS[project.type],
              backgroundColor: `${TYPE_COLORS[project.type]}18`,
            }}
          >
            {project.type === 'end-term' ? 'End-term Project' : project.type}
          </span>
          {project.course && (
            <span className="text-xs text-secondary-text font-medium">
              {project.course.code} · {project.course.name}
            </span>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onEdit}
              className="px-2.5 py-1 bg-surface text-primary-text border border-border rounded-lg text-xs font-semibold hover:bg-border/60 transition-colors"
            >
              ✏️ Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors"
            >
              🗑️ Delete
            </button>
          </div>
        )}
      </div>

      {/* Deadline */}
      <div className="bg-surface rounded-2xl p-4 border border-border">
        <p className="text-xs text-secondary-text mb-1">Deadline</p>
        <p className="text-base font-semibold text-primary-text">{formatDeadline(project.deadline)}</p>
        <p className={`text-sm mt-1 font-medium ${isPast ? 'text-secondary-text' : secs < 86400 * 2 ? 'text-danger' : 'text-soon'}`}>
          {isPast ? 'Deadline passed' : `${formatDuration(secs)} remaining`}
        </p>
      </div>

      {/* Description with clickable links */}
      {project.description && (
        <div className="space-y-1.5">
          <p className="text-xs text-secondary-text uppercase tracking-wide font-semibold">Description</p>
          <div className="bg-surface/50 rounded-2xl p-3.5 border border-border">
            <FormattedDescription text={project.description} />
          </div>
        </div>
      )}

      {/* Group size */}
      {project.group_size > 1 && (
        <div className="flex items-center gap-2 bg-surface rounded-xl p-3 border border-border text-xs text-primary-text font-medium">
          <span className="text-base">👥</span>
          <span>Group Submission (Maximum {project.group_size} members)</span>
        </div>
      )}

      {/* Submission link */}
      {project.submission_link && (
        <a
          href={project.submission_link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 bg-accent text-white rounded-2xl text-xs font-semibold shadow-sm hover:opacity-95 transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Open Submission Link
        </a>
      )}
    </div>
  )
}

function ProjectFormModal({
  project,
  courses,
  submitting,
  onSave,
  onClose,
}: {
  project: Project | null
  courses: Course[]
  submitting: boolean
  onSave: (data: any) => void
  onClose: () => void
}) {
  const defaultDeadline = project
    ? toDatetimeLocalIST(project.deadline)
    : `${dayOffsetIST(7)}T23:59`

  const [title, setTitle] = useState(project?.title || '')
  const [description, setDescription] = useState(project?.description || '')
  const [type, setType] = useState<ProjectType>(project?.type || 'assignment')
  const [courseId, setCourseId] = useState(project?.course_id || '')
  const [deadlineLocal, setDeadlineLocal] = useState(defaultDeadline)
  const [submissionLink, setSubmissionLink] = useState(project?.submission_link || '')
  const [groupSize, setGroupSize] = useState<number>(project?.group_size || 1)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)

    if (!title.trim()) {
      setErrorMsg('Title is required')
      return
    }

    if (title.length > 120) {
      setErrorMsg('Title cannot exceed 120 characters')
      return
    }

    if (description.length > 2000) {
      setErrorMsg('Description cannot exceed 2000 characters')
      return
    }

    const isoDeadline = fromDatetimeLocalToIST(deadlineLocal)
    if (!isoDeadline) {
      setErrorMsg('Valid deadline is required')
      return
    }

    // Past deadline validation
    if (!courseId || !courseId.trim()) {
      setErrorMsg('Subject (Course) is required')
      return
    }

    onSave({
      id: project?.id,
      title: title.trim(),
      description: description.trim(),
      type,
      course_id: courseId,
      deadline: isoDeadline,
      submission_link: submissionLink.trim() || null,
      group_size: Number(groupSize) || 1,
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl p-5 max-w-lg w-full shadow-modal space-y-4 max-h-[92vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📁</span>
            <div>
              <h3 className="text-base font-bold text-primary-text">
                {project ? 'Edit Project / Assignment' : 'Add Project / Assignment'}
              </h3>
              <p className="text-[11px] text-secondary-text">
                Publish course deliverables & milestones for DEM 2026
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-secondary-text hover:text-primary-text text-sm">✕</button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-2xl bg-danger/10 text-danger text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Subject Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-secondary-text mb-1">
              Subject (Course) *
            </label>
            <select
              value={courseId}
              required
              onChange={(e) => setCourseId(e.target.value)}
              className="input text-xs font-semibold"
            >
              <option value="">-- Select Subject / Course (Required) --</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type Segmented Control */}
          <div>
            <label className="block text-xs font-semibold text-secondary-text mb-1">
              Deliverable Type *
            </label>
            <div className="flex bg-surface p-1 rounded-2xl border border-border gap-1">
              {(['assignment', 'project', 'end-term'] as ProjectType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    type === t
                      ? 'bg-white text-primary-text shadow-sm border border-border'
                      : 'text-secondary-text hover:text-primary-text'
                  }`}
                >
                  {t === 'assignment' ? 'Assignment' : t === 'project' ? 'Project' : 'End-term project'}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-secondary-text">
                Title *
              </label>
              <span className={`text-[10px] ${title.length > 110 ? 'text-danger font-bold' : 'text-secondary-text'}`}>
                {title.length}/120
              </span>
            </div>
            <input
              type="text"
              required
              maxLength={120}
              placeholder="e.g. DSO 503 · Case Study Milestone 1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input text-xs"
            />
          </div>

          {/* Description */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-secondary-text">
                Description (Guidelines & Links)
              </label>
              <span className={`text-[10px] ${description.length > 1900 ? 'text-danger font-bold' : 'text-secondary-text'}`}>
                {description.length}/2000
              </span>
            </div>
            <textarea
              rows={5}
              maxLength={2000}
              placeholder="Provide assignment guidelines, scoring rubric, and instructions. URLs will become clickable automatically..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input text-xs font-mono resize-y min-h-[110px]"
            />
          </div>

          {/* Deadline Date + Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-secondary-text mb-1">
                Submission End Date (IST) *
              </label>
              <input
                type="datetime-local"
                required
                value={deadlineLocal}
                onChange={(e) => setDeadlineLocal(e.target.value)}
                className="input text-xs font-semibold text-accent border-accent/40 bg-accent/5"
              />
              <p className="text-[10px] text-secondary-text mt-1">
                Default: 11:59 PM Asia/Kolkata
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-secondary-text mb-1">
                Group Size (Max)
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={groupSize}
                onChange={(e) => setGroupSize(parseInt(e.target.value) || 1)}
                className="input text-xs"
              />
              <p className="text-[10px] text-secondary-text mt-1">
                1 for Individual, 2-10 for Team
              </p>
            </div>
          </div>

          {/* Submission link */}
          <div>
            <label className="block text-xs font-semibold text-secondary-text mb-1">
              Submission Link (Google Form / Drive / Portal)
            </label>
            <input
              type="url"
              placeholder="https://..."
              value={submissionLink}
              onChange={(e) => setSubmissionLink(e.target.value)}
              className="input text-xs"
            />
          </div>

          {/* Form Actions */}
          <div className="flex gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 bg-surface text-secondary-text rounded-xl text-xs font-semibold hover:bg-border/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 bg-accent text-white rounded-xl text-xs font-semibold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {submitting ? 'Saving...' : project ? 'Update Project' : 'Save & Publish'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function EmptyProjects({ onAddClick }: { onAddClick?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4 space-y-3">
      <div className="text-4xl">📁</div>
      <h3 className="text-lg font-semibold text-primary-text">No projects yet</h3>
      <p className="text-sm text-secondary-text max-w-xs">Projects and assignments will appear here once published by faculty or admin.</p>
      {onAddClick && (
        <button
          onClick={onAddClick}
          className="px-4 py-2 bg-accent text-white text-xs font-semibold rounded-xl shadow-sm hover:opacity-95"
        >
          + Add First Project
        </button>
      )}
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="text-4xl mb-3">⚠️</div>
      <h3 className="text-lg font-semibold text-primary-text">Something went wrong</h3>
      <p className="text-sm text-secondary-text mt-1">{message}</p>
    </div>
  )
}
