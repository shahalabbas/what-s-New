import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase, isConfiguredSupabase } from '../../lib/supabase'
import { parseSupersetEmail } from '../../lib/email/superset'
import {
  formatPlacementDeadline,
  toDatetimeLocalIST,
  fromDatetimeLocalToIST,
  dayOffsetIST,
} from '../../lib/timeUtils'
import type {
  PlacementOpportunity,
  PlacementStage,
  PlacementAdditionalDetail,
  PlacementSource,
} from '../../types'

export function PlacementsAdmin() {
  const [opportunities, setOpportunities] = useState<PlacementOpportunity[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('open')
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  // Upload & Paste state
  const [pasteText, setPasteText] = useState('')
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [parsing, setParsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Modals state
  const [reviewData, setReviewData] = useState<{
    parsed: any
    rawText: string
    source: 'upload' | 'paste'
  } | null>(null)
  const [manualModalData, setManualModalData] = useState<{
    mode: 'add' | 'edit'
    item?: PlacementOpportunity
  } | null>(null)

  const fetchPlacements = useCallback(async () => {
    setLoading(true)
    if (isConfiguredSupabase) {
      const { data, error } = await supabase
        .from('placement_opportunities')
        .select('*')
        .order('deadline_at', { ascending: true })
      if (!error && data) {
        setOpportunities(data)
      }
    } else {
      const cached = localStorage.getItem('whats_next_placements')
      if (cached) {
        try {
          setOpportunities(JSON.parse(cached))
        } catch {
          // ignore
        }
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPlacements()
    const handleUpdate = () => fetchPlacements()
    window.addEventListener('placements_updated', handleUpdate)
    return () => window.removeEventListener('placements_updated', handleUpdate)
  }, [fetchPlacements])

  // Handle .eml file upload
  async function handleEmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate extension & size (2MB max)
    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.eml')) {
      toast.error('Please upload a .eml file up to 2 MB (.msg is not supported)')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size exceeds 2 MB limit. Please upload a smaller .eml file.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setParsing(true)
    setStatusMsg(null)
    try {
      const text = await file.text()
      const parsed = await parseSupersetEmail(text)
      setReviewData({
        parsed,
        rawText: text,
        source: 'upload',
      })
    } catch (err: any) {
      toast.error(`Failed to parse .eml: ${err.message}`)
    } finally {
      setParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Handle raw or visible email paste
  async function handlePasteEmail() {
    if (!pasteText.trim()) return
    setParsing(true)
    setStatusMsg(null)
    try {
      const parsed = await parseSupersetEmail(pasteText)
      setShowPasteModal(false)
      setReviewData({
        parsed,
        rawText: pasteText,
        source: 'paste',
      })
      setPasteText('')
    } catch (err: any) {
      toast.error(`Failed to parse email: ${err.message}`)
    } finally {
      setParsing(false)
    }
  }

  // Delete placement opportunity
  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this placement record?')) return
    try {
      if (isConfiguredSupabase) {
        await supabase.from('placement_opportunities').delete().eq('id', id)
        await supabase.from('placement_updates').delete().eq('opportunity_id', id)
      }
      const updated = opportunities.filter((o) => o.id !== id)
      setOpportunities(updated)
      localStorage.setItem('whats_next_placements', JSON.stringify(updated))
      window.dispatchEvent(new Event('placements_updated'))
      toast.success('Placement opportunity deleted.')
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`)
    }
  }

  const filteredOpportunities = opportunities.filter((o) => {
    if (filter === 'open') {
      return o.stage === 'open_for_application' || o.stage === 'deadline_extended'
    }
    if (filter === 'closed') {
      return o.stage === 'application_closed' || o.stage === 'result'
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Header & Ingestion Action Bar */}
      <div className="bg-white rounded-3xl p-5 shadow-card border border-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-primary-text flex items-center gap-2">
              <span>💼</span> Placement Opportunities & Ingestion
            </h2>
            <p className="text-xs text-secondary-text mt-0.5">
              Rule-based Superset email parser & interview process management
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".eml"
              onChange={handleEmlUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="px-3 py-2 bg-accent text-white rounded-xl text-xs font-semibold shadow-sm hover:opacity-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>📥</span> Upload .eml File
            </button>
            <button
              onClick={() => setShowPasteModal(true)}
              className="px-3 py-2 bg-surface hover:bg-surface/80 text-primary-text border border-border rounded-xl text-xs font-semibold flex items-center gap-1.5"
            >
              <span>📋</span> Paste Email / Source
            </button>
            <button
              onClick={() => setManualModalData({ mode: 'add' })}
              className="px-3 py-2 bg-surface hover:bg-surface/80 text-primary-text border border-border rounded-xl text-xs font-semibold flex items-center gap-1.5"
            >
              <span>➕</span> Add Manually
            </button>
          </div>
        </div>

        {parsing && (
          <div className="p-3 bg-accent/10 border border-accent/20 rounded-2xl flex items-center gap-2 text-xs text-accent font-semibold">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span>Parsing email with rule-based Superset engine...</span>
          </div>
        )}
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

      {/* Filter Tabs & Listings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex bg-surface p-1 rounded-xl border border-border gap-1">
            {(['open', 'closed', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all ${
                  filter === f
                    ? 'bg-white text-primary-text shadow-sm'
                    : 'text-secondary-text hover:text-primary-text'
                }`}
              >
                {f === 'open' ? '🟢 Openings' : f === 'closed' ? '🔒 Closed / Results' : '📋 All'}
              </button>
            ))}
          </div>

          <span className="text-xs text-secondary-text font-medium">
            {filteredOpportunities.length} record{filteredOpportunities.length === 1 ? '' : 's'}
          </span>
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl p-8 text-center shadow-card border border-border text-secondary-text text-xs">
            Loading placement records...
          </div>
        ) : filteredOpportunities.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center shadow-card border border-border text-secondary-text text-xs">
            No placement records found for filter "{filter}". Upload a Superset .eml or add manually.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredOpportunities.map((opp) => (
              <div
                key={opp.id}
                className="bg-white rounded-2xl p-4 shadow-card border border-border space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700">
                        {opp.source === 'superset' ? 'Superset' : 'Manual'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface text-secondary-text border border-border uppercase">
                        {opp.stage.replace(/_/g, ' ')}
                      </span>
                      {opp.deadline_at && (
                        <span className="text-xs font-mono font-semibold text-accent">
                          Deadline: {formatPlacementDeadline(opp.deadline_at)}
                        </span>
                      )}
                      {opp.event_at && (
                        <span className="text-xs font-mono font-semibold text-amber-700">
                          Event: {formatPlacementDeadline(opp.event_at)}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-primary-text">{opp.company}</h3>
                    <p className="text-xs text-secondary-text">{opp.role}</p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setManualModalData({ mode: 'edit', item: opp })}
                      className="px-2.5 py-1 bg-surface hover:bg-surface/80 text-primary-text border border-border rounded-lg text-xs font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(opp.id)}
                      className="px-2.5 py-1 text-danger/80 hover:text-danger text-xs font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Additional Details Chips */}
                {opp.additional_details && opp.additional_details.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {opp.additional_details.map((detail, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-lg bg-surface border border-border text-[10px] font-medium text-secondary-text"
                      >
                        <span className="font-semibold text-primary-text">{detail.label}:</span>{' '}
                        {detail.value}
                      </span>
                    ))}
                  </div>
                )}

                {opp.notes && (
                  <p className="text-xs text-secondary-text bg-surface p-2.5 rounded-xl font-mono text-[11px] leading-relaxed line-clamp-3">
                    {opp.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Paste Email Modal */}
      <AnimatePresence>
        {showPasteModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-5 max-w-lg w-full shadow-modal space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📋</span>
                  <div>
                    <h3 className="text-base font-bold text-primary-text">Paste Placement Email</h3>
                    <p className="text-[11px] text-secondary-text">
                      Supports Gmail "Show original" raw MIME or copied visible text
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPasteModal(false)}
                  className="text-secondary-text hover:text-primary-text text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <AdminField label="Email Content / Raw RFC822 Source">
                  <textarea
                    rows={10}
                    placeholder="Paste the raw email source or visible body text here..."
                    className="input text-xs font-mono resize-y min-h-[180px] p-3 leading-relaxed"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                </AdminField>
                <p className="text-[11px] text-secondary-text">
                  Tip: Copying the raw source from Gmail (⋮ ➔ "Show original") preserves exact message ID and timestamps.
                </p>
              </div>

              <div className="flex gap-2 pt-2 border-t border-border">
                <button
                  onClick={() => setShowPasteModal(false)}
                  className="flex-1 py-2.5 bg-surface text-secondary-text rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePasteEmail}
                  disabled={!pasteText.trim() || parsing}
                  className="flex-1 py-2.5 bg-accent text-white rounded-xl text-xs font-semibold disabled:opacity-50"
                >
                  {parsing ? 'Parsing...' : 'Parse & Review'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Review Modal for Extracted Superset Data */}
      <AnimatePresence>
        {reviewData && (
          <PlacementReviewModal
            data={reviewData}
            onClose={() => setReviewData(null)}
            onSaved={() => {
              setReviewData(null)
              fetchPlacements()
            }}
          />
        )}
      </AnimatePresence>

      {/* Manual Add / Edit Modal */}
      <AnimatePresence>
        {manualModalData && (
          <PlacementManualModal
            mode={manualModalData.mode}
            item={manualModalData.item}
            onClose={() => setManualModalData(null)}
            onSaved={() => {
              setManualModalData(null)
              fetchPlacements()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PlacementReviewModal: Extracted Superset email review with Additional Details
// ─────────────────────────────────────────────────────────────────────────────

function PlacementReviewModal({
  data,
  onClose,
  onSaved,
}: {
  data: { parsed: any; rawText: string; source: 'upload' | 'paste' }
  onClose: () => void
  onSaved: () => void
}) {
  const p = data.parsed
  const [saving, setSaving] = useState(false)
  const [existingRecord, setExistingRecord] = useState<PlacementOpportunity | null>(null)

  const [company, setCompany] = useState(p.company || '')
  const [role, setRole] = useState(p.role || '')
  const [stage, setStage] = useState<PlacementStage>(p.stage || 'open_for_application')
  const [applicationStart, setApplicationStart] = useState(
    p.application_start ? toDatetimeLocalIST(p.application_start) : toDatetimeLocalIST(new Date().toISOString())
  )
  const [deadlineAt, setDeadlineAt] = useState(
    p.deadline_at ? toDatetimeLocalIST(p.deadline_at) : toDatetimeLocalIST(`${dayOffsetIST(3)}T23:59:00+05:30`)
  )
  const [applyUrl, setApplyUrl] = useState(p.apply_url || '')
  const [additionalDetails, setAdditionalDetails] = useState<PlacementAdditionalDetail[]>(
    p.additional_details && p.additional_details.length > 0
      ? p.additional_details
      : (p.category ? [{ label: 'Job Profile Category', value: p.category }] : [])
  )
  const [notes, setNotes] = useState(p.clean_text || '')

  useEffect(() => {
    let isCancelled = false
    async function checkExisting() {
      if (isConfiguredSupabase) {
        if (p.external_job_id) {
          const { data: matchJob } = await supabase
            .from('placement_opportunities')
            .select('*')
            .eq('program', 'dem')
            .eq('batch_year', 2026)
            .eq('external_job_id', p.external_job_id)
            .maybeSingle()
          if (!isCancelled && matchJob) {
            setExistingRecord(matchJob)
            return
          }
        }
        if (p.message_id) {
          const { data: matchMsg } = await supabase
            .from('placement_opportunities')
            .select('*')
            .eq('message_id', p.message_id)
            .maybeSingle()
          if (!isCancelled && matchMsg) {
            setExistingRecord(matchMsg)
            return
          }
        }
      } else {
        const cached: PlacementOpportunity[] = JSON.parse(
          localStorage.getItem('whats_next_placements') || '[]'
        )
        const match = cached.find(
          (o) =>
            (p.external_job_id && o.external_job_id === p.external_job_id) ||
            (p.message_id && o.message_id === p.message_id)
        )
        if (!isCancelled && match) {
          setExistingRecord(match)
        }
      }
    }
    checkExisting()
    return () => {
      isCancelled = true
    }
  }, [p.message_id, p.external_job_id])

  function addDetailRow() {
    setAdditionalDetails([...additionalDetails, { label: '', value: '' }])
  }

  function updateDetailRow(idx: number, field: 'label' | 'value', val: string) {
    const next = [...additionalDetails]
    next[idx] = { ...next[idx], [field]: val }
    setAdditionalDetails(next)
  }

  function removeDetailRow(idx: number) {
    setAdditionalDetails(additionalDetails.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!company.trim() || !role.trim()) {
      toast.error('Company and Role are required.')
      return
    }

    setSaving(true)
    try {
      const deadlineIso = deadlineAt ? fromDatetimeLocalToIST(deadlineAt) : null
      const startIso = applicationStart ? fromDatetimeLocalToIST(applicationStart) : null
      const cleanedDetails = additionalDetails.filter((d) => d.label.trim() && d.value.trim())

      const payload = {
        program: 'dem',
        batch_year: 2026,
        source: 'superset' as const,
        external_job_id: p.external_job_id || null,
        company: company.trim(),
        role: role.trim(),
        stage,
        deadline_at: deadlineIso,
        application_start: startIso,
        apply_url: applyUrl.trim() || null,
        additional_details: cleanedDetails,
        notes: notes.trim() || null,
        message_id: p.message_id || null,
      }

      if (isConfiguredSupabase) {
        let targetId = existingRecord?.id
        let targetRecord = existingRecord

        if (!targetId && payload.external_job_id) {
          const { data: matchJob } = await supabase
            .from('placement_opportunities')
            .select('*')
            .eq('program', payload.program)
            .eq('batch_year', payload.batch_year)
            .eq('external_job_id', payload.external_job_id)
            .maybeSingle()
          if (matchJob) {
            targetId = matchJob.id
            targetRecord = matchJob
          }
        }

        if (!targetId && payload.message_id) {
          const { data: matchMsg } = await supabase
            .from('placement_opportunities')
            .select('*')
            .eq('message_id', payload.message_id)
            .maybeSingle()
          if (matchMsg) {
            targetId = matchMsg.id
            targetRecord = matchMsg
          }
        }

        if (targetId && targetRecord) {
          const { error: uErr } = await supabase
            .from('placement_opportunities')
            .update({
              ...payload,
              updated_at: new Date().toISOString(),
            })
            .eq('id', targetId)
          if (uErr) throw uErr

          await supabase.from('placement_updates').insert({
            opportunity_id: targetId,
            old_values: {
              stage: targetRecord.stage,
              deadline_at: targetRecord.deadline_at,
              additional_details: targetRecord.additional_details,
            },
            new_values: {
              stage: payload.stage,
              deadline_at: payload.deadline_at,
              additional_details: payload.additional_details,
            },
            message_id: payload.message_id,
          })
          toast.success('Updated existing placement opportunity.')
        } else {
          const { error: iErr } = await supabase.from('placement_opportunities').insert(payload)
          if (iErr) throw iErr
          toast.success('Successfully published placement opportunity!')
        }
      } else {
        const current: PlacementOpportunity[] = JSON.parse(
          localStorage.getItem('whats_next_placements') || '[]'
        )
        const matchIdx = current.findIndex(
          (o) =>
            (existingRecord && o.id === existingRecord.id) ||
            (payload.external_job_id && o.external_job_id === payload.external_job_id) ||
            (payload.message_id && o.message_id === payload.message_id)
        )
        const newRecord: PlacementOpportunity = {
          id: matchIdx >= 0 ? current[matchIdx].id : `place-${Date.now()}`,
          ...payload,
          created_at: matchIdx >= 0 ? current[matchIdx].created_at : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        const updated =
          matchIdx >= 0
            ? current.map((c, idx) => (idx === matchIdx ? newRecord : c))
            : [newRecord, ...current]
        localStorage.setItem('whats_next_placements', JSON.stringify(updated))
        toast.success(
          matchIdx >= 0 ? 'Updated placement opportunity locally.' : 'Saved placement opportunity locally.'
        )
      }

      window.dispatchEvent(new Event('placements_updated'))
      onSaved()
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl p-5 max-w-2xl w-full shadow-modal space-y-4 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💼</span>
            <div>
              <h3 className="text-base font-bold text-primary-text">Review Superset Ingestion</h3>
              <p className="text-[11px] text-secondary-text">
                Rule-based extracted placement details & additional parameters
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-secondary-text hover:text-primary-text text-sm">
            ✕
          </button>
        </div>

        {p.warnings && p.warnings.length > 0 && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs space-y-1">
            {p.warnings.map((w: string, idx: number) => (
              <div key={idx} className="flex items-center gap-1.5 font-medium">
                <span>⚠️</span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {existingRecord && (
          <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <span>📝</span>
              <span>Matching existing opportunity ({existingRecord.company})</span>
            </div>
            <p className="text-[11px]">
              Saving will update the existing record and create a version audit entry in the timeline.
            </p>
          </div>
        )}

        <div className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AdminField label="Company Name *">
              <input
                type="text"
                required
                className="input"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </AdminField>
            <AdminField label="Role Title *">
              <input
                type="text"
                required
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </AdminField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <AdminField label="Stage">
              <select
                className="input text-xs font-semibold"
                value={stage}
                onChange={(e) => setStage(e.target.value as PlacementStage)}
              >
                <option value="open_for_application">Open for Application</option>
                <option value="deadline_extended">Deadline Extended</option>
                <option value="application_closed">Application Closed</option>
                <option value="shortlist">Shortlist Out</option>
                <option value="test">Test Scheduled</option>
                <option value="interview">Interview Scheduled</option>
                <option value="result">Results Announced</option>
                <option value="other">Other</option>
              </select>
            </AdminField>
            <AdminField label="Application Start (IST)">
              <input
                type="datetime-local"
                className="input text-xs"
                value={applicationStart}
                onChange={(e) => setApplicationStart(e.target.value)}
              />
            </AdminField>
            <AdminField label="End Time / Deadline (IST) *">
              <input
                type="datetime-local"
                required
                className="input text-xs font-semibold text-accent border-accent/40 bg-accent/5"
                value={deadlineAt}
                onChange={(e) => setDeadlineAt(e.target.value)}
              />
            </AdminField>
          </div>

          <AdminField label="Superset / Application URL">
            <input
              type="url"
              className="input text-xs"
              value={applyUrl}
              onChange={(e) => setApplyUrl(e.target.value)}
            />
          </AdminField>

          {/* Additional Details Table */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-primary-text">
                Additional Details (Category, Stipend, Bond, etc.)
              </label>
              <button
                type="button"
                onClick={addDetailRow}
                className="text-[11px] font-semibold text-accent hover:underline"
              >
                + Add Detail Row
              </button>
            </div>

            {additionalDetails.length === 0 ? (
              <p className="text-[11px] text-secondary-text italic">
                No additional key-value details detected. Click "+ Add Detail Row" to add one.
              </p>
            ) : (
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {additionalDetails.map((detail, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Label (e.g. Stipend)"
                      className="input text-xs flex-1 py-1.5"
                      value={detail.label}
                      onChange={(e) => updateDetailRow(idx, 'label', e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Value (e.g. ₹50,000/mo)"
                      className="input text-xs flex-1 py-1.5"
                      value={detail.value}
                      onChange={(e) => updateDetailRow(idx, 'value', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeDetailRow(idx)}
                      className="text-danger hover:text-danger/80 px-2 py-1 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <AdminField label="Job Description / Cleaned Text">
            <textarea
              rows={6}
              className="input text-xs font-mono leading-relaxed resize-y min-h-[120px] p-3"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </AdminField>
        </div>

        <div className="flex gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-surface text-secondary-text rounded-xl text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !company.trim() || !role.trim()}
            className="flex-1 py-2.5 bg-accent text-white rounded-xl text-xs font-semibold shadow-sm hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save & Publish to Students</span>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PlacementManualModal: Manual interview & placement process form (8 stages)
// ─────────────────────────────────────────────────────────────────────────────

function PlacementManualModal({
  mode,
  item,
  onClose,
  onSaved,
}: {
  mode: 'add' | 'edit'
  item?: PlacementOpportunity
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)

  const [company, setCompany] = useState(item?.company || '')
  const [role, setRole] = useState(item?.role || '')
  const [stage, setStage] = useState<PlacementStage>(item?.stage || 'open_for_application')
  const [applicationStart, setApplicationStart] = useState(
    item?.application_start ? toDatetimeLocalIST(item.application_start) : toDatetimeLocalIST(new Date().toISOString())
  )
  const [deadlineAt, setDeadlineAt] = useState(
    item?.deadline_at ? toDatetimeLocalIST(item.deadline_at) : toDatetimeLocalIST(`${dayOffsetIST(3)}T23:59:00+05:30`)
  )
  const [eventAt, setEventAt] = useState(item?.event_at ? toDatetimeLocalIST(item.event_at) : '')
  const [venueOrLink, setVenueOrLink] = useState(item?.venue_or_link || '')
  const [applyUrl, setApplyUrl] = useState(item?.apply_url || '')
  const [additionalDetails, setAdditionalDetails] = useState<PlacementAdditionalDetail[]>(
    item?.additional_details || []
  )
  const [notes, setNotes] = useState(item?.notes || '')

  function addDetailRow() {
    setAdditionalDetails([...additionalDetails, { label: '', value: '' }])
  }

  function updateDetailRow(idx: number, field: 'label' | 'value', val: string) {
    const next = [...additionalDetails]
    next[idx] = { ...next[idx], [field]: val }
    setAdditionalDetails(next)
  }

  function removeDetailRow(idx: number) {
    setAdditionalDetails(additionalDetails.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!company.trim() || !role.trim()) {
      toast.error('Company and Role are required.')
      return
    }

    setSaving(true)
    try {
      const deadlineIso = deadlineAt ? fromDatetimeLocalToIST(deadlineAt) : null
      const startIso = applicationStart ? fromDatetimeLocalToIST(applicationStart) : null
      const eventIso = eventAt ? fromDatetimeLocalToIST(eventAt) : null
      const cleanedDetails = additionalDetails.filter((d) => d.label.trim() && d.value.trim())

      const payload = {
        program: 'dem',
        batch_year: 2026,
        source: (item?.source || 'manual') as PlacementSource,
        external_job_id: item?.external_job_id || null,
        company: company.trim(),
        role: role.trim(),
        stage,
        deadline_at: deadlineIso,
        application_start: startIso,
        event_at: eventIso,
        venue_or_link: venueOrLink.trim() || null,
        apply_url: applyUrl.trim() || null,
        additional_details: cleanedDetails,
        notes: notes.trim() || null,
      }

      if (isConfiguredSupabase) {
        if (mode === 'edit' && item?.id) {
          const { error: uErr } = await supabase
            .from('placement_opportunities')
            .update({
              ...payload,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id)
          if (uErr) throw uErr

          await supabase.from('placement_updates').insert({
            opportunity_id: item.id,
            old_values: {
              stage: item.stage,
              deadline_at: item.deadline_at,
              event_at: item.event_at,
              additional_details: item.additional_details,
            },
            new_values: {
              stage: payload.stage,
              deadline_at: payload.deadline_at,
              event_at: payload.event_at,
              additional_details: payload.additional_details,
            },
          })
          toast.success('Updated placement opportunity!')
        } else {
          let existingId = item?.id
          if (!existingId && payload.external_job_id) {
            const { data: match } = await supabase
              .from('placement_opportunities')
              .select('id')
              .eq('program', payload.program)
              .eq('batch_year', payload.batch_year)
              .eq('external_job_id', payload.external_job_id)
              .maybeSingle()
            if (match) existingId = match.id
          }

          if (existingId) {
            const { error: uErr } = await supabase
              .from('placement_opportunities')
              .update({
                ...payload,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingId)
            if (uErr) throw uErr
            toast.success('Updated existing placement opportunity!')
          } else {
            const { error: iErr } = await supabase.from('placement_opportunities').insert(payload)
            if (iErr) throw iErr
            toast.success('Created placement opportunity!')
          }
        }
      } else {
        const current = JSON.parse(localStorage.getItem('whats_next_placements') || '[]')
        const newRecord: PlacementOpportunity = {
          id: mode === 'edit' && item?.id ? item.id : `place-${Date.now()}`,
          ...payload,
          created_at: item?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        const updated = mode === 'edit' && item?.id
          ? current.map((c: any) => (c.id === item.id ? newRecord : c))
          : [newRecord, ...current]
        localStorage.setItem('whats_next_placements', JSON.stringify(updated))
        toast.success(mode === 'edit' ? 'Updated locally.' : 'Saved locally.')
      }

      window.dispatchEvent(new Event('placements_updated'))
      onSaved()
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl p-5 max-w-2xl w-full shadow-modal space-y-4 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎤</span>
            <div>
              <h3 className="text-base font-bold text-primary-text">
                {mode === 'edit' ? 'Edit Placement / Interview' : 'Add Placement / Interview Manually'}
              </h3>
              <p className="text-[11px] text-secondary-text">
                Manage interview rounds, PPT dates, shortlists & deadlines
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-secondary-text hover:text-primary-text text-sm">
            ✕
          </button>
        </div>

        <div className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AdminField label="Company Name *">
              <input
                type="text"
                required
                placeholder="e.g. Alvarez & Marsal"
                className="input"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </AdminField>
            <AdminField label="Role Title *">
              <input
                type="text"
                required
                placeholder="e.g. Senior Associate"
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </AdminField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <AdminField label="Stage / Process Status">
              <select
                className="input text-xs font-semibold"
                value={stage}
                onChange={(e) => setStage(e.target.value as PlacementStage)}
              >
                <option value="open_for_application">1. Open for Application</option>
                <option value="deadline_extended">2. Deadline Extended</option>
                <option value="application_closed">3. Application Closed</option>
                <option value="shortlist">4. Shortlist Out</option>
                <option value="test">5. Test Scheduled</option>
                <option value="interview">6. Interview Scheduled</option>
                <option value="result">7. Results Announced</option>
                <option value="other">8. Other</option>
              </select>
            </AdminField>
            <AdminField label="Event / Session Date (IST)">
              <input
                type="datetime-local"
                className="input text-xs"
                value={eventAt}
                onChange={(e) => setEventAt(e.target.value)}
              />
            </AdminField>
            <AdminField label="Application Start (IST)">
              <input
                type="datetime-local"
                className="input text-xs"
                value={applicationStart}
                onChange={(e) => setApplicationStart(e.target.value)}
              />
            </AdminField>
            <AdminField label="Application Deadline (IST)">
              <input
                type="datetime-local"
                className="input text-xs"
                value={deadlineAt}
                onChange={(e) => setDeadlineAt(e.target.value)}
              />
            </AdminField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AdminField label="Venue / Meeting Link">
              <input
                type="text"
                placeholder="Auditorium, CR-7C, or Google Meet URL"
                className="input text-xs"
                value={venueOrLink}
                onChange={(e) => setVenueOrLink(e.target.value)}
              />
            </AdminField>
            <AdminField label="Application / Portal Link">
              <input
                type="url"
                placeholder="https://app.joinsuperset.com/..."
                className="input text-xs"
                value={applyUrl}
                onChange={(e) => setApplyUrl(e.target.value)}
              />
            </AdminField>
          </div>

          {/* Additional Details Table */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-primary-text">
                Additional Details (Key-Value pairs)
              </label>
              <button
                type="button"
                onClick={addDetailRow}
                className="text-[11px] font-semibold text-accent hover:underline"
              >
                + Add Detail Row
              </button>
            </div>

            {additionalDetails.length === 0 ? (
              <p className="text-[11px] text-secondary-text italic">
                No custom details added yet. Click "+ Add Detail Row" to specify category, stipend, etc.
              </p>
            ) : (
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {additionalDetails.map((detail, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Label (e.g. Category)"
                      className="input text-xs flex-1 py-1.5"
                      value={detail.label}
                      onChange={(e) => updateDetailRow(idx, 'label', e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Value (e.g. 1)"
                      className="input text-xs flex-1 py-1.5"
                      value={detail.value}
                      onChange={(e) => updateDetailRow(idx, 'value', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeDetailRow(idx)}
                      className="text-danger hover:text-danger/80 px-2 py-1 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <AdminField label="Description & Notes">
            <textarea
              rows={5}
              placeholder="Provide interview process guidelines, eligibility criteria, or instructions..."
              className="input text-xs font-mono leading-relaxed resize-y min-h-[110px] p-3"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </AdminField>
        </div>

        <div className="flex gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-surface text-secondary-text rounded-xl text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !company.trim() || !role.trim()}
            className="flex-1 py-2.5 bg-accent text-white rounded-xl text-xs font-semibold shadow-sm hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>{mode === 'edit' ? 'Update Opportunity' : 'Publish Opportunity'}</span>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function AdminField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-primary-text">{label}</label>
      {children}
    </div>
  )
}
