import React, { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useSchedule } from '../../hooks/useSchedule'
import { useMessMenu } from '../../hooks/useMessMenu'
import { useProjects } from '../../hooks/useProjects'
import { useInterviews } from '../../hooks/useInterviews'
import {
  formatTime12,
  dayOffsetIST,
  todayIST,
  timeToMinutes,
  nowIST,
  formatIST,
  formatDeadline,
  secondsUntilDeadline,
  formatDuration,
} from '../../lib/timeUtils'
import { BottomSheet } from '../../components/BottomSheet'
import { PlacementDeadlineWidget } from './PlacementDeadlineWidget'
import type { MealType, Project, ProjectType, InterviewSubmission } from '../../types'
import { MOCK_TERMS } from '../../lib/mockData'

const MEAL_ICONS: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  hi_tea: '☕',
  snacks: '☕',
  dinner: '🌙',
}

const TYPE_COLORS: Record<ProjectType, { bg: string; text: string; label: string }> = {
  assignment: { bg: 'bg-blue-50 text-blue-700 border-blue-200/60', text: '#0A84FF', label: 'Assignment' },
  project: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/60', text: '#34C759', label: 'Project' },
  'end-term': { bg: 'bg-rose-50 text-rose-700 border-rose-200/60', text: '#FF3B30', label: 'End-term' },
}

