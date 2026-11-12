import { useEffect, useRef, useState } from 'react'
import { t, getLang } from '../utils/lang'
import { activeSkin } from '../utils/skin'
import { ROUTE_TIPS, TEXT_TIPS } from '../data/hoverTips'

// Nov 7 (Jade): when a mouse rests on a button or link, a short note shows over it
// saying what it does. Only for a mouse; phones and touch screens never see it.
// Where the words come from, first match wins:
//   data-tip on the element, its title, the words on it (data/hoverTips.js), its
//   aria-label (when that says more than the words on it), where a link goes.
// The mouse note is for eyes only. Screen readers already hear the label, so it is aria-hidden.
//
// Nov 10 (Jade): the same notes on phones, two ways.
//   1. "What is this?": tap the ? button (WhatButton.jsx), then tap anything. A note says
//      what it is, and the thing itself does not open. One note per tap of the ?.
//   2. Hold a finger on a button or link for half a second. The note shows, and lifting
//      the finger does not press the button. Off on the maps, where a hold is a drag.
// Notes shown these ways are read out by screen readers.

const PICK = 'a[href], button, [role="button"], [role="tab"], summary, label.corner-item, select'
const WAIT = 450
const HOLD = 500
// No hold-for-a-note here: map pictures (a hold moves them), the globe, and typing boxes.
const NO_HOLD = '.vs-el, .wd-globe-wrap, .leaflet-container, .cr-room, input, textarea, select, [data-no-hold]'
export const WHAT_EVENT = 'vwb:what'
export const WHAT_STATE = 'vwb:what-state'

// The words that tell people how to get a note (tour last card, Help page).
// A mouse on a big screen has no ? button (same rule as .what-btn in index.css), so it gets its own words.
export function whatHint() {
  const mouse = typeof window !== 'undefined' && !!window.matchMedia
    && window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches
  return mouse
    ? 'Not sure what something is? Rest your mouse on it.'
    : 'Not sure what something is? Tap the ? and then tap it. Or hold your finger on it.'
}

const clean = (s) => (s || '').replace(/[←-⇿›‹+›‹]/g, '').replace(/\s+/g, ' ').trim()

let textMap = null, textLang = null
function textTip(words) {
  // Skins change a few button words (Edit cottage), so the skin is part of the key too.
  const lang = getLang() + '|' + activeSkin()
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
  // A button with a title and a small line under it: try the title alone (Nov 10).
  const firstLine = clean(((el.innerText || '').split('\n').find((l) => l.trim())) || '')
  if (firstLine && firstLine !== words) { const fromTitle = textTip(firstLine); if (fromTitle) return fromTitle }
  // A tab with a count on it, like "Active (1)": the note is for the words.
  const noCount = firstLine.replace(/\s*\(\d+\+?\)$/, '')
  if (noCount && noCount !== firstLine) { const fromTab = textTip(noCount); if (fromTab) return fromTab }
  if (aria && aria.toLowerCase() !== words.toLowerCase() && aria.length > words.length) return el.getAttribute('aria-label')
  if (el.tagName === 'A') { const r = routeTip(el); if (r) return r }
  if (aria && !words) return el.getAttribute('aria-label')
  return fallbackTip(el, firstLine)
}

// Nov 10 (Jade): when a button has no note of its own, say something useful instead
// of "No note for this one yet". First match wins.
const PREFIX_TIPS = [
  ['\u21B3', 'Open this smaller Campfire.'],
  ['Your garden', 'See the gifts growing in your garden.'],
  ['Step into', 'Go into this village.'],
  ['Entrar a', 'Go into this village.'],
  ['Send update to', 'Send this update to the people coming.'],
  ['See all', 'See the whole list.'],
]
// Nov 11: buttons whose words are a name or a number. The kind of button says what it does.
const CLASS_TIPS = [
  ['.groups-row', 'Open this chat.'],
  ['.dash-stat', 'See the list behind this number.'],
  ['.dash-need', 'Open this to take care of it.'],
  ['.wd-res-list button', 'Show this place on the map.'],
  ['.gh-link', 'Open this part of the group.'],
]
function fallbackTip(el, firstLine) {
  // The raw words: clean() takes arrows like \u21B3 out.
  const raw = (el.innerText || el.textContent || '').trim()
  for (const [start, tip] of PREFIX_TIPS) if (raw.startsWith(start) || raw.startsWith(t(start)) || firstLine.startsWith(t(start))) return t(tip)
  if (el.tagName === 'SUMMARY') return t('Open or close this part.')
  if (el.tagName === 'SELECT') return t('Pick one from the list.')
  if (el.classList.contains('hub-tile')) return t('See places near you that help with this.')
  if (el.classList.contains('notification-card')) return t('Open this alert.')
  // A place on a group or village list: the small line under its name says what is there.
  if (el.matches('.vs-room')) { const sub = clean(el.querySelector('small')?.textContent); return sub || t('Open this part of the group.') }
  for (const [sel, tip] of CLASS_TIPS) if (el.matches(sel)) return t(tip)
  // A button with a title and a line under it: the line under it says what it is.
  const lines = (el.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length >= 2) {
    const rest = lines.slice(1).join(' ')
    if (rest.length > 8 && rest.length < 220 && /[a-z\u00e1-\u00fa]/i.test(rest)) return rest
  }
  return ''
}

