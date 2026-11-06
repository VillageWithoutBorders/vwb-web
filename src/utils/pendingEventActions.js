import { useSyncExternalStore } from 'react'
import { supabase, keepSignedIn } from '../supabaseClient'
import { isNoSignal } from './pendingAsks'

// Check-ins and sign-ups on an emergency, saved with no signal (Nov 5). "I'm safe"
// matters most when the signal is down, so it is kept on this phone and sent by
// itself once the signal comes back, while the app is open. Same pattern as saved
// asks and saved reports: kept per account, cleared on sign out.
//
// kind 'checkin': row = { event_id, status, note }
// kind 'signup':  row = { event_id, role, skills, availability, notes }

const PREFIX = 'vwb_pending_event_actions_'
const subs = new Set()
let version = 0
function changed() { version += 1; subs.forEach((f) => f()) }

function store() {
  try { return keepSignedIn() ? localStorage : sessionStorage } catch { return null }
}

export function pendingEventActions(userId) {
  if (!userId) return []
  try { return JSON.parse(store()?.getItem(PREFIX + userId) || '[]') || [] } catch { return [] }
}

function write(userId, list) {
  try {
    const s = store()
    if (!s) return false
    if (list.length) s.setItem(PREFIX + userId, JSON.stringify(list))
    else s.removeItem(PREFIX + userId)
    changed()
    return true
  } catch { return false }
}

// Returns the saved item, or null if this phone can't save it (a private window, for one).
export function saveEventAction(userId, kind, row, eventTitle) {
  const item = { key: Date.now() + '-' + Math.random().toString(36).slice(2, 8), kind, saved_at: new Date().toISOString(), row, event_title: eventTitle || '', problem: '' }
  // A newer check-in on the same emergency replaces one that hasn't gone out yet.
  const rest = pendingEventActions(userId).filter((a) => !(kind === 'checkin' && a.kind === 'checkin' && !a.problem && String(a.row.event_id) === String(row.event_id)))
  return write(userId, [...rest, item]) ? item : null
}

export function removeEventAction(userId, key) {
  write(userId, pendingEventActions(userId).filter((a) => a.key !== key))
}

export function clearAllPendingEventActions() {
  for (const s of [localStorage, sessionStorage]) {
    try {
      Object.keys(s).filter((k) => k.startsWith(PREFIX)).forEach((k) => s.removeItem(k))
    } catch { /* private window */ }
  }
  changed()
}

let sending = null

// Sends every saved action it can. Returns the ones that went out.
export function sendPendingEventActions(userId) {
  if (!userId) return Promise.resolve([])
  if (sending) return sending
  sending = (async () => {
    const sent = []
    for (const item of pendingEventActions(userId)) {
      if (item.problem) continue
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break
      const eventId = Number(item.row.event_id)
      let error = null

      if (item.kind === 'checkin') {
        // A try that lost signal may have reached VWB anyway. Look first, so it never posts twice.
        const since = new Date(new Date(item.saved_at).getTime() - 5 * 60 * 1000).toISOString()
        const { data: found, error: lookErr } = await supabase.from('event_check_ins').select('id')
          .eq('event_id', eventId).eq('user_id', userId).eq('status', item.row.status).gte('created_at', since).limit(1)
        if (lookErr && isNoSignal(lookErr)) break
        if (lookErr) console.error('Failed to check a saved check-in:', lookErr)
        if (!found || !found.length) {
          ;({ error } = await supabase.from('event_check_ins').insert({ event_id: eventId, user_id: userId, status: item.row.status, note: item.row.note || null }))
        }
      } else if (item.kind === 'signup') {
        const { data: found, error: lookErr } = await supabase.from('event_signups').select('id').eq('event_id', eventId).eq('user_id', userId).limit(1)
        if (lookErr && isNoSignal(lookErr)) break
        if (lookErr) console.error('Failed to check a saved sign-up:', lookErr)
        if (!found || !found.length) {
          ;({ error } = await supabase.from('event_signups').insert({
            event_id: eventId, user_id: userId, role: item.row.role,
            skills: item.row.skills || [], availability: item.row.availability || null, notes: item.row.notes || null,
          }))
          // Already signed up (another tab, or a send that got through): that's fine.
          if (error && error.code === '23505') error = null
        }
      }

      if (error) {
        if (isNoSignal(error)) break
        // VWB said no (the emergency closed, or a rule). Keep it, and say why.
        console.error('Saved emergency action was not accepted:', error)
        const plain = error.code === 'P0001' && error.message && error.message.length < 140
        write(userId, pendingEventActions(userId).map((a) => (a.key === item.key ? { ...a, problem: plain ? error.message : 'VWB could not post this one.' } : a)))
        continue
      }
      removeEventAction(userId, item.key)
      sent.push(item)
    }
    return sent
  })().finally(() => { sending = null })
  return sending
}

export function usePendingEventActions(userId) {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => version, () => 0)
  return pendingEventActions(userId)
}

// Another tab saved or sent one.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith(PREFIX)) changed() })
}
