import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCalendarEvents, filterByDistance, saveTown, startingOrigin } from '../utils/calendar'
import { CalendarLocationBar, CalendarEventList } from '../components/CalendarParts'

export default function Calendar() {
  const { isAdmin, organizations, profile } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [origin, setOrigin] = useState(() => startingOrigin(profile))
  const [miles, setMiles] = useState(25)

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
    fetchCalendarEvents().then(({ events: evs, error }) => {
      if (!alive) return
      setEvents(evs)
      setLoadError(!!error)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const visible = useMemo(() => filterByDistance(events, origin, miles), [events, origin, miles])

  function changeOrigin(o) {
    setOrigin(o)
    if (!o.isMe && !o.isArea) saveTown(o.name)
  }

  return (
    <div className="cal-page">
      <div className="cal-head">
        <div>
          <h1>Calendar</h1>
          <p className="cal-sub">Gatherings, drives, and volunteer shifts near you</p>
        </div>
        {canPost && (
          <button type="button" className="btn btn-primary" style={{ minHeight: '44px' }} onClick={() => navigate('/calendar/new')}>
            + New event
          </button>
        )}
      </div>

      <CalendarLocationBar origin={origin} onOriginChange={changeOrigin} miles={miles} onMilesChange={setMiles} />

      {loading && <p className="cal-empty">Loading events...</p>}
      {!loading && loadError && (
        <p className="cal-error">We couldn't load the calendar right now. Check your connection and try again.</p>
      )}
      {!loading && !loadError && (
        <CalendarEventList
          events={visible}
          emptyText={canPost ? 'No events nearby yet. Tap "New event" to post the first one.' : 'No events nearby yet. Check back soon, or try a wider distance.'}
        />
      )}
    </div>
  )
}
