import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { loadMyTaskOverview, urgencyLabel } from '../utils/myTasks'
import Icon from './Icon'

// Home dashboard: your SkillShare and Tasks at a glance, in four tabs.
// Requests and Offers are SkillShare. Active and Archived are Tasks.
// Finished tasks also live in your Profile.

const TABS = [
  { id: 'requests', label: 'Requests', icon: '\u{1F198}' },
  { id: 'offers', label: 'Offers', icon: '\u{1F49A}' },
  { id: 'active', label: 'Active', icon: '\u{1F91D}' },
  { id: 'archived', label: 'Archived', icon: '\u{1F4E6}' },
]
const SHOW = 5
const EMPTY = {
  requests: { text: 'No open requests. Tap Ask for help above when you need a hand.', cta: null, to: null },
  offers: { text: 'Share a skill so neighbors know what you can do.', cta: 'Offer a skill', to: '/post-offer' },
  active: { text: 'No tasks in progress. When someone takes your request, or you help a neighbor, it shows here.', cta: null, to: null },
  archived: { text: 'Finished tasks rest here and in your Profile.', cta: null, to: null },
}

function whenText(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function HomeTasks() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem('vwb_home_tab') || 'requests' } catch { return 'requests' }
  })
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    loadMyTaskOverview(user?.id).then((d) => {
      if (!alive) return
      setData(d); setFailed(!d.ok)
    }).catch((err) => { console.error('Failed to load your dashboard:', err); if (alive) setFailed(true) })
    return () => { alive = false }
  }, [user?.id])

  // Start on Active when something there is waiting on you.
  useEffect(() => {
    if (data && data.active.some((t) => t.needsYou)) setTab('active')
  }, [data])

  function pick(id) {
    setTab(id)
    try { localStorage.setItem('vwb_home_tab', id) } catch { /* ignore */ }
  }

  function open() {
    navigate('/tasks?tab=' + tab)
  }

  const rows = data ? data[tab] : []
  const waitingOnYou = data ? data.active.filter((t) => t.needsYou).length : 0
  const empty = EMPTY[tab]

  return (
    <section className="home-tasks" aria-labelledby="home-tasks-h">
      <div className="home-tasks-head">
        <h2 id="home-tasks-h">Your SkillShare and Tasks</h2>
        {waitingOnYou > 0 && <span className="home-tasks-flag" role="status">{waitingOnYou} waiting on you</span>}
      </div>

      <div className="home-tasks-tabs" role="tablist" aria-label="Your SkillShare and Tasks">
        {TABS.map((t) => {
          const n = data ? data[t.id].length : null
          const on = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={'ht-' + t.id}
              aria-selected={on}
              aria-controls="ht-panel"
              className={'home-tasks-tab' + (on ? ' on' : '')}
              onClick={() => pick(t.id)}
            >
              <span aria-hidden="true"><Icon name={t.icon} /></span> {t.label}
              {n > 0 && <span className="home-tasks-count">{n}</span>}
              {t.id === 'active' && waitingOnYou > 0 && <span className="home-tasks-dot" aria-label="Something is waiting on you" />}
            </button>
          )
        })}
      </div>

      <div id="ht-panel" role="tabpanel" aria-labelledby={'ht-' + tab} className="home-tasks-panel">
        {!data && !failed && <p className="home-tasks-empty">Loading...</p>}
        {failed && <p className="home-tasks-empty">We couldn't load this just now. Try again in a moment, or open Tasks.</p>}
        {data && rows.length === 0 && (
          <div className="home-tasks-empty">
            <p style={{ margin: '0 0 0.5rem' }}>{empty.text}</p>
            {empty.cta && <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} onClick={() => navigate(empty.to)}>{empty.cta}</button>}
          </div>
        )}
        {data && rows.length > 0 && (
          <ul className="home-tasks-list">
            {rows.slice(0, SHOW).map((item) => (
              <li key={item.key}>
                <button type="button" className={'home-task' + (item.needsYou ? ' needs' : '')} onClick={open}>
                  <span className="home-task-title">{item.title}</span>
                  <span className="home-task-meta">
                    {item.role === 'helping' ? 'You are helping ' + item.who : item.who ? 'Helper: ' + item.who : item.category || ''}
                    {(item.role === 'helping' || item.who || item.category) && ' · '}
                    {item.urgency ? urgencyLabel(item.urgency) + ' · ' : ''}{whenText(item.created_at)}
                  </span>
                  {item.note && <span className={'home-task-note' + (item.needsYou ? ' you' : '')}>{item.needsYou ? '→ ' : ''}{item.note}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {data && rows.length > SHOW && (
          <p className="home-tasks-more">and {rows.length - SHOW} more</p>
        )}
        {data && tab === 'archived' && rows.length > 0 && (
          <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px', marginTop: '0.5rem' }} onClick={() => navigate('/profile#past-tasks')}>See all in your Profile</button>
        )}
        {data && tab !== 'archived' && rows.length > 0 && (
          <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px', marginTop: '0.5rem' }} onClick={() => navigate('/tasks?tab=' + tab)}>Open in Help</button>
        )}
      </div>
    </section>
  )
}
