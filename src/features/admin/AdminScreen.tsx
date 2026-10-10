import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase, isConfiguredSupabase } from '../../lib/supabase'
import { spring } from '../../lib/motion'
import {
  MOCK_COURSES,
  MOCK_CLASS_SESSIONS,
  MOCK_EVENTS,
  MOCK_TERMS,
  MOCK_MESS_WEEKS,
  MOCK_MESS_MENU_ITEMS,
  MOCK_MESS_MEAL_TIMINGS,
} from '../../lib/mockData'
import type {
  Course,
  ClassSession,
  CampusEvent,
  IngestBatch,
  EventType,
  DiffItem,
  FlatTimetableParseResult,
  FlatMessMenuParseResult,
  MessMenuDiffItem,
  MessMenuItem,
} from '../../types'
import {
  parseFlatTimetableWorkbook,
  generateTimetableDiff,
  generateBlankTimetableTemplate,
  exportLiveTermToExcel,
} from '../../lib/flatTimetableImporter'
import {
  parseFlatMessMenuWorkbook,
  generateMessMenuDiff,
  generateBlankMessMenuTemplate,
  exportLiveMessMenuToExcel,
} from '../../lib/flatMessMenuImporter'
import {
  formatIST,
  todayIST,
  fromDatetimeLocalToIST,
} from '../../lib/timeUtils'
import { PlacementsAdmin } from './PlacementsAdmin'
import { ProjectsAdmin } from './ProjectsAdmin'

type AdminTab = 'placements' | 'projects' | 'timetable' | 'mess' | 'batches' | 'events' | 'courses'

