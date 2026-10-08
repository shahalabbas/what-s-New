import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useProjects } from '../../hooks/useProjects'
import { useSchedule } from '../../hooks/useSchedule'
import { formatDeadline, secondsUntilDeadline, formatDuration } from '../../lib/timeUtils'
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
  const { projects, loading, error, filter, setFilter } = useProjects()
  const { classSessions, events, courseProgressList } = useSchedule()
  const [mainTab, setMainTab] = useState<MainTab>('deadlines')
  const [courses, setCourses] = useState<Course[]>(MOCK_COURSES)
  const [selected, setSelected] = useState<Project | null>(null)

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

  return (
    <div className="min-h-screen bg-surface pb-tab-bar">
      {/* Header */}
      <div className="bg-white px-5 pt-safe-top pb-3 border-b border-border sticky top-0 z-20">
        <div className="pt-3 pb-2">
          <h1 className="text-2xl font-bold text-primary-text tracking-tight">Academics</h1>
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
        <EmptyProjects />
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
        {selected && <ProjectDetail project={selected} />}
      </BottomSheet>
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
                <p className="text-xs text-secondary-text mt-0.5">{project.course.name}</p>
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

function ProjectDetail({ project }: { project: Project }) {
  const secs = secondsUntilDeadline(project.deadline)
  const isPast = secs <= 0

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Type + course */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-xs font-semibold px-3 py-1 rounded-full capitalize"
          style={{
            color: TYPE_COLORS[project.type],
            backgroundColor: `${TYPE_COLORS[project.type]}18`,
          }}
        >
          {project.type}
        </span>
        {project.course && (
          <span className="text-xs text-secondary-text">{project.course.name}</span>
        )}
      </div>

      {/* Deadline */}
      <div className="bg-surface rounded-2xl p-4">
        <p className="text-xs text-secondary-text mb-1">Deadline</p>
        <p className="text-base font-semibold text-primary-text">{formatDeadline(project.deadline)}</p>
        <p className={`text-sm mt-1 font-medium ${isPast ? 'text-secondary-text' : secs < 86400*2 ? 'text-danger' : 'text-soon'}`}>
          {isPast ? 'Deadline passed' : `${formatDuration(secs)} remaining`}
        </p>
      </div>

      {/* Description */}
      {project.description && (
        <div>
          <p className="text-xs text-secondary-text mb-2 uppercase tracking-wide font-semibold">Description</p>
          <p className="text-sm text-primary-text leading-relaxed">{project.description}</p>
        </div>
      )}

      {/* Group size */}
      {project.group_size > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-lg">👥</span>
          <p className="text-sm text-primary-text">Group of {project.group_size}</p>
        </div>
      )}

      {/* Submission link */}
      {project.submission_link && (
        <a
          href={project.submission_link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-accent text-sm font-medium"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Open Submission Link
        </a>
      )}

      {/* Status */}
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${
          project.status === 'submitted' ? 'text-live bg-live/10' :
          project.status === 'graded' ? 'text-accent bg-accent/10' :
          'text-secondary-text bg-surface'
        }`}>
          {project.status}
        </span>
      </div>
    </div>
  )
}

function EmptyProjects() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="text-4xl mb-3">📁</div>
      <h3 className="text-lg font-semibold text-primary-text">No projects yet</h3>
      <p className="text-sm text-secondary-text mt-1">Projects and assignments will appear here.</p>
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
