import { useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import '../dashboard.css'
import Icon from './Icon'
import { calmMotion } from '../utils/motion'

// Shared pieces for the Keeper and Organizer dashboards.
// The open tab lives in the address (?tab=people) so links and the back button land on it.

export function useDashTab(tabs) {
  const [params, setParams] = useSearchParams()
  const want = params.get('tab')
  const tab = tabs.some((t) => t.k === want) ? want : tabs[0].k
  function setTab(k) {
    const next = new URLSearchParams(params)
    next.set('tab', k)
    setParams(next, { replace: true })
  }
  return [tab, setTab]
}

// Needs you now: things waiting on this person. Each row jumps to its tab.
export function NeedsYou({ items, onGo, calm }) {
  const navigate = useNavigate()
  // A row with `to` opens that page. Otherwise it opens its tab and scrolls
  // there, so it still moves even when that tab is already open.
  function open(it) {
    if (it.to) { navigate(it.to); return }
    onGo(it.tab)
    setTimeout(() => {
      const el = document.getElementById(it.target || ('dash-panel-' + it.tab))
      if (!el) return
      const still = calmMotion()
      el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
    }, 60)
  }
  if (!items) return null
  if (items.length === 0) {
    return (
      <section className="dash-needs is-calm" aria-label="Needs you now">
        <p className="dash-needs-calm"><span aria-hidden="true"><Icon name="leaf" /></span> {calm || 'Nothing is waiting on you right now.'}</p>
      </section>
    )
  }
  return (
    <section className="dash-needs" aria-labelledby="dash-needs-h">
      <h2 id="dash-needs-h">Needs you now</h2>
      {items.map((it) => (
        <button key={it.k} type="button" className="dash-need" onClick={() => open(it)}>
          <span className="dash-need-ic" aria-hidden="true"><Icon name={it.em} /></span>
          <span className="dash-need-text">{it.text}</span>
          <span className="dash-need-go" aria-hidden="true">&#8250;</span>
        </button>
      ))}
    </section>
  )
}

// Tab bar. Arrow keys move between tabs.
export function DashTabs({ tabs, tab, setTab, dots = {} }) {
  const refs = useRef({})
  function onKey(e, i) {
    let j = null
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length
    if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length
    if (j === null) return
    e.preventDefault()
    setTab(tabs[j].k)
    refs.current[tabs[j].k]?.focus()
  }
  return (
    <div className="dash-tabs" role="tablist" aria-label="Dashboard sections">
      {tabs.map((t, i) => (
        <button key={t.k} ref={(el) => { refs.current[t.k] = el }} type="button" role="tab"
          id={'dash-tab-' + t.k} aria-controls={'dash-panel-' + t.k} aria-selected={tab === t.k}
          tabIndex={tab === t.k ? 0 : -1} className="dash-tab"
          onClick={() => setTab(t.k)} onKeyDown={(e) => onKey(e, i)}>
          <span className="dash-tab-ic" aria-hidden="true"><Icon name={t.em} /></span>
          <span className="dash-tab-label">{t.label}</span>
          {dots[t.k] ? <span className="dash-tab-dot" aria-label="Needs you" /> : null}
        </button>
      ))}
    </div>
  )
}

export function DashPanel({ k, children }) {
  return <div className="dash-panel" role="tabpanel" id={'dash-panel-' + k} aria-labelledby={'dash-tab-' + k}>{children}</div>
}
