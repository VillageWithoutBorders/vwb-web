import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useT, t as tr } from '../utils/lang'

// "Read this to me" (Nov 3, barriers review): reads the page out loud with the
// phone's own voice (the browser's speech, nothing to install, no cost, works
// without signal on most phones). Shown in Simple view. Each part of the page is
// read on its own, with a soft outline on the part being read, so people can
// follow along. A Stop button sits near the bottom while it reads.

const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

// Parts of the page that make one spoken piece each.
const BLOCK = 'h1,h2,h3,h4,h5,h6,p,li,button,a,label,legend,summary,td,th,dt,dd,figcaption,[role="status"],[role="alert"],div,section,form,fieldset'
// Never read: the Read button's row, hidden things, pictures drawn in code.
const SKIP = '.app-back-row,[aria-hidden="true"],[hidden],[data-no-read],.read-aloud-stop'
const INSIDE = 'select,textarea,script,style,noscript,template,svg,canvas,iframe'
const END = /[.!?:;,]$/

function shown(el) {
  if (!el) return false
  const ok = el.checkVisibility
    ? el.checkVisibility({ visibilityProperty: true, opacityProperty: false })
    : !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
  if (ok) return true
  // A wrapper with no box of its own (display: contents) still shows what is inside it.
  try { return getComputedStyle(el).display === 'contents' } catch { return false }
}

// Buttons that are switched on, picked, or the page you are on.
function onWord(el) {
  if (el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true') return tr('chosen')
  if (el.getAttribute('aria-current') === 'page') return tr('you are here')
  return ''
}

function blockOf(el) {
  return el.closest(BLOCK) || el
}

function isInline(el) {
  try { return getComputedStyle(el).display.startsWith('inline') && el.tagName !== 'BUTTON' } catch { return true }
}

// Walks the page in order and groups its words into pieces to read.
export function readablePieces(root) {
  const pieces = []
  const onMap = new Map()
  let cur = null
  function add(block, text, fromEl) {
    if (!text) return
    if (cur && cur.block === block) {
      if (fromEl !== cur.lastEl) {
        const before = cur.text.trim()
        const now = text.trim()
        // A new line in the same part gets a short pause, unless it already ends a sentence.
        const newLine = !isInline(fromEl) || (/^(B|STRONG)$/.test(cur.lastEl.tagName) && /^\p{Lu}/u.test(now))
        if (before && now && newLine && !END.test(before)) cur.text += '. '
        else if (!/\s$/.test(cur.text) && !/^\s/.test(text)) cur.text += ' '
      }
      cur.text += text
      cur.lastEl = fromEl
      return
    }
    cur = { block, text, lastEl: fromEl, after: '' }
    pieces.push(cur)
  }
  // Said at the end of a part, like "chosen" or "not checked".
  function tag(block, word) {
    if (!word) return
    if (!cur || cur.block !== block) { cur = { block, text: '', lastEl: block, after: '' }; pieces.push(cur) }
    if (!cur.after.includes(word)) cur.after += ', ' + word
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const parent = n.parentElement
      // Nothing inside a list of choices, a typing box, or code-drawn pictures.
      if (parent && parent !== root && parent.closest(INSIDE)) return NodeFilter.FILTER_REJECT
      if (n.nodeType !== 1) return NodeFilter.FILTER_ACCEPT
      if (n.matches(SKIP)) return NodeFilter.FILTER_REJECT
      if (n.inert) return NodeFilter.FILTER_REJECT
      if (!shown(n) && !n.matches('.sr-only,.visually-hidden')) return NodeFilter.FILTER_REJECT
      // Panels slid off the side of the screen are not on the page right now.
      const r = n.getBoundingClientRect()
      if (r.width > 0 && (r.left >= window.innerWidth - 1 || r.right <= 1)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) {
      const p = n.parentElement
      if (p) add(blockOf(p), n.nodeValue || '', p)
      continue
    }
    const el = n
    const name = el.tagName
    const on = onWord(el)
    if (on) onMap.set(el, on)
    if (name === 'SELECT') {
      // Read what is picked, not every choice in the list.
      const o = el.options[el.selectedIndex]
      if (o && o.text) add(blockOf(el), tr('Picked: ') + o.text, el)
    } else if (name === 'TEXTAREA') {
      if (el.value) add(blockOf(el), tr('Typed: ') + el.value, el)
    } else if (name === 'IMG') {
      if (el.alt) add(blockOf(el), el.alt, el)
    } else if (name === 'INPUT') {
      const t = (el.type || 'text').toLowerCase()
      if (t === 'checkbox') tag(blockOf(el), tr(el.checked ? 'checked' : 'not checked'))
      else if (t === 'radio') tag(blockOf(el), el.checked ? tr('chosen') : '')
      else if (!['hidden', 'password', 'submit', 'button', 'file', 'image', 'reset'].includes(t) && el.value) add(blockOf(el), tr('Typed: ') + el.value, el)
    }
  }
  return pieces
    .map((p) => {
      let after = p.after
      const on = onMap.get(p.block)
      if (on && !after.includes(on)) after += ', ' + on
      const text = p.text.replace(/\s+/g, ' ').trim()
      return { block: p.block, text: after ? text.replace(/[.,;:]$/, '') + after + '.' : text }
    })
    .filter((p) => /[\p{L}\p{N}]/u.test(p.text))
}

function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices() || []
  const base = lang.slice(0, 2).toLowerCase()
  const same = voices.filter((v) => (v.lang || '').toLowerCase().startsWith(base))
  return same.find((v) => v.default) || same.find((v) => v.localService) || same[0] || null
}

