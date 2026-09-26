// Remembers where someone was headed before they had to sign in or sign up
// (for example, an event page they opened from the website calendar), so
// they land back there afterwards instead of on the home screen. Survives
// the "check your email to confirm" gap because it lives in localStorage.
// Expires after a day so an old stashed page never hijacks a later login.
const KEY = 'vwb_return_to'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export function setReturnTo(path) {
  try { localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() })) } catch { /* private mode */ }
}

export function peekReturnTo() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const { path, at } = JSON.parse(raw)
    if (!path || typeof path !== 'string' || !path.startsWith('/') || Date.now() - at > MAX_AGE_MS) {
      localStorage.removeItem(KEY)
      return null
    }
    return path
  } catch { return null }
}

export function clearReturnTo() {
  try { localStorage.removeItem(KEY) } catch { /* private mode */ }
}
