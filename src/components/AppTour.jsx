import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { useSimpleView } from '../utils/simpleView'
import Icon from './Icon'
import { firstRunPaused } from '../utils/firstVillage'

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
// Each step opens the real screen, dims everything else, and rings the
// button or tab it is talking about, so people learn where things live
// instead of reading about them. The card moves to the top or bottom of the
// screen, whichever keeps the ringed spot in view. If a spot cannot be found
// (a screen is slow, or a button is hidden for this person), the card still
// shows and the tour keeps going. Plain words on purpose: short sentences,
// one idea per card.
//
// Village intro: four short stops on the village map (the chat, the living
// village, the Show/Hide names button, and Arrange and build my village).
//
// Practice round (optional): after SkillShare, a sample request, offer, and
// event let people try the buttons. Nothing is saved, nobody is notified, and
// "Skip practice" jumps past it at any time, even on the first-time tour.

const START_EVENT = 'vwb:start-tour'

// route: the screen to open for this step. target: what to ring (a CSS selector).
// Steps with no target show a plain card over the dimmed screen.
const TAB = (name) => '.tab-item[data-tour="' + name + '"]'

// need: show the step only when it fits this person.
//   'village'   in at least one village      'noVillage' not in any village yet
//   'keeper'    looks after a village         'organizer' Head or organizer of an organization
// route can be a function of ctx ({ villageId }).
const VILLAGE = (c) => '/village/' + c.villageId
const SPOT = (k) => '.vs-el[data-spot="' + k + '"]'

// Steps for everyone, then the steps for your role, then a last card.
// Each ringed spot is small on purpose, so the card never has to cover it.
// The practice round is offered after the Help step and can be skipped.
const ALL_STEPS = [
  {
    route: '/',
    target: '.header-nav',
    icon: '\u{1F3E1}',
    title: 'Welcome to the village',
    body: 'These buttons stay at the top of every screen. Tap Show me around to see what each part does. You can skip any time.',
  },
  {
    route: '/world',
    target: '.wd-switch',
    icon: '\u{1F30D}',
    title: 'Home: your world',
    body: 'Home opens the globe. Gold circles are your villages. Use these tabs to see your Villages, Organizations, or Groups.',
  },
  {
    need: 'noVillage',
    route: '/find-village',
    target: '#fv-search',
    icon: '\u{1F3D8}\uFE0F',
    title: 'Find your village',
    body: 'Search for your town here, then tap Join. Your village is the neighbors who live near you. No village yet? Anyone can start one.',
  },
  {
    need: 'village',
    route: VILLAGE,
    target: SPOT('chat'),
    icon: '\u{1F3D8}\uFE0F',
    title: 'Your village',
    body: 'Your village is a little map. Each picture is a place. Tap one to go in. This one is the village chat, where neighbors talk.',
  },
  {
    need: 'village',
    route: VILLAGE,
    target: SPOT('neighbors'),
    icon: '\u{1F3E0}',
    title: 'A living village',
    body: 'More cottages light up as more neighbors join. The campfire grows when the chats are busy. A lantern means a keeper looks after the village.',
  },
  {
    need: 'village',
    route: VILLAGE,
    target: '.vs-names-toggle',
    icon: '\u{1F3F7}\uFE0F',
    title: 'Names on the map',
    body: 'Tap here to show or hide the names. On a computer, point at a place to see its name.',
  },
  {
    need: 'village',
    route: '/village',
    target: '[data-tour="village-arrange"]',
    icon: '\u{1F333}',
    title: 'Your cottage',
    body: 'The Village tab opens your cottage: your own map with your home village, chats, organizations, and more. Tap Arrange and build to move things, add trees and bridges, and draw roads. Only you see it.',
  },
  {
    route: '/home',
    target: '[data-tour="top-dashboard"]',
    icon: '\u2600\uFE0F',
    title: 'Today',
    body: 'Your day at a glance: what needs you, your shortcuts, your places, and what is coming up. Tap Today at the top to come back here.',
  },
  {
    route: '/calendar',
    target: '[data-tour="top-calendar"]',
    icon: '\u{1F4C5}',
    title: 'Calendar',
    body: 'Events and volunteer sign-ups near you. Tap one to sign up or add it to your phone.',
  },
  {
    route: '/help-doors',
    target: '.doors',
    icon: '\u{1F91D}',
    title: 'Help',
    body: 'Find resources near you, ask neighbors for a hand, or see who you can help. Your own requests are at the bottom.',
  },
  {
    practice: 'intro',
    icon: '\u270B',
    title: 'Want to practice?',
    body: 'Try a pretend request, offer, and event. Nothing is real and nobody is told. It takes about a minute. Or skip it.',
  },
  {
    practice: 'request',
    icon: '\u{1F64B}',
    title: 'Practice: a request',
    body: 'This is how a request looks to your neighbors. Tap the button to see what happens.',
  },
  {
    practice: 'offer',
    icon: '\u{1F381}',
    title: 'Practice: an offer',
    body: 'Neighbors share skills, time, and things they can spare. Tap the button to try it.',
  },
  {
    practice: 'event',
    icon: '\u{1F4C5}',
    title: 'Practice: an event',
    body: 'Events are gatherings and drives near you. Tap the button to try it.',
  },
  {
    route: '/messages',
    target: TAB('messages'),
    icon: '\u{1F4AC}',
    title: 'Messages',
    body: 'All your chats live here. Each kind is a room of a different size: the bigger the room, the less you share. Tap "Why so many kinds of chat?" at the top to learn which one to use.',
  },
  {
    route: '/home',
    target: '[data-tour="emergency"]',
    icon: '\u26A0\uFE0F',
    title: 'Emergencies',
    body: 'For a flood, storm, fire, or outage that hits many neighbors. Report it or sign up to help. Someone in danger? Call 911 first.',
  },
  {
    need: 'keeper',
    route: VILLAGE,
    target: '[data-tour="keeper-tools"]',
    icon: '\u{1F511}',
    title: 'Keeper tools',
    body: 'You look after this village. Here you see who wants to join, sister villages, and more.',
  },
  {
    need: 'organizer',
    route: '/org-dashboard',
    icon: '\u{1F9F0}',
    title: 'Organizer tools',
    body: 'You help run an organization. Here you see who wants to join, your chats, events, and settings.',
  },
  {
    need: 'ambassador',
    route: '/ambassador',
    target: '.amb-title',
    icon: '\u2B50',
    title: 'Ambassador tools',
    body: 'Emergencies to check, groups asking to respond, and needs near you, all in one place.',
  },
  {
    route: '/',
    target: '[data-tour="role-tab"]',
    icon: '\u{1F9F0}',
    title: 'Your last button',
    body: 'This button changes with your role. Most people see Emergency. If you keep a village, run an organization, or are an Ambassador, your tools are here.',
  },
  {
    route: '/me',
    target: '[data-tour="me"]',
    icon: '\u{1F331}',
    title: 'You',
    body: 'Tap your picture for your profile, settings, and help. New here? Once a neighbor vouches for you, or you finish a task together, you can message people first and post offers.',
    last: 'Take this tour again any time from Settings or Help.',
  },
]

