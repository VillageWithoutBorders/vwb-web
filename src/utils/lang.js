import { useSyncExternalStore } from 'react'
import { activeSkin, onSkinChange } from './skin'
import { SKIN_WORDS, TAB_WORDS } from '../data/skinWords'

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
let patterns = null
const alertCache = new Map()

function changed() { version += 1; subs.forEach((f) => f()) }

function setPageLang(l) {
  document.documentElement.lang = l === 'es' ? 'es' : 'en'
}

async function loadWords(l) {
  patterns = null
  alertCache.clear()
  if (l !== 'es') { words = null; return }
  // The rest of the words (es-more.js, about 3/4 of them) start loading now but don't
  // hold up the first draw. When they arrive, the screen re-draws in Spanish.
  const more = import('../data/es-more.js')
  try {
    words = (await import('../data/es.js')).default
  } catch (e) {
    // No signal and never loaded on this phone: stay in English until it can load.
    console.error('Failed to load Spanish words:', e)
    words = null
    more.catch(() => {})
    return
  }
  const core = words
  more.then((m) => {
    // Still the same Spanish load (the person didn't switch back to English meanwhile).
    if (words !== core) return
    words = { ...core, ...m.default }
    patterns = null
    alertCache.clear()
    changed()
  }).catch((e) => console.error('Failed to load more Spanish words:', e))
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
  // Skins (Nov 11): a few place names change. Before {name} spots fill, so people's
  // own words (a cottage name, a message) are never changed.
  if (s && typeof s === 'string') { const sk = activeSkin(); if (sk !== 'home') s = skinSwap(en, s, sk) }
  if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]))
  return s
}

// Alerts (Nov 5): most alerts are written in English by the database, often with a
// name or title inside ("Ruth wants to connect"). tAlert finds the es.js key that has
// the same shape ('{name} wants to connect') and fills in the Spanish.
// Only keys with real words around the {spots} are used, so a short key can't
// grab a whole alert by mistake. A {skill} or {role} spot is translated too, and so are
// the stand-in words the database uses when a name is missing ("A neighbor").
const ALERT_FILLERS = new Set(['A neighbor', 'A member', 'Someone', 'someone', 'A group', 'A new group', 'A resource', 'The resource', 'your group', 'your village', 'your organization', 'their name', 'not given', 'village', 'Community Connection'])
function buildPatterns() {
  const list = []
  for (const en of Object.keys(words)) {
    if (!en.includes('{')) continue
    const parts = en.split(/(\{\w+\})/)
    const literal = parts.filter((x) => !/^\{\w+\}$/.test(x)).join('')
    if (literal.replace(/\W/g, '').length < 4) continue
    const names = []
    const src = parts.map((x) => {
      const m = /^\{(\w+)\}$/.exec(x)
      if (m) { names.push(m[1]); return '([\\s\\S]+?)' }
      return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }).join('')
    list.push({ re: new RegExp('^' + src + '$'), names, es: words[en], size: literal.length })
  }
  return list.sort((a, b) => b.size - a.size)
}

export function tAlert(text) {
  if (lang === 'en' || !words || !text) return text
  if (words[text]) return words[text]
  if (alertCache.has(text)) return alertCache.get(text)
  if (!patterns) patterns = buildPatterns()
  let out = text
  for (const p of patterns) {
    const m = p.re.exec(text)
    if (!m) continue
    out = p.es
    p.names.forEach((n, i) => {
      const v = n === 'skill' || n === 'role' || ALERT_FILLERS.has(m[i + 1]) ? t(m[i + 1]) : m[i + 1]
      out = out.split('{' + n + '}').join(v)
    })
    break
  }
  alertCache.set(text, out)
  return out
}

// Skins (Nov 11, Jade). The place name by itself ("My Corner") becomes the skin's name
// ("My Bunk"). Inside longer words (a note, a hover tip, a screen reader label), the
// plain name follows in ( ): "Tap My Station (your village) at the top."
function skinSwap(en, s, sk) {
  const i = lang === 'es' ? 1 : 0
  const own = SKIN_WORDS[en]
  if (own) return own[sk][i]
  for (const [key, w] of Object.entries(SKIN_WORDS)) {
    const from = i ? w.es : key
    if (s.includes(from)) s = s.split(from).join(w[sk][i] + ' (' + w.plain[i] + ')')
  }
  return s
}

// The plain name for a title with a skin on: "(your cottage)". Empty for Home Place.
export function plainName(en) {
  const sk = activeSkin()
  const w = sk !== 'home' && SKIN_WORDS[en]
  return w ? '(' + w.plain[lang === 'es' ? 1 : 0] + ')' : ''
}

// The second word on a top bar tab ("World" in "My World"), in the skin's words.
export function tabWord(en) {
  const sk = activeSkin()
  const w = sk !== 'home' && TAB_WORDS[en]
  return w ? w[sk][lang === 'es' ? 1 : 0] : t(en)
}

// Re-draws the screen when the language changes. Returns t, so a component can write
// const t = useT()
export function useT() {
  // And when the skin changes (Nov 11), since a few place names follow it.
  useSyncExternalStore((f) => { subs.add(f); const off = onSkinChange(f); return () => { subs.delete(f); off() } }, () => version + '|' + activeSkin(), () => '0|home')
  return t
}
