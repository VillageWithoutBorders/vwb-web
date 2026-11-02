// Text size (Oct 27, Jade): normal, large, larger, largest. Kept on this phone,
// and on the account since Nov 1 (uiPrefs.js). index.html puts the class on the
// page before it draws, so there is no jump.
const KEY = 'vwb_text'
export const TEXT_SIZES = ['normal', 'large', 'larger', 'largest']

export function readTextSize() {
  try { const v = localStorage.getItem(KEY); return TEXT_SIZES.includes(v) ? v : 'normal' } catch { return 'normal' }
}

export function applyTextSize(v) {
  const root = document.documentElement
  root.classList.toggle('text-large', v === 'large')
  root.classList.toggle('text-larger', v === 'larger')
  root.classList.toggle('text-largest', v === 'largest')
  try { if (v === 'normal' || !TEXT_SIZES.includes(v)) localStorage.removeItem(KEY); else localStorage.setItem(KEY, v) } catch { /* private window */ }
}
