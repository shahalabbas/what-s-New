import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { useSchedule } from '../../hooks/useSchedule'
import { formatTime12, dayOffsetIST } from '../../lib/timeUtils'
import { fadeRise, stagger, spring } from '../../lib/motion'
import { ListSkeleton } from '../../components/Skeleton'
import type { ResolvedSession } from '../../types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SESSION_TYPE_COLORS: Record<string, string> = {
  lecture: '#0A84FF',
  tutorial: '#34C759',
  exam: '#FF3B30',
  other: '#6E6E73',
}

export function TimetableScreen() {
  const schedule = useSchedule()
  const [selectedOffset, setSelectedOffset] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const selectedDate = dayOffsetIST(selectedOffset)
  const sessions = schedule.getSessionsForDate(selectedDate)

  // Day selector: show 7 days centered on today
  const dayOffsets = [-2, -1, 0, 1, 2, 3, 4]

  return (
    <div className="min-h-screen bg-surface pb-tab-bar">
      {/* Header */}
      <div className="bg-white px-5 pt-safe-top pb-0 border-b border-border sticky top-0 z-20">
        <div className="pt-3 pb-2">
          <h1 className="text-2xl font-bold text-primary-text tracking-tight">Schedule</h1>
        </div>

        {/* Day selector */}
        <div
          ref={scrollRef}
          className="flex gap-1 overflow-x-auto pb-3 scrollbar-none -mx-1 px-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {dayOffsets.map((offset) => {
            const dateStr = dayOffsetIST(offset)
            const date = new Date(dateStr + 'T00:00:00')
            const dayName = DAYS[date.getDay()]
            const dayNum = date.getDate()
            const isSelected = offset === selectedOffset
            const isToday = offset === 0

            return (
              <motion.button
                key={offset}
                onClick={() => setSelectedOffset(offset)}
                whileTap={{ scale: 0.92 }}
                transition={spring}
                className={`flex flex-col items-center px-3 py-2 rounded-xl min-w-[52px] relative flex-shrink-0 ${
                  isSelected
                    ? 'bg-accent text-white'
                    : 'text-secondary-text hover:bg-surface'
                }`}
              >
                <span className="text-[10px] font-medium uppercase">{dayName}</span>
                <span className={`text-lg font-bold ${isSelected ? 'text-white' : 'text-primary-text'}`}>
                  {dayNum}
                </span>
                {isToday && !isSelected && (
                  <span className="absolute bottom-1 w-1 h-1 bg-accent rounded-full" />
                )}
              </motion.button>
            )
          })}
        </div>
      </div>

      {schedule.loading ? (
        <div className="px-4 py-4"><ListSkeleton count={4} /></div>
      ) : (
        <motion.div
          key={selectedDate}
          variants={stagger}
          initial="initial"
          animate="animate"
          className="px-4 py-4 space-y-3"
        >
          {sessions.length === 0 ? (
            <EmptyDay />
          ) : (
            sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isCurrentSession={
                  selectedOffset === 0 && session.id === schedule.currentSession?.id
                }
              />
            ))
          )}
        </motion.div>
      )}
    </div>
  )
}

function SessionCard({
  session,
  isCurrentSession,
}: {
  session: ResolvedSession
  isCurrentSession: boolean
}) {
  const isCancelled = session.override_action === 'cancelled'
  const isExtra = session.is_extra
  const isRescheduled = session.override_action === 'rescheduled'
  const typeColor = SESSION_TYPE_COLORS[session.session_type] ?? '#6E6E73'

  return (
    <motion.div
      variants={fadeRise}
      className={`bg-white rounded-2xl shadow-card overflow-hidden ${
        isCurrentSession ? 'ring-2 ring-live' : ''
      } ${isCancelled ? 'opacity-60' : ''}`}
    >
      <div className="flex">
        {/* Color bar */}
        <div
          className="w-1.5 flex-shrink-0 rounded-l-2xl"
          style={{ backgroundColor: session.course?.color_tag ?? typeColor }}
        />
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={`text-base font-semibold text-primary-text ${isCancelled ? 'line-through' : ''}`}>
                  {session.course?.name ?? 'Unknown Course'}
                </h3>
                {isCurrentSession && (
                  <span className="text-[10px] font-bold text-live bg-live/10 px-2 py-0.5 rounded-full uppercase">
                    Live
                  </span>
                )}
                {isCancelled && (
                  <span className="text-[10px] font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-full uppercase">
                    Cancelled
                  </span>
                )}
                {isRescheduled && (
                  <span className="text-[10px] font-bold text-soon bg-soon/10 px-2 py-0.5 rounded-full uppercase">
                    Rescheduled
                  </span>
                )}
                {session.session_no && (
                  <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                    S{session.session_no}{session.course?.total_sessions ? ` of ${session.course.total_sessions}` : ''}
                  </span>
                )}
                {isExtra && (
                  <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full uppercase">
                    Extra
                  </span>
                )}
              </div>
              {session.course?.code && (
                <p className="text-xs text-secondary-text mt-0.5">{session.course.code}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-primary-text">
                {formatTime12(session.start_time)}
              </p>
              <p className="text-xs text-secondary-text">
                {formatTime12(session.end_time)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {session.room && (
              <span className="text-xs text-secondary-text flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="2"/>
                  <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="2"/>
                </svg>
                {session.room}
              </span>
            )}
            {session.course?.faculty && (
              <span className="text-xs text-secondary-text">{session.course.faculty}</span>
            )}
            <span className="text-xs text-secondary-text capitalize ml-auto">
              {session.session_type}
            </span>
          </div>

          {session.note && (
            <p className="text-xs text-secondary-text mt-2 bg-surface px-3 py-2 rounded-lg">
              📌 {session.note}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function EmptyDay() {
  return (
    <motion.div
      variants={fadeRise}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="text-4xl mb-3">🎉</div>
      <h3 className="text-lg font-semibold text-primary-text">Free day!</h3>
      <p className="text-sm text-secondary-text mt-1">No classes scheduled for this day.</p>
    </motion.div>
  )
}
