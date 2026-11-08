import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUnreadCount } from '../context/UnreadCountContext'
import { supabase } from '../supabaseClient'
import { loadMyTaskOverview } from '../utils/myTasks'
import { fetchCalendarEvents, filterByDistance, startingOrigin, hasEnded } from '../utils/calendar'
import { useAdminInbox } from '../hooks/useAdminInbox'
import { useMyTools } from '../hooks/useMyTools'
import { CalendarEventCard } from './CalendarParts'
import Icon from './Icon'
import { useT, getLang } from '../utils/lang'

// The Dashboard as a "today" page (Oct 22). It answers one question:
// what needs me today? Asking for and giving help live in the Help tab;
// this page only points there when something is waiting.

// Things waiting on you: offers to help that need your yes, tasks waiting
// on your answer, and (for VWB admins) the shared admin inbox.
// Calls onCount with how many, for the line under the greeting.
export function NeedsYou({ onCount, children }) {
  const { user } = useAuth()
  const { total: adminWaiting } = useAdminInbox()
  const t = useT()
  const [tasks, setTasks] = useState(null)

  useEffect(() => {
    let alive = true
    loadMyTaskOverview(user?.id).then((d) => { if (alive) setTasks(d) })
      .catch((err) => { console.error('Failed to load what needs you:', err); if (alive) setTasks({ requests: [], active: [], ok: false }) })
    return () => { alive = false }
  }, [user?.id])

  const items = []
  if (tasks) {
    tasks.requests.filter((r) => r.needsYou).forEach((r) => items.push({ key: r.key, icon: 'raise-hand', title: t('{note}. Say yes?', { note: t(r.note) }), sub: r.title, to: '/tasks?tab=requests' }))
    tasks.active.filter((a) => a.needsYou).forEach((a) => items.push({ key: a.key, icon: 'handshake', title: t(a.note), sub: a.who ? t('{title} with {who}', { title: a.title, who: a.who }) : a.title, to: '/tasks?tab=active' }))
  }
  if (adminWaiting > 0) items.push({ key: 'admin', icon: 'inbox', title: adminWaiting === 1 ? t('1 thing needs a VWB admin') : t('{n} things need a VWB admin', { n: adminWaiting }), sub: t('Shared admin inbox'), to: '/admin' })

  useEffect(() => { if (onCount && tasks) onCount(items.length) }, [items.length, tasks]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="today-needs" aria-labelledby="today-needs-h">
      <h2 id="today-needs-h" className="today-h">{t('Needs you')}</h2>
      {tasks && !tasks.ok && <p className="form-error" role="alert">{t("We couldn't load your tasks. Leave this page and come back to try again.")}</p>}
      {items.map((it) => (
        <Link key={it.key} to={it.to} className="today-need">
          <span className="today-need-ic" aria-hidden="true"><Icon name={it.icon} size={32} /></span>
          <span className="today-need-text"><b>{it.title}</b><small>{it.sub}</small></span>
          <span className="today-go" aria-hidden="true">&#8250;</span>
        </Link>
      ))}
      {/* Nov 7 (Jade): your own "nothing waiting" line first, then what's open nearby,
          so the two quiet lines read in order instead of one under the other backwards. */}
      {tasks && items.length === 0 && <p className="today-empty">{t('Nothing is waiting on you right now.')}</p>}
      {/* Invites and nearby needs render themselves, and show nothing when empty. */}
      {children}
    </section>
  )
}

// Your places: your village, your chats, and the tools your roles give you.
export function YourPlaces() {
  const { user } = useAuth()
  const { unreadCount } = useUnreadCount()
  const tools = useMyTools()
  const t = useT()
  const [villageUnread, setVillageUnread] = useState(0)

  useEffect(() => {
    if (!user) return
    let alive = true
    supabase.rpc('campfire_unread').then(({ data, error }) => {
      if (error) { console.error('Failed to count new village messages:', error); return }
      if (alive) setVillageUnread((data || []).reduce((n, r) => n + Number(r.unread || 0), 0))
    })
    return () => { alive = false }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const places = [
    { key: 'village', label: t('My village'), icon: 'houses', to: '/village', badge: villageUnread },
    { key: 'chats', label: t('Messages'), icon: 'envelope', to: '/messages', badge: unreadCount },
    ...tools.map((tl) => ({ key: tl.key, label: tl.name ? t(tl.label) + ': ' + tl.name : t(tl.label), icon: tl.icon, to: tl.to })),
  ]

  return (
    <section aria-labelledby="today-places-h">
      <h2 id="today-places-h" className="today-h">{t('Your places')}</h2>
      <div className="today-places">
        {places.map((p) => (
          <Link key={p.key} to={p.to} className="today-place">
            <span className="today-place-ic" aria-hidden="true"><Icon name={p.icon} size={32} /></span>
            <span className="today-place-label">{p.label}</span>
            {p.badge > 0 && <span className="today-badge" aria-label={t('{n} new', { n: p.badge })}>{p.badge > 9 ? '9+' : p.badge}</span>}
          </Link>
        ))}
      </div>
    </section>
  )
}

// Coming up: the next two events near you.
// slim (Nov 1, Jade): under the cottage map, one thin bar with the next event.
export function ComingUp({ slim = false }) {
  const { profile } = useAuth()
  const t = useT()
  const [events, setEvents] = useState(null)

  useEffect(() => {
    let alive = true
    fetchCalendarEvents().then(({ events: all }) => {
      if (!alive) return
      const origin = startingOrigin(profile)
      const near = origin ? filterByDistance(all, origin, 25) : all
      setEvents(near.filter((e) => !hasEnded(e)).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).slice(0, 2))
    })
    return () => { alive = false }
  }, [profile?.user_id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (slim) {
    const ev = events && events[0]
    const when = ev ? new Date(ev.starts_at).toLocaleDateString(getLang() === 'es' ? 'es-US' : undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : ''
    return (
      <Link to="/calendar" className="today-slim">
        <Icon name="calendar" size={28} />
        <span className="today-slim-text">
          <b>{t('Coming up')}</b>
          <small>{events === null ? t('Loading...') : ev ? ev.title + ', ' + when : t('No events nearby yet')}</small>
        </span>
        <span className="today-slim-go" aria-hidden="true">&#8250;</span>
      </Link>
    )
  }

  return (
    <section aria-labelledby="today-coming-h">
      <h2 id="today-coming-h" className="today-h">{t('Coming up')}</h2>
      {events === null && <p className="today-empty" role="status">{t('Loading events...')}</p>}
      {events && events.length === 0 && <p className="today-empty">{t('No events nearby yet.')}</p>}
      {events && events.map((ev) => <CalendarEventCard key={ev.id} ev={ev} showDate />)}
      <Link to="/calendar" className="today-more">{t('See the calendar')}</Link>
    </section>
  )
}
