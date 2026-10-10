import { useState, useEffect, useCallback } from 'react'
import { supabase, isConfiguredSupabase } from '../lib/supabase'
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
      if (data && data.length > 0) {
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

  const filtered = filter === 'all'
    ? projects
    : projects.filter((p) => p.type === filter)

  const upcoming = projects
    .filter((p) => new Date(p.deadline) > new Date())
    .slice(0, 3)

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
