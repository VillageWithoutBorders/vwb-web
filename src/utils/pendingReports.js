import { useSyncExternalStore } from 'react'
import { supabase, keepSignedIn } from '../supabaseClient'
import { isNoSignal } from './pendingAsks'
import { bestMatch } from './emergencyMatch'

// Emergency reports saved with no signal (Nov 5). Storms take the signal down first,
// so a report made then is kept on this phone and sent by itself once the signal
// comes back, while the app is open. Works like saved asks (pendingAsks.js):
// kept per account, cleared on sign out.
//
// Before it sends, it looks again: if someone else reported something like it while
// this phone had no signal, it waits and asks the person "Is this the same one?"

const PREFIX = 'vwb_pending_reports_'
const subs = new Set()
let version = 0
function changed() { version += 1; subs.forEach((f) => f()) }

function store() {
  try { return keepSignedIn() ? localStorage : sessionStorage } catch { return null }
}

export function pendingReports(userId) {
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

function update(userId, key, changes) {
  write(userId, pendingReports(userId).map((r) => (r.key === key ? { ...r, ...changes } : r)))
}

// row is what goes into emergency_events, without created_by.
// Returns false if this phone can't save it (a private window, for one).
export function savePendingReport(userId, row) {
  const item = { key: Date.now() + '-' + Math.random().toString(36).slice(2, 8), saved_at: new Date().toISOString(), row, problem: '', match: null, anyway: false }
  return write(userId, [...pendingReports(userId), item])
}

export function removePendingReport(userId, key) {
  write(userId, pendingReports(userId).filter((r) => r.key !== key))
}

// "No, it is different": send it even though it looks like another report.
export function sendReportAnyway(userId, key) {
  update(userId, key, { anyway: true, problem: '', match: null })
}

export function clearAllPendingReports() {
  for (const s of [localStorage, sessionStorage]) {
    try {
      Object.keys(s).filter((k) => k.startsWith(PREFIX)).forEach((k) => s.removeItem(k))
    } catch { /* private window */ }
  }
  changed()
}

let sending = null

// Sends every saved report it can. Returns the ones that went out: [{ id, title }].
export function sendPendingReports(userId) {
  if (!userId) return Promise.resolve([])
  if (sending) return sending
  sending = (async () => {
    const sent = []
    for (const item of pendingReports(userId)) {
      if (item.problem) continue
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break
      const row = item.row

      // A try that lost signal may have reached VWB anyway. Look first, so it never posts twice.
      const since = new Date(new Date(item.saved_at).getTime() - 5 * 60 * 1000).toISOString()
      const { data: mine, error: mineErr } = await supabase.from('emergency_events')
        .select('id, title').eq('created_by', userId).eq('title', row.title).gte('created_at', since).limit(1)
      if (mineErr) {
        if (isNoSignal(mineErr)) break
        console.error('Failed to check a saved emergency report:', mineErr)
      } else if (mine && mine.length) {
        removePendingReport(userId, item.key)
        sent.push({ id: mine[0].id, title: mine[0].title })
        continue
      }

      // Someone else may have reported the same thing while this phone had no signal.
      if (!item.anyway) {
        const { data: active, error: actErr } = await supabase.from('emergency_events')
          .select('id, title, description, event_type, location_name, verified, created_at').eq('status', 'active')
        if (actErr) {
          if (isNoSignal(actErr)) break
          console.error('Failed to check for a matching emergency:', actErr)
        } else {
          const match = bestMatch({ eventType: row.event_type, title: row.title, description: row.description || '', locationName: row.location_name || '' }, active)
          if (match) {
            update(userId, item.key, { problem: 'similar', match: { id: match.id, title: match.title, event_type: match.event_type, location_name: match.location_name, verified: !!match.verified } })
            continue
          }
        }
      }

      const { data, error } = await supabase.from('emergency_events').insert({ ...row, created_by: userId }).select('id, title').single()
      if (error) {
        if (isNoSignal(error)) break
        // VWB said no (a rule or limit). Keep it, and say why, so the person can decide.
        console.error('Saved emergency report was not accepted:', error)
        const plain = error.code === 'P0001' && error.message && error.message.length < 140
        update(userId, item.key, { problem: plain ? error.message : 'VWB could not post this one.' })
        continue
      }
      // The reporter is the first coordinator, same as reporting with signal.
      const { error: signupErr } = await supabase.from('event_signups').insert({ event_id: data.id, user_id: userId, role: 'coordinator' })
      if (signupErr) console.error('Failed to record saved report creator as coordinator:', signupErr)
      removePendingReport(userId, item.key)
      sent.push({ id: data.id, title: data.title })
    }
    return sent
  })().finally(() => { sending = null })
  return sending
}

export function usePendingReports(userId) {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => version, () => 0)
  return pendingReports(userId)
}

// Another tab saved or sent one.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith(PREFIX)) changed() })
}