export default function HoverTips() {
  const [tip, setTip] = useState(null)
  const timer = useRef(0)
  const current = useRef(null)
  const box = useRef(null)
  // Nov 7: after a click, no note on that button until the mouse leaves it (it covered menus).
  const quiet = useRef(null)

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    if (!mq.matches) return undefined

    const hide = () => { clearTimeout(timer.current); current.current = null; setTip(null) }
    const over = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return
      const el = e.target.closest && e.target.closest(PICK)
      if (el === current.current) return
      if (el && el === quiet.current) return
      quiet.current = null
      clearTimeout(timer.current)
      current.current = el
      if (!el || el.disabled || el.closest('[data-no-tip]') || el.getAttribute('aria-expanded') === 'true') { setTip(null); return }
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
    const down = (e) => { quiet.current = e.target.closest && e.target.closest(PICK); hide() }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      hide()
      document.removeEventListener('pointerover', over, true)
      document.removeEventListener('pointerout', out, true)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // Phones and touch screens: hold for a note, and "What is this?" (see the top of this file).
  const [asking, setAsking] = useState(false)
  const askingRef = useRef(false)
  const touchTip = useRef(false)
  useEffect(() => {
    let press = null
    let swallowClick = false
    const setAsk = (on) => {
      askingRef.current = on
      setAsking(on)
      try { window.dispatchEvent(new CustomEvent(WHAT_STATE, { detail: on })) } catch { /* old browser */ }
    }
    const showNote = (el, text) => { touchTip.current = true; setTip({ text, rect: el.getBoundingClientRect(), spoken: true }) }
    const hideNote = () => { if (touchTip.current) { touchTip.current = false; setTip(null) } }
    const drop = () => { if (press) { clearTimeout(press.timer); press = null } }
    const fire = () => {
      if (!press) return
      const p = press
      drop()
      if (!p.el.isConnected) return
      swallowClick = true
      showNote(p.el, p.text)
    }
    const down = (e) => {
      hideNote()
      drop()
      swallowClick = false
      if (askingRef.current) return
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return
      const el = e.target.closest && e.target.closest(PICK)
      if (!el || el.disabled || el.closest(NO_HOLD) || el.closest('[data-no-tip]')) return
      const text = tipFor(el)
      if (!text) return
      press = { el, text, x: e.clientX, y: e.clientY, timer: setTimeout(fire, HOLD) }
    }
    const move = (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) drop() }
    // The phone's own hold menu (open in new tab, copy) stays away when a note shows.
    const menu = (e) => {
      if (press) { e.preventDefault(); fire() } else if (swallowClick) e.preventDefault()
    }
    const click = (e) => {
      if (askingRef.current) {
        if (e.target.closest && e.target.closest('[data-what-btn]')) return
        e.preventDefault()
        e.stopPropagation()
        const el = e.target.closest && e.target.closest(PICK + ', [data-tip]')
        // Not a button or link: stay ready, so the next tap can try again.
        if (!el) return
        setAsk(false)
        showNote(el, tipFor(el) || t('No note for this one yet. It does what the words on it say.'))
        return
      }
      if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation() }
    }
    const toggle = () => { hideNote(); setAsk(!askingRef.current) }
    const key = (e) => { if (e.key === 'Escape') { hideNote(); if (askingRef.current) setAsk(false) } }
    const scroll = () => { drop(); hideNote() }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointermove', move, true)
    document.addEventListener('pointerup', drop, true)
    document.addEventListener('pointercancel', drop, true)
    document.addEventListener('contextmenu', menu, true)
    document.addEventListener('click', click, true)
    document.addEventListener('keydown', key, true)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener(WHAT_EVENT, toggle)
    return () => {
      drop()
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', drop, true)
      document.removeEventListener('pointercancel', drop, true)
      document.removeEventListener('contextmenu', menu, true)
      document.removeEventListener('click', click, true)
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener(WHAT_EVENT, toggle)
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

  return (
    <>
      {asking && <p className="what-bar" role="status">{t('Tap anything to see what it is.')}</p>}
      {tip && (tip.spoken
        ? <div ref={box} className="hover-tip" role="status" style={{ visibility: 'hidden' }}>{tip.text}</div>
        : <div ref={box} className="hover-tip" aria-hidden="true" style={{ visibility: 'hidden' }}>{tip.text}</div>)}
    </>
  )
}
