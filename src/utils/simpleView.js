import { useSyncExternalStore } from 'react'
import { supabase } from '../supabaseClient'

// Simple view: bigger words and buttons, only the main things.
// Saved on the account (helper_profiles.simple_view) so it follows the person
// to any phone. Also kept on this device so it shows before the profile loads
// (index.html adds the "simple" class before the page draws).
const KEY = 'vwb_simple'
const subs = new Set()

function read() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

let on = read()

export function isSimpleView() { return on }

// Change it on this device only (used when the account value loads).
export function setSimpleLocal(v) {
  on = !!v
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY) } catch { /* private window */ }
  document.documentElement.classList.toggle('simple', on)
  subs.forEach((f) => f())
}

// Change it and save it to the account. Returns true when saved.
export async function saveSimpleView(v) {
  setSimpleLocal(v)
  const { error } = await supabase.rpc('set_simple_view', { p_on: !!v })
  if (error) { console.error('Failed to save Simple view:', error); return false }
  return true
}

export function useSimpleView() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f) },
    () => on,
    () => false,
  )
}

// True when the phone is set to large text.
export function phoneUsesLargeText() {
  try { return parseFloat(getComputedStyle(document.body).fontSize) >= 19 } catch { return false }
}