// Simple view gets a short tour: three stops.
const SIMPLE_STEPS = [
  {
    route: '/',
    target: '[data-tour="simple-buttons"]',
    icon: '\u{1F3E1}',
    title: 'Welcome to the village',
    body: 'These three buttons are all you need. Ask for help, help a neighbor, or read your messages.',
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
    target: '[data-tour="me"]',
    icon: '\u{1F331}',
    title: 'You',
    body: 'Tap your picture for your profile and settings. Want the full app? Tap Show me everything at the bottom of Home.',
    last: 'Take this tour again any time from Settings or Help.',
  },
]

// Sample cards for the practice round. Static on purpose: no database, no alerts.
const SAMPLES = {
  request: {
    label: 'Request',
    title: 'SAMPLE: Help carrying groceries',
    text: 'This is an example request. Nothing here is real.',
    action: 'I can help',
    after: 'Nice. In the real app, the person gets an alert, and the two of you can message to set a time and place. Your address stays private.',
  },
  offer: {
    label: 'Offer',
    title: 'SAMPLE: Free ride to the clinic',
    text: 'This is an example offer. Nothing here is real.',
    action: 'Ask about this',
    after: 'Nice. In the real app, you can send a message to ask about it. Once a neighbor vouches for you, you can post offers too.',
  },
  event: {
    label: 'Event',
    title: 'SAMPLE: Community Cleanup Day',
    text: 'This is an example event. Nothing here is real.',
    action: 'Sign up',
    after: 'Nice. In the real app, you would be on the list, and the organizers would see you are coming. You can take your name off any time.',
  },
}

function SampleCard({ kind }) {
  const [tried, setTried] = useState(false)
  const s = SAMPLES[kind]
  if (!s) return null
  return (
    <div className="tour-sample" role="group" aria-label={'Sample ' + s.label.toLowerCase()}>
      <span className="tour-sample-tag">Sample {s.label.toLowerCase()}</span>
      <p className="tour-sample-title">{s.title}</p>
      <p className="tour-sample-text">{s.text}</p>
      {tried ? (
        <p className="tour-sample-after" role="status">{s.after}</p>
      ) : (
        <button type="button" className="btn btn-outline tour-sample-btn" onClick={() => setTried(true)}>{s.action}</button>
      )}
    </div>
  )
}

// Steps that fit this person (see "need" above).
function stepsFor(ctx) {
  if (ctx.simple) return SIMPLE_STEPS
  return ALL_STEPS.filter((st) => {
    if (st.need === 'village') return !!ctx.villageId
    if (st.need === 'noVillage') return ctx.ready && !ctx.villageId
    if (st.need === 'keeper') return !!ctx.isKeeper
    if (st.need === 'organizer') return !!ctx.isOrganizer
    if (st.need === 'ambassador') return !!ctx.isAmbassador
    return true
  })
}

