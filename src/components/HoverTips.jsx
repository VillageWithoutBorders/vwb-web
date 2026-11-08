import { useEffect, useRef, useState } from 'react'
import { t, getLang } from '../utils/lang'
import { ROUTE_TIPS, TEXT_TIPS } from '../data/hoverTips'

// Nov 7 (Jade): when a mouse rests on a button or link, a short note shows over it
// saying what it does. Only for a mouse; phones and touch screens never see it.
// Where the words come from, first match wins:
//   data-tip on the element, its title, the words on it (data/hoverTips.js), its
//   aria-label (when that says more than the words on it), where a link goes.
// The note is for eyes only. Screen readers already hear the label, so it is aria-hidden.

const PICK = 'a[href], button, [role="button"], [role="tab"], summary, label.corner-item, select'
const WAIT = 450

const clean = (s) => (s || '').replace(/[←-⇿›‹+›‹]/g, '').replace(/\s+/g, ' ').trim()

let textMap = null, textLang = null
function textTip(words) {
  const lang = getLang()
  if (!textMap || textLang !== lang) {
    textMap = new Map()
    for (const [label, tip] of Object.entries(TEXT_TIPS)) textMap.set(clean(t(label)).toLowerCase(), tip)
    textLang = lang
  }
  const tip = textMap.get(clean(words).toLowerCase())
  return tip ? t(tip) : ''
}

function routeTip(a) {
  if (!a.href) return ''
  let url
  try { url = new URL(a.href, window.location.href) } catch { return '' }
  if (url.origin !== window.location.origin) return t('Opens another website.')
  const path = url.pathname.replace(/\/+$/, '') || '/'
  let best = null
  for (const [route, tip] of ROUTE_TIPS) {
    const hit = route.endsWith('/') ? path.startsWith(route) : path === route
    if (hit && (!best || route.length > best[0].length)) best = [route, tip]
  }
  return best ? t(best[1]) : ''
}

function tipFor(el) {
  if (el.dataset.tip) return el.dataset.tip
  // Take over the browser's own title note so two notes never show at once.
  const title = el.getAttribute('title')
  if (title) { el.dataset.tipTitle = title; el.removeAttribute('title') }
  if (el.dataset.tipTitle) return el.dataset.tipTitle
  const words = clean(el.innerText || el.textContent)
  const aria = clean(el.getAttribute('aria-label'))
  const fromText = textTip(words)
  if (fromText) return fromText
  if (aria && aria.toLowerCase() !== words.toLowerCase() && aria.length > words.length) return el.getAttribute('aria-label')
  if (el.tagName === 'A') return routeTip(el)
  return aria && !words ? el.getAttribute('aria-label') : ''
}

export default function HoverTips() {
  const [tip, setTip] = useState(null)
  const timer = useRef(0)
  const current = useRef(null)
  const box = useRef(null)

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    if (!mq.matches) return undefined

    const hide = () => { clearTimeout(timer.current); current.current = null; setTip(null) }
    const over = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return
      const el = e.target.closest && e.target.closest(PICK)
      if (el === current.current) return
      clearTimeout(timer.current)
      current.current = el
      if (!el || el.disabled || el.closest('[data-no-tip]')) { setTip(null); return }
      const text = tipFor(el)
      if (!text) { setTip(null); return }
      timer.current = setTimeout(() => {
        if (current.current !== el || !el.isConnected) return
        setTip({ text, rect: el.getBoundingClientRect() })
      }, WAIT)
    }
    const out = (e) => {
      if (!current.current) return
      if (e.relatedTarget && current.current.contains(e.relatedTarget)) return
      hide()
    }
    const key = (e) => { if (e.key === 'Escape') hide() }
    document.addEventListener('pointerover', over, true)
    document.addEventListener('pointerout', out, true)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', key, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      hide()
      document.removeEventListener('pointerover', over, true)
      document.removeEventListener('pointerout', out, true)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // Place it above the button, or below when there is no room above. Keep it on screen.
  useEffect(() => {
    const b = box.current
    if (!tip || !b) return
    const r = tip.rect, w = b.offsetWidth, h = b.offsetHeight, gap = 8
    let top = r.top - h - gap
    let below = false
    if (top < 8) { top = r.bottom + gap; below = true }
    let left = r.left + r.width / 2 - w / 2
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    b.style.top = top + 'px'
    b.style.left = left + 'px'
    b.dataset.below = below ? '1' : ''
    b.style.visibility = 'visible'
  }, [tip])

  if (!tip) return null
  return (
    <div ref={box} className="hover-tip" aria-hidden="true" style={{ visibility: 'hidden' }}>{tip.text}</div>
  )
}
