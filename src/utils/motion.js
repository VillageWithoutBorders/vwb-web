// Calm motion (Oct 27, Jade). A switch in Settings > Easy to use that stops
// moving pictures, sparkles and sliding, for people who don't know their phone
// has its own "reduce motion" setting. Saved on this phone. index.html puts the
// class on the page before it draws.
const KEY = 'vwb_motion'

// True when this phone asks for less motion, from VWB's switch or the phone's own setting.
export function calmMotion() {
  try {
    if (document.documentElement.classList.contains('calm-motion')) return true
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  } catch { return false }
}

export function readCalm() {
  try { return localStorage.getItem(KEY) === 'calm' } catch { return false }
}

export function applyCalm(on) {
  document.documentElement.classList.toggle('calm-motion', on)
  try { if (on) localStorage.setItem(KEY, 'calm'); else localStorage.removeItem(KEY) } catch { /* private window */ }
}
