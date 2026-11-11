import Icon from './Icon'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DISTANCE_OPTIONS, groupByDay, hasEnded, timeRange, dayLabel, VISIBILITY, placeFromZip } from '../utils/calendar'
import { useWideScreen } from '../hooks/useWideScreen'
import { t as tr, useT, getLang } from '../utils/lang'

// Nov 9: month and day names follow the app language, not the browser's.
function dateLoc() { return getLang() === 'es' ? 'es-US' : undefined }

// Where to look: a zip code (any US zip), "Use my location" (this visit
// only), or "Back to my area" (the member's saved area), plus how far.
// `origin` is null when we don't know the person's area yet: then every
// event shows, with a nudge to choose. No place is ever assumed.
// Used by the app calendar and the website one (no `homeArea` there).
export function CalendarLocationBar({ origin, onOriginChange, miles, onMilesChange, homeArea }) {
  const t = useT()
  const [zip, setZip] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  // Once a place is set, the zip box, location button and distance fold away
  // behind "Change place" so the events show sooner on a phone.
  const [open, setOpen] = useState(false)
  const showForm = !origin || open

  async function useZip(e) {
    e.preventDefault()
    const clean = zip.replace(/[^0-9]/g, '')
    if (clean.length !== 5) { setNote(t('Enter a 5-digit zip code.')); return }
    setBusy('zip'); setNote('')
    const place = await placeFromZip(clean)
    setBusy('')
    if (!place) { setNote(t("We couldn't find that zip code. Check it and try again.")); return }
    setZip('')
    setOpen(false)
    onOriginChange(place)
  }

  return (
    <div className="cal-location">
      <div className={'cal-found' + (origin && busy !== 'zip' ? ' is-set' : '')} role="status" aria-live="polite">
        {busy === 'zip'
          ? t('Looking up that zip code...')
          : origin
            ? <><span aria-hidden="true">&#10003; </span>{t('Location set:')} <strong>{origin.name}{origin.zip ? ' (' + origin.zip + ')' : ''}</strong>. {t('Showing events within {n} miles.', { n: miles })}</>
            : t('No location set yet, so you only see online events. Enter a zip code to see events near you.')}
        {origin && origin.kind === 'zip' && !homeArea && (
          <button type="button" className="link-button" style={{ minHeight: '44px', marginLeft: '0.5rem' }} onClick={() => onOriginChange(null)}>{t('Clear')}</button>
        )}
        {origin && busy !== 'zip' && (
          <button type="button" className="cal-change" aria-expanded={open} aria-controls="cal-place-form" onClick={() => setOpen((v) => !v)}>
            {open ? t('Done') : t('Change place or distance')}
          </button>
        )}
      </div>
      {showForm && <div id="cal-place-form">
      <form className="cal-zip-form" onSubmit={useZip} noValidate>
        <label htmlFor="cal-zip">{origin ? t('Look somewhere else (zip code)') : t('Your zip code')}</label>
        <div className="cal-zip-row">
          <input id="cal-zip" type="text" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]*" maxLength={5} value={zip} onChange={(e) => { setZip(e.target.value.replace(/[^0-9]/g, '')); setNote('') }} placeholder={t('Example: 30736')} aria-describedby={note ? 'cal-zip-note' : undefined} />
          <button type="submit" className="btn btn-primary" disabled={busy === 'zip'}>{busy === 'zip' ? t('Looking...') : t('Go')}</button>
        </div>
      </form>
      {note && <p id="cal-zip-note" className="cal-error" role="alert">{note}</p>}
      <div className="cal-loc-actions">
        {homeArea && origin?.kind !== 'area' && (
          <button type="button" className="btn btn-outline" onClick={() => onOriginChange(homeArea)}>{t('Back to my area')}</button>
        )}
      </div>
      {origin && (
        <label className="cal-within">
          {t('Within')}
          <select value={miles} onChange={(e) => onMilesChange(Number(e.target.value))} aria-label={t('How far you can travel')}>
            {DISTANCE_OPTIONS.map((m) => <option key={m} value={m}>{t('{n} miles', { n: m })}</option>)}
          </select>
        </label>
      )}
      </div>}
    </div>
  )
}

