// "Read this to me" in the full view (Nov 10, Jade). Simple view always has the button.
// In the full view it shows when this is 'on'. Saved on this phone and on the account (uiPrefs.js).
const KEY = 'vwb_read_button'
export const READ_CHOICES = ['off', 'on']

export function readReadButton() {
  try { return localStorage.getItem(KEY) === 'on' ? 'on' : 'off' } catch { return 'off' }
}

export function applyReadButton(v) {
  try { if (v === 'on') localStorage.setItem(KEY, 'on'); else localStorage.removeItem(KEY) } catch { /* private window */ }
  window.dispatchEvent(new Event('vwb:prefs'))
}
