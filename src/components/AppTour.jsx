import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { useSimpleView } from '../utils/simpleView'
import Icon from './Icon'
import { firstRunPaused } from '../utils/firstVillage'
import { needsFullSetup } from '../utils/startPath'
import { useT } from '../utils/lang'
import { whatHint } from './HoverTips'

// A short walk-through of the app.
//
// New members: shown once, right after the Community Guidelines. It is
// optional: "Skip tour" is always on screen. Finishing or skipping is saved
// on their account (helper_profiles.tour_done_at), so it never pops up again,
// on any phone or computer. (The agreement to the guidelines is separate and
// happens on the Guidelines screen.)
//
// Everyone: can take it again any time from Help or Settings. A
// replay can be closed whenever they like.
//
// Nov 10 (Jade): the tour is short on purpose. Seven cards for the biggest uses of the
// app: ask, offer, calendar, messages, your village, alerts and My Corner. People with a
// role get one more card. Everything else is explained by the "What is this?" notes
// (the ? button, or holding a finger on something; see HoverTips.jsx).
//
// Each card dims the screen and rings the button it is talking about. The tour stays on
// the page you are on; the buttons it rings are in the top and bottom bars. The card
// always shows its full words. If a spot cannot be found, the card still shows and the
// tour keeps going. Plain words on purpose: short sentences, one idea per card.
//
// Practice (optional): the last card and the Help page offer "Try a pretend request".
// Nothing is saved and nobody is told.

const START_EVENT = 'vwb:start-tour'

// route: the screen to open for this step. target: what to ring (a CSS selector).
// Steps with no target show a plain card over the dimmed screen.
const TAB = (name) => '.tab-item[data-tour="' + name + '"]'

// need: show the step only when it fits this person ('tools': has a role).
// note: one more small line under the words.
const ALL_STEPS = [
  {
    icon: '\u{1F3E1}',
    title: 'Welcome to the village',
    body: 'Neighbors helping neighbors. Here are the main things you can do. It takes about a minute.',
  },
  {
    target: TAB('ask'),
    icon: '\u{1F64B}',
    title: 'Ask for Help',
    body: 'Need a hand? Tap here. Ask your neighbors, or find food, rides, and more near you.',
    note: 'A flood, storm, or fire? Tap Emergency Response on that page. In danger? Call 911.',
  },
  {
    target: TAB('offer'),
    icon: '\u{1F91D}',
    title: 'Offer Help',
    body: 'Want to help? Tap here to see what neighbors near you need.',
  },
  {
    target: TAB('calendar'),
    icon: '\u{1F4C5}',
    title: 'Calendar',
    body: 'Events and volunteer shifts near you. Tap one to sign up.',
  },
  {
    target: TAB('messages'),
    icon: '\u{1F4AC}',
    title: 'Messages',
    body: 'Your chats live here. A red number means someone wrote to you.',
  },
  {
    target: '[data-tour="top-village"]',
    icon: '\u{1F3D8}️',
    title: 'My Village',
    body: 'Your village is the neighbors who live near you. Tap here to visit it, or to find yours.',
  },
  {
    target: '.header-nav',
    icon: '\u{1F514}',
    title: 'Alerts and My Corner',
    body: 'The bell shows what is new. My Corner has your profile and Settings, where you can make the words bigger.',
  },
  {
    need: 'tools',
    route: '/me',
    target: '[data-tour="top-tools"]',
    icon: '\u{1F9F0}',
    title: 'Your roles',
    body: 'You have a role. Your tools are in My Corner, under Your roles.',
  },
]