export default function ReadAloud() {
  const t = useT()
  const { pathname } = useLocation()
  const [reading, setReading] = useState(false)
  const runRef = useRef(0)
  const litRef = useRef(null)

  function light(el) {
    if (litRef.current) litRef.current.removeAttribute('data-reading')
    litRef.current = el
    if (!el) return
    el.setAttribute('data-reading', '')
    try {
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      // Middle of the screen, clear of the Stop button and the bottom bar.
      const r = el.getBoundingClientRect()
      const low = window.innerHeight * 0.6
      if (r.top < 70 || r.bottom > low) el.scrollIntoView({ block: r.height > low - 70 ? 'start' : 'center', behavior: calm ? 'auto' : 'smooth' })
    } catch { /* older browsers */ }
  }

  function stop() {
    runRef.current += 1
    try { window.speechSynthesis.cancel() } catch { /* nothing to stop */ }
    light(null)
    setReading(false)
  }

  function start() {
    const root = document.querySelector('.app-main')
    if (!root) return
    const pieces = readablePieces(root)
    if (!pieces.length) return
    const run = ++runRef.current
    const lang = document.documentElement.lang || 'en-US'
    const voice = pickVoice(lang)
    const synth = window.speechSynthesis
    synth.cancel()
    setReading(true)
    let i = 0
    function next() {
      if (run !== runRef.current) return
      if (i >= pieces.length) { light(null); setReading(false); return }
      const p = pieces[i++]
      const u = new SpeechSynthesisUtterance(p.text)
      u.lang = voice ? voice.lang : lang
      if (voice) u.voice = voice
      u.rate = 0.9
      u.onstart = () => { if (run === runRef.current) light(p.block) }
      u.onend = next
      u.onerror = (e) => {
        if (run !== runRef.current) return
        if (e.error === 'interrupted' || e.error === 'canceled') return
        console.error('Read aloud stopped:', e.error)
        next()
      }
      synth.speak(u)
    }
    // Some phones drop the first words if speech starts right after a cancel.
    setTimeout(next, 60)
  }

  // A new page, or leaving Simple view, stops the reading.
  useEffect(() => () => stop(), [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!canSpeak) return null

  return (
    <>
      <button
        type="button"
        className={'read-aloud' + (reading ? ' on' : '')}
        aria-pressed={reading}
        onClick={reading ? stop : start}
      >
        <SpeakerPic reading={reading} />
        <span>{t(reading ? 'Stop reading' : 'Read this to me')}</span>
      </button>
      {reading && (
        <button type="button" className="read-aloud-stop" onClick={stop}>
          <span className="read-aloud-square" aria-hidden="true" /> {t('Stop reading')}
        </button>
      )}
    </>
  )
}

function SpeakerPic({ reading }) {
  return (
    <svg className="read-aloud-pic" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      <path d="M16 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {!reading && <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  )
}