export function Dashboard() {
  const navigate = useNavigate()
  const schedule = useSchedule()
  const mess = useMessMenu()
  const projects = useProjects()
  const interviews = useInterviews()
  const { user, profile, signOut } = useAuth()

  // Pull-to-refresh state
  const [pullY, setPullY] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const touchStartY = useRef(0)

  // Sheet states
  const [showFoodSheet, setShowFoodSheet] = useState(false)
  const [foodSheetOffset, setFoodSheetOffset] = useState<number>(0)
  const [showScheduleSheet, setShowScheduleSheet] = useState(false)
  const [scheduleSheetOffset, setScheduleSheetOffset] = useState<number>(0)
  const [showProfileSheet, setShowProfileSheet] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

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
      await Promise.all([schedule.refresh(), mess.refresh(), projects.refresh(), interviews.refresh()])
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
  const startMillis = new Date(termStartDate + 'T00:00:00').getTime()
  const currentMillis = todayDateObj.getTime()
  const diffDays = Math.max(0, Math.floor((currentMillis - startMillis) / (1000 * 60 * 60 * 24)))
  const termWeek = Math.max(1, Math.floor(diffDays / 7) + 1)

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

        {/* 2. PLACEMENT OPPORTUNITY (Live Countdown above projects) */}
        <PlacementDeadlineWidget />

        {/* 3. PROJECTS & ASSIGNMENTS SECTION */}
        <DashboardProjectsSection
          projects={projects.upcoming}
          onSelectProject={(p) => setSelectedProject(p)}
          onViewAll={() => navigate('/projects')}
        />

        {/* 4. INTERVIEW INSIGHTS & EXPERIENCES */}
        <DashboardInterviewsSection
          submissions={interviews.submissions}
          onViewAll={() => navigate('/interviews')}
        />
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

      {/* ─── PROJECT DETAIL BOTTOM SHEET ───────────────────────────────────── */}
      <BottomSheet
        isOpen={Boolean(selectedProject)}
        onClose={() => setSelectedProject(null)}
        title={selectedProject ? selectedProject.title : 'Project Details'}
      >
        {selectedProject && (
          <div className="p-5 space-y-4">
            {/* Type + Course Code */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                  TYPE_COLORS[selectedProject.type]?.bg || 'bg-slate-100 text-slate-700'
                }`}
              >
                {TYPE_COLORS[selectedProject.type]?.label || selectedProject.type}
              </span>
              {selectedProject.course && (
                <span className="text-xs font-semibold text-secondary-text bg-surface px-2.5 py-1 rounded-full border border-border">
                  {selectedProject.course.code} · {selectedProject.course.name}
                </span>
              )}
            </div>

            {/* Deadline Card */}
            <div className="p-4 rounded-2xl bg-surface border border-border space-y-1">
              <p className="text-xs font-semibold text-secondary-text">Submission Deadline</p>
              <p className="text-sm font-bold text-primary-text">
                {formatDeadline(selectedProject.deadline)}
              </p>
              {(() => {
                const secs = secondsUntilDeadline(selectedProject.deadline)
                const isPast = secs <= 0
                return (
                  <p className={`text-xs font-bold ${isPast ? 'text-secondary-text' : secs < 86400 * 2 ? 'text-danger' : 'text-soon'}`}>
                    {isPast ? 'Deadline passed' : `${formatDuration(secs)} remaining`}
                  </p>
                )
              })()}
            </div>

            {/* Description */}
            {selectedProject.description && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-secondary-text uppercase tracking-wider">
                  Description
                </p>
                <div className="bg-surface/60 rounded-2xl p-3.5 border border-border text-xs text-primary-text leading-relaxed whitespace-pre-wrap">
                  {selectedProject.description}
                </div>
              </div>
            )}

            {/* Group Size */}
            {selectedProject.group_size > 1 && (
              <div className="flex items-center gap-2 bg-surface rounded-xl p-3 border border-border text-xs font-semibold text-primary-text">
                <span className="text-base">👥</span>
                <span>Group Deliverable (Max {selectedProject.group_size} members)</span>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2 pt-2">
              {selectedProject.submission_link && (
                <a
                  href={selectedProject.submission_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-accent text-white rounded-2xl text-xs font-bold shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-2"
                >
                  <span>Open Submission Portal</span>
                  <span>↗</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedProject(null)
                  navigate('/projects')
                }}
                className="w-full py-3 bg-surface text-primary-text border border-border rounded-2xl text-xs font-bold hover:bg-slate-200/60 transition-colors"
              >
                Go to Projects Screen →
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. UP NEXT CARD (Left Column - strictly DB bound)
// ═════════════════════════════════════════════════════════════════════════════

function getUpNextScheduleItem(
  schedule: ReturnType<typeof useSchedule>
): {
  isEvent: boolean
  isLive: boolean
  timeDisplay: string
  titleDisplay: string
  subtitle: string
  pillText: string
  eventTypeBadge?: string
} | null {
  const { currentSession, nextSession, currentTime, extendedState, events, classSessions } = schedule
  const today = todayIST()
  const curMins = timeToMinutes(currentTime)

  // 1. Check if an event is active right now
  const liveEvent = events.find((e) => {
    if (e.date !== today || e.status === 'cancelled') return false
    if (!e.start_time || !e.end_time) return false
    const start = timeToMinutes(e.start_time)
    const end = timeToMinutes(e.end_time)
    return curMins >= start && curMins < end
  })

  if (liveEvent) {
    const formattedType = liveEvent.type.replace(/_/g, ' ')
    const timeDisplay = formatTime12(liveEvent.start_time!).replace(/\s?(AM|PM)/i, '')
    return {
      isEvent: true,
      isLive: true,
      timeDisplay,
      titleDisplay: liveEvent.title,
      subtitle: liveEvent.venue ? `📍 ${liveEvent.venue}` : (liveEvent.company || formattedType),
      pillText: 'LIVE NOW · Event',
      eventTypeBadge: formattedType,
    }
  }

  // 2. Check if a class is active right now
  if (currentSession) {
    const timeDisplay = formatTime12(currentSession.start_time).replace(/\s?(AM|PM)/i, '')
    const titleDisplay = currentSession.course?.name || currentSession.course_id || 'Class Session'
    const facultyName = currentSession.course?.faculty
    const sessionNo = currentSession.session_no || 1
    const totalSessions = currentSession.course?.total_sessions || 20
    return {
      isEvent: false,
      isLive: true,
      timeDisplay,
      titleDisplay,
      subtitle: facultyName
        ? (facultyName.startsWith('Prof') ? facultyName : `Prof. ${facultyName}`)
        : (currentSession.room ? `📍 ${currentSession.room}` : ''),
      pillText: `LIVE NOW · S${sessionNo}/${totalSessions}`,
    }
  }

  // 3. Upcoming today: compare next upcoming event today vs next class today
  const todayUpcomingEvents = events
    .filter(
      (e) =>
        e.date === today &&
        e.status !== 'cancelled' &&
        e.start_time &&
        timeToMinutes(e.start_time) > curMins
    )
    .sort((a, b) => timeToMinutes(a.start_time!) - timeToMinutes(b.start_time!))
  const nextEventToday = todayUpcomingEvents[0]

  if (nextEventToday && nextSession) {
    const eventMins = timeToMinutes(nextEventToday.start_time!)
    const classMins = timeToMinutes(nextSession.start_time)
    if (eventMins <= classMins) {
      const diffMins = Math.max(0, eventMins - curMins)
      const diffText = diffMins > 60 ? `in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m` : `in ${diffMins}m`
      const formattedType = nextEventToday.type.replace(/_/g, ' ')
      return {
        isEvent: true,
        isLive: false,
        timeDisplay: formatTime12(nextEventToday.start_time!).replace(/\s?(AM|PM)/i, ''),
        titleDisplay: nextEventToday.title,
        subtitle: nextEventToday.venue ? `📍 ${nextEventToday.venue}` : (nextEventToday.company || formattedType),
        pillText: `${diffText} · Event`,
        eventTypeBadge: formattedType,
      }
    }
  } else if (nextEventToday && !nextSession) {
    const eventMins = timeToMinutes(nextEventToday.start_time!)
    const diffMins = Math.max(0, eventMins - curMins)
    const diffText = diffMins > 60 ? `in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m` : `in ${diffMins}m`
    const formattedType = nextEventToday.type.replace(/_/g, ' ')
    return {
      isEvent: true,
      isLive: false,
      timeDisplay: formatTime12(nextEventToday.start_time!).replace(/\s?(AM|PM)/i, ''),
      titleDisplay: nextEventToday.title,
      subtitle: nextEventToday.venue ? `📍 ${nextEventToday.venue}` : (nextEventToday.company || formattedType),
      pillText: `${diffText} · Event`,
      eventTypeBadge: formattedType,
    }
  }

  // If nextSession is up next today
  if (nextSession) {
    const timeDisplay = formatTime12(nextSession.start_time).replace(/\s?(AM|PM)/i, '')
    const titleDisplay = nextSession.course?.name || nextSession.course_id || 'Class Session'
    const facultyName = nextSession.course?.faculty
    const sessionNo = nextSession.session_no || 1
    const totalSessions = nextSession.course?.total_sessions || 20
    const targetMins = timeToMinutes(nextSession.start_time)
    const diffMins = Math.max(0, targetMins - curMins)
    const diffText = diffMins > 60 ? `in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m` : `in ${diffMins}m`
    return {
      isEvent: false,
      isLive: false,
      timeDisplay,
      titleDisplay,
      subtitle: facultyName
        ? (facultyName.startsWith('Prof') ? facultyName : `Prof. ${facultyName}`)
        : (nextSession.room ? `📍 ${nextSession.room}` : ''),
      pillText: `${diffText} · S${sessionNo}/${totalSessions}`,
    }
  }

  // 4. All-day event today
  const allDayEventToday = events.find(
    (e) => e.date === today && e.status !== 'cancelled' && (e.all_day || !e.start_time)
  )
  if (allDayEventToday) {
    const formattedType = allDayEventToday.type.replace(/_/g, ' ')
    return {
      isEvent: true,
      isLive: false,
      timeDisplay: 'All Day',
      titleDisplay: allDayEventToday.title,
      subtitle: allDayEventToday.venue ? `📍 ${allDayEventToday.venue}` : formattedType,
      pillText: 'Today · Event',
      eventTypeBadge: formattedType,
    }
  }

  // 5. Future day check (across next 14 days)
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  let earliestFutureItem: {
    offset: number
    dateStr: string
    dayLabel: string
    classSession?: any
    event?: any
  } | null = null

  for (let offset = 1; offset <= 14; offset++) {
    const targetDate = dayOffsetIST(offset)
    const dayOfWeek = new Date(targetDate + 'T00:00:00+05:30').getDay()
    const dayLabel = offset === 1 ? 'Tomorrow' : DAY_NAMES[dayOfWeek]

    const dayClasses = classSessions.filter((s) => s.date === targetDate && s.status !== 'cancelled')
    const dayEvs = events.filter((e) => e.date === targetDate && e.status !== 'cancelled')

    if (dayClasses.length > 0 || dayEvs.length > 0) {
      if (dayEvs.length > 0 && dayClasses.length > 0) {
        const firstClass = dayClasses[0]
        const firstEv = dayEvs[0]
        const classMins = timeToMinutes(firstClass.start_time)
        const evMins = firstEv.start_time ? timeToMinutes(firstEv.start_time) : 0
        if (firstEv.start_time && evMins <= classMins) {
          earliestFutureItem = { offset, dateStr: targetDate, dayLabel, event: firstEv }
        } else {
          earliestFutureItem = { offset, dateStr: targetDate, dayLabel, classSession: firstClass }
        }
      } else if (dayEvs.length > 0) {
        earliestFutureItem = { offset, dateStr: targetDate, dayLabel, event: dayEvs[0] }
      } else {
        earliestFutureItem = { offset, dateStr: targetDate, dayLabel, classSession: dayClasses[0] }
      }
      break
    }
  }

  if (earliestFutureItem?.event) {
    const ev = earliestFutureItem.event
    const formattedType = ev.type.replace(/_/g, ' ')
    const timeDisplay = ev.start_time ? formatTime12(ev.start_time).replace(/\s?(AM|PM)/i, '') : 'All Day'
    return {
      isEvent: true,
      isLive: false,
      timeDisplay,
      titleDisplay: ev.title,
      subtitle: ev.venue ? `📍 ${ev.venue}` : (ev.company || formattedType),
      pillText: `${earliestFutureItem.dayLabel} · Event`,
      eventTypeBadge: formattedType,
    }
  }

  if (earliestFutureItem?.classSession) {
    const cs = earliestFutureItem.classSession
    const timeDisplay = formatTime12(cs.start_time).replace(/\s?(AM|PM)/i, '')
    const titleDisplay = cs.course?.name || cs.course_id || 'Class Session'
    const facultyName = cs.course?.faculty || cs.faculty
    const sessionNo = cs.session_no || 1
    const totalSessions = cs.course?.total_sessions || 20
    return {
      isEvent: false,
      isLive: false,
      timeDisplay,
      titleDisplay,
      subtitle: facultyName ? (facultyName.startsWith('Prof') ? facultyName : `Prof. ${facultyName}`) : (cs.room ? `📍 ${cs.room}` : ''),
      pillText: `${earliestFutureItem.dayLabel} · S${sessionNo}/${totalSessions}`,
    }
  }

  if (extendedState.futureDayInfo?.session) {
    const s = extendedState.futureDayInfo.session
    const timeDisplay = formatTime12(s.start_time).replace(/\s?(AM|PM)/i, '')
    const titleDisplay = s.course?.name || s.course_id || 'Class Session'
    const facultyName = s.course?.faculty
    const sessionNo = s.session_no || 1
    const totalSessions = s.course?.total_sessions || 20
    return {
      isEvent: false,
      isLive: false,
      timeDisplay,
      titleDisplay,
      subtitle: facultyName ? (facultyName.startsWith('Prof') ? facultyName : `Prof. ${facultyName}`) : (s.room ? `📍 ${s.room}` : ''),
      pillText: `${extendedState.futureDayInfo.dayLabel} · S${sessionNo}/${totalSessions}`,
    }
  }

  return null
}

function UpNextCard({
  schedule,
  onTap,
}: {
  schedule: ReturnType<typeof useSchedule>
  onTap: () => void
}) {
  const item = getUpNextScheduleItem(schedule)

  if (!item) {
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

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onTap}
      className={`rounded-[26px] border shadow-2xs p-4 flex flex-col justify-between min-h-[168px] cursor-pointer transition-all ${
        item.isLive
          ? item.isEvent
            ? 'bg-purple-50/50 border-purple-200 hover:border-purple-300'
            : 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300'
          : item.isEvent
          ? 'bg-white border-indigo-100/80 hover:border-indigo-200'
          : 'bg-white border-slate-100 hover:border-slate-200'
      }`}
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
            {item.isLive ? (item.isEvent ? 'CURRENT EVENT' : 'CURRENT CLASS') : item.isEvent ? 'UPCOMING EVENT' : 'UP NEXT'}
          </span>
          {item.isLive ? (
            <span
              className={`w-2 h-2 rounded-full animate-pulse ${
                item.isEvent ? 'bg-purple-500' : 'bg-emerald-500'
              }`}
            />
          ) : item.isEvent ? (
            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/60">
              {item.eventTypeBadge || 'Event'}
            </span>
          ) : null}
        </div>

        <div className="text-2xl font-black text-[#0F2942] tracking-tight mt-1 font-mono">
          {item.timeDisplay}
        </div>

        <h3
          className="text-xs font-bold text-slate-800 line-clamp-1 mt-1 leading-snug"
          title={item.titleDisplay}
        >
          {item.titleDisplay}
        </h3>

        {item.subtitle && (
          <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
            {item.subtitle}
          </p>
        )}
      </div>

      <div className="mt-3">
        <span
          className={`inline-flex items-center gap-1 font-bold text-[10px] px-2.5 py-1 rounded-full truncate max-w-full ${
            item.isLive
              ? item.isEvent
                ? 'bg-purple-100 text-purple-800'
                : 'bg-emerald-100 text-emerald-800'
              : item.isEvent
              ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
              : 'bg-blue-50 text-blue-600'
          }`}
        >
          {item.pillText}
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
// 2. DASHBOARD PROJECTS & ASSIGNMENTS SECTION
// ═════════════════════════════════════════════════════════════════════════════

function DashboardProjectsSection({
  projects,
  onSelectProject,
  onViewAll,
}: {
  projects: Project[]
  onSelectProject: (p: Project) => void
  onViewAll: () => void
}) {
  const upcomingList = projects.slice(0, 3)

  return (
    <section className="bg-white rounded-[26px] border border-slate-100 shadow-2xs p-4.5 space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">📚</span>
          <h2 className="text-xs font-extrabold text-slate-400 tracking-wider uppercase">
            Projects & Deadlines
          </h2>
          {upcomingList.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {upcomingList.length} upcoming
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs font-bold text-accent hover:opacity-80 transition-opacity flex items-center gap-0.5"
        >
          <span>View all</span>
          <span>→</span>
        </button>
      </div>

      {/* Projects List or Empty State */}
      {upcomingList.length > 0 ? (
        <div className="space-y-2.5">
          {upcomingList.map((item) => {
            const secs = secondsUntilDeadline(item.deadline)
            const isPast = secs <= 0
            const isUrgent = secs > 0 && secs < 86400 * 2
            const typeConfig = TYPE_COLORS[item.type] || {
              bg: 'bg-slate-50 text-slate-700 border-slate-200/60',
              label: item.type,
            }

            return (
              <motion.div
                key={item.id}
                data-testid="dashboard-project-card"
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectProject(item)}
                className="p-3 rounded-2xl bg-surface/70 hover:bg-surface border border-border/80 cursor-pointer transition-all space-y-1.5"
              >
                {/* Top Row: Type Badge + Course Tag + Countdown */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${typeConfig.bg}`}
                    >
                      {typeConfig.label}
                    </span>
                    {item.course && (
                      <span className="text-[10px] font-semibold text-secondary-text">
                        {item.course.code}
                      </span>
                    )}
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isPast
                        ? 'bg-slate-100 text-slate-500'
                        : isUrgent
                        ? 'bg-amber-100 text-amber-800 animate-pulse'
                        : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    {isPast ? 'Passed' : formatDuration(secs) + ' left'}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-xs font-bold text-primary-text line-clamp-1">
                  {item.title}
                </h3>

                {/* Sub-info: Formatted date & group size */}
                <div className="flex items-center justify-between text-[11px] text-secondary-text pt-0.5">
                  <span className="truncate">{formatDeadline(item.deadline)}</span>
                  {item.group_size > 1 && (
                    <span className="text-[10px] font-medium text-slate-500">
                      👥 Group of {item.group_size}
                    </span>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      ) : (
        <div className="py-5 text-center bg-surface/50 rounded-2xl border border-dashed border-border space-y-1.5">
          <span className="text-2xl">🎉</span>
          <p className="text-xs font-bold text-primary-text">No Upcoming Deadlines</p>
          <p className="text-[11px] text-secondary-text">You're completely caught up on assignments.</p>
        </div>
      )}
    </section>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. DASHBOARD INTERVIEWS & PLACEMENTS HUB
// ═════════════════════════════════════════════════════════════════════════════

function DashboardInterviewsSection({
  submissions,
  onViewAll,
}: {
  submissions: InterviewSubmission[]
  onViewAll: () => void
}) {
  const recentSubmissions = submissions.slice(0, 2)

  return (
    <section className="bg-white rounded-[26px] border border-slate-100 shadow-2xs p-4.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">💬</span>
            <h2 className="text-xs font-extrabold text-slate-400 tracking-wider uppercase">
              Interview Insights
            </h2>
            {submissions.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {submissions.length} shared
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-bold text-accent hover:opacity-80 transition-opacity flex items-center gap-0.5"
          >
            <span>View all</span>
            <span>→</span>
          </button>
        </div>

        {recentSubmissions.length > 0 ? (
          <div className="space-y-2.5">
            {recentSubmissions.map((sub) => (
              <motion.div
                key={sub.id}
                whileTap={{ scale: 0.98 }}
                onClick={onViewAll}
                className="p-3 rounded-2xl bg-surface/70 hover:bg-surface border border-border/80 cursor-pointer transition-all space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-primary-text truncate">
                    {sub.company}
                  </span>
                  {sub.outcome && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                        sub.outcome.toLowerCase().includes('select') || sub.outcome.toLowerCase().includes('offer')
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {sub.outcome}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-secondary-text">
                  <span className="font-semibold text-primary-text">{sub.role}</span>
                  {sub.round_type && <span>· {sub.round_type}</span>}
                </div>

                {(sub.tips || sub.questions) && (
                  <p className="text-[11px] text-slate-600 line-clamp-1 italic bg-white/70 px-2 py-1 rounded-lg border border-border/40">
                    "{sub.tips || sub.questions}"
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="py-4 text-center bg-surface/50 rounded-2xl border border-dashed border-border space-y-1">
            <p className="text-xs font-semibold text-primary-text">Prepare for upcoming placements</p>
            <p className="text-[11px] text-secondary-text">
              View round formats, questions, and preparation tips from seniors and peers.
            </p>
          </div>
        )}
      </section>
  )
}
