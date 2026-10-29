import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCalendarEvents, filterByDistance, savePlace, startingOrigin, memberArea } from '../utils/calendar'
import CalendarSubscribe from '../components/CalendarSubscribe'
import { CalendarLocationBar, CalendarView, CalendarEventList, CalendarMonth, AllAgesFilter } from '../components/CalendarParts'
import { useWideScreen } from '../hooks/useWideScreen'
import { hasEnded } from '../utils/calendar'
import NearbyOrganizers from '../components/NearbyOrganizers'
import BringOrg from '../components/BringOrg'
import { calmMotion } from '../utils/motion'

export default function Calendar() {
  const { isAdmin, organizations, profile } = useAuth()
  const wide = useWideScreen()
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
      el.scrollIntoView({ behavior: calmMotion() ? 'auto' : 'smooth', block: 'start' })
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

  const upcoming = visible.filter((e) => !hasEnded(e))
  const emptyText = canPost ? 'No events nearby yet. Tap "New event" to post the first one.' : 'No events nearby yet. Check back soon, or try a wider distance.'
  const farBox = yourFarEvents.length > 0 ? (
            <details style={{ margin: '1rem 0' }}>
              <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 600, cursor: 'pointer' }}>
                Your events farther away ({yourFarEvents.length})
              </summary>
              <CalendarEventList events={yourFarEvents} />
            </details>
          ) : null

  // Oct 28 (Jade): on a computer the calendar works like the map and help pages. Left: the
  // title, buttons, filters, and the month, held in place. Right: the list of events and the
  // organizers near you, in a panel as tall as the left that scrolls by itself.
  if (wide) {
    return (
      <div className="cal-page cal-split">
        <div className="cal-left">
        <div className="cal-head">
          <div>
            <h1>Calendar</h1>
            <p className="cal-sub">Gatherings, drives, volunteer shifts, and who is organizing near you</p>
          </div>
        </div>

        {/* Oct 28 (Jade): one calm row before the events. New event; Place and filters
            (place, distance, all ages) fold into one line; Bring in events and the phone
            calendar link move under More. Nothing was taken away. */}
        <div className="cal-top-row">
          {canPost && (
            <button type="button" className="btn btn-primary" onClick={() => navigate('/calendar/new')}>+ New event</button>
          )}
          <details className="cal-more">
            <summary>More</summary>
            <div className="cal-more-body">
              {canPost && <button type="button" className="btn btn-outline btn-full" onClick={() => navigate('/calendar/import')}>Bring in events</button>}
              <button type="button" className="btn btn-outline btn-full" onClick={jumpToSubscribe}>Add these events to my phone calendar</button>
            </div>
          </details>
        </div>

        <details className="cal-filters" open={!origin}>
          <summary>
            <span className="cal-filters-word">Place and filters</span>
            <small>{(origin && origin.name ? origin.name + ', ' : '') + 'within ' + miles + ' miles' + (allAgesOnly ? ', all ages only' : '')}</small>
          </summary>
          <div className="cal-filters-body">
            <CalendarLocationBar origin={origin} onOriginChange={changeOrigin} miles={miles} onMilesChange={setMiles} homeArea={memberArea(profile)} />
            <AllAgesFilter checked={allAgesOnly} onChange={setAllAgesOnly} />
          </div>
        </details>

          {!loading && !loadError && <CalendarMonth events={visible} />}
        </div>
        <div className="cal-right">
          {loading && <p className="cal-empty">Loading events...</p>}
          {!loading && loadError && (
            <p className="cal-error">We couldn't load the calendar right now. Check your connection and try again.</p>
          )}
          {!loading && !loadError && (<>
            <p className="cal-sub" role="status">{upcoming.length === 0 ? 'No upcoming events found for this search. Try more miles.' : upcoming.length + (upcoming.length === 1 ? ' upcoming event found.' : ' upcoming events found.')}</p>
            {farBox}
            <CalendarEventList events={upcoming} emptyText={emptyText} />
          </>)}
          <NearbyOrganizers origin={origin} miles={miles} />
          <BringOrg />
          <CalendarSubscribe choices={subscribeChoices} anchorId="cal-subscribe" />
        </div>
      </div>
    )
  }

  return (
    <div className="cal-page">
      <div className="cal-head">
        <div>
          <h1>Calendar</h1>
          <p className="cal-sub">Gatherings, drives, volunteer shifts, and who is organizing near you</p>
        </div>
      </div>

      {/* Oct 28 (Jade): one calm row before the events. New event; Place and filters
          (place, distance, all ages) fold into one line; Bring in events and the phone
          calendar link move under More. Nothing was taken away. */}
      <div className="cal-top-row">
        {canPost && (
          <button type="button" className="btn btn-primary" onClick={() => navigate('/calendar/new')}>+ New event</button>
        )}
        <details className="cal-more">
          <summary>More</summary>
          <div className="cal-more-body">
            {canPost && <button type="button" className="btn btn-outline btn-full" onClick={() => navigate('/calendar/import')}>Bring in events</button>}
            <button type="button" className="btn btn-outline btn-full" onClick={jumpToSubscribe}>Add these events to my phone calendar</button>
          </div>
        </details>
      </div>

      <details className="cal-filters" open={!origin}>
        <summary>
          <span className="cal-filters-word">Place and filters</span>
          <small>{(origin && origin.name ? origin.name + ', ' : '') + 'within ' + miles + ' miles' + (allAgesOnly ? ', all ages only' : '')}</small>
        </summary>
        <div className="cal-filters-body">
          <CalendarLocationBar origin={origin} onOriginChange={changeOrigin} miles={miles} onMilesChange={setMiles} homeArea={memberArea(profile)} />
          <AllAgesFilter checked={allAgesOnly} onChange={setAllAgesOnly} />
        </div>
      </details>

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

      {/* Oct 22: the old Around you page folded in here (events and organizers) and into Find resources. */}
      <NearbyOrganizers origin={origin} miles={miles} />
      <BringOrg />

      <CalendarSubscribe choices={subscribeChoices} anchorId="cal-subscribe" />
    </div>
  )
}
