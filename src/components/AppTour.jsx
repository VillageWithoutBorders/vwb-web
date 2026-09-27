import { useEffect, useRef, useState } from 'react'

// A short walk-through of the app, shown once after someone joins (right
// after the Community Guidelines), and any time from Help & Feedback.
// It sits just above the bottom tab bar and lights up the tab it's talking
// about, so people learn where things live instead of reading about them.
//
// Plain words on purpose: short sentences, one idea per card.

const TOUR_KEY = 'vwb_tour_done_v1'
const START_EVENT = 'vwb:start-tour'

const STEPS = [
  {
    icon: '\u{1F3E1}',
    title: 'Welcome to the village',
    body: "Here's a quick look around. It takes about a minute. You can skip it and come back any time.",
  },
  {
    tab: 'skillshare',
    icon: '\u{1F91D}',
    title: 'SkillShare',
    body: 'See what neighbors near you need, and what they are giving away for free. If you can help with something, tap I can help.',
  },
  {
    tab: 'home',
    icon: '\u{1F64B}',
    title: 'Ask for help',
    body: "Need a hand? Go to Home and tap Ask for Help. Pick what you need and how soon. Neighbors near you will see it. Your address is never shown.",
  },
  {
    tab: 'messages',
    icon: '\u{1F4AC}',
    title: 'Messages',
    body: "Talk with neighbors here to plan the details. Don't want to hear from someone? Block them, and they can't reach you.",
  },
  {
    tab: 'tasks',
    icon: '✅',
    title: 'Tasks',
    body: "Keep track of help you asked for and help you're giving. When it's done, mark it done and thank each other.",
  },
  {
    tab: 'community',
    icon: '\u{1F4DA}',
    title: 'Community',
    body: 'Local help in one place: food pantries, clinics, housing help, and more.',
  },
  {
    tab: 'profile',
    icon: '\u{1F6E1}️',
    title: 'Your profile and safety',
    body: 'Change your skills and zip code here. Block or report anyone, any time. Moving or traveling? Tap Change on any "Near..." line.',
  },
  {
    top: true,
    icon: '\u2630',
    title: 'Alerts and Menu',
    body: 'At the top right, Alerts shows what is new for you. Menu has your settings, help, and Log out. Tap the logo any time to go Home.',
    last: 'You can take this tour again from Menu.',
  },
]

function tourDone() {
  try { return localStorage.getItem(TOUR_KEY) === '1' } catch { return false }
}

function markDone() {
  try { localStorage.setItem(TOUR_KEY, '1') } catch { /* private mode: it may show again, that's okay */ }
}

// Call from anywhere (Help page, menus) to replay the tour.
export function startAppTour() {
  window.dispatchEvent(new Event(START_EVENT))
}

export default function AppTour() {
  const [open, setOpen] = useState(() => !tourDone())
  const [index, setIndex] = useState(0)
  const headingRef = useRef(null)
  const step = STEPS[index]
  const isLast = index === STEPS.length - 1

  // Replay requests from the Help page.
  useEffect(() => {
    function start() { setIndex(0); setOpen(true) }
    window.addEventListener(START_EVENT, start)
    return () => window.removeEventListener(START_EVENT, start)
  }, [])

  // Light up the matching bottom tab, and lift the tab bar above the dimmed page.
  useEffect(() => {
    const root = document.documentElement
    if (!open) { root.removeAttribute('data-tour-tab'); root.classList.remove('tour-open'); return }
    root.classList.add('tour-open')
    if (step.tab) root.setAttribute('data-tour-tab', step.tab)
    else if (step.top) root.setAttribute('data-tour-tab', 'top')
    else root.removeAttribute('data-tour-tab')
    return () => { root.removeAttribute('data-tour-tab'); root.classList.remove('tour-open') }
  }, [open, step])

  // Move focus to each new card so screen readers read it.
  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [open, index])

  // Escape closes it, same as Skip.
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') finish() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function finish() {
    markDone()
    setOpen(false)
  }

  if (!open) return null

  return (
    <>
      <div className="tour-backdrop" aria-hidden="true" onClick={finish} />
      <div className="tour-sheet" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourBody">
        <div className="tour-top">
          <span className="tour-count">Step {index + 1} of {STEPS.length}</span>
          <button type="button" className="tour-skip" onClick={finish}>
            {isLast ? 'Close' : 'Skip tour'}
          </button>
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
          {step.tab && <p className="tour-hint">Look for the lit-up button at the bottom of your screen.</p>}
          {step.top && <p className="tour-hint">Look for the lit-up buttons at the top of your screen.</p>}
          {step.last && <p className="tour-hint">{step.last}</p>}
        </div>

        <div className="tour-buttons">
          {index > 0 && (
            <button type="button" className="btn btn-outline tour-btn" onClick={() => setIndex(i => i - 1)}>Back</button>
          )}
          {isLast ? (
            <button type="button" className="btn btn-primary tour-btn tour-btn-main" onClick={finish}>Let's go</button>
          ) : (
            <button type="button" className="btn btn-primary tour-btn tour-btn-main" onClick={() => setIndex(i => i + 1)}>
              {index === 0 ? 'Show me around' : 'Next'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
