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
