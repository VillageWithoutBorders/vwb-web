import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCalendarEvents, filterByDistance, savePlace, startingOrigin, memberArea } from '../utils/calendar'
import CalendarSubscribe from '../components/CalendarSubscribe'
import { CalendarLocationBar, CalendarView, CalendarEventList, AllAgesFilter } from '../components/CalendarParts'

export default function Calendar() {
  const { isAdmin, organizations, profile } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [origin, setOrigin] = useState(() => startingOrigin(profile))
  const [miles, setMiles] = useState(25)
  const [allAgesOnly, setAllAgesOnly] = useState(false)

  // Calendars you can subscribe to: the network's own, plus your groups
  // (skipping groups hidden from the public).
  const subscribeChoices = useMemo(() => [
    { id: '', name: 'Village Without Borders' },
    ...organizations.filter((o) => !o.hide_from_public).map((o) => ({ id: o.id, name: o.name })),
  ], [organizations])

  function jumpToSubscribe() {
    const el = document.getElementById('cal-subscribe')
    if (el) {
      el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
      el.focus({ preventScroll: true })
    }
  }

  const canPost = isAdmin || organizations.some((o) => o.role === 'admin' || o.role === 'organizer')

  // The profile can arrive after the page first draws. If we had nothing
  // to start from yet, use the member's area as soon as we know it.
  useEffect(() => {
    if (!origin && profile) {
      const start = startingOrigin(profile)
      if (start) setOrigin(start)
    }
  }, [profile]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true
    fetchCalendarEvents({ thisMonth: true }).then(({ events: evs, error }) => {
      if (!alive) return
      setEvents(evs)
      setLoadError(!!error)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const visible = useMemo(
    () => filterByDistance(events, origin, miles).filter((e) => !allAgesOnly || e.all_ages),
    [events, origin, miles, allAgesOnly]
  )

  // Events you organize that the distance setting left out, so you never
  // lose track of them.
  const yourFarEvents = useMemo(() => {
    const shown = new Set(visible.map((e) => e.id))
    return events.filter((e) => e.can_manage && !shown.has(e.id) && (!allAgesOnly || e.all_ages))
      .filter((e) => filterByDistance([e], origin, miles).length === 0)
      .map((e) => filterByDistance([e], origin, Infinity)[0])
  }, [events, visible, origin, miles, allAgesOnly])

  function changeOrigin(o) {
    setOrigin(o)
    savePlace(o)
  }

  return (
    <div className="cal-page">
      <div className="cal-head">
        <div>
          <h1>Calendar</h1>
          <p className="cal-sub">Gatherings, drives, and volunteer shifts near you</p>
        </div>
        {canPost && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button type="button" className="btn btn-primary" style={{ minHeight: '44px' }} onClick={() => navigate('/calendar/new')}>
              + New event
            </button>
            <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={() => navigate('/calendar/import')}>
              Bring in events
            </button>
          </div>
        )}
      </div>

      <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px', margin: '0 0 0.75rem' }} onClick={jumpToSubscribe}>
        Add to my phone calendar
      </button>

      <CalendarLocationBar origin={origin} onOriginChange={changeOrigin} miles={miles} onMilesChange={setMiles} homeArea={memberArea(profile)} />
      <AllAgesFilter checked={allAgesOnly} onChange={setAllAgesOnly} />

      {loading && <p className="cal-empty">Loading events...</p>}
      {!loading && loadError && (
        <p className="cal-error">We couldn't load the calendar right now. Check your connection and try again.</p>
      )}
      {!loading && !loadError && (
        <CalendarView
          events={visible}
          belowTabs={yourFarEvents.length > 0 ? (
            <details style={{ margin: '1rem 0' }}>
              <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 600, cursor: 'pointer' }}>
                Your events farther away ({yourFarEvents.length})
              </summary>
              <CalendarEventList events={yourFarEvents} />
            </details>
          ) : null}
          emptyText={canPost ? 'No events nearby yet. Tap "New event" to post the first one.' : 'No events nearby yet. Check back soon, or try a wider distance.'}
        />
      )}

      <CalendarSubscribe choices={subscribeChoices} anchorId="cal-subscribe" />
    </div>
  )
}
