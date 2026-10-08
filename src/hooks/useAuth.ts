import { useState, useEffect, useCallback } from 'react'
import { supabase, isConfiguredSupabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { Profile, AllowedCohort } from '../types'
import { MOCK_USER, MOCK_ADMIN } from '../lib/mockData'
import {
  isCohortAllowed,
  parseIIMUEmail,
  isAdminEmail,
  DEFAULT_ALLOWED_COHORTS,
  DEFAULT_ADMIN_EMAILS,
} from '../lib/authUtils'

export interface BlockedState {
  isBlocked: boolean
  attemptedEmail: string | null
  reason: string
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [allowedCohorts, setAllowedCohorts] = useState<AllowedCohort[]>(DEFAULT_ALLOWED_COHORTS)
  const [adminEmails, setAdminEmails] = useState<string[]>(DEFAULT_ADMIN_EMAILS)
  const [loading, setLoading] = useState(true)
  const [blockedState, setBlockedState] = useState<BlockedState>({
    isBlocked: false,
    attemptedEmail: null,
    reason: '',
  })

  // Fetch access control rules from DB
  const fetchAccessRules = useCallback(async () => {
    if (!isConfiguredSupabase) return

    try {
      const [cohortsRes, adminsRes] = await Promise.all([
        supabase.from('allowed_cohorts').select('*').eq('is_active', true),
        supabase.from('admin_emails').select('email'),
      ])

      if (cohortsRes.data && cohortsRes.data.length > 0) {
        setAllowedCohorts(cohortsRes.data)
      }
      if (adminsRes.data && adminsRes.data.length > 0) {
        setAdminEmails(adminsRes.data.map((a: { email: string }) => a.email))
      }
    } catch {
      // Use defaults
    }
  }, [])

  // Validate user and set profile
  const validateAndSetUser = useCallback(async (u: User) => {
    const email = u.email || ''
    const cohortCheck = isCohortAllowed(email, allowedCohorts, adminEmails)

    if (!cohortCheck.isAllowed) {
      setBlockedState({
        isBlocked: true,
        attemptedEmail: email,
        reason: cohortCheck.reason || 'This app is currently available only to DEM 2026 students.',
      })
      setUser(null)
      setProfile(null)
      setLoading(false)
      return
    }

    // Allowed
    setBlockedState({ isBlocked: false, attemptedEmail: null, reason: '' })
    setUser(u)

    if (isConfiguredSupabase) {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', u.id)
          .single()

        if (prof) {
          const activeCohort = allowedCohorts.find(
            (c) => c.is_active && c.program.toLowerCase() === prof.program.toLowerCase() && c.batch_year === prof.batch_year
          )
          const isAdmin = adminEmails.some((adm) => adm.toLowerCase() === email.toLowerCase())

          if (!activeCohort && !isAdmin) {
            setBlockedState({
              isBlocked: true,
              attemptedEmail: email,
              reason: 'Your cohort is no longer active.',
            })
            setUser(null)
            setProfile(null)
            setLoading(false)
            return
          }

          setProfile(prof)
        } else {
          const parsed = parseIIMUEmail(email)
          setProfile({
            id: u.id,
            email,
            full_name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? 'Student',
            avatar_url: u.user_metadata?.avatar_url ?? null,
            program: parsed.program ?? 'dem',
            batch_year: parsed.batchYear ?? 2026,
            role: adminEmails.includes(email.toLowerCase()) ? 'admin' : 'student',
            created_at: new Date().toISOString(),
          })
        }
      } catch {
        const parsed = parseIIMUEmail(email)
        setProfile({
          id: u.id,
          email,
          full_name: u.user_metadata?.full_name ?? 'Student',
          avatar_url: null,
          program: parsed.program ?? 'dem',
          batch_year: parsed.batchYear ?? 2026,
          role: adminEmails.includes(email.toLowerCase()) ? 'admin' : 'student',
          created_at: new Date().toISOString(),
        })
      }
    } else {
      const parsed = parseIIMUEmail(email)
      setProfile({
        id: u.id,
        email,
        full_name: u.user_metadata?.full_name ?? 'Student',
        avatar_url: null,
        program: parsed.program ?? 'dem',
        batch_year: parsed.batchYear ?? 2026,
        role: adminEmails.includes(email.toLowerCase()) ? 'admin' : 'student',
        created_at: new Date().toISOString(),
      })
    }

    setLoading(false)
  }, [allowedCohorts, adminEmails])

  // Login with custom email ID (automatically extracts role and validates cohort)
  const loginWithEmail = useCallback((email: string) => {
    setLoading(true)
    const clean = email.trim().toLowerCase()
    const cohortCheck = isCohortAllowed(clean, allowedCohorts, adminEmails)

    if (!cohortCheck.isAllowed) {
      setBlockedState({
        isBlocked: true,
        attemptedEmail: clean,
        reason: cohortCheck.reason || 'This app is currently available only to DEM 2026 students.',
      })
      setUser(null)
      setProfile(null)
      setLoading(false)
      return
    }

    try {
      localStorage.setItem('wn_saved_email', clean)
    } catch {
      // ignore
    }

    const isAdmin = isAdminEmail(clean, adminEmails)
    const parsed = parseIIMUEmail(clean)

    const newProfile: Profile = {
      id: isAdmin ? MOCK_ADMIN.id : MOCK_USER.id,
      email: clean,
      full_name: clean.split('@')[0].replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      avatar_url: null,
      program: parsed.program ?? 'dem',
      batch_year: parsed.batchYear ?? 2026,
      role: isAdmin ? 'admin' : 'student',
      created_at: new Date().toISOString(),
    }

    setProfile(newProfile)
    setUser({ id: newProfile.id, email: clean } as User)
    setBlockedState({ isBlocked: false, attemptedEmail: null, reason: '' })
    setLoading(false)
  }, [allowedCohorts, adminEmails])

  useEffect(() => {
    // 1. Check URL hash / search params for OAuth errors or callbacks
    try {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const searchParams = new URLSearchParams(window.location.search)

      const oauthError =
        hashParams.get('error_description') ||
        searchParams.get('error_description') ||
        hashParams.get('error') ||
        searchParams.get('error')

      if (oauthError) {
        const cleanError = decodeURIComponent(oauthError).replace(/\+/g, ' ')
        setBlockedState({
          isBlocked: true,
          attemptedEmail: null,
          reason: cleanError.includes('Database error') || cleanError.includes('access_denied')
            ? 'Access denied: This app is currently available only to DEM 2026 students of IIM Udaipur.'
            : cleanError,
        })
        setLoading(false)
        window.history.replaceState(null, '', window.location.pathname)
        return
      }

      // Check URL query param e.g. ?email=...
      const urlEmail = searchParams.get('email')
      if (urlEmail) {
        loginWithEmail(urlEmail)
        return
      }

      const savedEmail = localStorage.getItem('wn_saved_email')
      if (savedEmail && !isConfiguredSupabase) {
        loginWithEmail(savedEmail)
        return
      }
    } catch {
      // ignore
    }

    if (isConfiguredSupabase) {
      fetchAccessRules().then(() => {
        supabase.auth.getSession().then(({ data, error }) => {
          if (error) {
            console.warn('Session error:', error)
          }
          const u = data.session?.user ?? null
          if (u) {
            validateAndSetUser(u)
          } else {
            setLoading(false)
          }
        }).catch(() => {
          setLoading(false)
        })
      })

      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        const u = session?.user ?? null
        if (u) {
          validateAndSetUser(u)
        } else {
          setUser(null)
          setProfile(null)
          setLoading(false)
        }
      })

      return () => listener.subscription.unsubscribe()
    } else {
      setLoading(false)
    }
  }, [fetchAccessRules, validateAndSetUser, loginWithEmail])

  // Google OAuth using PKCE redirect flow
  async function signInWithGoogle(): Promise<{ success: boolean; error?: string }> {
    setLoading(true)
    if (!isConfiguredSupabase) {
      setLoading(false)
      return { success: false, error: 'supabase_not_configured' }
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            hd: 'iimu.ac.in',
            prompt: 'select_account',
          },
        },
      })
      if (error) throw error
      return { success: true }
    } catch (err: any) {
      console.warn('Google sign-in error:', err)
      setLoading(false)
      return { success: false, error: err?.message || 'Google OAuth failed' }
    }
  }

  // Sign out / switch account
  async function signOut() {
    setLoading(true)
    try {
      localStorage.removeItem('wn_saved_email')
      localStorage.removeItem('wn_demo_role')
      if (isConfiguredSupabase) {
        await supabase.auth.signOut()
      }
    } catch {
      // ignore
    }
    setUser(null)
    setProfile(null)
    setBlockedState({ isBlocked: false, attemptedEmail: null, reason: '' })
    setLoading(false)
  }

  // Switch account from blocked screen
  async function switchAccount() {
    await signOut()
    if (isConfiguredSupabase) {
      await signInWithGoogle()
    }
  }

  return {
    user,
    profile,
    loading,
    blockedState,
    isAdmin: profile?.role === 'admin',
    signInWithGoogle,
    loginWithEmail,
    signOut,
    switchAccount,
    allowedCohorts,
  }
}
