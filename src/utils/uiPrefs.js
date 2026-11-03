import { supabase } from '../supabaseClient'
import { readTextSize, applyTextSize, TEXT_SIZES } from './textSize'
import { getTheme, setTheme } from './theme'
import { readCalm, applyCalm } from './motion'
import { getLang, setLangLocal, LANGS } from './lang'

// Settings that follow you (Nov 1, Jade): Text size, Light or dark, and Motion are
// saved on the account (helper_profiles.ui_prefs) as well as on this phone, so they
// show up on any phone you sign in on. Like Simple view, the account wins.
//   { text: 'normal'|'large'|'larger'|'largest', theme: 'auto'|'light'|'dark', motion: 'normal'|'calm', lang: 'en'|'es' }
// (lang added Nov 3; needs vwb-language.sql so the account can save it)
const OK = {
  text: TEXT_SIZES,
  theme: ['auto', 'light', 'dark'],
  motion: ['normal', 'calm'],
  lang: LANGS,
}

export function devicePrefs() {
  return { text: readTextSize(), theme: getTheme(), motion: readCalm() ? 'calm' : 'normal', lang: getLang() }
}

// Put the account's choices on this phone.
export function applyPrefs(p) {
  if (!p || typeof p !== 'object') return
  if (OK.text.includes(p.text) && p.text !== readTextSize()) applyTextSize(p.text)
  if (OK.theme.includes(p.theme) && p.theme !== getTheme()) setTheme(p.theme)
  if (OK.motion.includes(p.motion) && (p.motion === 'calm') !== readCalm()) applyCalm(p.motion === 'calm')
  if (OK.lang.includes(p.lang) && p.lang !== getLang()) {
    setLangLocal(p.lang).then(() => window.dispatchEvent(new Event('vwb:prefs')))
  }
  window.dispatchEvent(new Event('vwb:prefs'))
}

// Save one or more choices to the account. Quiet if the database step isn't run yet.
export async function savePrefs(changes) {
  const { error } = await supabase.rpc('set_my_ui_prefs', { p_prefs: changes })
  if (error && error.code !== 'PGRST202') { console.error('Failed to save settings to the account:', error); return false }
  return !error
}
