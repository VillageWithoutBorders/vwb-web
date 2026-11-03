import { useSyncExternalStore } from 'react'
import { supabase, keepSignedIn } from '../supabaseClient'

// Asks saved with no signal (Nov 3, barriers review). When someone asks for help
// and the phone has no signal, the request is kept on this phone and sent by
// itself once the signal comes back, while the app is open. Kept per account.
// Signing out clears them, so nothing is left behind on a shared phone.

const PREFIX = 'vwb_pending_asks_'
const subs = new Set()
let version = 0
function changed() { version += 1; subs.forEach((f) => f()) }

function store() {
  try { return keepSignedIn() ? localStorage : sessionStorage } catch { return null }
}

export function pendingAsks(userId) {
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

// Keep a request to send later. row is what goes into help_requests, with
// open_hours in place of opens_to_all_at (the clock starts when it sends).
// Returns false if this phone can't save it (a private window, for one).
export function savePendingAsk(userId, row) {
  const item = { key: Date.now() + '-' + Math.random().toString(36).slice(2, 8), saved_at: new Date().toISOString(), row, problem: '' }
  return write(userId, [...pendingAsks(userId), item])
}

export function removePendingAsk(userId, key) {
  write(userId, pendingAsks(userId).filter((a) => a.key !== key))
}

export function clearAllPendingAsks() {
  for (const s of [localStorage, sessionStorage]) {
    try {
      Object.keys(s).filter((k) => k.startsWith(PREFIX)).forEach((k) => s.removeItem(k))
    } catch { /* private window */ }
  }
  changed()
}

// No signal, or the sign-in pass ran out while offline. Worth trying again later.
export function isNoSignal(error) {
  if (!error) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const words = [error.message, error.details, error.name].filter(Boolean).join(' ')
  if (!error.code && /fetch|network|load failed|timed? ?out|offline|abort/i.test(words)) return true
  return error.code === 'PGRST301' || error.status === 401
}

let sending = null

// Sends every saved request it can. Returns how many went out.
export function sendPendingAsks(userId) {
  if (!userId) return Promise.resolve(0)
  if (sending) return sending
  sending = (async () => {
    let sent = 0
    for (const item of pendingAsks(userId)) {
      if (item.problem) continue
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break
      // A try that lost signal may have reached VWB anyway. Look first, so it never posts twice.
      const since = new Date(new Date(item.saved_at).getTime() - 5 * 60 * 1000).toISOString()
      const { data: found, error: lookErr } = await supabase.from('help_requests')
        .select('id').eq('requester_id', userId).eq('description', item.row.description).gte('created_at', since).limit(1)
      if (lookErr) {
        if (isNoSignal(lookErr)) break
        console.error('Failed to check a saved request:', lookErr)
      } else if (found && found.length) {
        removePendingAsk(userId, item.key)
        sent += 1
        continue
      }
      const { open_hours: hours, ...row } = item.row
      const { error } = await supabase.from('help_requests').insert({
        ...row,
        requester_id: userId,
        opens_to_all_at: row.audience === 'everyone' ? null : new Date(Date.now() + Number(hours || 24) * 3600 * 1000).toISOString(),
      })
      if (error) {
        if (isNoSignal(error)) break
        // VWB said no (a limit or a rule). Keep it, and say why, so the person can decide.
        console.error('Saved request was not accepted:', error)
        const plain = error.message && error.message.length < 140 && (/group/i.test(error.message) || ['P0001', '42501'].includes(error.code))
        write(userId, pendingAsks(userId).map((a) => (a.key === item.key ? { ...a, problem: plain ? error.message : 'VWB could not post this one.' } : a)))
        continue
      }
      removePendingAsk(userId, item.key)
      sent += 1
    }
    return sent
  })().finally(() => { sending = null })
  return sending
}

export function usePendingAsks(userId) {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => version, () => 0)
  return pendingAsks(userId)
}

// Another tab saved or sent one.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith(PREFIX)) changed() })
}
