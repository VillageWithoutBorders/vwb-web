import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

// A short walk-through of the app.
//
// New members: shown once, right after the Community Guidelines. It is
// optional: "Skip tour" is always on screen. Finishing or skipping is saved
// on their account (helper_profiles.tour_done_at), so it never pops up again,
// on any phone or computer. (The agreement to the guidelines is separate and
// happens on the Guidelines screen.)
//
// Everyone: can take it again any time from Menu, Help, or Settings. A
// replay can be closed whenever they like.
//
// It sits just above the bottom tab bar and lights up the tab it's talking
// about, so people learn where things live instead of reading about them.
// Plain words on purpose: short sentences, one idea per card.
//
// Practice round (optional): after SkillShare, a sample request, offer, and
// event let people try the buttons. Nothing is saved, nobody is notified, and
// "Skip practice" jumps past it at any time, even on the first-time tour.

const START_EVENT = 'vwb:start-tour'

const ALL_STEPS = [
  {
    icon: '\u{1F3E1}',
    title: 'Welcome to the village',
    body: "Here's a quick look around. It takes about a minute.",
  },
  {
    tab: 'home',
    icon: '\u{1F64B}',
    title: 'Home',
    body: 'Need a hand? Tap Ask for Help. Pick what you need and how soon. Neighbors near you will see it, and your address is never shown. You can fix a request later if something changes. The Calendar, your Cottage Chats and Campfires, and the Village Map are here too.',
  },
  {
    tab: 'community',
    icon: '\u{1F4DA}',
    title: 'Community',
    body: "See what's happening near you and who is organizing. Find local help like food pantries and clinics. You can even start a Cottage Chat with your neighbors. Standing next to a friend? Open your chat and tap Show QR code. They scan it with their phone camera to join.",
  },
  {
    icon: '\u{1F5FA}\uFE0F',
    title: 'The village map',
    body: 'Find Village Map on Home. It shows every village on a map, and as a web that shows how villages connect. Tap a village to see its name and size. Only places and rough numbers show, never people.',
  },
  {
    tab: 'skillshare',
    icon: '\u{1F91D}',
    title: 'SkillShare',
    body: 'See what neighbors near you need, and what they are giving away for free. If you can help with something, tap I can help.',
  },
  {
    practice: 'intro',
    icon: '\u270B',
    title: 'Want to practice?',
    body: 'Try a sample request, offer, and event. Nothing is real, nobody is told, and nothing is saved. It takes about a minute. Or skip it. You can always take the tour again later.',
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
    tab: 'messages',
    icon: '\u{1F4AC}',
    title: 'Messages',
    body: "Talk with neighbors, Cottage Chats, and Campfires here. Tap ⋯ on a chat to mark it unread or flag it to follow up. Don't want to hear from someone? Block them. Messages stay private, and you can turn read receipts on or off in Settings.",
  },
  {
    only: 'campfire',
    icon: '\u{1F4E3}',
    title: 'The Village Square',
    body: 'Hope Ambassadors, admins, and the founder meet at the Village Square, pinned at the top of Messages. It has a General board and one board for each village. Tap a message\u2019s \u22EF to reply to it or edit your own. Every message shows when it was sent.',
  },
  {
    tab: 'tasks',
    icon: '✅',
    title: 'Tasks',
    body: "Keep track of help you asked for and help you're giving. When it's done, mark it done and thank each other.",
  },
  {
    tab: 'profile',
    icon: '\u{1F6E1}️',
    title: 'Your profile and safety',
    body: "Add your zip code here so we can show you what's near you. Only your area is shared, never your address. Block or report anyone, any time.",
  },
  {
    icon: '\u{1F331}',
    title: 'How trust grows',
    body: 'New here? You can ask for help and offer to help right away. Once a neighbor vouches for you, or you finish a task together, you can message people first and post offers too.',
  },
  {
    top: true,
    icon: '☰',
    title: 'Alerts and Menu',
    body: 'At the top right, Alerts shows what is new for you. Menu has your settings, help, and Log out. In Settings you can turn on phone notifications, change your password, add two-step login, and see your devices. Tap the logo any time to go Home.',
    last: 'You can take this tour again any time from Menu, Help, or Settings.',
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

// Everyone sees the same walk-through, except steps marked for a smaller group.
function stepsFor(profile, isAdmin) {
  const hasCampfire = !!(profile?.is_hope_ambassador || isAdmin)
  return ALL_STEPS.filter((st) => !st.only || (st.only === 'campfire' && hasCampfire))
}

// Call from anywhere (Menu, Help, Settings) to replay the tour.
export function startAppTour() {
  window.dispatchEvent(new Event(START_EVENT))
}

export default function AppTour() {
  const { user, profile, isAdmin, refreshProfile } = useAuth()
  // Only when the column exists and is empty. If the database step hasn't
  // been run yet, the tour never forces itself on anyone.
  const needsTour = !!profile && Object.prototype.hasOwnProperty.call(profile, 'tour_done_at') && !profile.tour_done_at
  const [open, setOpen] = useState(false)
  const [required, setRequired] = useState(false)
  const [index, setIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const headingRef = useRef(null)
  const STEPS = stepsFor(profile, isAdmin)
  const step = STEPS[index] || STEPS[0]
  const isLast = index === STEPS.length - 1
  const inPractice = !!step.practice
  function skipPractice() {
    const next = STEPS.findIndex((st, i) => i > index && !st.practice)
    setIndex(next === -1 ? STEPS.length - 1 : next)
  }

  // First time for a new member: open it, and it has to be finished.
  useEffect(() => {
    if (needsTour) { setIndex(0); setRequired(true); setOpen(true) }
  }, [needsTour])

  // Replays from Menu, Help, or Settings.
  useEffect(() => {
    function start() { setIndex(0); setError(''); setRequired(needsTour); setOpen(true) }
    window.addEventListener(START_EVENT, start)
    return () => window.removeEventListener(START_EVENT, start)
  }, [needsTour])

  // Light up the matching bottom tab, and lift the tab bar above the dimmed page.
  useEffect(() => {
    const root = document.documentElement
    function clear() { root.removeAttribute('data-tour-tab'); root.classList.remove('tour-open', 'tour-required') }
    if (!open) { clear(); return }
    root.classList.add('tour-open')
    root.classList.toggle('tour-required', required)
    if (step.tab) root.setAttribute('data-tour-tab', step.tab)
    else if (step.top) root.setAttribute('data-tour-tab', 'top')
    else root.removeAttribute('data-tour-tab')
    return clear
  }, [open, step, required])

  // Move focus to each new card so screen readers read it.
  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [open, index])

  // Escape closes a replay. The first-time tour has to be finished.
  useEffect(() => {
    if (!open || required) return
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, required])

  async function agree() {
    if (!required) { setOpen(false); return }
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
    setOpen(false)
    refreshProfile?.()
  }

  if (!open) return null

  return (
    <>
      <div className="tour-backdrop" aria-hidden="true" onClick={required ? undefined : () => setOpen(false)} />
      <div className="tour-sheet" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourBody">
        <div className="tour-top">
          <span className="tour-count">Step {index + 1} of {STEPS.length}</span>
          <span className="tour-top-actions">
            {inPractice && (
              <button type="button" className="tour-skip" onClick={skipPractice}>Skip practice</button>
            )}
            {required ? (
              <button type="button" className="tour-skip" onClick={agree} disabled={saving}>{saving ? 'Saving...' : 'Skip tour'}</button>
            ) : (
              <button type="button" className="tour-skip" onClick={() => setOpen(false)}>Close</button>
            )}
          </span>
        </div>

        <div className="tour-dots" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s.title} className={'tour-dot' + (i === index ? ' active' : i < index ? ' done' : '')} />
          ))}
        </div>

        <div className="tour-card" key={step.title}>
          <div className="tour-icon" aria-hidden="true">{step.icon}</div>
          <h2 id="tourTitle" className="tour-title" tabIndex={-1} ref={headingRef}>{step.title}</h2>
          <p id="tourBody" className="tour-body">{step.body}</p>
          {step.practice && step.practice !== 'intro' && <SampleCard kind={step.practice} />}
          {step.tab && <p className="tour-hint">Look for the lit-up button at the bottom of your screen.</p>}
          {step.top && <p className="tour-hint">Look for the lit-up buttons at the top of your screen.</p>}
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
