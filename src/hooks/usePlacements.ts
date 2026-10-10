import { useState, useEffect, useCallback } from 'react'
import { supabase, isConfiguredSupabase } from '../lib/supabase'
import type {
  PlacementOpportunity,
  PlacementUpdate,
  StudentApplication,
  StudentApplicationStatus,
  InterviewSubmission,
} from '../types'
import {
  MOCK_PLACEMENT_OPPORTUNITIES,
  MOCK_STUDENT_APPLICATIONS,
  MOCK_SUBMISSIONS,
} from '../lib/mockData'
import { useAuth } from './useAuth'

export function usePlacements() {
  const { user } = useAuth()
  const [opportunities, setOpportunities] = useState<PlacementOpportunity[]>(() => {
    try {
      const cached =
        localStorage.getItem('cache_placement_opportunities') ||
        localStorage.getItem('whats_next_placements')
      if (cached) return JSON.parse(cached)
    } catch {}
    return MOCK_PLACEMENT_OPPORTUNITIES
  })
  const [userApplications, setUserApplications] = useState<Record<string, StudentApplication>>(
    () => {
      try {
        const cached = localStorage.getItem('cache_student_applications')
        if (cached) return JSON.parse(cached)
      } catch {}
      const map: Record<string, StudentApplication> = {}
      for (const app of MOCK_STUDENT_APPLICATIONS) {
        map[app.opportunity_id] = app
      }
      return map
    }
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async () => {
    if (!isConfiguredSupabase) {
      setOpportunities(MOCK_PLACEMENT_OPPORTUNITIES)
      setLoading(false)
      return
    }

    try {
      // 1. Fetch Opportunities
      const { data: opps, error: oppErr } = await supabase
        .from('placement_opportunities')
        .select('*')
        .order('deadline_at', { ascending: true, nullsFirst: false })

      if (oppErr) throw oppErr

      // 2. Fetch User Applications
      let appsMap: Record<string, StudentApplication> = {}
      if (user?.id) {
        const { data: apps, error: appErr } = await supabase
          .from('student_applications')
          .select('*')
          .eq('user_id', user.id)

        if (!appErr && apps) {
          for (const a of apps) {
            appsMap[a.opportunity_id] = a
          }
        }
      }

      // 3. Fetch Updates History
      const { data: updates, error: updErr } = await supabase
        .from('placement_updates')
        .select('*')
        .order('created_at', { ascending: false })

      const updatesMap: Record<string, PlacementUpdate[]> = {}
      if (!updErr && updates) {
        for (const u of updates) {
          if (!updatesMap[u.opportunity_id]) updatesMap[u.opportunity_id] = []
          updatesMap[u.opportunity_id].push(u)
        }
      }

      // 4. Fetch Linked Interview Submissions
      const { data: submissions, error: subErr } = await supabase
        .from('interview_submissions')
        .select('*')

      const expMap: Record<string, InterviewSubmission[]> = {}
      if (!subErr && submissions) {
        for (const sub of submissions) {
          if (sub.opportunity_id) {
            if (!expMap[sub.opportunity_id]) expMap[sub.opportunity_id] = []
            expMap[sub.opportunity_id].push(sub)
          }
        }
      }

      const mergedOpps = (opps && opps.length > 0 ? opps : MOCK_PLACEMENT_OPPORTUNITIES).map((o) => {
        const linkedSubs = [
          ...(expMap[o.id] || []),
          ...((submissions || MOCK_SUBMISSIONS).filter(
            (s) => !s.opportunity_id && s.company.toLowerCase() === o.company.toLowerCase()
          )),
        ]

        return {
          ...o,
          student_application: appsMap[o.id] || null,
          updates: updatesMap[o.id] || [],
          experiences: linkedSubs,
        }
      })

      setOpportunities(mergedOpps)
      setUserApplications(appsMap)
      try {
        localStorage.setItem('cache_placement_opportunities', JSON.stringify(mergedOpps))
        localStorage.setItem('cache_student_applications', JSON.stringify(appsMap))
      } catch {}
    } catch (err: any) {
      setError(err.message || 'Failed to sync placements')
      console.warn('Placements background sync notice:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchData()

    const handleFocus = () => {
      fetchData()
    }
    const handleVisibility = () => {
      if (!document.hidden) fetchData()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchData])

  const setApplicationStatus = useCallback(
    async (opportunityId: string, status: StudentApplicationStatus) => {
      const currentUserId = user?.id || 'current-user-demo'

      // Optimistic update
      const newApp: StudentApplication = {
        user_id: currentUserId,
        opportunity_id: opportunityId,
        status,
        updated_at: new Date().toISOString(),
      }

      setUserApplications((prev) => ({ ...prev, [opportunityId]: newApp }))
      setOpportunities((prev) =>
        prev.map((o) => (o.id === opportunityId ? { ...o, student_application: newApp } : o))
      )

      if (isConfiguredSupabase && user?.id) {
        try {
          const { error: err } = await supabase.from('student_applications').upsert({
            user_id: user.id,
            opportunity_id: opportunityId,
            status,
            updated_at: new Date().toISOString(),
          })
          if (err) throw err
        } catch (err) {
          console.error('Failed to update student application status:', err)
        }
      }
    },
    [user?.id]
  )

  const filtered = opportunities.filter((o) => {
    if (!search) return true
    const q = search.toLowerCase()
    const matchDetails = o.additional_details?.some(
      (d) => d.label.toLowerCase().includes(q) || d.value.toLowerCase().includes(q)
    )
    return (
      o.company.toLowerCase().includes(q) ||
      o.role.toLowerCase().includes(q) ||
      o.stage.toLowerCase().includes(q) ||
      matchDetails
    )
  })

  // Open opportunities (deadline in future and not closed)
  const nowTime = new Date().getTime()
  const openOpportunities = filtered.filter((o) => {
    const isClosedStage = o.stage === 'application_closed'
    const isDeadlinePassed = o.deadline_at ? new Date(o.deadline_at).getTime() <= nowTime : false
    return !isClosedStage && !isDeadlinePassed
  })

  const closedOpportunities = filtered.filter((o) => {
    const isClosedStage = o.stage === 'application_closed'
    const isDeadlinePassed = o.deadline_at ? new Date(o.deadline_at).getTime() <= nowTime : false
    return isClosedStage || isDeadlinePassed
  })

  // Nearest open opportunity student hasn't marked Applied or Skipped
  const nearestActionableOpportunity = openOpportunities.find((o) => {
    const appStatus = o.student_application?.status || userApplications[o.id]?.status
    return appStatus !== 'applied' && appStatus !== 'skipped'
  }) || openOpportunities[0] || null

  return {
    opportunities: filtered,
    allOpportunities: opportunities,
    openOpportunities,
    closedOpportunities,
    nearestActionableOpportunity,
    userApplications,
    loading,
    error,
    search,
    setSearch,
    setApplicationStatus,
    refresh: fetchData,
  }
}
