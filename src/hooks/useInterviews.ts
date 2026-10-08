import { useState, useEffect, useCallback } from 'react'
import { supabase, isConfiguredSupabase } from '../lib/supabase'
import type { InterviewSubmission } from '../types'
import { MOCK_INTERVIEWS } from '../lib/mockData'

export function useInterviews() {
  const [submissions, setSubmissions] = useState<InterviewSubmission[]>(MOCK_INTERVIEWS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async () => {
    if (!isConfiguredSupabase) {
      setSubmissions(MOCK_INTERVIEWS)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('interview_submissions')
        .select('*')
        .order('created_at', { ascending: false })
      if (err) throw err
      if (data && data.length > 0) {
        setSubmissions(data)
      } else {
        setSubmissions(MOCK_INTERVIEWS)
      }
    } catch {
      setSubmissions(MOCK_INTERVIEWS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = submissions.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      s.company.toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q) ||
      (s.round_type ?? '').toLowerCase().includes(q)
    )
  })

  async function addSubmission(sub: Omit<InterviewSubmission, 'id' | 'created_at' | 'profile'>) {
    if (isConfiguredSupabase) {
      try {
        const { error: err } = await supabase.from('interview_submissions').insert(sub)
        if (err) throw err
        await fetchData()
        return
      } catch {
        // fallback to local optimistic state
      }
    }
    const localNew: InterviewSubmission = {
      ...sub,
      id: `local-${Date.now()}`,
      created_at: new Date().toISOString(),
    }
    setSubmissions((prev) => [localNew, ...prev])
  }

  async function deleteSubmission(id: string) {
    if (isConfiguredSupabase) {
      try {
        const { error: err } = await supabase.from('interview_submissions').delete().eq('id', id)
        if (err) throw err
      } catch {
        // ignore
      }
    }
    setSubmissions((prev) => prev.filter((s) => s.id !== id))
  }

  return {
    submissions: filtered,
    allSubmissions: submissions,
    loading,
    error,
    search,
    setSearch,
    refresh: fetchData,
    addSubmission,
    deleteSubmission,
  }
}
