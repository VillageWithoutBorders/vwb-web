import { keepSignedIn } from '../supabaseClient'

// A copy of an emergency page, kept on this phone (Nov 5), so it still opens with
// no signal: what it showed the last time it loaded. Only the emergencies this
// person opened, only the last 5, and only while signed in (cleared on sign out,
// and kept for this browser session only when "Keep me signed in" is off).

const PREFIX = 'vwb_event_copy_'
const KEEP = 5

function store() {
  try { return keepSignedIn() ? localStorage : sessionStorage } catch { return null }
}

export function saveEventCopy(userId, eventId, data) {
  if (!userId || !eventId) return
  const s = store()
  if (!s) return
  const key = PREFIX + userId + '_' + eventId
  try {
    s.setItem(key, JSON.stringify({ ...data, saved_at: new Date().toISOString() }))
    // Keep only the newest few.
    const mine = Object.keys(s).filter((k) => k.startsWith(PREFIX + userId + '_'))
    if (mine.length > KEEP) {
      const dated = mine.map((k) => {
        let at = ''
        try { at = JSON.parse(s.getItem(k) || '{}').saved_at || '' } catch { /* broken copy */ }
        return { k, at }
      }).sort((a, b) => (a.at < b.at ? -1 : 1))
      dated.slice(0, dated.length - KEEP).forEach((d) => s.removeItem(d.k))
    }
  } catch (e) {
    // Phone storage full: drop the copy rather than break the page.
    console.error('Could not keep a copy of this emergency page:', e)
    try { s.removeItem(key) } catch { /* nothing more to do */ }
  }
}

export function readEventCopy(userId, eventId) {
  if (!userId || !eventId) return null
  try { return JSON.parse(store()?.getItem(PREFIX + userId + '_' + eventId) || 'null') } catch { return null }
}

export function clearEventCopies() {
  for (const s of [localStorage, sessionStorage]) {
    try {
      Object.keys(s).filter((k) => k.startsWith(PREFIX)).forEach((k) => s.removeItem(k))
    } catch { /* private window */ }
  }
}
