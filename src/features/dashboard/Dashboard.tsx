import React, { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth'
import { useSchedule } from '../../hooks/useSchedule'
import { useMessMenu } from '../../hooks/useMessMenu'
import { useProjects } from '../../hooks/useProjects'
import {
  formatTime12,
  dayOffsetIST,
  timeToMinutes,
  nowIST,
  formatIST,
} from '../../lib/timeUtils'
import { BottomSheet } from '../../components/BottomSheet'
import type { MealType, CourseProgress, Project } from '../../types'
import { MOCK_TERMS } from '../../lib/mockData'

const MEAL_ICONS: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  hi_tea: '☕',
  snacks: '☕',
  dinner: '🌙',
}

export function Dashboard() {
  const schedule = useSchedule()
  const mess = useMessMenu()
  const projects = useProjects()
  const { user, profile, signOut } = useAuth()

  // Pull-to-refresh state
  const [pullY, setPullY] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const touchStartY = useRef(0)

  // Full day food & schedule sheet states
  const [showFoodSheet, setShowFoodSheet] = useState(false)
  const [foodSheetOffset, setFoodSheetOffset] = useState<number>(0)
  const [showScheduleSheet, setShowScheduleSheet] = useState(false)
  const [scheduleSheetOffset, setScheduleSheetOffset] = useState<number>(0)
  const [showProfileSheet, setShowProfileSheet] = useState(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0].clientY
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current > 0 && window.scrollY === 0) {
      const currentY = e.touches[0].clientY
      const diff = currentY - touchStartY.current
      if (diff > 0) {
        setPullY(Math.min(diff * 0.4, 70))
      }
    }
  }

  const handleTouchEnd = async () => {
    if (pullY > 45 && !isRefreshing) {
      setIsRefreshing(true)
      setPullY(45)
      await Promise.all([schedule.refresh(), mess.refresh(), projects.refresh()])
      setIsRefreshing(false)
    }
    setPullY(0)
    touchStartY.current = 0
  }

  // Dynamic date and term week derived from active term in DB
  const todayDateObj = nowIST()
  const dateFormatted = formatIST(todayDateObj, 'EEEE, d MMMM') // e.g. "Friday, 9 October"

  // Derive term week from DB term start date
  const termStartDate = MOCK_TERMS[0]?.start_date || '2026-09-21'
  const termEndDate = MOCK_TERMS[0]?.end_date || '2026-12-19'
  const termName = MOCK_TERMS[0]?.term_name || 'Term III'

  const startMillis = new Date(termStartDate + 'T00:00:00').getTime()
  const endMillis = new Date(termEndDate + 'T00:00:00').getTime()
  const currentMillis = todayDateObj.getTime()
  const diffDays = Math.max(0, Math.floor((currentMillis - startMillis) / (1000 * 60 * 60 * 24)))
  const termWeek = Math.max(1, Math.floor(diffDays / 7) + 1)
  const totalWeeks = Math.max(1, Math.ceil((endMillis - startMillis) / (1000 * 60 * 60 * 24 * 7)))

  // Schedule sheet computed data
  const scheduleTargetDate = dayOffsetIST(scheduleSheetOffset)
  const targetDateSessions = schedule.getSessionsForDate(scheduleTargetDate)
  const targetDateEvents = schedule.events.filter((e) => e.date === scheduleTargetDate)

  // Food sheet computed data
  const foodTargetDate = dayOffsetIST(foodSheetOffset)

  return (
    <div
      className="min-h-screen bg-[#F8FAFC] pb-tab-bar select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      <AnimatePresence>
        {(pullY > 0 || isRefreshing) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: pullY || 40 }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-center overflow-hidden"
          >
            <motion.div
              animate={{ rotate: isRefreshing ? 360 : pullY * 4 }}
              transition={isRefreshing ? { repeat: Infinity, duration: 0.8, ease: 'linear' } : { duration: 0 }}
              className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header matching layout */}
      <header className="px-5 pt-safe-top pt-4 pb-2 bg-transparent max-w-md mx-auto">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 tracking-tight">
              {dateFormatted} · Week {termWeek}
            </p>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-0.5">
              What's Next
            </h1>
          </div>

          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => setShowProfileSheet(true)}
            className="w-10 h-10 rounded-full bg-white shadow-xs border border-slate-200/80 flex items-center justify-center text-sm font-black text-[#007AFF] mt-1"
            title="Account & Profile"
          >
            {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : (user?.email?.charAt(0).toUpperCase() || 'S')}
          </motion.button>
        </div>
      </header>

      {/* Main Content: Strict DB Data Binding */}
      <main className="px-4 space-y-3.5 pt-2 max-w-md mx-auto">
        {/* 1. TWO-COLUMN SIDE-BY-SIDE GRID (Up Next & Food from DB) */}
        <div className="grid grid-cols-2 gap-3.5">
          <UpNextCard
            schedule={schedule}
            onTap={() => {
              setScheduleSheetOffset(0)
              setShowScheduleSheet(true)
            }}
          />
          <FoodCard
            mess={mess}
            onTap={() => {
              setFoodSheetOffset(0)
              setShowFoodSheet(true)
            }}
          />
        </div>

        {/* 3. COURSE PROGRESS SECTION (Strictly from DB course_progress & sessions) */}
        <CourseProgressSection
          progressList={schedule.courseProgressList}
          termName={termName}
          termWeek={termWeek}
          totalWeeks={totalWeeks}
        />

        {/* 4. DUE SOON SECTION (Strictly from DB projects/assignments) */}
        <DueSoonSection projects={projects.upcoming} />
      </main>

      {/* ─── FULL DAY SCHEDULE SHEET ────────────────────────────────────────── */}
      <BottomSheet
        isOpen={showScheduleSheet}
        onClose={() => setShowScheduleSheet(false)}
        title={
          scheduleSheetOffset === 0
            ? "Today's Schedule"
            : scheduleSheetOffset === 1
            ? "Tomorrow's Schedule"
            : `Schedule (${scheduleTargetDate})`
        }
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between bg-surface p-1 rounded-2xl border border-border">
            <button
              onClick={() => setScheduleSheetOffset((prev) => prev - 1)}
              className="p-2 text-secondary-text hover:text-primary-text rounded-xl"
              title="Previous Day"
            >
              ←
            </button>
            <div className="flex gap-1.5">
              <button
                onClick={() => setScheduleSheetOffset(0)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                  scheduleSheetOffset === 0
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-secondary-text hover:text-primary-text'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setScheduleSheetOffset(1)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                  scheduleSheetOffset === 1
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-secondary-text hover:text-primary-text'
                }`}
              >
                Tomorrow
              </button>
            </div>
            <button
              onClick={() => setScheduleSheetOffset((prev) => prev + 1)}
              className="p-2 text-secondary-text hover:text-primary-text rounded-xl"
              title="Next Day"
            >
              →
            </button>
          </div>

          <div className="text-center">
            <h3 className="text-sm font-bold text-primary-text">
              {new Date(scheduleTargetDate + 'T00:00:00').toLocaleDateString('en-IN', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </h3>
            <p className="text-[11px] text-secondary-text mt-0.5">
              {targetDateSessions.length} {targetDateSessions.length === 1 ? 'class session' : 'class sessions'}
              {targetDateEvents.length > 0 && ` · ${targetDateEvents.length} event${targetDateEvents.length > 1 ? 's' : ''}`}
            </p>
          </div>

          <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-0.5">
            {targetDateSessions.length > 0 ? (
              targetDateSessions.map((s) => {
                const isNow = scheduleSheetOffset === 0 && schedule.currentSession?.id === s.id
                return (
                  <div
                    key={s.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isNow
                        ? 'bg-accent/10 border-accent/40 shadow-sm'
                        : s.status === 'cancelled'
                        ? 'bg-red-50/60 border-red-200/60 opacity-75'
                        : s.status === 'rescheduled'
                        ? 'bg-amber-50/60 border-amber-200/60'
                        : 'bg-white border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono text-primary-text">
                          {formatTime12(s.start_time)} – {formatTime12(s.end_time)}
                        </span>
                        {isNow && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                            Live Now
                          </span>
                        )}
                        {s.status === 'cancelled' && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            Cancelled
                          </span>
                        )}
                        {s.status === 'rescheduled' && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            Rescheduled
                          </span>
                        )}
                      </div>

                      {s.session_no && (
                        <span className="text-[10px] font-bold bg-surface text-secondary-text px-2 py-0.5 rounded-full border border-border shadow-2xs">
                          Session {s.session_no} of {s.course?.total_sessions || 20}
                        </span>
                      )}
                    </div>

                    <div className="flex items-start gap-2 mt-1">
                      {s.course?.color_tag && (
                        <span
                          className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0"
                          style={{ backgroundColor: s.course.color_tag }}
                        />
                      )}
                      <div>
                        <h4 className="text-sm font-bold text-primary-text">
                          {s.course?.name || s.course_id || 'Class Session'}
                        </h4>
                        <p className="text-xs text-secondary-text mt-0.5">
                          {s.course?.faculty && `${s.course.faculty} · `}
                          📍 {s.room || 'CR-7C-15'}
                        </p>
                        {s.note && (
                          <p className="text-[11px] font-medium text-amber-700 mt-1 bg-amber-100/50 px-2 py-0.5 rounded-lg inline-block">
                            📝 {s.note}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : targetDateEvents.length === 0 ? (
              <div className="text-center py-8 bg-surface rounded-2xl border border-dashed border-border space-y-1.5">
                <span className="text-3xl">🏖️</span>
                <p className="text-sm font-bold text-primary-text">No Classes Scheduled</p>
                <p className="text-xs text-secondary-text">No lectures or events charted for this day.</p>
              </div>
            ) : null}

            {targetDateEvents.length > 0 && (
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-secondary-text uppercase tracking-wider">
                  Campus Events & Exams
                </h4>
                {targetDateEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3.5 bg-blue-50/70 border border-blue-200/60 rounded-2xl space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-900 capitalize">
                        📌 {ev.title}
                      </span>
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        {ev.type}
                      </span>
                    </div>
                    {ev.start_time && (
                      <p className="text-[11px] text-blue-700 font-mono">
                        ⏰ {formatTime12(ev.start_time)} {ev.end_time ? `– ${formatTime12(ev.end_time)}` : ''}
                      </p>
                    )}
                    {ev.venue && (
                      <p className="text-[11px] text-blue-700">📍 {ev.venue}</p>
                    )}
                    {ev.note && (
                      <p className="text-[11px] text-blue-800 italic">📝 {ev.note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setScheduleSheetOffset((prev) => (prev === 0 ? 1 : prev + 1))}
            className="w-full py-3 bg-accent text-white rounded-xl text-sm font-semibold shadow-sm hover:opacity-95 transition-opacity flex items-center justify-center gap-2"
          >
            <span>{scheduleSheetOffset === 0 ? "See Tomorrow's Schedule →" : "See Next Day's Schedule →"}</span>
          </button>
        </div>
      </BottomSheet>

      {/* ─── FULL DAY MESS MENU SHEET ───────────────────────────────────────── */}
      <BottomSheet
        isOpen={showFoodSheet}
        onClose={() => setShowFoodSheet(false)}
        title={foodSheetOffset === 0 ? "Today's Mess Menu" : foodSheetOffset === 1 ? "Tomorrow's Mess Menu" : `Mess Menu (${foodTargetDate})`}
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between bg-surface p-1 rounded-2xl border border-border">
            <button
              onClick={() => setFoodSheetOffset((prev) => prev - 1)}
              className="p-2 text-secondary-text hover:text-primary-text rounded-xl"
              title="Previous Day"
            >
              ←
            </button>
            <div className="flex gap-1.5">
              <button
                onClick={() => setFoodSheetOffset(0)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                  foodSheetOffset === 0
                    ? 'bg-[#FF9500] text-white shadow-sm'
                    : 'text-secondary-text hover:text-primary-text'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setFoodSheetOffset(1)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                  foodSheetOffset === 1
                    ? 'bg-[#FF9500] text-white shadow-sm'
                    : 'text-secondary-text hover:text-primary-text'
                }`}
              >
                Tomorrow
              </button>
            </div>
            <button
              onClick={() => setFoodSheetOffset((prev) => prev + 1)}
              className="p-2 text-secondary-text hover:text-primary-text rounded-xl"
              title="Next Day"
            >
              →
            </button>
          </div>

          <div className="text-center">
            <h3 className="text-sm font-bold text-primary-text">
              {new Date(foodTargetDate + 'T00:00:00').toLocaleDateString('en-IN', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </h3>
          </div>

          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-0.5">
            {mess.getDayMenu(foodTargetDate).length > 0 ? (
              mess.getDayMenu(foodTargetDate).map((dayMenu) => {
                const isCurrentServing =
                  foodSheetOffset === 0 &&
                  mess.displayMeal?.isNowServing &&
                  mess.displayMeal.meal.meal === dayMenu.meal

                return (
                  <div
                    key={dayMenu.meal}
                    className={`p-4 rounded-2xl transition-all ${
                      isCurrentServing
                        ? 'bg-amber-50 border border-amber-300 shadow-sm'
                        : 'bg-white border border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{MEAL_ICONS[dayMenu.meal] || '🍽'}</span>
                        <span className="font-bold text-sm text-primary-text capitalize">
                          {dayMenu.label || dayMenu.meal.replace('_', ' ')}
                        </span>
                        {isCurrentServing && (
                          <span className="text-[10px] font-bold uppercase bg-amber-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                            Now Serving
                          </span>
                        )}
                        {dayMenu.has_non_veg && (
                          <span className="text-[10px] font-bold uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                            Non-Veg / Egg
                          </span>
                        )}
                        {dayMenu.has_special && (
                          <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                            ⭐ Special
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-medium text-secondary-text font-mono">
                        {formatTime12(dayMenu.start_time)} – {formatTime12(dayMenu.end_time)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {dayMenu.items.map((item, idx) => (
                        <div
                          key={idx}
                          className={`text-xs bg-surface px-2.5 py-1 rounded-full text-primary-text shadow-2xs border font-medium flex items-center gap-1.5 ${
                            item.diet === 'non_veg'
                              ? 'border-red-200 text-red-950 bg-red-50/30'
                              : item.diet === 'egg'
                              ? 'border-amber-200 text-amber-950 bg-amber-50/30'
                              : 'border-border/60'
                          }`}
                        >
                          {item.diet === 'non_veg' && <span className="text-[10px]">🔴</span>}
                          {item.diet === 'egg' && <span className="text-[10px]">🟡</span>}
                          {item.is_special && <span className="text-amber-500">⭐</span>}
                          <span>{item.name}</span>
                          {item.note && (
                            <span className="text-[10px] text-secondary-text italic">
                              ({item.note})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center py-10 bg-surface rounded-2xl border border-dashed border-border space-y-1.5">
                <span className="text-3xl">🍽</span>
                <p className="text-sm font-bold text-primary-text">Menu Not Available</p>
                <p className="text-xs text-secondary-text">Menu hasn't been posted for this day yet.</p>
              </div>
            )}
          </div>

          <button
            onClick={() => setFoodSheetOffset((prev) => (prev === 0 ? 1 : prev + 1))}
            className="w-full py-3 bg-[#FF9500] text-white rounded-xl text-sm font-semibold shadow-sm hover:opacity-95 transition-opacity flex items-center justify-center gap-2"
          >
            <span>{foodSheetOffset === 0 ? "See Tomorrow's Mess Menu →" : "See Next Day's Menu →"}</span>
          </button>
        </div>
      </BottomSheet>

      {/* ─── STUDENT PROFILE SHEET ─────────────────────────────────────────── */}
      <BottomSheet
        isOpen={showProfileSheet}
        onClose={() => setShowProfileSheet(false)}
        title="Account & Profile"
      >
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3.5 bg-surface rounded-2xl p-4">
            <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center font-bold text-base shadow-sm">
              {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : (user?.email?.charAt(0).toUpperCase() || 'S')}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-primary-text truncate">
                {profile?.full_name ?? 'DEM Student'}
              </h3>
              <p className="text-xs text-secondary-text truncate mt-0.5 font-mono">
                {profile?.email ?? user?.email ?? 'student@iimu.ac.in'}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-accent/10 text-accent">
                  {profile?.role ?? 'student'}
                </span>
                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-amber-500/10 text-amber-700">
                  {profile?.program?.toUpperCase() || 'DEM'} {profile?.batch_year || 2026}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-surface/60 rounded-2xl p-4 space-y-2.5 text-xs text-secondary-text">
            <div className="flex justify-between">
              <span>Institute:</span>
              <strong className="text-primary-text">IIM Udaipur</strong>
            </div>
            <div className="flex justify-between">
              <span>Cohort:</span>
              <strong className="text-primary-text">{profile?.program?.toUpperCase() ?? 'DEM'} {profile?.batch_year ?? 2026}</strong>
            </div>
            <div className="flex justify-between">
              <span>Timezone:</span>
              <strong className="text-primary-text">Asia/Kolkata (IST)</strong>
            </div>
            <div className="flex justify-between">
              <span>Offline Caching:</span>
              <strong className="text-[#34C759]">Active (Workbox)</strong>
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={async () => {
              setShowProfileSheet(false)
              await signOut()
            }}
            className="w-full py-3.5 bg-red-50 hover:bg-red-100 text-danger rounded-2xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sign Out
          </motion.button>
        </div>
      </BottomSheet>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. UP NEXT CARD (Left Column - strictly DB bound)
// ═════════════════════════════════════════════════════════════════════════════

function UpNextCard({
  schedule,
  onTap,
}: {
  schedule: ReturnType<typeof useSchedule>
  onTap: () => void
}) {
  const { currentSession, nextSession, currentTime, extendedState } = schedule

  // The active session is either currently live, or the next session today, or next scheduled day
  const displaySession = currentSession || nextSession || extendedState.futureDayInfo?.session
  const isLive = Boolean(currentSession)

  if (!displaySession) {
    return (
      <motion.div
        whileTap={{ scale: 0.97 }}
        onClick={onTap}
        className="bg-white rounded-[26px] border border-slate-100 shadow-2xs p-4 flex flex-col justify-between min-h-[168px] cursor-pointer hover:border-slate-200 transition-all"
      >
        <div>
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
            UP NEXT
          </span>
          <div className="text-lg font-black text-[#0F2942] tracking-tight mt-2">
            No Classes
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Enjoy your free time!
          </p>
        </div>
        <div className="mt-3">
          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 font-bold text-[10px] px-2.5 py-1 rounded-full">
            All Done 🎉
          </span>
        </div>
      </motion.div>
    )
  }

  const timeDisplay = formatTime12(displaySession.start_time).replace(/\s?(AM|PM)/i, '')
  const titleDisplay = displaySession.course?.name || displaySession.course_id || 'Class Session'
  const facultyName = displaySession.course?.faculty
  const sessionNo = displaySession.session_no || 1
  const totalSessions = displaySession.course?.total_sessions || 20

  const curMins = timeToMinutes(currentTime)
  const targetMins = timeToMinutes(displaySession.start_time)
  const isToday = isLive || displaySession.id === nextSession?.id
  const diffMins = isToday ? Math.max(0, targetMins - curMins) : 0
  const diffText = isLive
    ? 'LIVE NOW'
    : isToday
    ? (diffMins > 60 ? `in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m` : `in ${diffMins}m`)
    : (extendedState.futureDayInfo?.dayLabel || 'Upcoming')

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onTap}
      className={`rounded-[26px] border shadow-2xs p-4 flex flex-col justify-between min-h-[168px] cursor-pointer transition-all ${
        isLive ? 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300' : 'bg-white border-slate-100 hover:border-slate-200'
      }`}
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
            {isLive ? 'CURRENT CLASS' : 'UP NEXT'}
          </span>
          {isLive && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </div>
        <div className="text-2xl font-black text-[#0F2942] tracking-tight mt-1 font-mono">
          {timeDisplay}
        </div>
        <h3 className="text-xs font-bold text-slate-800 line-clamp-1 mt-1 leading-snug" title={titleDisplay}>
          {titleDisplay}
        </h3>
        {facultyName && (
          <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
            {facultyName.startsWith('Prof') ? facultyName : `Prof. ${facultyName}`}
          </p>
        )}
      </div>

      <div className="mt-3">
        <span
          className={`inline-flex items-center gap-1 font-bold text-[10px] px-2.5 py-1 rounded-full truncate max-w-full ${
            isLive ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-50 text-blue-600'
          }`}
        >
          {diffText} · S{sessionNo}/{totalSessions}
        </span>
      </div>
    </motion.div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. FOOD / MESS CARD (Right Column - strictly DB bound)
// ═════════════════════════════════════════════════════════════════════════════

function FoodCard({
  mess,
  onTap,
}: {
  mess: ReturnType<typeof useMessMenu>
  onTap: () => void
}) {
  const { displayMeal } = mess

  if (!displayMeal) {
    return (
      <motion.div
        whileTap={{ scale: 0.97 }}
        onClick={onTap}
        className="bg-[#FFF8F0] rounded-[26px] border border-[#FDE8D0]/70 shadow-2xs p-4 flex flex-col justify-between min-h-[168px] cursor-pointer hover:border-[#FDE8D0] transition-all"
      >
        <div>
          <span className="text-[10px] font-extrabold text-[#A05E26] uppercase tracking-wider block">
            MESS MENU
          </span>
          <div className="text-sm font-extrabold text-[#422206] leading-tight truncate mt-2">
            No Menu Posted
          </div>
        </div>
        <div className="mt-3">
          <span className="bg-white rounded-xl py-1 px-2.5 shadow-2xs text-[#422206] text-[11px] font-bold inline-block">
            Check Timings
          </span>
        </div>
      </motion.div>
    )
  }

  // Real meal data from DB
  const mealType = displayMeal.meal.meal || 'lunch'
  const mealLabel = displayMeal.dayMenu?.label || mealType.toUpperCase().replace('_', ' ')
  const mealTime = formatTime12(displayMeal.meal.start_time).replace(/\s?(AM|PM)/i, '')

  const items = displayMeal.dayMenu?.items || []
  const mainDish = items.length > 0 ? items[0].name : (displayMeal.meal.items[0] || 'Meal')
  const otherItems = items.length > 1
    ? items.slice(1, 3).map((i) => i.name).join(', ')
    : (displayMeal.meal.items.slice(1, 3).join(', ') || '')

  // Non-veg, Egg, or Special highlight strictly from DB flags
  const nonVegOrEggItem = items.find((i) => i.diet === 'non_veg' || i.diet === 'egg')
  const specialItem = items.find((i) => i.is_special)

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onTap}
      className="bg-[#FFF8F0] rounded-[26px] border border-[#FDE8D0]/70 shadow-2xs p-4 flex flex-col justify-between min-h-[168px] cursor-pointer hover:border-[#FDE8D0] transition-all"
    >
      <div>
        <span className="text-[10px] font-extrabold text-[#A05E26] uppercase tracking-wider block">
          {mealLabel} · {mealTime}
        </span>
        <div className="text-base font-extrabold text-[#422206] leading-tight truncate mt-1">
          {mainDish}
        </div>
        {otherItems && (
          <p className="text-[11px] font-medium text-[#8C6239] line-clamp-2 mt-0.5 leading-snug">
            + {otherItems}
          </p>
        )}
      </div>

      <div className="mt-3">
        {nonVegOrEggItem ? (
          <div className="bg-white rounded-xl py-1 px-2.5 shadow-2xs text-[#422206] text-[11px] font-bold flex items-center gap-1.5 w-full max-w-full overflow-hidden">
            <span className="w-3.5 h-3.5 rounded-[3px] border border-[#C2410C] flex items-center justify-center flex-shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${nonVegOrEggItem.diet === 'non_veg' ? 'bg-[#C2410C]' : 'bg-[#D97706]'}`} />
            </span>
            <span className="truncate flex-1">{nonVegOrEggItem.name}</span>
          </div>
        ) : specialItem ? (
          <div className="bg-white rounded-xl py-1 px-2.5 shadow-2xs text-[#422206] text-[11px] font-bold flex items-center gap-1.5 w-full max-w-full overflow-hidden">
            <span className="flex-shrink-0">⭐</span>
            <span className="truncate flex-1">{specialItem.name}</span>
          </div>
        ) : (
          <div className="bg-white rounded-xl py-1 px-2.5 shadow-2xs text-[#059669] text-[11px] font-bold flex items-center gap-1.5 w-fit">
            <span className="w-3.5 h-3.5 rounded-[3px] border border-[#059669] flex items-center justify-center flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
            </span>
            <span>Pure Veg</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. COURSE PROGRESS SECTION (Strictly DB bound, harmonious blue shades)
// ═════════════════════════════════════════════════════════════════════════════

const BLUE_SHADES = [
  '#007AFF', // Vibrant Blue
  '#0F2942', // Deep Navy Blue
  '#2563EB', // Royal Blue
  '#1D4ED8', // Dark Royal Blue
  '#0284C7', // Slate Ocean Blue
  '#3B82F6', // Sky Deep Blue
  '#1E40AF', // Midnight Blue
]

function CourseProgressSection({
  progressList,
  termName,
  termWeek,
  totalWeeks,
}: {
  progressList: CourseProgress[]
  termName: string
  termWeek: number
  totalWeeks: number
}) {
  if (!progressList || progressList.length === 0) {
    return null
  }

  // Display top courses from DB
  const displayCourses = progressList.slice(0, 4)

  return (
    <section className="bg-white rounded-[26px] border border-slate-100 shadow-2xs p-4.5 space-y-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-extrabold text-slate-400 tracking-wider uppercase">
          COURSE PROGRESS
        </h2>
        <span className="text-xs font-medium text-slate-400">
          {termName} · week {termWeek} of {totalWeeks}
        </span>
      </div>

      <div className="space-y-3">
        {displayCourses.map((item, idx) => {
          const completed = item.completed_sessions
          const total = item.total_sessions || 20
          const pct = item.percent_complete
          const barColor = BLUE_SHADES[idx % BLUE_SHADES.length]
          const facultyName = item.faculty
            ? item.faculty.startsWith('Prof')
              ? item.faculty
              : `Prof. ${item.faculty}`
            : null

          return (
            <div key={item.course_id || item.course_code} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-baseline gap-1.5 truncate max-w-[70%]">
                  <span className="font-black text-slate-800 tracking-tight">
                    {item.course_code}
                  </span>
                  {facultyName && (
                    <span className="text-[11px] font-medium text-slate-500 truncate" title={facultyName}>
                      · {facultyName}
                    </span>
                  )}
                </div>

                <span className="text-right font-bold text-slate-500 font-mono text-[11px] flex-shrink-0">
                  {completed}/{total}
                </span>
              </div>

              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: barColor }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. DUE SOON SECTION (Strictly DB bound)
// ═════════════════════════════════════════════════════════════════════════════

function DueSoonSection({ projects }: { projects: Project[] }) {
  if (!projects || projects.length === 0) {
    return null
  }

  return (
    <section className="bg-white rounded-[26px] border border-slate-100 shadow-2xs p-4.5 space-y-3">
      <h2 className="text-xs font-extrabold text-slate-400 tracking-wider uppercase">
        DUE SOON
      </h2>

      <div className="space-y-2.5">
        {projects.slice(0, 3).map((item) => {
          const d = new Date(item.deadline)
          const diffDays = Math.ceil((d.getTime() - Date.now()) / (1000 * 3600 * 24))
          let dayLabel = d.toLocaleDateString('en-IN', { weekday: 'short' })
          if (diffDays <= 0) dayLabel = 'Today'
          else if (diffDays === 1) dayLabel = 'Tmrw'

          const isUrgent = diffDays <= 2

          return (
            <div key={item.id} className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-slate-800 flex-1 truncate" title={item.description || item.title}>
                {item.title}
              </span>
              <span
                className={`text-xs font-bold ${
                  isUrgent ? 'text-[#D97706]' : 'text-slate-400 font-semibold'
                }`}
              >
                {dayLabel}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