// Call from anywhere (Menu, Help, Settings) to replay the tour.
export function startAppTour() {
  window.dispatchEvent(new Event(START_EVENT))
}

export default function AppTour() {
  const { user, profile, organizations, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // Only when the column exists and is empty. If the database step hasn't
  // been run yet, the tour never forces itself on anyone.
  // Wait until they've picked Simple or Everything (SimpleOffer asks first).
  const pickedView = !profile || !Object.prototype.hasOwnProperty.call(profile, 'simple_view') || profile.simple_view !== null
  const needsTour = !!profile && Object.prototype.hasOwnProperty.call(profile, 'tour_done_at') && !profile.tour_done_at && pickedView && !firstRunPaused(pathname)
  const [open, setOpen] = useState(false)
  const [required, setRequired] = useState(false)
  const [index, setIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rect, setRect] = useState(null)
  const [cardAtTop, setCardAtTop] = useState(false)
  const headingRef = useRef(null)
  const sheetRef = useRef(null)
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
      const mine = (data || []).find((v) => v.is_mine)
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
  const isOrganizer = (organizations || []).some((o) => o.kind !== 'group' && (o.role === 'admin' || o.role === 'organizer'))
  const isAmbassador = !!profile?.is_hope_ambassador || profile?.role === 'admin' || profile?.role === 'founder'
  const simple = useSimpleView()
  const STEPS = stepsFor({ ...ctx, isOrganizer, isAmbassador, simple })
  const step = STEPS[index] || STEPS[0]
  const isLast = index === STEPS.length - 1
  const inPractice = !!step.practice
  function skipPractice() {
    const next = STEPS.findIndex((st, i) => i > index && !st.practice)
    setIndex(next === -1 ? STEPS.length - 1 : next)
  }

  // First time for a new member: open it, and it has to be finished.
  useEffect(() => {
    // Once open, moving through the tour's own screens must not restart it.
    if (needsTour && !openRef.current) { startPath.current = pathRef.current; setIndex(0); setRequired(true); setOpen(true) }
  }, [needsTour])

  // Replays from Menu, Help, or Settings.
  useEffect(() => {
    function start() { startPath.current = pathRef.current; setIndex(0); setError(''); setRequired(needsTour); setOpen(true) }
    window.addEventListener(START_EVENT, start)
    return () => window.removeEventListener(START_EVENT, start)
  }, [needsTour])

  // Open the real screen for each step.
  useEffect(() => {
    if (!open) return
    const to = typeof step.route === 'function' ? step.route(ctx) : step.route
    if (to && pathRef.current !== to) navigate(to)
  }, [open, index, ctx.villageId])

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
    // When neither side has room, use the bigger side and let the card scroll inside, so the ring stays in view.
    const top = spaceBelow < cardH && (spaceAbove >= cardH || spaceAbove > spaceBelow)
    setCardAtTop(top)
    if (sheet && cardH > Math.max(spaceBelow, spaceAbove)) sheet.style.maxHeight = Math.max(160, top ? spaceAbove : spaceBelow) + 'px'
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
          <span className="tour-count">Step {index + 1} of {STEPS.length}</span>
          <span className="tour-top-actions">
            {inPractice && (
              <button type="button" className="tour-skip" onClick={skipPractice}>Skip practice</button>
            )}
            {required ? (
              <button type="button" className="tour-skip" onClick={agree} disabled={saving}>{saving ? 'Saving...' : 'Skip tour'}</button>
            ) : (
              <button type="button" className="tour-skip" onClick={close}>Close</button>
            )}
          </span>
        </div>

        <div className="tour-progress" aria-hidden="true"><span style={{ width: pct + '%' }} /></div>

        <div className="tour-card" key={step.title}>
          <div className="tour-head">
            <span className="tour-icon" aria-hidden="true"><Icon name={step.icon} /></span>
            <h2 id="tourTitle" className="tour-title" tabIndex={-1} ref={headingRef}>{step.title}</h2>
          </div>
          <p id="tourBody" className="tour-body">{step.body}</p>
          {step.practice && step.practice !== 'intro' && <SampleCard kind={step.practice} />}
          {step.target && rect && <p className="tour-hint">Look for the ringed spot on your screen.</p>}
          {step.last && <p className="tour-hint">{step.last}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        <div className="tour-buttons">
          {index > 0 && (
            <button type="button" className="btn btn-outline tour-btn" onClick={() => setIndex(i => i - 1)}>Back</button>
          )}
          {isLast ? (
            <button type="button" className="btn btn-primary tour-btn tour-btn-main" onClick={agree} disabled={saving}>
              {saving ? 'Saving...' : 'Done'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary tour-btn tour-btn-main" onClick={() => setIndex(i => i + 1)}>
              {index === 0 ? 'Show me around' : step.practice === 'intro' ? 'Try it' : 'Next'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
