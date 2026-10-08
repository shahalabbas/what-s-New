import { createClient } from '@supabase/supabase-js'

function getValidSupabaseUrl(): string {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string)?.trim()
  const raw = envUrl || 'https://kewzjsphblafnuakapam.supabase.co'
  let clean = raw.replace(/^["']|["']$/g, '').trim()
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `https://${clean}`
  }
  return clean
}

function getValidAnonKey(): string {
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string)?.trim()
  return (envKey || 'sb_publishable_tjddC77NMtW1eULdmBrmVw_N4Cz-beC').replace(/^["']|["']$/g, '').trim()
}

const supabaseUrl = getValidSupabaseUrl()
const supabaseAnonKey = getValidAnonKey()

export const isConfiguredSupabase = Boolean(
  supabaseUrl &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseUrl.includes('your-project') &&
  supabaseAnonKey &&
  !supabaseAnonKey.includes('placeholder') &&
  !supabaseAnonKey.includes('your-anon-key')
)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