// Simple view gets its own short tour.
const SIMPLE_STEPS = [
  {
    route: '/',
    target: '[data-tour="simple-buttons"]',
    icon: '\u{1F3E1}',
    title: 'Welcome to the village',
    body: 'These big buttons are the main things. Get help, find food and rides, help a neighbor, or read your messages.',
  },
  {
    route: '/',
    target: TAB('messages'),
    icon: '\u{1F4AC}',
    title: 'Messages',
    body: 'When a neighbor writes to you, a red number shows here. Tap it to read and answer.',
  },
  {
    route: '/',
    target: '.tab-item[data-tour="help"]',
    icon: '\u{1F91D}',
    title: 'Help',
    body: 'Tap Help any time to find food, rides and more, ask neighbors for a hand, or help someone.',
  },
  {
    route: '/',
    target: '[data-tour="alerts"]',
    icon: '\u{1F514}',
    title: 'Alerts',
    body: 'When something new happens, like a neighbor offering to help you, a number shows here.',
  },
  {
    route: '/',
    target: '[data-tour="me"]',
    icon: '\u{1F331}',
    title: 'My Corner',
    body: 'Tap your picture for your profile and Settings, where you can make the words bigger. Want the full app? Tap Show me everything at the bottom of Home.',
  },
  {
    route: '/me',
    target: '[data-tour="top-tools"]',
    icon: '\u{1F9F0}',
    title: 'Your roles',
    body: 'You have a role. Your tools are in My Corner, under Your roles.',
    need: 'tools',
  },
]

// The pretend request. Static on purpose: no database, no alerts.
const SAMPLE = {
  title: 'SAMPLE: Help carrying groceries',
  text: 'This is an example request. Nothing here is real.',
  action: 'Offer Help',
  after: 'Nice. In the real app, the person gets an alert, and the two of you can message to set a time and place. Your address stays private.',
}

// Used on the tour's last card and on the Help page.
export function SampleCard() {
  const t = useT()
  const [tried, setTried] = useState(false)
  const s = SAMPLE
  const tag = t('Sample request')
  return (
    <div className="tour-sample" role="group" aria-label={tag}>
      <span className="tour-sample-tag">{tag}</span>
      <p className="tour-sample-title">{t(s.title)}</p>
      <p className="tour-sample-text">{t(s.text)}</p>
      {tried ? (
        <p className="tour-sample-after" role="status">{t(s.after)}</p>
      ) : (
        <button type="button" className="btn btn-outline tour-sample-btn" onClick={() => setTried(true)}>{t(s.action)}</button>
      )}
    </div>
  )
}

// Steps that fit this person (see "need" above).
function stepsFor(ctx) {
  return (ctx.simple ? SIMPLE_STEPS : ALL_STEPS).filter((st) => st.need !== 'tools' || ctx.hasTools)
}

// Call from anywhere (Menu, Help, Settings) to replay the tour.
export function startAppTour() {
  window.dispatchEvent(new Event(START_EVENT))
}

