// Page width (Nov 8, Jade). Simple view stays narrow and calm on a computer.
// "Fill the screen" lets pages use the whole width instead. Saved on this
// computer and on the account (uiPrefs.js). main.jsx puts the class on the page.
const KEY = 'vwb_width'
export const WIDTHS = ['calm', 'full']

export function readWidth() {
  try { return localStorage.getItem(KEY) === 'full' ? 'full' : 'calm' } catch { return 'calm' }
}

export function applyWidth(w) {
  document.documentElement.classList.toggle('wide-pages', w === 'full')
  try { if (w === 'full') localStorage.setItem(KEY, 'full'); else localStorage.removeItem(KEY) } catch { /* private window */ }
}
