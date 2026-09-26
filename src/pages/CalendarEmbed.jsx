import { useEffect, useMemo, useState } from 'react'
import { fetchCalendarEvents, filterByDistance, loadSavedTown, saveTown, DEFAULT_TOWN } from '../utils/calendar'
import { CalendarLocationBar, CalendarEventList } from '../components/CalendarParts'

// The public calendar shown on villagewithoutborders.org (inside the
// "See What's Happening" section). No login, no app header or tabs.
// Only ever shows public events; the database won't hand anything else to
// a visitor anyway, and this filter keeps it that way even if someone who
// happens to be logged in views the website.
export default function CalendarEmbed() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [origin, setOrigin] = useState(() => loadSavedTown() || DEFAULT_TOWN)
  const [miles, setMiles] = useState(25)

  useEffect(() => {
    document.title = 'Community Calendar | Village Without Borders'
    let alive = true
    fetchCalendarEvents().then(({ events: evs }) => {
      if (!alive) return
      setEvents(evs.filter((e) => e.visibility === 'public' && e.status === 'active'))
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const visible = useMemo(() => filterByDistance(events, origin, miles), [events, origin, miles])

  function changeOrigin(o) {
    setOrigin(o)
    if (!o.isMe) saveTown(o.name)
  }

  return (
    <main className="cal-embed">
      <CalendarLocationBar origin={origin} onOriginChange={changeOrigin} miles={miles} onMilesChange={setMiles} />
      {loading
        ? <p className="cal-empty">Loading events...</p>
        : <CalendarEventList events={visible} newTab emptyText="No public events nearby yet. Try a wider distance, or check back soon." />}
      <p className="cal-embed-foot">
        Want to post events for your group? <a href="/login?mode=signup" target="_blank" rel="noopener noreferrer">Join the app</a>
      </p>
    </main>
  )
}
