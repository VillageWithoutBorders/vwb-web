import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TOWNS, DISTANCE_OPTIONS, groupByDay, timeRange, VISIBILITY } from '../utils/calendar'
import { getCurrentPosition } from '../utils/location'

// Town dropdown (plus "Use my location") and a "how far" dropdown.
// `origin` is { name, lat, lng }, or null when we don't know the person's
// area yet (then every event shows, with a nudge to pick). `isArea` marks
// the member's own saved area, `isMe` a location shared this visit.
// Used by the app calendar and the website one.
export function CalendarLocationBar({ origin, onOriginChange, miles, onMilesChange }) {
  const [locating, setLocating] = useState(false)
  const MY_LOCATION = '__me__'
  const MY_AREA = '__area__'

  async function handleTown(value) {
    if (value === MY_LOCATION) {
      setLocating(true)
      const loc = await getCurrentPosition()
      setLocating(false)
      if (loc) {
        onOriginChange({ name: 'My location', lat: loc.lat, lng: loc.lng, isMe: true })
      } else {
        alert("We couldn't get your location. Pick your town from the list instead.")
      }
      return
    }
    if (value === MY_AREA) return
    const t = TOWNS.find((x) => x.name === value)
    if (t) onOriginChange(t)
  }

  return (
    <div className="cal-location">
      <label>
        Near
        <select value={origin?.isMe ? MY_LOCATION : origin?.isArea ? MY_AREA : (origin?.name || '')} onChange={(e) => handleTown(e.target.value)} aria-label="Choose your town">
          {!origin && <option value="" disabled>Choose your area</option>}
          {origin?.isArea && <option value={MY_AREA}>{origin.name}</option>}
          {TOWNS.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          <option value={MY_LOCATION}>{locating ? 'Finding you...' : 'Use my location'}</option>
        </select>
      </label>
      <label>
        Within
        <select value={miles} onChange={(e) => onMilesChange(Number(e.target.value))} aria-label="How far you can travel">
          {DISTANCE_OPTIONS.map((m) => <option key={m} value={m}>{m} miles</option>)}
        </select>
      </label>
      {!origin && (
        <p className="cal-hint" role="status">Showing every event. Choose your area to see what's close to you.</p>
      )}
    </div>
  )
}

function badges(ev) {
  const out = []
  if (ev.status === 'cancelled') out.push(['Cancelled', 'cal-badge-off'])
  if (ev.visibility === 'members') out.push([VISIBILITY.members.label, 'cal-badge-private'])
  if (ev.visibility === 'invite') out.push([VISIBILITY.invite.label, 'cal-badge-private'])
  if (ev.is_signed_up) out.push(["You're signed up", ''])
  else if (ev.signup_enabled && ev.status !== 'cancelled') {
    const full = ev.signup_limit != null && ev.signup_count >= ev.signup_limit
    out.push(full ? ['Spots full', 'cal-badge-warn'] : ['Volunteers needed', ''])
  }
  return out
}

export function CalendarEventCard({ ev, newTab }) {
  const where = [ev.town, ev.miles != null ? (ev.miles < 1 ? 'nearby' : Math.round(ev.miles) + ' mi away') : null].filter(Boolean).join(' · ')
  const inner = (
    <>
      <span className="cal-card-time">{timeRange(ev)}</span>
      <span className="cal-card-title">{ev.title}</span>
      <span className="cal-card-meta">
        {ev.organization_name || 'Village Without Borders'}{where ? ' · ' + where : ''}
      </span>
      {badges(ev).length > 0 && (
        <span className="cal-badges">
          {badges(ev).map(([label, cls]) => <span key={label} className={'cal-badge ' + cls}>{label}</span>)}
        </span>
      )}
    </>
  )
  if (newTab) {
    return <a className="cal-card" href={'/events/' + ev.id} target="_blank" rel="noopener noreferrer">{inner}</a>
  }
  return <Link className="cal-card" to={'/events/' + ev.id}>{inner}</Link>
}

export function CalendarEventList({ events, newTab, emptyText }) {
  if (events.length === 0) {
    return (
      <div className="cal-empty">
        <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }} aria-hidden="true">&#127793;</p>
        <p style={{ margin: 0 }}>{emptyText || 'No events nearby yet.'}</p>
      </div>
    )
  }
  return groupByDay(events).map((g) => (
    <section key={g.key} aria-label={g.label}>
      <h2 className="cal-day">{g.label}</h2>
      {g.events.map((ev) => <CalendarEventCard key={ev.id} ev={ev} newTab={newTab} />)}
    </section>
  ))
}
