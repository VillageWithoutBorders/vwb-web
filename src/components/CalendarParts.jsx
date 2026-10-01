import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DISTANCE_OPTIONS, groupByDay, timeRange, VISIBILITY, placeFromZip } from '../utils/calendar'
import { getCurrentPosition } from '../utils/location'

// Where to look: a zip code (any US zip), "Use my location" (this visit
// only), or "Back to my area" (the member's saved area), plus how far.
// `origin` is null when we don't know the person's area yet: then every
// event shows, with a nudge to choose. No place is ever assumed.
// Used by the app calendar and the website one (no `homeArea` there).
export function CalendarLocationBar({ origin, onOriginChange, miles, onMilesChange, homeArea }) {
  const [zip, setZip] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')

  async function useZip(e) {
    e.preventDefault()
    const clean = zip.replace(/[^0-9]/g, '')
    if (clean.length !== 5) { setNote('Enter a 5-digit zip code.'); return }
    setBusy('zip'); setNote('')
    const place = await placeFromZip(clean)
    setBusy('')
    if (!place) { setNote("We couldn't find that zip code. Check it and try again."); return }
    setZip('')
    onOriginChange(place)
  }

  async function useMyLocation() {
    setBusy('me'); setNote('')
    const loc = await getCurrentPosition()
    setBusy('')
    if (!loc) { setNote("We couldn't get your location. Enter a zip code instead."); return }
    onOriginChange({ name: 'your current location', lat: loc.lat, lng: loc.lng, kind: 'me' })
  }

  return (
    <div className="cal-location">
      <p className="cal-near" role="status">
        {origin ? <>Showing events near <strong>{origin.name}</strong></> : "Showing every event. Choose your area to see what's close to you."}
      </p>
      <form className="cal-zip-form" onSubmit={useZip} noValidate>
        <label htmlFor="cal-zip">{origin ? 'Look somewhere else (zip code)' : 'Your zip code'}</label>
        <div className="cal-zip-row">
          <input id="cal-zip" type="text" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]*" maxLength={5} value={zip} onChange={(e) => { setZip(e.target.value.replace(/[^0-9]/g, '')); setNote('') }} placeholder="12345" aria-describedby={note ? 'cal-zip-note' : undefined} />
          <button type="submit" className="btn btn-primary" disabled={busy === 'zip'}>{busy === 'zip' ? '...' : 'Go'}</button>
        </div>
      </form>
      {note && <p id="cal-zip-note" className="cal-error" role="alert">{note}</p>}
      <div className="cal-loc-actions">
        <button type="button" className="btn btn-outline" onClick={useMyLocation} disabled={busy === 'me'}>{busy === 'me' ? 'Finding you...' : 'Use my location'}</button>
        {homeArea && origin?.kind !== 'area' && (
          <button type="button" className="btn btn-outline" onClick={() => onOriginChange(homeArea)}>Back to my area</button>
        )}
      </div>
      {origin && (
        <label className="cal-within">
          Within
          <select value={miles} onChange={(e) => onMilesChange(Number(e.target.value))} aria-label="How far you can travel">
            {DISTANCE_OPTIONS.map((m) => <option key={m} value={m}>{m} miles</option>)}
          </select>
        </label>
      )}
    </div>
  )
}

// Lets anyone, including teens looking around without an account, hide
// the adults-only events.
export function AllAgesFilter({ checked, onChange }) {
  return (
    <label className={'cal-choice' + (checked ? ' is-on' : '')}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>Show only events open to all ages
        <small>Accounts are for adults 18 and over. Anyone can look at the calendar.</small>
      </span>
    </label>
  )
}

function badges(ev) {
  const out = []
  if (ev.status === 'cancelled') out.push(['Cancelled', 'cal-badge-off'])
  if (ev.visibility === 'account') out.push([VISIBILITY.account.label, 'cal-badge-private'])
  if (ev.visibility === 'members') out.push([VISIBILITY.members.label, 'cal-badge-private'])
  if (ev.visibility === 'invite') out.push([VISIBILITY.invite.label, 'cal-badge-private'])
  if (ev.all_ages) out.push(['All ages', ''])
  else if (ev.status !== 'cancelled') out.push(['Adults 18+', ''])
  if (ev.teens_can_help) out.push(['Teens can help with a parent', ''])
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
