import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import Icon from './Icon'

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

// Six steps for everyone, then the steps for your role, then a last card.
// The practice round is offered after the Help step and can be skipped.
const ALL_STEPS = [
  {
    route: '/',
    target: '.header-nav',
    icon: '\u{1F3E1}',
    title: 'Welcome to the village',
    body: 'These five buttons stay at the top of every screen: Home, Calendar, Dashboard, Alerts, and You. Tap Next to keep going. You can skip any time.',
  },
  {
    route: '/',
    target: '.wd-globe-wrap',
    icon: '\u{1F30D}',
    title: 'Your world',
    body: 'Home opens the globe. Gold circles are your villages. Faded ones you can join. Switch to Organizations or Groups above it. The megaphone holds news for everyone.',
  },
  {
    need: 'noVillage',
    route: '/find-village',
    target: '#fv-search',
    icon: '\u{1F3D8}\uFE0F',
    title: 'Find your village',
    body: 'Type your zip code, then tap Join. Your village is your neighbors close by. Do not see yours? Any neighbor can start one.',
  },
  {
    need: 'village',
    route: VILLAGE,
    target: '.vs-scene',
    icon: '\u{1F3D8}\uFE0F',
    title: 'Inside your village',
    body: 'Every picture is a place: the village chat, Campfires, your neighbors, and more. Ask for help and I can help sit under the map.',
  },
  {
    route: '/skillshare',
    target: TAB('help'),
    icon: '\u{1F91D}',
    title: 'Help',
    body: 'Ask for help or offer something with the buttons at the top. Near you shows what neighbors need. Mine keeps your own. Resources lists places that help.',
  },
  {
    practice: 'intro',
    icon: '\u270B',
    title: 'Want to practice?',
    body: 'Try a sample request, offer, and event. Nothing is real, nobody is told, and nothing is saved. It takes about a minute. Or skip it.',
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
    body: 'Events are gatherings and drives in your area. Tap the button to try it.',
  },
  {
    route: '/messages',
    target: TAB('messages'),
    icon: '\u{1F4AC}',
    title: 'Messages',
    body: 'Private chats, your village chats, Cottage Chats, and Campfires all live here. You can block or report anyone, any time.',
  },
  {
    need: 'keeper',
    route: VILLAGE,
    target: '[data-tour="keeper-tools"]',
    icon: '\u{1F511}',
    title: 'Keeper tools',
    body: 'You look after this village. Keeper tools show what needs you: people asking to join, sister villages, and more.',
  },
  {
    need: 'organizer',
    route: '/org-dashboard',
    icon: '\u{1F9F0}',
    title: 'Organizer tools',
    body: 'You help run an organization. Organizer tools show who is asking to join, your chats, events, and settings.',
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
    body: 'Neighbors see Emergency here, for disasters that hit many people at once. If you keep a village, run an organization, or are an Ambassador, your tools are here instead.',
    last: 'New here? Once a neighbor vouches for you, or you finish a task together, you can message people first and post offers. Take this tour again any time from Settings or Help.',
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
  const needsTour = !!profile && Object.prototype.hasOwnProperty.call(profile, 'tour_done_at') && !profile.tour_done_at
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
  pathRef.current = pathname
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
  const STEPS = stepsFor({ ...ctx, isOrganizer, isAmbassador })
  const step = STEPS[index] || STEPS[0]
  const isLast = index === STEPS.length - 1
  const inPractice = !!step.practice
  function skipPractice() {
    const next = STEPS.findIndex((st, i) => i > index && !st.practice)
    setIndex(next === -1 ? STEPS.length - 1 : next)
  }

  // First time for a new member: open it, and it has to be finished.
  useEffect(() => {
    if (needsTour) { startPath.current = pathRef.current; setIndex(0); setRequired(true); setOpen(true) }
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
    const cardH = sheetRef.current ? sheetRef.current.offsetHeight : 300
    const vh = window.innerHeight
    const tabH = 60 + 12
    const headH = 52 + 8
    const spaceBelow = vh - tabH - (rect.top + rect.height)
    const spaceAbove = rect.top - headH
    // Prefer the bottom. Use the top only when the bottom would cover the spot and the top would not.
    setCardAtTop(spaceBelow < cardH + 12 && spaceAbove >= cardH + 12)
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
          <div className="tour-icon" aria-hidden="true"><Icon name={step.icon} /></div>
          <h2 id="tourTitle" className="tour-title" tabIndex={-1} ref={headingRef}>{step.title}</h2>
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