// Lets anyone, including teens looking around without an account, hide
// the adults-only events.
export function AllAgesFilter({ checked, onChange }) {
  const t = useT()
  return (
    <label className={'cal-choice' + (checked ? ' is-on' : '')}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{t('Show only events open to all ages')}
        <small>{t('Accounts are for adults 18 and over. Anyone can look at the calendar.')}</small>
      </span>
    </label>
  )
}

function badges(ev) {
  const out = []
  if (ev.status === 'cancelled') out.push([tr('Cancelled'), 'cal-badge-off'])
  else if (hasEnded(ev)) out.push([tr('Ended'), 'cal-badge-ended'])
  if (ev.visibility === 'account') out.push([tr(VISIBILITY.account.label), 'cal-badge-private'])
  if (ev.visibility === 'members') out.push([tr(VISIBILITY.members.label), 'cal-badge-private'])
  if (ev.visibility === 'invite') out.push([tr(VISIBILITY.invite.label), 'cal-badge-private'])
  if (ev.visibility === 'affiliates') out.push([tr(VISIBILITY.affiliates.label), 'cal-badge-private'])
  if (ev.is_online) out.push([tr('Online'), ''])
  if (ev.all_ages) out.push([tr('All ages'), ''])
  else if (ev.status !== 'cancelled' && !hasEnded(ev)) out.push([tr('Adults 18+'), ''])
  if (ev.teens_can_help) out.push([tr('Teens can help with a parent'), ''])
  if (ev.is_signed_up) out.push([tr("You're signed up"), ''])
  else if (ev.signup_enabled && ev.status !== 'cancelled') {
    const full = ev.signup_limit != null && ev.signup_count >= ev.signup_limit
    out.push(full ? [tr('Spots full'), 'cal-badge-warn'] : [tr('Volunteers needed'), ''])
  }
  return out
}

