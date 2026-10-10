import { useState, useEffect, useCallback } from 'react'
import { supabase, isConfiguredSupabase } from '../lib/supabase'
import { useOnAppResume } from '../lib/lifecycle'
import type { Project, ProjectType } from '../types'
import { MOCK_PROJECTS } from '../lib/mockData'

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const cached =
        localStorage.getItem('cache_projects') ||
        localStorage.getItem('whats_next_projects')
      if (cached) return JSON.parse(cached)
    } catch {}
    return MOCK_PROJECTS
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ProjectType | 'all'>('all')

  const fetchData = useCallback(async () => {
    if (!isConfiguredSupabase) {
      setProjects(MOCK_PROJECTS)
      setLoading(false)
      return
    }

    try {
      const { data, error: err } = await supabase
        .from('projects')
        .select('*, course:courses(*)')
        .order('deadline', { ascending: true })
      if (err) throw err
      if (data) {
        setProjects(data)
        try { localStorage.setItem('cache_projects', JSON.stringify(data)) } catch {}
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sync projects')
      console.warn('Projects background sync notice:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Automatically refresh projects when app resumes from background
  useOnAppResume(() => {
    fetchData()
  })

  const filtered = filter === 'all'
    ? projects.filter((p) => Boolean(p.course_id && p.course_id.trim() !== ''))
    : projects.filter((p) => p.type === filter && Boolean(p.course_id && p.course_id.trim() !== ''))

  const upcoming = projects
    .filter((p) => Boolean(p.course_id && p.course_id.trim() !== '') && new Date(p.deadline) > new Date())
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())

  return {
    projects: filtered,
    allProjects: projects,
    upcoming,
    loading,
    error,
    filter,
    setFilter,
    refresh: fetchData,
  }
}
