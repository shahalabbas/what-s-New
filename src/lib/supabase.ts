import { createClient } from '@supabase/supabase-js'

function getValidSupabaseUrl(): string {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string)?.trim()
  const defaultUrl = 'https://kewzjsphblafnuakapam.supabase.co'
  if (!envUrl || !envUrl.includes('.') || envUrl.toLowerCase().includes('vite_supabase_url')) {
    return defaultUrl
  }
  let clean = envUrl.replace(/^["']|["']$/g, '').trim()
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `https://${clean}`
  }
  return clean
}

function getValidAnonKey(): string {
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string)?.trim()
  const defaultKey = 'sb_publishable_tjddC77NMtW1eULdmBrmVw_N4Cz-beC'
  if (!envKey || envKey.toLowerCase().includes('anon_key') || envKey.toLowerCase().includes('vite_')) {
    return defaultKey
  }
  return envKey.replace(/^["']|["']$/g, '').trim()
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
