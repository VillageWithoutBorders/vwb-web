import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Shared or library computers (Nov 3): when "Keep me signed in" is unchecked,
// the sign-in lives only until this browser closes. Everyone else stays signed in.
const SESSION_ONLY = 'vwb_session_only'
function sessionOnly() {
  try { return localStorage.getItem(SESSION_ONLY) === '1' } catch { return false }
}
const authStorage = {
  getItem: (k) => { try { return (sessionOnly() ? sessionStorage : localStorage).getItem(k) } catch { return null } },
  setItem: (k, v) => { try { (sessionOnly() ? sessionStorage : localStorage).setItem(k, v) } catch { /* private window */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); sessionStorage.removeItem(k) } catch { /* private window */ } },
}

export function keepSignedIn() {
  return !sessionOnly()
}

export function setKeepSignedIn(keep) {
  try {
    if (keep) localStorage.removeItem(SESSION_ONLY)
    else localStorage.setItem(SESSION_ONLY, '1')
  } catch { /* private window: the browser forgets anyway */ }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { storage: authStorage } })

// The sign-in saved on this phone, read straight from storage (Nov 3). With no
// signal, an hour-old sign-in can't be renewed, so Supabase reports nobody
// signed in even though the sign-in is still here. The app uses this to keep
// the person in until the signal comes back and it renews. Null if none.
export function savedSignIn() {
  try {
    const raw = authStorage.getItem(supabase.auth.storageKey)
    const s = raw ? JSON.parse(raw) : null
    return s && s.user && s.refresh_token ? s : null
  } catch { return null }
}
