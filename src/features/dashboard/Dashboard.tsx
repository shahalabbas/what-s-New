import React, { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useSchedule } from '../../hooks/useSchedule'
import { useMessMenu } from '../../hooks/useMessMenu'
import { useProjects } from '../../hooks/useProjects'
import { useNow } from '../../hooks/useNow'
import { useNotifications } from '../../hooks/useNotifications'
import toast from 'react-hot-toast'
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
import type { MealType, Project, ProjectType } from '../../types'
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
  const { user, profile, signOut } = useAuth()
  const { themePref, setTheme } = useTheme()
  useNow()
  const notifications = useNotifications({
    sessions: schedule.todaySessions,
    messMenus: mess.menus,
    dayMenus: mess.todayDayMenus,
  })

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

  // Placed mode / Dashboard widget order state (persisted)
  const [isPlacedMode, setIsPlacedMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('whats_next_is_placed')
      return saved === 'true'
    } catch {
      return false
    }
  })


  const setPlacedStatus = (placed: boolean) => {
    setIsPlacedMode(placed)
    try {
      localStorage.setItem('whats_next_is_placed', String(placed))
    } catch {}
  }

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
      className="min-h-screen bg-surface dark:bg-black pb-tab-bar select-none transition-colors duration-200"
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
      <header className="px-5 pt-safe-top pb-2 bg-transparent max-w-md mx-auto">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-[#8E8E93] tracking-tight">
              {dateFormatted} · Week {termWeek}
            </p>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-0.5">
              What's Next
            </h1>
          </div>

          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => setShowProfileSheet(true)}
            className="w-10 h-10 rounded-full bg-white dark:bg-[#1C1C1E] shadow-xs border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-sm font-black text-[#007AFF] dark:text-[#0A84FF] mt-1"
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

        {/* 2 & 3. DYNAMIC ORDERING (Placements vs Projects) */}
        {isPlacedMode ? (
          <>
            {/* PROJECTS & ASSIGNMENTS FIRST */}
            <motion.div
              key="projects-first-section"
              layout
              transition={{ duration: 0.25 }}
            >
              <DashboardProjectsSection
                projects={projects.upcoming}
                onSelectProject={(p) => setSelectedProject(p)}
                onViewAll={() => navigate('/projects')}
              />
            </motion.div>

            {/* PLACEMENT OPPORTUNITY BELOW */}
            <motion.div
              key="placements-bottom-section"
              layout
              transition={{ duration: 0.25 }}
            >
              <PlacementDeadlineWidget />
            </motion.div>
          </>
        ) : (
          <>
            {/* PLACEMENT OPPORTUNITY FIRST */}
            <motion.div
              key="placements-first-section"
              layout
              transition={{ duration: 0.25 }}
            >
              <PlacementDeadlineWidget />
            </motion.div>

            {/* PROJECTS & ASSIGNMENTS BELOW */}
            <motion.div
              key="projects-bottom-section"
              layout
              transition={{ duration: 0.25 }}
            >
              <DashboardProjectsSection
                projects={projects.upcoming}
                onSelectProject={(p) => setSelectedProject(p)}
                onViewAll={() => navigate('/projects')}
              />
            </motion.div>
          </>
        )}
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

          {/* Appearance / Theme Mode Setting */}
          <div className="bg-surface/70 dark:bg-white/5 rounded-2xl p-4 border border-border/80 space-y-2.5">
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary-text flex items-center gap-1.5">
                  <span>🌓</span>
                  <span>Appearance</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-accent/10 text-accent">
                  {themePref === 'system' ? 'Auto (System)' : themePref === 'dark' ? 'Night Mode' : 'Light Mode'}
                </span>
              </div>
              <p className="text-[11px] text-secondary-text">
                {themePref === 'system'
                  ? 'Automatically follows your phone’s system night/day mode in real time.'
                  : themePref === 'dark'
                  ? 'Always night mode (OLED true black & deep surfaces).'
                  : 'Always light mode.'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              {(
                [
                  { id: 'system', label: 'Auto', icon: '📱' },
                  { id: 'light', label: 'Light', icon: '☀️' },
                  { id: 'dark', label: 'Dark', icon: '🌙' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setTheme(mode.id)}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    themePref === mode.id
                      ? 'bg-accent text-white shadow-xs'
                      : 'bg-white dark:bg-[#1C1C1E] text-secondary-text hover:text-primary-text border border-border dark:border-white/10'
                  }`}
                >
                  <span>{mode.icon}</span>
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Placement Status / Dashboard Layout Setting */}
          <div className="bg-surface/70 dark:bg-white/5 rounded-2xl p-4 border border-border/80 space-y-2.5">
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary-text flex items-center gap-1.5">
                  <span>🎓</span>
                  <span>Placement Status</span>
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isPlacedMode ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                }`}>
                  {isPlacedMode ? 'Placed 🎉' : 'Seeking Job'}
                </span>
              </div>
              <p className="text-[11px] text-secondary-text">
                {isPlacedMode
                  ? 'Congratulations! Projects & coursework are prioritized at the top, placements moved to bottom.'
                  : 'Placement opportunities and deadlines are prioritized at the top.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPlacedStatus(false)}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  !isPlacedMode
                    ? 'bg-accent text-white shadow-xs'
                    : 'bg-white dark:bg-[#1C1C1E] text-secondary-text hover:text-primary-text border border-border dark:border-white/10'
                }`}
              >
                <span>💼 Seeking Job</span>
              </button>
              <button
                type="button"
                onClick={() => setPlacedStatus(true)}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  isPlacedMode
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-[#1C1C1E] text-secondary-text hover:text-primary-text border border-border dark:border-white/10'
                }`}
              >
                <span>🎓 I am Placed</span>
              </button>
            </div>
          </div>

          {/* Push Notifications Card (Automatically Active for All Registered Users) */}
          <div className="bg-surface/70 dark:bg-white/5 rounded-2xl p-4 border border-border/80 space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary-text flex items-center gap-1.5">
                  <span>🔔</span>
                  <span>Push Notifications</span>
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    notifications.permission === 'granted'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : notifications.permission === 'denied'
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                      : notifications.permission === 'unsupported'
                      ? 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300'
                      : 'bg-accent/10 text-accent'
                  }`}
                >
                  {notifications.permission === 'granted'
                    ? 'Active for All Students'
                    : notifications.permission === 'denied'
                    ? 'Permission Blocked'
                    : notifications.permission === 'unsupported'
                    ? 'Add to Home'
                    : 'Tap to Allow'}
                </span>
              </div>
              <p className="text-[11px] text-secondary-text leading-relaxed">
                Automatically enabled for all registered students with the official app logo: alerts arrive <strong>5 minutes before each class</strong> and <strong>5 minutes before mess meals</strong> (with complete food items).
              </p>
            </div>

            {notifications.permission !== 'granted' ? (
              <div className="pt-0.5">
                {notifications.permission === 'unsupported' ? (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                    <p className="font-semibold">📲 iOS / iPhone Home Screen Required</p>
                    <p>To enable notifications on iPhone, tap Safari’s Share button ⎋ and choose <strong>"Add to Home Screen"</strong>, then open What’s Next from your home screen.</p>
                  </div>
                ) : notifications.permission === 'denied' ? (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-800 dark:text-rose-300 space-y-1">
                    <p className="font-semibold">⚠️ Notifications Blocked</p>
                    <p>Please allow notifications in your phone’s browser site permissions to receive automated 5-minute class & mess alerts.</p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await notifications.requestPermission()
                      if (res === 'granted') {
                        toast.success('Notifications enabled! 5-min class and mess alerts are active.')
                      } else if (res === 'denied') {
                        toast.error('Permission was denied in browser.')
                      }
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-accent text-white text-xs font-bold shadow-xs hover:bg-accent/90 transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>🔔</span>
                    <span>Allow Phone Notifications</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 pt-0.5">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/60 dark:bg-white/5 border border-border/60 dark:border-white/5 text-[11px] text-secondary-text">
                  <img src="/icons/icon-192.png" alt="App Logo" className="w-5 h-5 rounded-md flex-shrink-0" />
                  <span>5-minute pre-alerts for classes & food menus are active for your account.</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={async () => {
                      const sent = await notifications.sendTestNotification('class')
                      if (sent) toast.success('5-min class alert pushed with app logo!')
                      else toast.error('Could not deliver notification')
                    }}
                    className="py-2 px-2.5 rounded-xl text-[11px] font-bold bg-white dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-200 border border-border dark:border-white/10 hover:border-slate-300 transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>📚 Test 5-Min Class</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const sent = await notifications.sendTestNotification('mess')
                      if (sent) toast.success('5-min mess alert with food & logo pushed!')
                      else toast.error('Could not deliver notification')
                    }}
                    className="py-2 px-2.5 rounded-xl text-[11px] font-bold bg-white dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-200 border border-border dark:border-white/10 hover:border-slate-300 transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>🍽️ Test 5-Min Food</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-surface/60 dark:bg-white/5 rounded-2xl p-4 space-y-2.5 text-xs text-secondary-text">
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
              try {
                if ('serviceWorker' in navigator) {
                  const registrations = await navigator.serviceWorker.getRegistrations()
                  for (const reg of registrations) {
                    await reg.unregister()
                  }
                }
                if ('caches' in window) {
                  const keys = await caches.keys()
                  for (const key of keys) {
                    await caches.delete(key)
                  }
                }
              } catch {}
              window.location.reload()
            }}
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-white rounded-2xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
          >
            <span>🔄</span>
            <span>Force Update App & Clear Cache</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={async () => {
              setShowProfileSheet(false)
              await signOut()
            }}
            className="w-full py-3.5 bg-red-50 hover:bg-red-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-danger rounded-2xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
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
            <div className="p-4 rounded-2xl bg-surface border border-border space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-secondary-text">Submission Deadline</p>
                {(() => {
                  const secs = secondsUntilDeadline(selectedProject.deadline)
                  const isPast = secs <= 0
                  const isCritical = secs > 0 && secs < 3600 * 12
                  return (
                    <span className={`text-xs font-bold ${isPast ? 'text-secondary-text' : isCritical ? 'text-rose-600 animate-pulse' : secs < 86400 * 2 ? 'text-amber-700' : 'text-soon'}`}>
                      {isPast ? 'Deadline passed' : `${formatDuration(secs)} remaining`}
                    </span>
                  )
                })()}
              </div>
              <p className="text-sm font-bold text-primary-text">
                {formatDeadline(selectedProject.deadline)}
              </p>
              {(() => {
                const secs = secondsUntilDeadline(selectedProject.deadline)
                const isPast = secs <= 0
                const isCritical = secs > 0 && secs < 3600 * 12
                const isUrgent = secs > 0 && secs < 86400
                const isWarm = secs >= 86400 && secs < 86400 * 2

                let progress = 100
                if (!isPast) {
                  if (secs < 3600 * 2) progress = 96 + Math.round((1 - secs / (2 * 3600)) * 3)
                  else if (secs < 3600 * 6) progress = 90 + Math.round((1 - secs / (6 * 3600)) * 6)
                  else if (secs < 3600 * 12) progress = 82 + Math.round((1 - secs / (12 * 3600)) * 8)
                  else if (secs < 3600 * 24) progress = 70 + Math.round((1 - secs / (24 * 3600)) * 12)
                  else if (secs < 3600 * 48) progress = 48 + Math.round((1 - secs / (48 * 3600)) * 22)
                  else if (secs < 3600 * 24 * 7) progress = 18 + Math.round((1 - secs / (7 * 86400)) * 30)
                  else progress = 12
                }

                return (
                  <div className="w-full bg-slate-200/70 h-2 rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isPast
                          ? 'bg-slate-300'
                          : isCritical
                          ? 'bg-gradient-to-r from-rose-500 via-amber-400 to-rose-600 shadow-[0_0_10px_rgba(244,63,94,0.7)] animate-pulse'
                          : isUrgent
                          ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                          : isWarm
                          ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                          : 'bg-gradient-to-r from-emerald-400 to-teal-500'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
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

function getEventTiming(e: any): { startTime?: string; endTime?: string } {
  if (e.start_time) {
    return {
      startTime: e.start_time.slice(0, 5),
      endTime: e.end_time ? e.end_time.slice(0, 5) : undefined,
    }
  }
  if (e.start_at) {
    try {
      const d = new Date(e.start_at)
      return { startTime: formatIST(d, 'HH:mm') }
    } catch {}
  }
  // Try extracting from title e.g. "Workshop : ML Ops 3.00 - 5.00" or "10:30 AM" or "3.00 PM"
  if (e.title) {
    const match = e.title.match(/(\d{1,2})[:.](\d{2})\s*(AM|PM)?/i)
    if (match) {
      let hours = parseInt(match[1], 10)
      const mins = match[2]
      const ampm = match[3]?.toUpperCase()
      if (ampm === 'PM' && hours < 12) hours += 12
      if (ampm === 'AM' && hours === 12) hours = 0
      if (!ampm && hours >= 1 && hours <= 7) hours += 12
      const formatted = `${String(hours).padStart(2, '0')}:${mins}`
      return { startTime: formatted }
    }
  }
  return {}
}

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
  sessionNo?: number
  totalSessions?: number
  room?: string | null
  venue?: string | null
} | null {
  const { currentSession, nextSession, currentTime, extendedState, events, classSessions } = schedule
  const today = todayIST()
  const curMins = timeToMinutes(currentTime)

  // 1. Check if a timed event is live right now
  const liveEvent = events.find((e) => {
    if (e.date !== today || e.status === 'cancelled') return false
    const timing = getEventTiming(e)
    if (!timing.startTime) return false
    const start = timeToMinutes(timing.startTime)
    const end = timing.endTime ? timeToMinutes(timing.endTime) : start + 120
    return curMins >= start && curMins < end
  })

  if (liveEvent) {
    const timing = getEventTiming(liveEvent)
    const formattedType = liveEvent.type.replace(/_/g, ' ')
    const timeDisplay = timing.startTime ? formatTime12(timing.startTime).replace(/\s?(AM|PM)/i, '') : ''
    return {
      isEvent: true,
      isLive: true,
      timeDisplay,
      titleDisplay: liveEvent.title,
      subtitle: liveEvent.venue ? `📍 ${liveEvent.venue}` : (liveEvent.company || formattedType),
      pillText: liveEvent.venue ? `📍 ${liveEvent.venue}` : 'In Progress',
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
        : (currentSession.room ? `CR: ${currentSession.room}` : ''),
      pillText: currentSession.room
        ? `${currentSession.room} · Session ${sessionNo}`
        : `Session ${sessionNo} of ${totalSessions}`,
      sessionNo,
      totalSessions,
      room: currentSession.room,
    }
  }

  // 3. Upcoming today: compare next upcoming timed event today vs next class today
  const todayTimedEvents = events
    .map((e) => ({ event: e, timing: getEventTiming(e) }))
    .filter(
      (item) =>
        item.event.date === today &&
        item.event.status !== 'cancelled' &&
        item.timing.startTime &&
        timeToMinutes(item.timing.startTime) > curMins
    )
    .sort((a, b) => timeToMinutes(a.timing.startTime!) - timeToMinutes(b.timing.startTime!))

  const nextTimedEventToday = todayTimedEvents[0]

  if (nextTimedEventToday && nextSession) {
    const eventMins = timeToMinutes(nextTimedEventToday.timing.startTime!)
    const classMins = timeToMinutes(nextSession.start_time)
    if (eventMins <= classMins) {
      const diffMins = Math.max(0, eventMins - curMins)
      const diffText = diffMins > 60 ? `in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m` : `in ${diffMins}m`
      const formattedType = nextTimedEventToday.event.type.replace(/_/g, ' ')
      return {
        isEvent: true,
        isLive: false,
        timeDisplay: formatTime12(nextTimedEventToday.timing.startTime!).replace(/\s?(AM|PM)/i, ''),
        titleDisplay: nextTimedEventToday.event.title,
        subtitle: nextTimedEventToday.event.venue
          ? nextTimedEventToday.event.venue
          : (nextTimedEventToday.event.company || formattedType),
        pillText: `${diffText} · ${formattedType}`,
        eventTypeBadge: formattedType,
        venue: nextTimedEventToday.event.venue,
      }
    }
  } else if (nextTimedEventToday && !nextSession) {
    const eventMins = timeToMinutes(nextTimedEventToday.timing.startTime!)
    const diffMins = Math.max(0, eventMins - curMins)
    const diffText = diffMins > 60 ? `in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m` : `in ${diffMins}m`
    const formattedType = nextTimedEventToday.event.type.replace(/_/g, ' ')
    return {
      isEvent: true,
      isLive: false,
      timeDisplay: formatTime12(nextTimedEventToday.timing.startTime!).replace(/\s?(AM|PM)/i, ''),
      titleDisplay: nextTimedEventToday.event.title,
      subtitle: nextTimedEventToday.event.venue
        ? nextTimedEventToday.event.venue
        : (nextTimedEventToday.event.company || formattedType),
      pillText: `${diffText} · ${formattedType}`,
      eventTypeBadge: formattedType,
      venue: nextTimedEventToday.event.venue,
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
        : (nextSession.room ? `CR: ${nextSession.room}` : ''),
      pillText: `${diffText} · S${sessionNo}/${totalSessions}`,
      sessionNo,
      totalSessions,
      room: nextSession.room,
    }
  }

  // 4. Future day check (across next 14 days): Look for next scheduled class or timed event
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  let earliestFutureItem: {
    offset: number
    dateStr: string
    dayLabel: string
    classSession?: any
    event?: any
    timing?: { startTime?: string; endTime?: string }
  } | null = null

  for (let offset = 1; offset <= 14; offset++) {
    const targetDate = dayOffsetIST(offset)
    const dayOfWeek = new Date(targetDate + 'T00:00:00+05:30').getDay()
    const dayLabel = offset === 1 ? 'Tomorrow' : DAY_NAMES[dayOfWeek]

    const dayClasses = classSessions.filter((s) => s.date === targetDate && s.status !== 'cancelled')
    const dayTimedEvs = events
      .map((e) => ({ event: e, timing: getEventTiming(e) }))
      .filter((item) => item.event.date === targetDate && item.event.status !== 'cancelled' && item.timing.startTime)

    if (dayClasses.length > 0 || dayTimedEvs.length > 0) {
      if (dayTimedEvs.length > 0 && dayClasses.length > 0) {
        const firstClass = dayClasses[0]
        const firstEv = dayTimedEvs[0]
        const classMins = timeToMinutes(firstClass.start_time)
        const evMins = timeToMinutes(firstEv.timing.startTime!)
        if (evMins <= classMins) {
          earliestFutureItem = { offset, dateStr: targetDate, dayLabel, event: firstEv.event, timing: firstEv.timing }
        } else {
          earliestFutureItem = { offset, dateStr: targetDate, dayLabel, classSession: firstClass }
        }
      } else if (dayTimedEvs.length > 0) {
        earliestFutureItem = { offset, dateStr: targetDate, dayLabel, event: dayTimedEvs[0].event, timing: dayTimedEvs[0].timing }
      } else {
        earliestFutureItem = { offset, dateStr: targetDate, dayLabel, classSession: dayClasses[0] }
      }
      break
    }
  }

  if (earliestFutureItem?.event && earliestFutureItem.timing?.startTime) {
    const ev = earliestFutureItem.event
    const formattedType = ev.type.replace(/_/g, ' ')
    const timeDisplay = formatTime12(earliestFutureItem.timing.startTime).replace(/\s?(AM|PM)/i, '')
    return {
      isEvent: true,
      isLive: false,
      timeDisplay,
      titleDisplay: ev.title,
      subtitle: ev.venue ? ev.venue : (ev.company || formattedType),
      pillText: `${earliestFutureItem.dayLabel} · ${formattedType}`,
      eventTypeBadge: formattedType,
      venue: ev.venue,
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
      subtitle: facultyName ? (facultyName.startsWith('Prof') ? facultyName : `Prof. ${facultyName}`) : (cs.room ? `CR: ${cs.room}` : ''),
      pillText: `${earliestFutureItem.dayLabel} · S${sessionNo}/${totalSessions}`,
      sessionNo,
      totalSessions,
      room: cs.room,
    }
  }

  // Fallback to futureDayInfo
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
        className="rounded-[24px] bg-white dark:bg-[#1C1C1E] border border-slate-200/70 dark:border-white/10 shadow-bento p-4 flex flex-col justify-between min-h-[172px] cursor-pointer hover:border-slate-300 dark:hover:border-white/20 transition-all select-none"
      >
        <div>
          <span className="text-[10px] font-black text-slate-400 dark:text-secondary-text uppercase tracking-wider block">
            Up Next
          </span>
          <div className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight mt-2">
            No Classes
          </div>
          <p className="text-xs text-slate-500 dark:text-secondary-text mt-1">
            Enjoy your free time!
          </p>
        </div>
        <div>
          <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 font-bold text-[10px] px-2.5 py-1 rounded-full border border-slate-200/50 dark:border-white/10">
            All Done
          </span>
        </div>
      </motion.div>
    )
  }

  const sessionRatio =
    item.sessionNo && item.totalSessions
      ? Math.min(100, Math.round((item.sessionNo / item.totalSessions) * 100))
      : 0

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onTap}
      className={`rounded-[24px] border shadow-bento p-4 flex flex-col justify-between min-h-[172px] cursor-pointer transition-all select-none ${
        item.isLive
          ? item.isEvent
            ? 'bg-purple-50/60 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/60 hover:border-purple-300 dark:hover:border-purple-700'
            : 'bg-emerald-50/50 dark:bg-emerald-950/40 border-emerald-200/90 dark:border-emerald-800/60 hover:border-emerald-300 dark:hover:border-emerald-700'
          : item.isEvent
          ? 'bg-white dark:bg-[#1C1C1E] border-indigo-100/90 dark:border-indigo-900/60 hover:border-indigo-200 dark:hover:border-indigo-700/60'
          : 'bg-white dark:bg-[#1C1C1E] border-slate-200/70 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
      }`}
    >
      <div>
        {/* Header row: Status pill + mini progress ring or room */}
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {item.isLive ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-black uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                Live Now
              </span>
            ) : item.isEvent ? (
              <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                {item.eventTypeBadge || 'Event'}
              </span>
            ) : (
              <span className="text-[10px] font-black text-slate-400 dark:text-secondary-text uppercase tracking-wider">
                Up Next
              </span>
            )}
          </div>

          {/* Mini Session Progress Ring */}
          {item.sessionNo && item.totalSessions ? (
            <div className="flex items-center gap-1" title={`Session ${item.sessionNo} of ${item.totalSessions}`}>
              <svg className="w-5 h-5 -rotate-90 flex-shrink-0" viewBox="0 0 36 36">
                <path
                  className="text-slate-100 dark:text-white/10"
                  strokeWidth="4"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className={item.isLive ? 'text-emerald-500' : 'text-accent'}
                  strokeDasharray={`${sessionRatio}, 100`}
                  strokeWidth="4"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="text-[9px] font-bold text-slate-500 dark:text-secondary-text font-mono">
                {item.sessionNo}/{item.totalSessions}
              </span>
            </div>
          ) : item.room ? (
            <span className="text-[9px] font-bold text-slate-500 dark:text-secondary-text bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded border border-slate-200/50 dark:border-white/10">
              {item.room}
            </span>
          ) : null}
        </div>

        {/* Big Time Display */}
        <div className="text-xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
          {item.timeDisplay}
        </div>

        {/* Title */}
        <h3
          className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1 mt-1 leading-snug"
          title={item.titleDisplay}
        >
          {item.titleDisplay}
        </h3>

        {/* Faculty / Venue Subtitle */}
        {item.subtitle && (
          <p className="text-[11px] font-medium text-slate-500 dark:text-secondary-text truncate mt-0.5">
            {item.subtitle}
          </p>
        )}
      </div>

      {/* Footer Pill */}
      <div className="mt-2.5">
        <span
          className={`inline-flex items-center gap-1 font-bold text-[10px] px-2.5 py-1 rounded-full truncate max-w-full border ${
            item.isLive
              ? item.isEvent
                ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-700/60'
                : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700/60'
              : item.isEvent
              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60'
              : 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-white/10'
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
        className="rounded-[24px] bg-[#FFF9F2] dark:bg-[#181410] border border-[#FDE8D0]/90 dark:border-[#382618] shadow-bento p-4 flex flex-col justify-between min-h-[172px] cursor-pointer hover:border-[#FDE8D0] dark:hover:border-[#4A3222] transition-all select-none"
      >
        <div>
          <span className="text-[10px] font-black text-[#A05E26] dark:text-[#D4A373] uppercase tracking-wider block">
            Mess Menu
          </span>
          <div className="text-sm font-extrabold text-[#422206] dark:text-[#F3D5B5] leading-tight truncate mt-2">
            No Menu Posted
          </div>
          <p className="text-xs text-[#8C6239] dark:text-[#C49B76] mt-1">
            Tap to view schedule
          </p>
        </div>
        <div>
          <span className="bg-white dark:bg-[#251C15] rounded-full py-1 px-2.5 border border-[#FDE8D0] dark:border-[#382618] shadow-2xs text-[#422206] dark:text-[#F3D5B5] text-[10px] font-bold inline-block">
            Timings
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
      className="rounded-[24px] bg-[#FFF9F2] dark:bg-[#181410] border border-[#FDE8D0]/90 dark:border-[#382618] shadow-bento p-4 flex flex-col justify-between min-h-[172px] cursor-pointer hover:border-[#FDE8D0] dark:hover:border-[#4A3222] transition-all select-none"
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-black text-[#A05E26] dark:text-[#D4A373] uppercase tracking-wider block">
            {mealLabel} · {mealTime}
          </span>
          {displayMeal.isNowServing && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          )}
        </div>

        <div className="text-base font-extrabold text-[#422206] dark:text-[#F3D5B5] leading-tight truncate mt-1">
          {mainDish}
        </div>
        {otherItems && (
          <p className="text-[11px] font-medium text-[#8C6239] dark:text-[#C49B76] line-clamp-2 mt-0.5 leading-snug">
            + {otherItems}
          </p>
        )}
      </div>

      <div className="mt-2.5">
        {nonVegOrEggItem ? (
          <div className="bg-white dark:bg-[#251C15] rounded-full py-1 px-2.5 border border-red-200/80 dark:border-red-900/60 shadow-2xs text-[#422206] dark:text-[#F3D5B5] text-[10px] font-bold flex items-center gap-1.5 w-full max-w-full overflow-hidden">
            <span className="w-3 h-3 rounded-[3px] border border-[#C2410C] flex items-center justify-center flex-shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${nonVegOrEggItem.diet === 'non_veg' ? 'bg-[#C2410C]' : 'bg-[#D97706]'}`} />
            </span>
            <span className="truncate flex-1">{nonVegOrEggItem.name}</span>
          </div>
        ) : specialItem ? (
          <div className="bg-white dark:bg-[#251C15] rounded-full py-1 px-2.5 border border-amber-200/80 dark:border-amber-900/60 shadow-2xs text-[#422206] dark:text-[#F3D5B5] text-[10px] font-bold flex items-center gap-1.5 w-full max-w-full overflow-hidden">
            <span className="flex-shrink-0 text-[10px]">⭐</span>
            <span className="truncate flex-1">{specialItem.name}</span>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#251C15] rounded-full py-1 px-2.5 border border-[#059669]/30 dark:border-[#059669]/50 shadow-2xs text-[#059669] dark:text-[#34D399] text-[10px] font-bold flex items-center gap-1.5 w-fit">
            <span className="w-3 h-3 rounded-[3px] border border-[#059669] flex items-center justify-center flex-shrink-0">
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
  onSwapOrder?: () => void
  isAtTop?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Sort upcoming projects: nearest deadline first
  const sortedProjects = [...projects].sort(
    (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  )

  if (sortedProjects.length === 0) {
    return (
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            Projects & Deadlines
          </h2>
          <button
            type="button"
            onClick={onViewAll}
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
          <p className="text-xs font-bold text-slate-800 dark:text-white">No Upcoming Deadlines</p>
          <p className="text-[11px] text-slate-500 dark:text-secondary-text mt-0.5">You're completely caught up on assignments.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2.5 pt-1">
      {/* Clean Section Header (Minimal, no buttons, no desktop arrows) */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            Projects & Deadlines
          </h2>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-white/10">
            {sortedProjects.length} upcoming
          </span>
        </div>

        <button
          type="button"
          onClick={onViewAll}
          className="text-xs font-semibold text-slate-500 dark:text-[#8E8E93] hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1"
        >
          <span>View all</span>
          <span>→</span>
        </button>
      </div>

      {/* Projects Container: Card peek affordance when > 2 items so users naturally see more is there */}
      <div
        ref={scrollRef}
        className={`space-y-2.5 overflow-y-auto snap-y snap-mandatory scroll-smooth pr-0.5 scrollbar-none overscroll-contain ${
          sortedProjects.length > 2 ? 'max-h-[235px]' : ''
        }`}
        style={{ scrollSnapType: 'y mandatory' }}
      >
        {sortedProjects.map((item) => {
          const secs = secondsUntilDeadline(item.deadline)
          const isPast = secs <= 0
          const isCritical = secs > 0 && secs < 3600 * 12

          // Calculate progress towards submission deadline (0 to 100%)
          // Fills smoothly towards 100% as submission deadline approaches
          let submissionProgress = 100
          if (!isPast) {
            if ((item as any).created_at) {
              try {
                const created = new Date((item as any).created_at).getTime()
                const target = new Date(item.deadline).getTime()
                const span = target - created
                if (span >= 86400 * 1000 && Date.now() >= created) {
                  submissionProgress = Math.min(99, Math.max(8, Math.round(((Date.now() - created) / span) * 100)))
                }
              } catch {}
            }
            if (submissionProgress === 100) {
              if (secs < 3600 * 2) {
                submissionProgress = 96 + Math.round((1 - secs / (2 * 3600)) * 3)
              } else if (secs < 3600 * 6) {
                submissionProgress = 90 + Math.round((1 - secs / (6 * 3600)) * 6)
              } else if (secs < 3600 * 12) {
                submissionProgress = 82 + Math.round((1 - secs / (12 * 3600)) * 8)
              } else if (secs < 3600 * 24) {
                submissionProgress = 70 + Math.round((1 - secs / (24 * 3600)) * 12)
              } else if (secs < 3600 * 48) {
                submissionProgress = 48 + Math.round((1 - secs / (48 * 3600)) * 22)
              } else if (secs < 3600 * 24 * 7) {
                submissionProgress = 18 + Math.round((1 - secs / (7 * 86400)) * 30)
              } else {
                submissionProgress = 12
              }
            }
          }

          return (
            <motion.div
              key={item.id}
              data-testid="dashboard-project-card"
              whileTap={{ scale: 0.985 }}
              onClick={() => onSelectProject(item)}
              className="min-h-[96px] max-h-[96px] h-[96px] snap-start rounded-[20px] bg-white dark:bg-[#1C1C1E] border border-slate-200/70 dark:border-white/10 shadow-xs hover:border-slate-300 dark:hover:border-white/20 p-3.5 cursor-pointer flex flex-col justify-between transition-all select-none"
            >
              {/* Row 1: Course code tag + Type name + Minimal Countdown */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {item.course ? (
                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-white/10 truncate max-w-[120px]">
                      {item.course.code}
                    </span>
                  ) : null}
                  <span className="text-[11px] font-medium text-slate-400 dark:text-secondary-text capitalize">
                    {item.type}
                  </span>
                </div>

                {isCritical ? (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    <span>{formatDuration(secs)} left</span>
                  </div>
                ) : (
                  <span className="text-xs font-medium text-slate-500 dark:text-secondary-text flex-shrink-0">
                    {isPast ? 'Passed' : `${formatDuration(secs)} left`}
                  </span>
                )}
              </div>

              {/* Row 2: Title */}
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight truncate leading-tight">
                {item.title}
              </h3>

              {/* Row 3: Minimal, High-Feeling Progress Bar + Date & Group */}
              <div>
                <div className="w-full bg-slate-100 dark:bg-white/10 h-1 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isPast
                        ? 'bg-slate-300 dark:bg-white/20'
                        : isCritical
                        ? 'bg-rose-500 animate-pulse'
                        : 'bg-slate-800 dark:bg-white/90'
                    }`}
                    style={{ width: `${submissionProgress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-medium">
                  <span className="truncate text-slate-500 dark:text-secondary-text">
                    Due {formatDeadline(item.deadline)}
                  </span>
                  <span className="text-slate-400 dark:text-secondary-text flex-shrink-0">
                    {item.group_size > 1 ? `Group of ${item.group_size}` : 'Individual'}
                  </span>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}