export function AdminScreen() {
  const [tab, setTab] = useState<AdminTab>('placements')
  const [courses, setCourses] = useState<Course[]>(MOCK_COURSES)

  useEffect(() => {
    if (isConfiguredSupabase) {
      supabase.from('courses').select('*').order('code').then(({ data }) => {
        if (data && data.length > 0) setCourses(data)
      })
    }
  }, [])

  const tabs: { key: AdminTab; label: string; emoji: string }[] = [
    { key: 'placements', label: 'Placements', emoji: '💼' },
    { key: 'projects', label: 'Projects', emoji: '📁' },
    { key: 'timetable', label: 'Timetable', emoji: '📅' },
    { key: 'mess', label: 'Mess Menu', emoji: '🍽' },
    { key: 'batches', label: 'Rollback', emoji: '🔄' },
    { key: 'events', label: 'Events', emoji: '📣' },
    { key: 'courses', label: 'Courses', emoji: '📚' },
  ]

  return (
    <div className="min-h-screen bg-surface pb-tab-bar">
      {/* Header */}
      <div className="bg-white px-5 pt-safe-top pb-0 border-b border-border sticky top-0 z-20">
        <div className="pt-3 pb-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary-text tracking-tight">Admin Portal</h1>
            <p className="text-xs text-secondary-text mt-0.5">Campus data ingestion & governance</p>
          </div>
          <span className="px-2.5 py-1 bg-accent/10 text-accent font-semibold text-[11px] rounded-full">
            DEM 2026
          </span>
        </div>

        {/* Horizontal Navigation Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-3 pt-1" style={{ scrollbarWidth: 'none' }}>
          {tabs.map((t) => (
            <motion.button
              key={t.key}
              onClick={() => setTab(t.key)}
              whileTap={{ scale: 0.94 }}
              transition={spring}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                tab === t.key
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-surface text-secondary-text hover:text-primary-text'
              }`}
            >
              <span>{t.emoji}</span>
              {t.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-4 py-4 max-w-3xl mx-auto">
        {tab === 'placements' && <PlacementsAdmin />}
        {tab === 'projects' && <ProjectsAdmin courses={courses} />}
        {tab === 'timetable' && <TimetableIngestAdmin courses={courses} />}
        {tab === 'mess' && <MessIngestAdmin />}
        {tab === 'batches' && <BatchesHistoryAdmin />}
        {tab === 'events' && <EventsAdmin />}
        {tab === 'courses' && <CoursesAdmin courses={courses} onCoursesUpdated={setCourses} />}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. TIMETABLE INGEST ADMIN (Flat Table Sheets: terms, courses, class_sessions, events)
// ═════════════════════════════════════════════════════════════════════════════

function TimetableIngestAdmin({ courses }: { courses: Course[] }) {
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<FlatTimetableParseResult | null>(null)
  const [diffs, setDiffs] = useState<DiffItem<ClassSession>[]>([])
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setStatusMsg(null)

    const arrayBuffer = await f.arrayBuffer()

    try {
      const res = parseFlatTimetableWorkbook(arrayBuffer, { program: 'dem', batch_year: 2026 })
      setParseResult(res)
      setDiffs(generateTimetableDiff(MOCK_CLASS_SESSIONS, res.class_sessions))
      if (res.errors.length === 0) {
        setStatusMsg(`✅ File parsed: ${res.terms.length} term, ${res.courses.length} courses, ${res.class_sessions.length} sessions, ${res.events.length} events.`)
      }
    } catch (err: any) {
      setStatusMsg(`Error parsing workbook: ${err.message}`)
    }
  }

  async function applyBatch() {
    if (!parseResult || parseResult.errors.length > 0) return
    setApplying(true)
    setStatusMsg(null)

    try {
      if (isConfiguredSupabase) {
        // 1. Ingest Batch record with rollback snapshot
        const { data: batch, error: batchErr } = await supabase
          .from('ingest_batches')
          .insert({
            kind: 'timetable',
            source: 'upload',
            file_path: file?.name || 'timetable.xlsx',
            status: 'pending_review',
            summary: {
              terms: parseResult.terms.length,
              courses: parseResult.courses.length,
              class_sessions: parseResult.class_sessions.length,
              events: parseResult.events.length,
              fileName: file?.name,
            },
          })
          .select()
          .single()

        if (batchErr) throw batchErr

        // 2. Upsert terms
        if (parseResult.terms.length > 0) {
          const termRows = parseResult.terms.map((t) => ({
            term_key: t.term_key,
            program: t.program,
            batch_year: t.batch_year,
            term_name: t.term_name,
            start_date: t.start_date,
            end_date: t.end_date,
            default_venue: t.default_venue,
            updated_as_on: t.updated_as_on,
            source_batch_id: batch?.id,
          }))
          const { error: tErr } = await supabase.from('terms').upsert(termRows, {
            onConflict: 'program,batch_year,term_key',
          })
          if (tErr) throw tErr
        }

        // 3. Upsert courses
        if (parseResult.courses.length > 0) {
          const courseRows = parseResult.courses.map((c) => ({
            code: c.code,
            name: c.name,
            faculty: c.faculty,
            credits: c.credits,
            total_sessions: c.total_sessions,
            color_tag: c.color_tag,
            grid_label: c.grid_label,
            program: c.program || 'dem',
            batch_year: c.batch_year || 2026,
          }))
          const { error: cErr } = await supabase.from('courses').upsert(courseRows, {
            onConflict: 'program,batch_year,code',
          })
          if (cErr) throw cErr
        }

        // Fetch fresh course mapping
        const { data: dbCourses } = await supabase.from('courses').select('id, code')
        const courseIdByCode = new Map<string, string>()
        dbCourses?.forEach((c) => courseIdByCode.set(c.code, c.id))

        // Fetch term mapping
        const { data: dbTerms } = await supabase.from('terms').select('id, term_key')
        const termIdByKey = new Map<string, string>()
        dbTerms?.forEach((t) => termIdByKey.set(t.term_key, t.id))

        // Clean & replace previous class_sessions and events for this cohort and term
        const program = parseResult.terms[0]?.program || 'dem'
        const batchYear = parseResult.terms[0]?.batch_year || 2026
        const termId = termIdByKey.get(parseResult.terms[0]?.term_key) || null

        if (termId) {
          await supabase.from('class_sessions').delete().eq('term_id', termId)
          await supabase.from('events').delete().eq('term_id', termId)
        }
        await supabase.from('class_sessions').delete().match({ program, batch_year: batchYear })
        await supabase.from('events').delete().match({ program, batch_year: batchYear })

        // Insert class_sessions
        if (parseResult.class_sessions.length > 0) {
          const sessionRows = parseResult.class_sessions.map((s) => ({
            term_id: termId,
            program: s.program || program,
            batch_year: s.batch_year || batchYear,
            date: s.date,
            start_time: s.start_time,
            end_time: s.end_time,
            course_id: s.course ? (courseIdByCode.get(s.course.code) || s.course.id) : (s.course_id || null),
            session_no: s.session_no,
            faculty: s.faculty || s.course?.faculty || null,
            room: s.room,
            session_type: s.session_type,
            status: s.status,
            note: s.note,
            raw_text: s.raw_text,
            source_batch_id: batch?.id,
          }))
          const { error: sErr } = await supabase.from('class_sessions').insert(sessionRows)
          if (sErr) throw sErr
        }

        // Insert events
        if (parseResult.events.length > 0) {
          const eventRows = parseResult.events.map((e) => ({
            term_id: termId,
            program: e.program || program,
            batch_year: e.batch_year || batchYear,
            type: e.type,
            title: e.title,
            date: e.date,
            start_at: e.start_at,
            end_at: e.end_at,
            all_day: e.all_day,
            course_id: e.course_code ? (courseIdByCode.get(e.course_code) || null) : (e.course_id || null),
            status: e.status,
            venue: e.venue,
            note: e.note,
            raw_text: e.raw_text,
            source_batch_id: batch?.id,
          }))
          const { error: evErr } = await supabase.from('events').insert(eventRows)
          if (evErr) throw evErr
        }

        // Update batch status
        if (batch?.id) {
          await supabase.from('ingest_batches').update({ status: 'applied', applied_at: new Date().toISOString() }).eq('id', batch.id)
        }
      }

      // Always sync in-memory records and local offline cache
      MOCK_TERMS.splice(0, MOCK_TERMS.length, ...parseResult.terms)
      MOCK_COURSES.splice(0, MOCK_COURSES.length, ...parseResult.courses)
      MOCK_CLASS_SESSIONS.splice(0, MOCK_CLASS_SESSIONS.length, ...parseResult.class_sessions)
      MOCK_EVENTS.splice(0, MOCK_EVENTS.length, ...parseResult.events)

      localStorage.setItem('whats_next_terms', JSON.stringify(parseResult.terms))
      localStorage.setItem('whats_next_courses', JSON.stringify(parseResult.courses))
      localStorage.setItem('whats_next_class_sessions', JSON.stringify(parseResult.class_sessions))
      localStorage.setItem('whats_next_events', JSON.stringify(parseResult.events))

      window.dispatchEvent(new Event('schedule_updated'))

      const msg = `✅ Successfully applied! ${parseResult.class_sessions.length} sessions and ${parseResult.events.length} events active.`
      setStatusMsg(msg)
      toast.success(msg)
    } catch (err: any) {
      const errMsg = `Error applying batch: ${err.message}`
      setStatusMsg(errMsg)
      toast.error(errMsg)
    } finally {
      setApplying(false)
    }
  }

  function downloadTemplate() {
    const bytes = generateBlankTimetableTemplate()
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'DEM2026_Term_Import_Template.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportCurrentTerm() {
    const terms = parseResult?.terms || MOCK_TERMS
    const coursesToExport = parseResult?.courses || courses
    const sessions = parseResult?.class_sessions || MOCK_CLASS_SESSIONS
    const eventsToExport = parseResult?.events || MOCK_EVENTS

    const bytes = exportLiveTermToExcel(terms, coursesToExport, sessions, eventsToExport)
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'DEM2026_Live_Term_Export.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-primary-text">Timetable Ingestion</h2>
          <p className="text-xs text-secondary-text">Flat Excel importer (terms, courses, class_sessions, events)</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={downloadTemplate}
            className="px-3 py-1.5 bg-surface text-secondary-text border border-border rounded-xl text-xs font-semibold hover:text-primary-text flex items-center gap-1.5"
          >
            <span>📥</span> Template
          </button>
          <button
            onClick={exportCurrentTerm}
            className="px-3 py-1.5 bg-surface text-secondary-text border border-border rounded-xl text-xs font-semibold hover:text-primary-text flex items-center gap-1.5"
          >
            <span>📤</span> Export Term
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-2xl text-xs font-semibold ${
          statusMsg.startsWith('✅') ? 'bg-live/10 text-live border border-live/20' : 'bg-danger/10 text-danger'
        }`}>
          {statusMsg}
        </div>
      )}

      {/* Upload Zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="bg-white rounded-2xl border-2 border-dashed border-border hover:border-accent/40 p-6 text-center cursor-pointer transition-colors space-y-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileSelected}
          className="hidden"
        />
        <span className="text-3xl">📊</span>
        <h3 className="text-sm font-semibold text-primary-text">
          {file ? file.name : 'Click to select Flat Timetable Excel (.xlsx)'}
        </h3>
        <p className="text-xs text-secondary-text">
          Direct 1:1 table-shaped import for terms, courses, class_sessions, events
        </p>
      </div>

      {/* Parsed Result & Audit Card */}
      {parseResult && (
        <div className="bg-white rounded-3xl p-5 shadow-card border border-border space-y-4">
          {/* Term Header */}
          {parseResult.terms.length > 0 && (
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-accent bg-accent/10 px-2.5 py-0.5 rounded-full uppercase">
                    {parseResult.terms[0].program.toUpperCase()} {parseResult.terms[0].batch_year} — {parseResult.terms[0].term_name}
                  </span>
                  {parseResult.terms[0].default_venue && (
                    <span className="text-xs font-semibold text-secondary-text">
                      📍 {parseResult.terms[0].default_venue}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-primary-text mt-1">
                  Term Range: {parseResult.terms[0].start_date} to {parseResult.terms[0].end_date}
                </h3>
                {parseResult.terms[0].updated_as_on && (
                  <p className="text-xs text-secondary-text mt-0.5">
                    Source: Updated as on {parseResult.terms[0].updated_as_on}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Breakdown Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="bg-surface p-2.5 rounded-xl">
              <p className="text-[11px] text-secondary-text font-medium">Courses</p>
              <p className="text-sm font-bold text-primary-text">{parseResult.courses.length}</p>
            </div>
            <div className="bg-surface p-2.5 rounded-xl">
              <p className="text-[11px] text-secondary-text font-medium">Lectures</p>
              <p className="text-sm font-bold text-primary-text">{parseResult.class_sessions.length}</p>
            </div>
            <div className="bg-surface p-2.5 rounded-xl">
              <p className="text-[11px] text-secondary-text font-medium">Events & Exams</p>
              <p className="text-sm font-bold text-accent">{parseResult.events.length}</p>
            </div>
            <div className="bg-surface p-2.5 rounded-xl">
              <p className="text-[11px] text-secondary-text font-medium">Cancelled</p>
              <p className="text-sm font-bold text-danger">
                {parseResult.class_sessions.filter((s) => s.status === 'cancelled').length}
              </p>
            </div>
          </div>

          {/* Per-Course Session Audit Table */}
          {parseResult.auditSummary.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold text-primary-text uppercase tracking-wider">
                Course Master & Session Audit
              </h4>
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface text-secondary-text font-semibold">
                    <tr>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Course Name</th>
                      <th className="px-3 py-2">Faculty</th>
                      <th className="px-3 py-2 text-center">Credits</th>
                      <th className="px-3 py-2 text-center">Expected</th>
                      <th className="px-3 py-2 text-center">Scheduled</th>
                      <th className="px-3 py-2 text-center">Cancelled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parseResult.auditSummary.map((aud) => (
                      <tr key={aud.code}>
                        <td className="px-3 py-2 font-bold font-mono text-accent">{aud.code}</td>
                        <td className="px-3 py-2 font-medium text-primary-text">{aud.name}</td>
                        <td className="px-3 py-2 text-secondary-text">{aud.faculty || '—'}</td>
                        <td className="px-3 py-2 text-center font-mono">{aud.credits}</td>
                        <td className="px-3 py-2 text-center font-mono">{aud.totalExpected}</td>
                        <td className="px-3 py-2 text-center font-mono font-semibold">
                          <span className={aud.status === 'ok' ? 'text-live' : 'text-amber-600'}>
                            {aud.scheduledCount}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-danger font-semibold">
                          {aud.cancelledCount > 0 ? aud.cancelledCount : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Warnings */}
          {parseResult.warnings.length > 0 && (
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 space-y-1">
              <p className="text-xs font-bold text-amber-800">
                ⚠️ Timetable Warnings ({parseResult.warnings.length})
              </p>
              <div className="max-h-28 overflow-y-auto space-y-0.5 text-[11px] text-amber-700">
                {parseResult.warnings.map((w, idx) => (
                  <p key={idx}>• {w}</p>
                ))}
              </div>
            </div>
          )}

          {/* Blocking Errors */}
          {parseResult.errors.length > 0 && (
            <div className="p-3 bg-danger/10 rounded-2xl border border-danger/20 space-y-1">
              <p className="text-xs font-bold text-danger">
                🚫 Validation Errors ({parseResult.errors.length}) — Cannot Apply
              </p>
              <div className="max-h-28 overflow-y-auto space-y-0.5 text-[11px] text-danger/90">
                {parseResult.errors.map((e, idx) => (
                  <p key={idx}>• {e}</p>
                ))}
              </div>
            </div>
          )}

          {/* Visual Diff Table */}
          {parseResult.class_sessions.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-primary-text uppercase tracking-wider">
                  Staged Sessions Diff Preview ({parseResult.class_sessions.length} sessions)
                </h4>
                <div className="flex gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                    +{diffs.filter((d) => d.status === 'added').length} Added
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                    ~{diffs.filter((d) => d.status === 'modified').length} Modified
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto max-h-60 border border-border rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface text-secondary-text font-semibold sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Course</th>
                      <th className="px-3 py-2">Room</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {diffs.slice(0, 20).map((d, i) => {
                      const s = d.incoming || d.current!
                      return (
                        <tr key={i} className={d.status === 'added' ? 'bg-emerald-50/40' : d.status === 'modified' ? 'bg-blue-50/40' : ''}>
                          <td className="px-3 py-2 font-bold uppercase text-[10px]">
                            {d.status === 'added' && <span className="text-emerald-700">+ Added</span>}
                            {d.status === 'modified' && <span className="text-blue-700">~ Modified</span>}
                            {d.status === 'unchanged' && <span className="text-secondary-text">Unchanged</span>}
                          </td>
                          <td className="px-3 py-2 font-mono">{s.date}</td>
                          <td className="px-3 py-2 font-mono">{s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}</td>
                          <td className="px-3 py-2 font-semibold text-primary-text">
                            {s.course?.name || s.course_id || 'Class'} (S{s.session_no})
                          </td>
                          <td className="px-3 py-2">{s.room}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <button
                onClick={applyBatch}
                disabled={applying || parseResult.errors.length > 0}
                className="w-full py-3 bg-accent text-white rounded-xl text-sm font-semibold shadow-sm hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {applying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Applying Batch to Database...</span>
                  </>
                ) : (
                  `Approve & Apply to Database (${parseResult.class_sessions.length} Sessions)`
                )}
              </button>

              {statusMsg && (
                <div className={`p-3 rounded-2xl text-xs font-semibold ${
                  statusMsg.startsWith('✅') ? 'bg-live/10 text-live border border-live/20' : 'bg-danger/10 text-danger'
                }`}>
                  {statusMsg}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. MESS INGEST ADMIN (Flat multi-sheet Excel, Audit, Diff Review, Apply)
// ═════════════════════════════════════════════════════════════════════════════

function MessIngestAdmin() {
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<FlatMessMenuParseResult | null>(null)
  const [diffs, setDiffs] = useState<MessMenuDiffItem[]>([])
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setStatusMsg(null)

    const arrayBuffer = await f.arrayBuffer()
    try {
      const res = parseFlatMessMenuWorkbook(arrayBuffer)
      setParseResult(res)

      // Compute diff against live or mock data
      let currentItems: MessMenuItem[] = MOCK_MESS_MENU_ITEMS
      if (isConfiguredSupabase && res.mess_weeks.length > 0) {
        const weekKeys = res.mess_weeks.map(w => w.week_key)
        const { data: dbItems } = await supabase
          .from('mess_menu_items')
          .select('*, mess_weeks!inner(week_key)')
          .in('mess_weeks.week_key', weekKeys)
        if (dbItems && dbItems.length > 0) {
          currentItems = dbItems
        }
      }

      const d = generateMessMenuDiff(res.mess_menu_items, currentItems)
      setDiffs(d)

      if (res.errors.length > 0) {
        setStatusMsg(`⚠️ Parsed with ${res.errors.length} validation errors`)
      } else {
        const nonVegCount = res.mess_menu_items.filter(i => i.diet === 'non_veg' || i.diet === 'egg').length
        setStatusMsg(`✅ Staged ${res.mess_menu_items.length} items (${nonVegCount} non-veg/egg, ${res.auditSummary.reduce((acc, d) => acc + d.specials, 0)} specials) across ${res.mess_weeks.length} week(s).`)
      }
    } catch (err: any) {
      setStatusMsg(`Error parsing mess sheet: ${err.message}`)
    }
  }

  async function applyMessBatch() {
    if (!parseResult || parseResult.mess_menu_items.length === 0) return
    setApplying(true)
    setStatusMsg(null)

    try {
      if (isConfiguredSupabase) {
        // 1. Create Ingest Batch
        const { data: batch, error: batchErr } = await supabase
          .from('ingest_batches')
          .insert({
            kind: 'mess',
            source: 'upload',
            file_path: file?.name || 'Mess_Menu_Import.xlsx',
            status: 'pending_review',
            summary: {
              weeks: parseResult.mess_weeks.length,
              items: parseResult.mess_menu_items.length,
              timings: parseResult.mess_meal_timings.length,
              fileName: file?.name,
            },
          })
          .select()
          .single()

        if (batchErr) throw batchErr

        // 2. Upsert mess_weeks
        for (const w of parseResult.mess_weeks) {
          const { error: wErr } = await supabase.from('mess_weeks').upsert(
            {
              week_key: w.week_key,
              week_start: w.week_start,
              week_end: w.week_end,
              title: w.title,
              source_batch_id: batch?.id,
            },
            { onConflict: 'week_key' }
          )
          if (wErr) throw wErr
        }

        // Fetch fresh week ID mapping
        const { data: dbWeeks } = await supabase.from('mess_weeks').select('id, week_key')
        const weekIdByKey = new Map<string, string>()
        dbWeeks?.forEach((w) => weekIdByKey.set(w.week_key, w.id))

        // 3. Upsert mess_meal_timings
        for (const t of parseResult.mess_meal_timings) {
          await supabase.from('mess_meal_timings').upsert(
            {
              meal: t.meal,
              label: t.label,
              applies_to: t.applies_to,
              start_time: t.start_time,
              end_time: t.end_time,
              effective_from: t.effective_from,
            },
            { onConflict: 'meal' }
          )
        }

        // 4. Delete previous items for these weeks and insert new ones
        const affectedWeekIds = Array.from(weekIdByKey.values())
        if (affectedWeekIds.length > 0) {
          await supabase.from('mess_menu_items').delete().in('week_id', affectedWeekIds)
        }

        const itemRows = parseResult.mess_menu_items.map((i) => ({
          week_id: (i.week_key ? weekIdByKey.get(i.week_key) : undefined) || i.week_id || null,
          date: i.date,
          meal: i.meal,
          position: i.position,
          item_raw: i.item_raw,
          item_display: i.item_display,
          diet: i.diet,
          is_special: i.is_special,
          source_batch_id: batch?.id,
        }))

        const { error: itErr } = await supabase.from('mess_menu_items').insert(itemRows)
        if (itErr) throw itErr

        // 5. Update batch status
        if (batch?.id) {
          await supabase
            .from('ingest_batches')
            .update({ status: 'applied', applied_at: new Date().toISOString() })
            .eq('id', batch.id)
        }
      }

      // Sync in-memory and local storage
      MOCK_MESS_WEEKS.splice(0, MOCK_MESS_WEEKS.length, ...parseResult.mess_weeks)
      MOCK_MESS_MENU_ITEMS.splice(0, MOCK_MESS_MENU_ITEMS.length, ...parseResult.mess_menu_items)
      MOCK_MESS_MEAL_TIMINGS.splice(0, MOCK_MESS_MEAL_TIMINGS.length, ...parseResult.mess_meal_timings)

      localStorage.setItem('whats_next_mess_weeks', JSON.stringify(parseResult.mess_weeks))
      localStorage.setItem('whats_next_mess_menu_items', JSON.stringify(parseResult.mess_menu_items))
      localStorage.setItem('whats_next_mess_meal_timings', JSON.stringify(parseResult.mess_meal_timings))

      window.dispatchEvent(new Event('mess_updated'))

      const msg = `✅ Successfully applied mess menu! ${parseResult.mess_menu_items.length} dishes published.`
      setStatusMsg(msg)
      toast.success(msg)
    } catch (err: any) {
      const errMsg = `Error applying mess batch: ${err.message}`
      setStatusMsg(errMsg)
      toast.error(errMsg)
    } finally {
      setApplying(false)
    }
  }

  function downloadTemplate() {
    const bytes = generateBlankMessMenuTemplate()
    const blob = new Blob([bytes.buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'IIMU_Mess_Menu_Template.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportCurrentMenu() {
    const weeks = parseResult?.mess_weeks || MOCK_MESS_WEEKS
    const items = parseResult?.mess_menu_items || MOCK_MESS_MENU_ITEMS
    const timings = parseResult?.mess_meal_timings || MOCK_MESS_MEAL_TIMINGS

    const bytes = exportLiveMessMenuToExcel(weeks, items, timings)
    const blob = new Blob([bytes.buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'IIMU_Live_Mess_Menu_Export.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-primary-text">Mess Menu Ingestion</h2>
          <p className="text-xs text-secondary-text">
            Flat Excel importer (mess_weeks, mess_menu_items, meal timings)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={downloadTemplate}
            className="px-3 py-1.5 bg-surface text-secondary-text border border-border rounded-xl text-xs font-semibold hover:text-primary-text flex items-center gap-1.5"
          >
            <span>📥</span> Template
          </button>
          <button
            onClick={exportCurrentMenu}
            className="px-3 py-1.5 bg-surface text-secondary-text border border-border rounded-xl text-xs font-semibold hover:text-primary-text flex items-center gap-1.5"
          >
            <span>📤</span> Export Menu
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3 rounded-2xl text-xs font-semibold ${
            statusMsg.startsWith('✅')
              ? 'bg-live/10 text-live border border-live/20'
              : 'bg-danger/10 text-danger'
          }`}
        >
          {statusMsg}
        </div>
      )}

      {/* Upload Box */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="bg-white rounded-2xl border-2 border-dashed border-border hover:border-accent/40 p-6 text-center cursor-pointer transition-colors space-y-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileSelected}
          className="hidden"
        />
        <span className="text-3xl">🍽</span>
        <h3 className="text-sm font-semibold text-primary-text">
          {file ? file.name : 'Click to select Mess Menu Excel (.xlsx)'}
        </h3>
        <p className="text-xs text-secondary-text">
          Automatic diet tagging (veg, non-veg, egg), spelling fix & audit verification
        </p>
      </div>

      {/* Parsed Result & Audit Card */}
      {parseResult && (
        <div className="bg-white rounded-3xl p-5 shadow-card border border-border space-y-4">
          {/* Week Info Header */}
          {parseResult.mess_weeks.length > 0 && (
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-accent bg-accent/10 px-2.5 py-0.5 rounded-full uppercase">
                  Week: {parseResult.mess_weeks[0].week_key}
                </span>
                <span className="text-xs font-semibold text-secondary-text">
                  📅 {parseResult.mess_weeks[0].week_start} to {parseResult.mess_weeks[0].week_end}
                </span>
              </div>
              <h3 className="text-base font-bold text-primary-text mt-1">
                {parseResult.mess_weeks[0].title}
              </h3>
            </div>
          )}

          {/* Breakdown Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="bg-surface p-2.5 rounded-xl">
              <p className="text-[11px] text-secondary-text font-medium">Total Dishes</p>
              <p className="text-sm font-bold text-primary-text">{parseResult.mess_menu_items.length}</p>
            </div>
            <div className="bg-surface p-2.5 rounded-xl">
              <p className="text-[11px] text-secondary-text font-medium">Pure Veg</p>
              <p className="text-sm font-bold text-emerald-600">
                {parseResult.mess_menu_items.filter((i) => i.diet === 'veg').length}
              </p>
            </div>
            <div className="bg-surface p-2.5 rounded-xl">
              <p className="text-[11px] text-secondary-text font-medium">Non-Veg / Egg</p>
              <p className="text-sm font-bold text-rose-600">
                {parseResult.mess_menu_items.filter((i) => i.diet === 'non_veg' || i.diet === 'egg').length}
              </p>
            </div>
            <div className="bg-surface p-2.5 rounded-xl">
              <p className="text-[11px] text-secondary-text font-medium">Specials (⭐)</p>
              <p className="text-sm font-bold text-amber-600">
                {parseResult.mess_menu_items.filter((i) => i.is_special).length}
              </p>
            </div>
          </div>

          {/* Daily Meal Breakdown Audit Table */}
          {parseResult.auditSummary.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold text-primary-text uppercase tracking-wider">
                Daily Meal Breakdown Audit
              </h4>
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface text-secondary-text font-semibold">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Day</th>
                      <th className="px-3 py-2 text-center">Breakfast</th>
                      <th className="px-3 py-2 text-center">Lunch</th>
                      <th className="px-3 py-2 text-center">Hi-Tea</th>
                      <th className="px-3 py-2 text-center">Dinner</th>
                      <th className="px-3 py-2 text-center">Total</th>
                      <th className="px-3 py-2 text-center text-rose-600">Non-Veg</th>
                      <th className="px-3 py-2 text-center text-amber-600">Specials</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parseResult.auditSummary.map((aud) => (
                      <tr key={aud.date}>
                        <td className="px-3 py-2 font-bold font-mono text-accent">{aud.date}</td>
                        <td className="px-3 py-2 font-medium text-primary-text">{aud.day}</td>
                        <td className="px-3 py-2 text-center font-mono">{aud.breakfast}</td>
                        <td className="px-3 py-2 text-center font-mono">{aud.lunch}</td>
                        <td className="px-3 py-2 text-center font-mono">{aud.hi_tea}</td>
                        <td className="px-3 py-2 text-center font-mono">{aud.dinner}</td>
                        <td className="px-3 py-2 text-center font-mono font-bold text-primary-text">{aud.total}</td>
                        <td className="px-3 py-2 text-center font-mono text-rose-600 font-semibold">
                          {aud.non_veg > 0 ? aud.non_veg : '—'}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-amber-600 font-semibold">
                          {aud.specials > 0 ? `⭐ ${aud.specials}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Spelling & Normalization Fixes Table */}
          {parseResult.spellingFixes.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold text-primary-text uppercase tracking-wider flex items-center gap-1.5">
                <span>✨</span> Spelling & Format Normalizations ({parseResult.spellingFixes.length})
              </h4>
              <div className="overflow-x-auto max-h-48 border border-border rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface text-secondary-text font-semibold sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Date & Meal</th>
                      <th className="px-3 py-2 text-rose-600">Raw Text in Sheet</th>
                      <th className="px-3 py-2 text-emerald-600">Normalized Display</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parseResult.spellingFixes.map((fix, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-secondary-text">
                          {fix.date} · <span className="capitalize">{fix.meal}</span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-rose-700 bg-rose-50/30">
                          {fix.raw}
                        </td>
                        <td className="px-3 py-1.5 font-semibold text-[11px] text-emerald-700 bg-emerald-50/30">
                          {fix.display}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Warnings */}
          {parseResult.warnings.length > 0 && (
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 space-y-1">
              <p className="text-xs font-bold text-amber-800">
                ⚠️ Mess Menu Warnings ({parseResult.warnings.length})
              </p>
              <div className="max-h-28 overflow-y-auto space-y-0.5 text-[11px] text-amber-700">
                {parseResult.warnings.map((w, idx) => (
                  <p key={idx}>• {w}</p>
                ))}
              </div>
            </div>
          )}

          {/* Blocking Errors */}
          {parseResult.errors.length > 0 && (
            <div className="p-3 bg-danger/10 rounded-2xl border border-danger/20 space-y-1">
              <p className="text-xs font-bold text-danger">
                🚫 Validation Errors ({parseResult.errors.length}) — Cannot Apply
              </p>
              <div className="max-h-28 overflow-y-auto space-y-0.5 text-[11px] text-danger/90">
                {parseResult.errors.map((e, idx) => (
                  <p key={idx}>• {e}</p>
                ))}
              </div>
            </div>
          )}

          {/* Visual Diff Table */}
          {parseResult.mess_menu_items.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-primary-text uppercase tracking-wider">
                  Staged Menu Items Diff Preview ({parseResult.mess_menu_items.length} items)
                </h4>
                <div className="flex gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                    +{diffs.filter((d) => d.status === 'added').length} Added
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                    ~{diffs.filter((d) => d.status === 'modified').length} Modified
                  </span>
                  {diffs.filter((d) => d.status === 'removed').length > 0 && (
                    <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold">
                      -{diffs.filter((d) => d.status === 'removed').length} Removed
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto max-h-60 border border-border rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface text-secondary-text font-semibold sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Meal</th>
                      <th className="px-3 py-2 text-center">Pos</th>
                      <th className="px-3 py-2">Dish Name</th>
                      <th className="px-3 py-2">Diet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {diffs.slice(0, 25).map((d, i) => {
                      const item = d.incoming || d.current!
                      return (
                        <tr key={i} className={d.status === 'added' ? 'bg-emerald-50/40' : d.status === 'modified' ? 'bg-blue-50/40' : d.status === 'removed' ? 'bg-rose-50/40' : ''}>
                          <td className="px-3 py-2 font-bold uppercase text-[10px]">
                            {d.status === 'added' && <span className="text-emerald-700">+ Added</span>}
                            {d.status === 'modified' && <span className="text-blue-700">~ Modified</span>}
                            {d.status === 'removed' && <span className="text-rose-700">- Removed</span>}
                            {d.status === 'unchanged' && <span className="text-secondary-text">Unchanged</span>}
                          </td>
                          <td className="px-3 py-2 font-mono">{item.date}</td>
                          <td className="px-3 py-2 capitalize font-medium">{item.meal}</td>
                          <td className="px-3 py-2 text-center font-mono text-secondary-text">{item.position}</td>
                          <td className="px-3 py-2 font-semibold text-primary-text">
                            {item.item_display} {item.is_special && '⭐'}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              item.diet === 'non_veg' ? 'bg-rose-100 text-rose-800' :
                              item.diet === 'egg' ? 'bg-amber-100 text-amber-800' :
                              'bg-emerald-100 text-emerald-800'
                            }`}>
                              {item.diet}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <button
                onClick={applyMessBatch}
                disabled={applying || parseResult.errors.length > 0}
                className="w-full py-3 bg-accent text-white rounded-xl text-sm font-semibold shadow-sm hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {applying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Applying Mess Menu to Database...</span>
                  </>
                ) : (
                  `Approve & Apply Mess Menu (${parseResult.mess_menu_items.length} Dishes)`
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. BATCHES HISTORY & ROLLBACK ADMIN
// ═════════════════════════════════════════════════════════════════════════════

function BatchesHistoryAdmin() {
  const [batches, setBatches] = useState<IngestBatch[]>([
    {
      id: 'demo-b-1',
      kind: 'timetable',
      source: 'upload',
      file_path: 'DEM2026_Term3_Import.xlsx',
      status: 'applied',
      created_by: null,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      applied_at: new Date(Date.now() - 86400000).toISOString(),
      summary: { terms: 1, courses: 12, class_sessions: 141, events: 36 },
    },
    {
      id: 'demo-b-2',
      kind: 'mess',
      source: 'upload',
      file_path: 'Mess_Menu_2026-10-05_to_10-11_Import.xlsx',
      status: 'applied',
      created_by: null,
      created_at: new Date(Date.now() - 43200000).toISOString(),
      applied_at: new Date(Date.now() - 43200000).toISOString(),
      summary: { weeks: 1, items: 181, timings: 4 },
    },
  ])
  const [rollingBackId, setRollingBackId] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isConfiguredSupabase) {
      supabase
        .from('ingest_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (data && data.length > 0) setBatches(data)
        })
    }
  }, [])

  async function rollback(batchId: string) {
    if (!confirm('Are you sure you want to rollback this batch? Staged records will be reverted.')) return
    setRollingBackId(batchId)
    setStatusMsg(null)
    try {
      if (isConfiguredSupabase) {
        await supabase.from('class_sessions').delete().eq('source_batch_id', batchId)
        await supabase.from('events').delete().eq('source_batch_id', batchId)
        await supabase.from('mess_menu_items').delete().eq('source_batch_id', batchId)
        await supabase.from('mess_weeks').delete().eq('source_batch_id', batchId)
        await supabase
          .from('ingest_batches')
          .update({ status: 'rolled_back' })
          .eq('id', batchId)

        setBatches(batches.map((b) => (b.id === batchId ? { ...b, status: 'rolled_back' } : b)))
      } else {
        setBatches(batches.map((b) => (b.id === batchId ? { ...b, status: 'rolled_back' } : b)))
      }
      window.dispatchEvent(new Event('schedule_updated'))
      window.dispatchEvent(new Event('mess_updated'))
      setStatusMsg('✅ Successfully rolled back batch!')
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`)
    } finally {
      setRollingBackId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-primary-text">Batch History & 1-Click Rollback</h2>
        <p className="text-xs text-secondary-text">Audit all ingested timetable and mess spreadsheets</p>
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-2xl text-xs font-semibold ${
          statusMsg.startsWith('✅') ? 'bg-live/10 text-live border border-live/20' : 'bg-danger/10 text-danger'
        }`}>
          {statusMsg}
        </div>
      )}

      <div className="space-y-3">
        {batches.map((b) => (
          <div key={b.id} className="bg-white rounded-2xl p-4 shadow-card border border-border space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-accent bg-accent/10 px-2.5 py-0.5 rounded-full">
                    {b.kind}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    b.status === 'applied' ? 'bg-live/10 text-live' : b.status === 'rolled_back' ? 'bg-danger/10 text-danger' : 'bg-surface text-secondary-text'
                  }`}>
                    {b.status}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-primary-text mt-1">{b.file_path || 'Direct Ingest'}</h3>
                <p className="text-[11px] text-secondary-text">
                  Created {formatIST(new Date(b.created_at), 'dd MMM yyyy, HH:mm')}
                </p>
              </div>

              {b.status === 'applied' && (
                <button
                  onClick={() => rollback(b.id)}
                  disabled={rollingBackId === b.id}
                  className="px-3 py-1.5 bg-danger/10 text-danger hover:bg-danger/15 rounded-xl text-xs font-semibold"
                >
                  {rollingBackId === b.id ? 'Rolling back...' : 'Rollback Batch'}
                </button>
              )}
            </div>

            {b.summary && (
              <div className="p-2 bg-surface rounded-xl text-[11px] font-mono text-secondary-text">
                {JSON.stringify(b.summary)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. EVENTS & INTERVIEWS ADMIN
// ═════════════════════════════════════════════════════════════════════════════

function EventsAdmin() {
  const [events, setEvents] = useState<CampusEvent[]>(MOCK_EVENTS)
  const [showAddModal, setShowAddModal] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [form, setForm] = useState<{
    type: EventType
    title: string
    company: string
    start_at: string
    end_at: string
    venue: string
    description: string
  }>({
    type: 'placement',
    title: '',
    company: '',
    start_at: `${todayIST()}T18:00`,
    end_at: `${todayIST()}T19:30`,
    venue: 'Auditorium / Online',
    description: '',
  })

  const fetchEvents = useCallback(async () => {
    if (isConfiguredSupabase) {
      const { data } = await supabase.from('events').select('*').order('start_at', { ascending: true })
      if (data && data.length > 0) setEvents(data)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  async function createEvent() {
    if (!form.title && !form.company) return
    setProcessing(true)
    setStatusMsg(null)
    try {
      const startIso = fromDatetimeLocalToIST(form.start_at) || new Date().toISOString()
      const endIso = fromDatetimeLocalToIST(form.end_at)
      const dateStr = startIso.slice(0, 10)

      const newEvent: Partial<CampusEvent> = {
        type: form.type,
        title: form.title || `${form.company} Session`,
        company: form.company || null,
        date: dateStr,
        start_at: startIso,
        end_at: endIso || null,
        start_time: form.start_at ? form.start_at.slice(11, 16) : null,
        end_time: form.end_at ? form.end_at.slice(11, 16) : null,
        all_day: false,
        venue: form.venue || null,
        description: form.description || null,
        status: 'scheduled',
        program: 'dem',
        batch_year: 2026,
      }

      if (isConfiguredSupabase) {
        const { data, error } = await supabase.from('events').insert(newEvent).select().single()
        if (error) throw error
        if (data) setEvents([...events, data])
      } else {
        setEvents([...events, { ...newEvent, id: `ev-${Date.now()}` } as CampusEvent])
      }

      setShowAddModal(false)
      setForm({
        type: 'placement',
        title: '',
        company: '',
        start_at: `${todayIST()}T18:00`,
        end_at: `${todayIST()}T19:30`,
        venue: 'Auditorium / Online',
        description: '',
      })
      setStatusMsg('✅ Successfully added event/interview!')
      window.dispatchEvent(new Event('schedule_updated'))
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  async function deleteEvent(id: string) {
    if (!confirm('Are you sure you want to delete this event?')) return
    try {
      if (isConfiguredSupabase) {
        await supabase.from('events').delete().eq('id', id)
      }
      setEvents(events.filter((e) => e.id !== id))
      setStatusMsg('✅ Event deleted.')
      window.dispatchEvent(new Event('schedule_updated'))
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-primary-text">Campus Events & Interviews</h2>
          <p className="text-xs text-secondary-text">Placement drives, GD/PI rounds, talks & campus exams</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 bg-accent text-white rounded-xl text-xs font-semibold shadow-sm hover:opacity-95 flex items-center gap-1.5"
        >
          <span>➕</span> New Interview / Event
        </button>
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-2xl text-xs font-semibold ${
          statusMsg.startsWith('✅') ? 'bg-live/10 text-live border border-live/20' : 'bg-danger/10 text-danger'
        }`}>
          {statusMsg}
        </div>
      )}

      <div className="space-y-2.5">
        {events.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center shadow-card border border-border text-secondary-text text-xs">
            No upcoming events or interviews scheduled.
          </div>
        ) : (
          events.map((ev) => (
            <div key={ev.id} className="bg-white rounded-2xl p-4 shadow-card border border-border space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-accent bg-accent/10 px-2.5 py-0.5 rounded-full uppercase">
                      {ev.type}
                    </span>
                    {ev.company && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700">
                        {ev.company}
                      </span>
                    )}
                    <span className="text-xs font-mono text-secondary-text">
                      {ev.date} {ev.start_time ? `· ${ev.start_time.slice(0, 5)}` : ''}
                      {ev.end_time ? ` - ${ev.end_time.slice(0, 5)}` : ''}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-primary-text mt-1.5">{ev.title}</h3>
                  {ev.venue && <p className="text-xs text-secondary-text mt-0.5">📍 {ev.venue}</p>}
                </div>
                <button
                  onClick={() => deleteEvent(ev.id)}
                  className="px-2.5 py-1 text-danger/80 hover:text-danger text-xs font-semibold"
                >
                  Delete
                </button>
              </div>
              {ev.description && (
                <p className="text-xs text-secondary-text bg-surface p-2.5 rounded-xl font-mono text-[11px] leading-relaxed">
                  {ev.description}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-5 max-w-lg w-full shadow-modal space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🎤</span>
                  <div>
                    <h3 className="text-base font-bold text-primary-text">Create Interview / Campus Event</h3>
                    <p className="text-[11px] text-secondary-text">Add recruiter interviews, PPTs or exams</p>
                  </div>
                </div>
                <button onClick={() => setShowAddModal(false)} className="text-secondary-text hover:text-primary-text text-sm">✕</button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-primary-text">Company / Organization</label>
                    <input
                      type="text"
                      placeholder="e.g. Alvarez & Marsal"
                      className="input"
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-primary-text">Event / Session Title *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Technical GD & Personal Interview"
                      className="input"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-primary-text">Event Type</label>
                    <select
                      className="input text-xs"
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                    >
                      <option value="placement">Placement PPT / Interview</option>
                      <option value="workshop">Workshop</option>
                      <option value="exam">Exam / Test</option>
                      <option value="meeting">Club Meeting</option>
                      <option value="campus_event">Campus Event</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-primary-text">Start Time (IST) *</label>
                    <input
                      type="datetime-local"
                      required
                      className="input text-xs"
                      value={form.start_at}
                      onChange={(e) => setForm({ ...form, start_at: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-primary-text">End Time (IST)</label>
                    <input
                      type="datetime-local"
                      className="input text-xs"
                      value={form.end_at}
                      onChange={(e) => setForm({ ...form, end_at: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary-text">Venue / Meeting Link</label>
                  <input
                    type="text"
                    placeholder="Auditorium, CR-7C, or Google Meet link..."
                    className="input text-xs"
                    value={form.venue}
                    onChange={(e) => setForm({ ...form, venue: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary-text">Interview Rounds & Instructions (Description)</label>
                  <textarea
                    rows={6}
                    placeholder="Provide details on rounds, attire, panel info, and eligibility..."
                    className="input text-xs font-mono leading-relaxed resize-y min-h-[120px] p-3"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 bg-surface text-secondary-text rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createEvent}
                  disabled={processing || (!form.title && !form.company)}
                  className="flex-1 py-2.5 bg-accent text-white rounded-xl text-xs font-semibold shadow-sm hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processing ? 'Publishing...' : 'Publish to Students'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. COURSES ADMIN
// ═════════════════════════════════════════════════════════════════════════════

function CoursesAdmin({
  courses,
}: {
  courses: Course[]
  onCoursesUpdated?: (c: Course[]) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-primary-text">Course Master</h2>
        <p className="text-xs text-secondary-text">Registered subjects for DEM 2026 cohort</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {courses.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl p-4 shadow-card border border-border flex items-start justify-between">
            <div>
              <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                {c.code}
              </span>
              <h3 className="text-sm font-semibold text-primary-text mt-1.5">{c.name}</h3>
              <p className="text-xs text-secondary-text mt-0.5">{c.faculty || 'No faculty assigned'}</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold font-mono text-secondary-text">
                {c.credits} cr · {c.total_sessions || c.credits * 5} sessions
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