// showDate (Oct 28): lists with no day headings above them (like Coming up) show the day too.
export function CalendarEventCard({ ev, newTab, showDate }) {
  const t = useT()
  const where = ev.is_online ? t('Online') : [ev.town, ev.miles != null ? (ev.miles < 1 ? t('nearby') : t('{n} mi away', { n: Math.round(ev.miles) })) : null].filter(Boolean).join(' · ')
  const inner = (
    <>
      <span className="cal-card-time">{showDate && <span className="cal-card-day">{dayLabel(ev.starts_at)}</span>}{timeRange(ev)}</span>
      <span className="cal-card-title">{ev.title}</span>
      <span className="cal-card-meta">
        {ev.organization_name || 'Village Without Borders'}{ev.organization_name && ev.partner_names && ev.partner_names.length ? ' ' + t('with') + ' ' + ev.partner_names.join(', ') : ''}{where ? ' · ' + where : ''}
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
  const t = useT()
  if (events.length === 0) {
    return (
      <div className="cal-empty">
        <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }} aria-hidden="true"><Icon name="sprout" /></p>
        <p style={{ margin: 0 }}>{emptyText || t('No events nearby yet.')}</p>
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

export function dayKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

// A normal month calendar. Tap a day to see its events underneath.
// Oct 28: on the wide Calendar page the day's events show in the right panel
// instead (hideDay, with picked and onPick), so the left side doesn't grow.
export function CalendarMonth({ events, newTab, picked: pickedProp, onPick, hideDay = false }) {
  const t = useT()
  const today = new Date()
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [pickedOwn, setPickedOwn] = useState(() => dayKey(today))
  const picked = pickedProp || pickedOwn
  function setPicked(k) {
    setPickedOwn(k)
    if (onPick) onPick(k)
  }

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
        <button type="button" className="cal-month-nav" onClick={() => move(-1)} aria-label={t('Previous month')}>&#8249;</button>
        <h2 className="cal-month-title" aria-live="polite">{month.toLocaleDateString(dateLoc(), { month: 'long', year: 'numeric' })}</h2>
        <button type="button" className="cal-month-nav" onClick={() => move(1)} aria-label={t('Next month')}>&#8250;</button>
      </div>
      <div className="cal-month-grid" role="group" aria-label={t('Month')}>
        {WEEKDAYS.map((w) => <div key={w} className="cal-month-wd" aria-hidden="true">{t(w)}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={'b' + i} className="cal-month-blank" />
          const k = dayKey(d)
          const list = byDay[k] || []
          const cls = 'cal-month-day' + (k === picked ? ' is-picked' : '') + (k === dayKey(today) ? ' is-today' : '') + (list.length ? ' has-events' : '') + (list.length && list.every(hasEnded) ? ' has-ended-only' : '')
          const label = d.toLocaleDateString(dateLoc(), { month: 'long', day: 'numeric' }) + ', ' + (list.length === 0 ? t('no events') : t(list.length === 1 ? '1 event' : '{n} events', { n: list.length }))
          return (
            <button key={k} type="button" className={cls} onClick={() => setPicked(k)} aria-label={label} aria-pressed={k === picked}>
              <span className="cal-month-num">{d.getDate()}</span>
              {list.length > 0 && <span className="cal-month-dots" aria-hidden="true">{list.slice(0, 3).map((e) => <i key={e.id} />)}{list.length > 3 ? '+' : ''}</span>}
            </button>
          )
        })}
      </div>
      <p className="cal-month-today"><button type="button" className="link-button" style={{ minHeight: '44px' }} onClick={goToday}>{t('Jump to today')}</button></p>
      {!hideDay && (<>
        <h2 className="cal-day">{pickedDate.toLocaleDateString(dateLoc(), { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
        {dayEvents.length === 0
          ? <p className="cal-sub">{t('Nothing on this day.')}</p>
          : dayEvents.map((ev) => <CalendarEventCard key={ev.id} ev={ev} newTab={newTab} />)}
      </>)}
    </div>
  )
}

// One day's events, for the right panel on the wide Calendar page.
export function CalendarDay({ day, events, newTab }) {
  const t = useT()
  const list = events.filter((ev) => dayKey(new Date(ev.starts_at)) === day)
  const date = new Date(day + 'T00:00:00')
  return (
    <section className="cal-picked-day" aria-live="polite">
      <h2 className="cal-day">{date.toLocaleDateString(dateLoc(), { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
      {list.length === 0
        ? <p className="cal-sub">{t('Nothing on this day.')}</p>
        : list.map((ev) => <CalendarEventCard key={ev.id} ev={ev} newTab={newTab} />)}
    </section>
  )
}

// Month calendar by default, with a switch to the plain list.
export function CalendarView({ events, newTab, emptyText, belowTabs = null, mode: modeProp, onMode }) {
  const t = useT()
  const [modeOwn, setModeOwn] = useState('list')
  // Round D (Nov 10): the Calendar page can hold List / Month itself, beside its title.
  const mode = modeProp || modeOwn
  const setMode = onMode || setModeOwn
  const wide = useWideScreen()
  const upcoming = events.filter((e) => !hasEnded(e)).length
  return (
    <>
      {/* Round D (Nov 10, Jade): one empty message (emptyText), not two. */}
      {upcoming > 0 && <p className="cal-sub" role="status">{t(upcoming === 1 ? '1 upcoming event found.' : '{n} upcoming events found.', { n: upcoming })}</p>}
      {/* Oct 28 (Jade): on a computer, the month and the list sit side by side, two even halves. */}
      {wide ? (
        <>
          {belowTabs}
          <div className="cal-two">
            <section aria-label={t('Month')}><CalendarMonth events={events} newTab={newTab} /></section>
            <section aria-label={t('List')}><CalendarEventList events={events.filter((e) => !hasEnded(e))} newTab={newTab} emptyText={emptyText} /></section>
          </div>
        </>
      ) : (<>
      {!onMode && <CalendarModeSwitch mode={mode} onMode={setMode} />}
      {belowTabs}
      {mode === 'month'
        ? <CalendarMonth events={events} newTab={newTab} />
        : <CalendarEventList events={events.filter((e) => !hasEnded(e))} newTab={newTab} emptyText={emptyText} />}
      </>)}
    </>
  )
}

// List or Month (phones). The Calendar page shows it beside its title (Round D, Nov 10).
export function CalendarModeSwitch({ mode, onMode }) {
  const t = useT()
  return (
    <div className="cal-mode" role="group" aria-label={t('How to show events')}>
      <button type="button" className={mode === 'list' ? 'is-on' : ''} aria-pressed={mode === 'list'} onClick={() => onMode('list')}>{t('List')}</button>
      <button type="button" className={mode === 'month' ? 'is-on' : ''} aria-pressed={mode === 'month'} onClick={() => onMode('month')}>{t('Month')}</button>
    </div>
  )
}
