import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase, isConfiguredSupabase } from '../../lib/supabase'
import {
  formatIST,
  dayOffsetIST,
  toDatetimeLocalIST,
  fromDatetimeLocalToIST,
} from '../../lib/timeUtils'
import type { Project, Course, ProjectType } from '../../types'

export function ProjectsAdmin({ courses = [] }: { courses?: Course[] }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  // Add / Edit Modal state
  const [modalData, setModalData] = useState<{
    isOpen: boolean
    mode: 'add' | 'edit'
    item?: Project
  }>({
    isOpen: false,
    mode: 'add',
  })

  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<{
    title: string
    course_id: string
    type: ProjectType
    deadline: string
    group_size: number
    submission_link: string
    description: string
  }>({
    title: '',
    course_id: courses[0]?.id || '',
    type: 'assignment',
    deadline: `${dayOffsetIST(7)}T23:59`,
    group_size: 1,
    submission_link: '',
    description: '',
  })

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    if (isConfiguredSupabase) {
      const { data, error } = await supabase
        .from('projects')
        .select('*, course:courses(*)')
        .order('deadline', { ascending: true })
      if (!error && data) {
        setProjects(data)
      }
    } else {
      const cached = localStorage.getItem('whats_next_projects')
      if (cached) {
        try {
          setProjects(JSON.parse(cached))
        } catch {
          // ignore
        }
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  function openAddModal() {
    setForm({
      title: '',
      course_id: courses[0]?.id || '',
      type: 'assignment',
      deadline: `${dayOffsetIST(7)}T23:59`,
      group_size: 1,
      submission_link: '',
      description: '',
    })
    setModalData({ isOpen: true, mode: 'add' })
  }

  function openEditModal(proj: Project) {
    setForm({
      title: proj.title,
      course_id: proj.course_id || '',
      type: proj.type || 'assignment',
      deadline: proj.deadline ? toDatetimeLocalIST(proj.deadline) : `${dayOffsetIST(7)}T23:59`,
      group_size: proj.group_size || 1,
      submission_link: proj.submission_link || '',
      description: proj.description || '',
    })
    setModalData({ isOpen: true, mode: 'edit', item: proj })
  }

  async function handleSaveProject() {
    if (!form.title.trim()) {
      toast.error('Title is required.')
      return
    }

    if (form.title.trim().length > 120) {
      toast.error('Title cannot exceed 120 characters.')
      return
    }

    if (form.description.trim().length > 2000) {
      toast.error('Description cannot exceed 2000 characters.')
      return
    }

    const deadlineIso = fromDatetimeLocalToIST(form.deadline)
    if (!deadlineIso) {
      toast.error('Please enter a valid deadline.')
      return
    }

    // Deadline validation: must be in future (for new projects)
    if (modalData.mode === 'add' && new Date(deadlineIso).getTime() <= Date.now()) {
      toast.error('Deadline must be in the future.')
      return
    }

    setSaving(true)
    setStatusMsg(null)

    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        type: form.type,
        course_id: form.course_id || null,
        deadline: deadlineIso,
        submission_link: form.submission_link.trim() || null,
        group_size: form.group_size || 1,
        status: 'open' as const,
        program: 'dem',
        batch_year: 2026,
      }

      if (isConfiguredSupabase) {
        if (modalData.mode === 'edit' && modalData.item?.id) {
          const { error: uErr } = await supabase
            .from('projects')
            .update(payload)
            .eq('id', modalData.item.id)
          if (uErr) throw uErr
          toast.success('Project deliverable updated!')
        } else {
          const { error: iErr } = await supabase.from('projects').insert(payload)
          if (iErr) throw iErr
          toast.success('Successfully published project deliverable!')
        }
        await fetchProjects()
      } else {
        const dummy: Project = {
          id: modalData.mode === 'edit' && modalData.item?.id ? modalData.item.id : `p-${Date.now()}`,
          ...payload,
          attachments: [],
          course: courses.find((c) => c.id === form.course_id),
        }
        const current = projects
        const next = modalData.mode === 'edit' && modalData.item?.id
          ? current.map((p) => (p.id === modalData.item!.id ? dummy : p))
          : [dummy, ...current]
        setProjects(next)
        localStorage.setItem('whats_next_projects', JSON.stringify(next))
        toast.success(modalData.mode === 'edit' ? 'Updated locally.' : 'Saved locally.')
      }

      setModalData({ isOpen: false, mode: 'add' })
      window.dispatchEvent(new Event('schedule_updated'))
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this project?')) return
    try {
      if (isConfiguredSupabase) {
        await supabase.from('projects').delete().eq('id', id)
      }
      const updated = projects.filter((p) => p.id !== id)
      setProjects(updated)
      localStorage.setItem('whats_next_projects', JSON.stringify(updated))
      window.dispatchEvent(new Event('schedule_updated'))
      toast.success('Deliverable deleted.')
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`)
    }
  }

  return (
    <div className="space-y-4">
      {/* Action Header */}
      <div className="bg-white rounded-3xl p-5 shadow-card border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-primary-text flex items-center gap-2">
            <span>📁</span> Course Deliverables & Assignments
          </h2>
          <p className="text-xs text-secondary-text mt-0.5">
            Manage projects, case studies, rubrics & submission deadlines for DEM 2026
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-3.5 py-2 bg-accent text-white rounded-xl text-xs font-semibold shadow-sm hover:opacity-95 flex items-center gap-1.5"
        >
          <span>➕</span> New Project / Assignment
        </button>
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

      {/* Projects List */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="bg-white rounded-3xl p-8 text-center shadow-card border border-border text-secondary-text text-xs">
            Loading deliverables...
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center shadow-card border border-border text-secondary-text text-xs">
            No active assignments or project milestones. Click "+ New Project / Assignment" to create one.
          </div>
        ) : (
          projects.map((proj) => (
            <div
              key={proj.id}
              className="bg-white rounded-2xl p-4 shadow-card border border-border space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-accent bg-accent/10 px-2.5 py-0.5 rounded-full">
                      {proj.type}
                    </span>
                    {proj.course && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface text-secondary-text font-mono border border-border">
                        {proj.course.code} · {proj.course.name}
                      </span>
                    )}
                    <span className="text-[11px] text-secondary-text font-medium">
                      Due {proj.deadline ? formatIST(new Date(proj.deadline), 'dd MMM yyyy, HH:mm') : 'No deadline'}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-primary-text mt-1.5">{proj.title}</h3>
                  {proj.group_size > 1 && (
                    <p className="text-xs text-secondary-text mt-0.5">👥 Groups of {proj.group_size}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openEditModal(proj)}
                    className="px-2.5 py-1 bg-surface hover:bg-surface/80 text-primary-text border border-border rounded-lg text-xs font-semibold"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(proj.id)}
                    className="px-2.5 py-1 text-danger/80 hover:text-danger text-xs font-semibold"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {proj.description && (
                <p className="text-xs text-secondary-text bg-surface p-2.5 rounded-xl font-mono text-[11px] leading-relaxed whitespace-pre-line">
                  {proj.description}
                </p>
              )}

              {proj.submission_link && (
                <a
                  href={proj.submission_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-accent font-semibold hover:underline"
                >
                  <span>🔗</span> Submission Portal
                </a>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Project Modal */}
      <AnimatePresence>
        {modalData.isOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-5 max-w-lg w-full shadow-modal space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📁</span>
                  <div>
                    <h3 className="text-base font-bold text-primary-text">
                      {modalData.mode === 'edit' ? 'Edit Deliverable' : 'Create Project / Assignment'}
                    </h3>
                    <p className="text-[11px] text-secondary-text">
                      Add course assignments, rubrics & submission deadlines
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setModalData({ isOpen: false, mode: 'add' })}
                  className="text-secondary-text hover:text-primary-text text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                {/* Deliverable Type Pills */}
                <div>
                  <label className="text-xs font-semibold text-primary-text block mb-1">
                    Deliverable Type
                  </label>
                  <div className="flex bg-surface p-1 rounded-xl border border-border gap-1">
                    {(['assignment', 'project', 'end-term'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm({ ...form, type: t })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                          form.type === t
                            ? 'bg-white text-primary-text shadow-sm'
                            : 'text-secondary-text hover:text-primary-text'
                        }`}
                      >
                        {t === 'assignment' ? '📝 Assignment' : t === 'project' ? '🚀 Project' : '🎯 End-term'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-primary-text">
                      Deliverable Title *
                    </label>
                    <span className="text-[10px] text-secondary-text">
                      {form.title.length}/120
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    placeholder="e.g. Term Project Milestone 1 — Market Analysis"
                    className="input"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>

                {/* Course Dropdown */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary-text">
                    Associated Course *
                  </label>
                  <select
                    className="input text-xs"
                    value={form.course_id}
                    onChange={(e) => setForm({ ...form, course_id: e.target.value })}
                  >
                    <option value="">Other / None (Campus-wide)</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Deadline & Group Size */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-primary-text">
                      Deadline (IST) *
                    </label>
                    <input
                      type="datetime-local"
                      required
                      className="input text-xs font-semibold text-accent border-accent/40 bg-accent/5"
                      value={form.deadline}
                      onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    />
                    <p className="text-[10px] text-secondary-text">Defaults to 11:59 PM IST</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-primary-text">
                      Group Size (1 to 20)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      className="input text-xs"
                      value={form.group_size}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          group_size: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)),
                        })
                      }
                    />
                    <p className="text-[10px] text-secondary-text">
                      {form.group_size === 1 ? 'Individual deliverable' : `Group of ${form.group_size} students`}
                    </p>
                  </div>
                </div>

                {/* Submission Link */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary-text">
                    Submission Link (Google Drive / Moodle / Form)
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    className="input text-xs"
                    value={form.submission_link}
                    onChange={(e) => setForm({ ...form, submission_link: e.target.value })}
                  />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-primary-text">
                      Requirements & Guidelines (Description)
                    </label>
                    <span className="text-[10px] text-secondary-text">
                      {form.description.length}/2000
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    maxLength={2000}
                    placeholder="Provide assignment guidelines, scoring rubrics, dataset links, and deliverable format..."
                    className="input text-xs font-mono leading-relaxed resize-y min-h-[120px] p-3"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setModalData({ isOpen: false, mode: 'add' })}
                  className="flex-1 py-2.5 bg-surface text-secondary-text rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveProject}
                  disabled={saving || !form.title.trim()}
                  className="flex-1 py-2.5 bg-accent text-white rounded-xl text-xs font-semibold shadow-sm hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{modalData.mode === 'edit' ? 'Update Deliverable' : 'Publish Deliverable'}</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
