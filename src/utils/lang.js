import { useSyncExternalStore } from 'react'

// Language (Nov 3, barriers review): English or Spanish.
// Words on screen go through t('English words'). In Spanish, t() looks the words
// up in src/data/es.js. Anything not there yet shows in English, so a screen is
// never blank while it waits to be translated.
// The choice is kept on this phone (vwb_lang) and on the account (ui_prefs.lang),
// like text size. The Spanish words load only for people who pick Spanish.

const KEY = 'vwb_lang'
export const LANGS = ['en', 'es']
const subs = new Set()
let lang = 'en'
let words = null
let version = 0

function changed() { version += 1; subs.forEach((f) => f()) }

function setPageLang(l) {
  document.documentElement.lang = l === 'es' ? 'es' : 'en'
}

async function loadWords(l) {
  if (l !== 'es') { words = null; return }
  try {
    words = (await import('../data/es.js')).default
  } catch (e) {
    // No signal and never loaded on this phone: stay in English until it can load.
    console.error('Failed to load Spanish words:', e)
    words = null
  }
}

export function getLang() { return lang }

// Change it on this phone only (used when the account value loads, and by Settings).
export async function setLangLocal(l) {
  const next = LANGS.includes(l) ? l : 'en'
  try { if (next === 'en') localStorage.removeItem(KEY); else localStorage.setItem(KEY, next) } catch { /* private window */ }
  await loadWords(next)
  lang = next
  setPageLang(next)
  changed()
}

// Called once before the app first draws, so Spanish shows from the start.
export async function startLang() {
  let saved = 'en'
  try { saved = localStorage.getItem(KEY) || 'en' } catch { /* private window */ }
  if (saved !== 'en') await setLangLocal(saved)
}

// The words in the picked language. vars fill {name} spots: t('Hi, {name}', { name }).
export function t(en, vars) {
  let s = en
  if (lang !== 'en' && words && en) {
    // Some older skill names in the database use "&" ("Food & Meals"). Same words.
    s = words[en] || words[String(en).replace(/\s*&\s*/g, ' and ')] || en
  }
  if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]))
  return s
}

// Re-draws the screen when the language changes. Returns t, so a component can write
// const t = useT()
export function useT() {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => version, () => 0)
  return t
}