export default function AppTour() {
  const t = useT()
  const { user, profile, organizations, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // Only when the column exists and is empty. If the database step hasn't
  // been run yet, the tour never forces itself on anyone.
  // Wait until they've picked Simple or Everything (SimpleOffer asks first).
  const pickedView = !profile || !Object.prototype.hasOwnProperty.call(profile, 'simple_view') || profile.simple_view !== null
  // Full setup (Nov 1) comes before the tour.
  const needsTour = !!profile && Object.prototype.hasOwnProperty.call(profile, 'tour_done_at') && !profile.tour_done_at && pickedView && !needsFullSetup(user, profile) && !firstRunPaused(pathname)
  const [open, setOpen] = useState(false)
  const [required, setRequired] = useState(false)
  const [index, setIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rect, setRect] = useState(null)
  const [cardAtTop, setCardAtTop] = useState(false)
  const headingRef = useRef(null)
  const sheetRef = useRef(null)
  // The step whose ringed spot was already slid into view (once per step).
  const nudgedFor = useRef(-1)
  const startPath = useRef('/')
  const pathRef = useRef(pathname)
  const openRef = useRef(false)
  pathRef.current = pathname
  openRef.current = open
  // Which village to show, and whether this person keeps it or runs an organization.
  const [ctx, setCtx] = useState({ ready: false, villageId: null, isKeeper: false })
  useEffect(() => {
    if (!open || !user) return
    let alive = true
    supabase.rpc('village_network').then(async ({ data, error: vErr }) => {
      if (!alive) return
      if (vErr) console.error('Tour: failed to load villages:', vErr)
      // Nov 10 (Jade): "Your village" is your home village, not one you visit as a guest.
      const mine = (data || []).find((v) => v.id === profile?.home_village_id) || (data || []).find((v) => v.is_mine)
      let keeper = false
      if (mine) {
        const { data: k, error: kErr } = await supabase.rpc('village_keepers_info', { p_village: mine.id })
        if (kErr) console.error('Tour: failed to check keeper:', kErr)
        keeper = !!((Array.isArray(k) ? k[0] : k) || {}).i_am_keeper
      }
      if (alive) setCtx({ ready: true, villageId: mine ? mine.id : null, isKeeper: keeper })
    })
    return () => { alive = false }
  }, [open, user])
  const isAmbassador = !!profile?.is_hope_ambassador || profile?.role === 'admin' || profile?.role === 'founder'
  const simple = useSimpleView()
  // Anyone with a role has Your roles on My Corner, in Simple view too (Nov 10).
  const hasTools = isAmbassador || ctx.isKeeper || (organizations || []).some((o) => o.role === 'admin' || o.role === 'organizer')
  const STEPS = stepsFor({ simple, hasTools })
  const step = STEPS[index] || STEPS[0]
  const isLast = index === STEPS.length - 1
  // The pretend request, opened from the last card.
  const [practice, setPractice] = useState(false)

  // First time for a new member: open it, and it has to be finished.
  useEffect(() => {
    // Once open, moving through the tour's own screens must not restart it.
    if (needsTour && !openRef.current) { startPath.current = pathRef.current; setIndex(0); setRequired(true); setOpen(true) }
  }, [needsTour])

  // Replays from Menu, Help, or Settings.
  useEffect(() => {
    function start() { startPath.current = pathRef.current; setIndex(0); setError(''); setPractice(false); setRequired(needsTour); setOpen(true) }
    window.addEventListener(START_EVENT, start)
    return () => window.removeEventListener(START_EVENT, start)
  }, [needsTour])

  // Open the real screen for each step.
  useEffect(() => {
    if (!open) return
    const to = step.route
    if (to && pathRef.current !== to) navigate(to)
  }, [open, index])

  // Find the thing to ring. The screen may still be loading, so keep looking
  // for a few seconds, and keep the ring in place if the page moves.
  useEffect(() => {
    setRect(null)
    if (!open || !step.target) return
    let cancelled = false
    let scrolled = false
    function look() {
      if (cancelled) return
      const el = document.querySelector(step.target)
      if (!el) return
      if (!scrolled) { scrolled = true; el.scrollIntoView({ block: 'center', inline: 'nearest' }) }
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return
      setRect((prev) => (prev && Math.abs(prev.top - r.top) < 1 && Math.abs(prev.left - r.left) < 1 && Math.abs(prev.width - r.width) < 1 && Math.abs(prev.height - r.height) < 1)
        ? prev
        : { top: r.top, left: r.left, width: r.width, height: r.height })
    }
    look()
    const id = setInterval(look, 200)
    return () => { cancelled = true; clearInterval(id) }
  }, [open, index, step.target])

  // Put the card where it does not cover the ringed spot.
  useLayoutEffect(() => {
    if (!open || !rect) { setCardAtTop(false); return }
    const sheet = sheetRef.current
    if (sheet) sheet.style.maxHeight = ''
    const cardH = sheet ? sheet.offsetHeight : 300
    const vh = window.innerHeight
    const head = document.querySelector('.app-header')
    const tabs = document.querySelector('.bottom-tabs')
    const headH = (head ? head.getBoundingClientRect().height : 60) + 8
    const tabH = (tabs ? tabs.getBoundingClientRect().height : 60) + 12
    const spaceBelow = vh - tabH - (rect.top + rect.height) - 12
    const spaceAbove = rect.top - headH - 12
    // Prefer the bottom. Use the top when the bottom would cover the spot and the top has room.
    // Nov 10 (Jade): the words always show in full. The card used to shrink when neither side
    // had room, which hid its title and words. Now the page slides the ringed spot up under
    // the top bar once, to make room below it. If there is still no room (a spot as tall as
    // the screen), the card keeps its full size and sits over part of the spot.
    if (Math.max(spaceBelow, spaceAbove) < cardH && nudgedFor.current !== index) {
      nudgedFor.current = index
      const move = rect.top - headH - 14
      if (Math.abs(move) > 4) {
        const before = window.scrollY
        window.scrollBy(0, move)
        // The ring follows the spot within a moment and this runs again. If the page
        // could not move (the spot is at the very top or bottom), place the card now.
        if (Math.abs(window.scrollY - before) > 1) return
      }
    }
    // No room on either side: the card goes to the bottom, so the top of the spot shows
    // under the top bar, unless there is clearly more room above the spot.
    setCardAtTop(spaceBelow < cardH && (spaceAbove >= cardH || (spaceAbove > spaceBelow && spaceAbove > 120)))
  }, [open, rect, index])

  // Move focus to each new card so screen readers read it.
  useEffect(() => {
    if (open) headingRef.current?.focus({ preventScroll: true })
  }, [open, index])

  // Escape closes a replay. The first-time tour has to be finished.
  useEffect(() => {
    if (!open || required) return
    function onKey(e) { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, required])

  // Leave the way you came: back on the screen where the tour began.
  function close() {
    setOpen(false)
    if (pathRef.current !== startPath.current) navigate(startPath.current)
  }

  async function agree() {
    if (!required) { close(); return }
    setSaving(true)
    setError('')
    const { error: saveErr } = await supabase
      .from('helper_profiles')
      .update({ tour_done_at: new Date().toISOString() })
      .eq('user_id', user.id)
    setSaving(false)
    if (saveErr) {
      console.error('Failed to save tour agreement:', saveErr)
      setError("That didn't save. Check your connection and tap Done or Skip tour again.")
      return
    }
    setRequired(false)
    close()
    refreshProfile?.()
  }

  if (!open) return null

  const pct = Math.round(((index + 1) / STEPS.length) * 100)

  return (
    <>
      <div className={'tour-backdrop' + (rect ? ' tour-backdrop-clear' : '')} aria-hidden="true" onClick={required ? undefined : close} />
      {rect && (
        <div
          className="tour-spot"
          aria-hidden="true"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div ref={sheetRef} className={'tour-sheet' + (cardAtTop ? ' tour-sheet-top' : '')} role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourBody">
        <div className="tour-top">
          <span className="tour-count">{t('Step {n} of {total}', { n: index + 1, total: STEPS.length })}</span>
          <span className="tour-top-actions">
            {required ? (
              <button type="button" className="tour-skip" onClick={agree} disabled={saving}>{saving ? t('Saving...') : t('Skip tour')}</button>
            ) : (
              <button type="button" className="tour-skip" onClick={close}>{t('Close')}</button>
            )}
          </span>
        </div>

        <div className="tour-progress" aria-hidden="true"><span style={{ width: pct + '%' }} /></div>

        <div className="tour-card" key={step.title}>
          <div className="tour-head">
            <span className="tour-icon" aria-hidden="true"><Icon name={step.icon} /></span>
            <h2 id="tourTitle" className="tour-title" tabIndex={-1} ref={headingRef}>{t(step.title)}</h2>
          </div>
          <p id="tourBody" className="tour-body">{t(step.body)}</p>
          {step.note && <p className="tour-hint">{t(step.note)}</p>}
          {/* Said once, on the first card that rings something. */}
          {step.target && rect && index === STEPS.findIndex((st) => st.target) && <p className="tour-hint">{t('Look for the ringed spot on your screen.')}</p>}
          {isLast && <>
            <p className="tour-hint">{t(whatHint())}</p>
            {practice
              ? <SampleCard />
              : <button type="button" className="btn btn-outline tour-sample-btn" onClick={() => setPractice(true)}>{t('Try a pretend request')}</button>}
          </>}
          {error && <p className="form-error" role="alert">{t(error)}</p>}
        </div>

        <div className="tour-buttons">
          {index > 0 && (
            <button type="button" className="btn btn-outline tour-btn" onClick={() => setIndex(i => i - 1)}>{t('Back')}</button>
          )}
          {isLast ? (
            <button type="button" className="btn btn-primary tour-btn tour-btn-main" onClick={agree} disabled={saving}>
              {saving ? t('Saving...') : t('Done')}
            </button>
          ) : (
            <button type="button" className="btn btn-primary tour-btn tour-btn-main" onClick={() => setIndex(i => i + 1)}>
              {index === 0 ? t('Show me around') : t('Next')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
