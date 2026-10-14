// Appearance: 'auto' (match the phone), 'light', or 'dark'. Saved on this device.
// index.html applies it before the page draws, so there is no flash.
const KEY = 'vwb_theme'

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'auto' } catch { return 'auto' }
}

export function isLight() {
  const t = document.documentElement.dataset.theme
  if (t) return t === 'light'
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
}

export function setTheme(t) {
  try { if (t === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t) } catch { /* private window */ }
  const root = document.documentElement
  if (t === 'auto') delete root.dataset.theme
  else root.dataset.theme = t
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', isLight() ? '#f6efdc' : '#1a1a1a')
}
