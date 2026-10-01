import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DISTANCE_OPTIONS, groupByDay, hasEnded, timeRange, VISIBILITY, placeFromZip } from '../utils/calendar'
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
      <div className={'cal-found' + (origin && busy !== 'zip' ? ' is-set' : '')} role="status" aria-live="polite">
        {busy === 'zip'
          ? 'Looking up that zip code...'
          : origin
            ? <><span aria-hidden="true">&#10003; </span>Location set: <strong>{origin.name}{origin.zip ? ' (' + origin.zip + ')' : ''}</strong>. Showing events within {miles} miles.</>
            : "No location set yet, so you only see online events. Enter a zip code to see events near you."}
        {origin && origin.kind === 'zip' && !homeArea && (
          <button type="button" className="link-button" style={{ minHeight: '44px', marginLeft: '0.5rem' }} onClick={() => onOriginChange(null)}>Clear</button>
        )}
      </div>
      <form className="cal-zip-form" onSubmit={useZip} noValidate>
        <label htmlFor="cal-zip">{origin ? 'Look somewhere else (zip code)' : 'Your zip code'}</label>
        <div className="cal-zip-row">
          <input id="cal-zip" type="text" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]*" maxLength={5} value={zip} onChange={(e) => { setZip(e.target.value.replace(/[^0-9]/g, '')); setNote('') }} placeholder="12345" aria-describedby={note ? 'cal-zip-note' : undefined} />
          <button type="submit" className="btn btn-primary" disabled={busy === 'zip'}>{busy === 'zip' ? 'Looking...' : 'Go'}</button>
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
  else if (hasEnded(ev)) out.push(['Ended', 'cal-badge-ended'])
  if (ev.visibility === 'account') out.push([VISIBILITY.account.label, 'cal-badge-private'])
  if (ev.visibility === 'members') out.push([VISIBILITY.members.label, 'cal-badge-private'])
  if (ev.visibility === 'invite') out.push([VISIBILITY.invite.label, 'cal-badge-private'])
  if (ev.visibility === 'affiliates') out.push([VISIBILITY.affiliates.label, 'cal-badge-private'])
  if (ev.is_online) out.push(['Online', ''])
  if (ev.all_ages) out.push(['All ages', ''])
  else if (ev.status !== 'cancelled' && !hasEnded(ev)) out.push(['Adults 18+', ''])
  if (ev.teens_can_help) out.push(['Teens can help with a parent', ''])
  if (ev.is_signed_up) out.push(["You're signed up", ''])
  else if (ev.signup_enabled && ev.status !== 'cancelled') {
    const full = ev.signup_limit != null && ev.signup_count >= ev.signup_limit
    out.push(full ? ['Spots full', 'cal-badge-warn'] : ['Volunteers needed', ''])
  }
  return out
}

export function CalendarEventCard({ ev, newTab }) {
  const where = ev.is_online ? 'Online' : [ev.town, ev.miles != null ? (ev.miles < 1 ? 'nearby' : Math.round(ev.miles) + ' mi away') : null].filter(Boolean).join(' · ')
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
    return <a className={'cal-card' + (hasEnded(ev) ? ' is-ended' : '')} href={'/events/' + ev.id} target="_blank" rel="noopener noreferrer">{inner}</a>
  }
  return <Link className={'cal-card' + (hasEnded(ev) ? ' is-ended' : '')} to={'/events/' + ev.id}>{inner}</Link>
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

// A normal month calendar. Tap a day to see its events underneath.
function CalendarMonth({ events, newTab }) {
  const today = new Date()
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [picked, setPicked] = useState(() => dayKey(today))

  const byDay = {}
  for (const ev of events) {
    const k = dayKey(new Date(ev.starts_at))
    ;(byDay[k] = byDay[k] || []).push(ev)
  }

  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < first.getDay(); i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d))

  function move(delta) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1)
    setMonth(next)
    setPicked(dayKey(next.getMonth() === today.getMonth() && next.getFullYear() === today.getFullYear() ? today : next))
  }

  function goToday() {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    setPicked(dayKey(today))
  }

  const dayEvents = byDay[picked] || []
  const pickedDate = new Date(picked + 'T00:00:00')

  return (
    <div className="cal-month">
      <div className="cal-month-head">
        <button type="button" className="cal-month-nav" onClick={() => move(-1)} aria-label="Previous month">&#8249;</button>
        <h2 className="cal-month-title" aria-live="polite">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button type="button" className="cal-month-nav" onClick={() => move(1)} aria-label="Next month">&#8250;</button>
      </div>
      <div className="cal-month-grid" role="grid" aria-label="Month">
        {WEEKDAYS.map((w) => <div key={w} className="cal-month-wd" role="columnheader">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={'b' + i} className="cal-month-blank" />
          const k = dayKey(d)
          const list = byDay[k] || []
          const cls = 'cal-month-day' + (k === picked ? ' is-picked' : '') + (k === dayKey(today) ? ' is-today' : '') + (list.length ? ' has-events' : '') + (list.length && list.every(hasEnded) ? ' has-ended-only' : '')
          const label = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) + ', ' + (list.length === 0 ? 'no events' : list.length + (list.length === 1 ? ' event' : ' events'))
          return (
            <button key={k} type="button" className={cls} onClick={() => setPicked(k)} aria-label={label} aria-pressed={k === picked}>
              <span className="cal-month-num">{d.getDate()}</span>
              {list.length > 0 && <span className="cal-month-dots" aria-hidden="true">{list.slice(0, 3).map((e) => <i key={e.id} />)}{list.length > 3 ? '+' : ''}</span>}
            </button>
          )
        })}
      </div>
      <p className="cal-month-today"><button type="button" className="link-button" style={{ minHeight: '44px' }} onClick={goToday}>Jump to today</button></p>
      <h2 className="cal-day">{pickedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
      {dayEvents.length === 0
        ? <p className="cal-sub">Nothing on this day.</p>
        : dayEvents.map((ev) => <CalendarEventCard key={ev.id} ev={ev} newTab={newTab} />)}
    </div>
  )
}

// Month calendar by default, with a switch to the plain list.
export function CalendarView({ events, newTab, emptyText }) {
  const [mode, setMode] = useState('month')
  const upcoming = events.filter((e) => !hasEnded(e)).length
  return (
    <>
      <p className="cal-sub" role="status">{upcoming === 0 ? 'No upcoming events found for this search. Try more miles.' : upcoming + (upcoming === 1 ? ' upcoming event found.' : ' upcoming events found.')}</p>
      <div className="cal-mode" role="group" aria-label="How to show events">
        <button type="button" className={mode === 'month' ? 'is-on' : ''} aria-pressed={mode === 'month'} onClick={() => setMode('month')}>Month</button>
        <button type="button" className={mode === 'list' ? 'is-on' : ''} aria-pressed={mode === 'list'} onClick={() => setMode('list')}>List</button>
      </div>
      {mode === 'month'
        ? <CalendarMonth events={events} newTab={newTab} />
        : <CalendarEventList events={events.filter((e) => !hasEnded(e))} newTab={newTab} emptyText={emptyText} />}
    </>
  )
}
