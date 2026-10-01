import { useEffect, useMemo, useState } from 'react'
import { fetchCalendarEvents, filterByDistance, loadSavedPlace, savePlace } from '../utils/calendar'
import { CalendarLocationBar, CalendarView, AllAgesFilter } from '../components/CalendarParts'

// The public calendar shown on villagewithoutborders.org (inside the
// "See What's Happening" section). No login, no app header or tabs.
// Only ever shows public events; the database won't hand anything else to
// a visitor anyway, and this filter keeps it that way even if someone who
// happens to be logged in views the website.
export default function CalendarEmbed() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  // Website visitors: a place they picked before on this browser, or
  // nothing (every public event, plus a nudge to choose). Never a guess.
  const [origin, setOrigin] = useState(() => loadSavedPlace())
  const [miles, setMiles] = useState(25)
  const [allAgesOnly, setAllAgesOnly] = useState(false)

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

  const visible = useMemo(
    () => filterByDistance(events, origin, miles).filter((e) => !allAgesOnly || e.all_ages),
    [events, origin, miles, allAgesOnly]
  )

  function changeOrigin(o) {
    setOrigin(o)
    savePlace(o)
  }

  // Opened on its own (from the website's "View Calendar" button) it gets a
  // small branded header. Inside a frame on another page it stays bare.
  const standalone = typeof window !== 'undefined' && window.self === window.top

  return (
    <main className="cal-embed">
      {standalone && (
        <header className="cal-embed-head">
          <a href="https://villagewithoutborders.org" aria-label="Village Without Borders website">
            <img src="/images/vwb_header.png" alt="" width="44" height="44" />
          </a>
          <div>
            <h1>Community Calendar</h1>
            <p>Gatherings, drives, and ways to help near you</p>
          </div>
        </header>
      )}
      <CalendarLocationBar origin={origin} onOriginChange={changeOrigin} miles={miles} onMilesChange={setMiles} />
      <AllAgesFilter checked={allAgesOnly} onChange={setAllAgesOnly} />
      {loading
        ? <p className="cal-empty">Loading events...</p>
        : <CalendarView events={visible} newTab emptyText="No public events nearby yet. Try a wider distance, or check back soon." />}
      <p className="cal-embed-foot">
        Want to post events for your group? <a href="/login?mode=signup" target="_blank" rel="noopener noreferrer">Join the app</a>
      </p>
    </main>
  )
}
