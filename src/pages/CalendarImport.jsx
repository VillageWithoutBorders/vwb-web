import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { VISIBILITY, placeFromZip } from '../utils/calendar'
import { parseIcs } from '../utils/icsParse'

const VWB_HOST = 'vwb'
const MAX_IMPORT = 100

function when(ev) {
  const d = new Date(ev.startsAt)
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  if (ev.allDay) return day + ' (all day)'
  return day + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// One-way copy of events from another calendar (Google, Apple, Outlook,
// Facebook) using the calendar file (.ics) they export. Nothing stays
// connected: it copies once, and the events are then ordinary VWB events.
export default function CalendarImport() {
  const navigate = useNavigate()
  const { user, isAdmin, organizations } = useAuth()

  const hostOrgs = organizations.filter((o) => o.role === 'admin' || o.role === 'organizer')
  const hostChoices = [
    ...(isAdmin ? [{ id: VWB_HOST, name: 'Village Without Borders' }] : []),
    ...hostOrgs.map((o) => ({ id: o.id, name: o.name })),
  ]

  const [host, setHost] = useState(hostChoices[0]?.id || '')
  const [zip, setZip] = useState('')
  const [place, setPlace] = useState(null)
  const [zipState, setZipState] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [allAges, setAllAges] = useState(false)
  // Per-event privacy. Anything not listed here uses the setting above.
  const [overrides, setOverrides] = useState({})
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    if (!helpOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setHelpOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [helpOpen])

  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState(null)
  const [dupes, setDupes] = useState(new Set())
  const [picked, setPicked] = useState(new Set())
  const [readError, setReadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  async function changeZip(value) {
    const clean = value.replace(/[^0-9]/g, '').slice(0, 5)
    setZip(clean)
    if (clean.length < 5) { setZipState(''); setPlace(null); return }
    setZipState('looking')
    const found = await placeFromZip(clean)
    if (found) { setPlace({ name: found.name, lat: found.lat, lng: found.lng }); setZipState('') } else { setPlace(null); setZipState('notfound') }
  }

  async function changeHost(value) {
    setHost(value)
    if (value === VWB_HOST && visibility === 'members') setVisibility('public')
    if (value === VWB_HOST) setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== 'members')))
    if (parsed) {
      const dup = await findDuplicates(parsed.events, value)
      setDupes(dup)
      setPicked((prev) => new Set([...prev].filter((k) => !dup.has(k))))
    }
  }

  // Marks events already on this calendar (same name, same start) so a
  // second import never doubles anything up.
  async function findDuplicates(events, hostId) {
    if (events.length === 0) return new Set()
    const first = events[0].startsAt
    const last = events[events.length - 1].startsAt
    let q = supabase.from('calendar_events').select('title, starts_at').gte('starts_at', first).lte('starts_at', last).limit(1000)
    q = hostId === VWB_HOST ? q.is('organization_id', null) : q.eq('organization_id', hostId)
    const { data, error: err } = await q
    if (err) { console.error('find duplicates', err); return new Set() }
    const have = new Set((data || []).map((r) => r.title.trim().toLowerCase() + '|' + new Date(r.starts_at).getTime()))
    return new Set(events.filter((e) => have.has(e.title.trim().toLowerCase() + '|' + new Date(e.startsAt).getTime())).map((e) => e.key))
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0]
    setReadError(''); setParsed(null); setDone(null); setError('')
    if (!file) return
    setFileName(file.name)
    if (file.size > 5 * 1024 * 1024) { setReadError('That file is too big. Export a shorter date range and try again.'); return }
    try {
      const text = await file.text()
      if (!/BEGIN:VCALENDAR/i.test(text)) { setReadError("That doesn't look like a calendar file. It should end in .ics."); return }
      const result = parseIcs(text)
      const dup = await findDuplicates(result.events, host)
      setDupes(dup)
      setParsed(result)
      setPicked(new Set(result.events.filter((ev) => !dup.has(ev.key)).slice(0, MAX_IMPORT).map((ev) => ev.key)))
    } catch (err) {
      console.error('read ics', err)
      setReadError("We couldn't read that file. Try exporting it again.")
    }
  }

  function toggle(key) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else if (next.size < MAX_IMPORT) next.add(key)
      return next
    })
  }

  const selectable = useMemo(() => (parsed ? parsed.events.filter((ev) => !dupes.has(ev.key)) : []), [parsed, dupes])

  async function doImport() {
    setError('')
    if (!place) { setError('Enter the zip code where these events happen first.'); return }
    if (picked.size === 0) { setError('Tick at least one event to bring over.'); return }
    setBusy(true)
    const rows = parsed.events.filter((ev) => picked.has(ev.key)).map((ev) => ({
      organization_id: host === VWB_HOST ? null : host,
      created_by: user.id,
      title: ev.title.slice(0, 140),
      description: ev.description ? ev.description.slice(0, 4000) : null,
      starts_at: ev.startsAt,
      ends_at: ev.endsAt,
      location_name: ev.location ? ev.location.slice(0, 200) : null,
      address: null,
      town: place.name,
      latitude: place.lat,
      longitude: place.lng,
      show_radius_miles: 25,
      visibility: overrides[ev.key] || visibility,
      hide_address: false,
      signup_enabled: false,
      signup_limit: null,
      all_ages: allAges,
      teens_can_help: false,
    }))
    let added = 0
    for (let i = 0; i < rows.length; i += 25) {
      const { error: err } = await supabase.from('calendar_events').insert(rows.slice(i, i + 25))
      if (err) {
        console.error('import events', err)
        setBusy(false)
        setError(added > 0
          ? 'Brought in ' + added + ' events, then something went wrong. Reload the calendar and run the import again: events already added are skipped.'
          : "We couldn't bring the events in. Check the details and try again.")
        return
      }
      added += Math.min(25, rows.length - i)
    }
    setBusy(false)
    setDone(added)
    setParsed(null)
  }

  if (hostChoices.length === 0) {
    return (
      <div className="cal-page">
        <h1 style={{ color: '#4ecca3' }}>Bring in events</h1>
        <p>Events can be brought in by organizers of a group that's part of Village Without Borders, and by VWB admins.</p>
        <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={() => navigate('/calendar')}>Back to the calendar</button>
      </div>
    )
  }

  if (done != null) {
    return (
      <div className="cal-page">
        <div className="cal-empty">
          <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }} aria-hidden="true">&#127793;</p>
          <p style={{ fontWeight: 700, color: 'var(--text)' }} role="status">Brought in {done} {done === 1 ? 'event' : 'events'}.</p>
          <p>They're on your calendar now. Open any one to add volunteer sign-ups, hide an address, or fix a detail.</p>
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '48px' }} onClick={() => navigate('/calendar')}>See the calendar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="cal-page">
      <div className="cal-head">
        <h1>Bring in events</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button type="button" className="imp-help-btn" onClick={() => setHelpOpen(true)} aria-label="How bringing in events works" aria-haspopup="dialog">?</button>
          <button type="button" onClick={() => navigate('/calendar')} className="link-button" style={{ minHeight: '44px' }}>Cancel</button>
        </div>
      </div>
      {helpOpen && (
        <div className="imp-modal-back" onClick={() => setHelpOpen(false)}>
          <div className="imp-modal" role="dialog" aria-modal="true" aria-labelledby="imp-help-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="imp-help-title">How to bring in events</h2>
            <p className="cal-sub" style={{ marginTop: 0 }}>You copy events from another calendar, one time. Nothing stays connected.</p>
            <ol>
              <li><strong>Export your calendar.</strong> In Google, Apple, or Outlook, export it as an .ics file. Google on a computer: Settings, Import and export, Export. It gives you a zip, so open it and find the .ics file. Facebook: open the event, tap the three dots, then Add to calendar.</li>
              <li><strong>Choose the file here.</strong> Tap "Choose the .ics file" and pick it. It is read right on your device. Nothing is posted yet.</li>
              <li><strong>Pick who hosts and where.</strong> Choose the host, then type the zip code where the events happen. Wait for the green check and the town name.</li>
              <li><strong>Choose who can see them.</strong> That sets all the events. You can change any single event in the list afterward.</li>
              <li><strong>Tick the events you want.</strong> Past events are left out, and events already on your calendar are greyed out so nothing doubles.</li>
              <li><strong>Tap "Bring in."</strong> Your events show on the calendar right away. Open one to add volunteer sign-ups, hide an address, or fix a detail.</li>
            </ol>
            <p className="cal-sub">Events you bring in are adults 18 and over unless you tick "All ages welcome."</p>
            <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '48px' }} onClick={() => setHelpOpen(false)} autoFocus>Got it</button>
          </div>
        </div>
      )}
      <p className="cal-sub">Copy events from another calendar into Village Without Borders. It copies once, in one direction. Changes you make later on either side do not follow.</p>

      {error && <p className="cal-error" role="alert">{error}</p>}

      <h2 style={{ fontSize: '1.05rem', margin: '1rem 0 0.5rem' }}>1. Get a calendar file</h2>
      <details className="cal-box" style={{ marginTop: 0 }}>
        <summary style={{ minHeight: '44px', display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}>How to get the file from your calendar</summary>
        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.6 }}>
          <li><strong>Google Calendar</strong> (on a computer): Settings, then Import and export, then Export. It downloads a zip. Open it and use the .ics file inside.</li>
          <li><strong>Apple Calendar</strong> (Mac): File, then Export, then Export. Pick your calendar.</li>
          <li><strong>Outlook</strong>: Calendar, then Share or Publish, then save the calendar as an .ics file.</li>
          <li><strong>Facebook</strong>: open the event, tap the three dots, choose Add to calendar or Export event, and save the .ics file.</li>
        </ul>
      </details>
      <div className="form-field">
        <label htmlFor="imp-file">Choose the .ics file</label>
        <input id="imp-file" type="file" accept=".ics,text/calendar" onChange={onFile} style={{ minHeight: '44px' }} />
        {fileName && !readError && <span className="field-hint">{fileName}</span>}
      </div>
      {readError && <p className="cal-error" role="alert">{readError}</p>}

      <h2 style={{ fontSize: '1.05rem', margin: '1.25rem 0 0.5rem' }}>2. How they should show up</h2>
      {hostChoices.length > 1 && (
        <div className="form-field">
          <label htmlFor="imp-host">Who's hosting these?</label>
          <select id="imp-host" value={host} onChange={(e) => changeHost(e.target.value)}>
            {hostChoices.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
      )}
      <div className="form-field">
        <label htmlFor="imp-zip">Zip code where they happen</label>
        <input id="imp-zip" type="text" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]*" maxLength={5} value={zip} onChange={(e) => changeZip(e.target.value)} placeholder="12345" aria-describedby="imp-zip-note" />
        <p id="imp-zip-note" className={'evt-zip-note' + (zipState === 'notfound' ? ' is-error' : '')} role="status">
          {zipState === 'looking' && 'Looking it up...'}
          {zipState === 'notfound' && "We couldn't find that zip code. Check it and try again."}
          {!zipState && place && <>&#10003; {place.name}. All the events in this file are placed here. You can change one later by editing it.</>}
          {!zipState && !place && 'One zip for the whole file. The calendar uses it to show the town and reach people nearby.'}
        </p>
      </div>

      <h3 style={{ fontSize: '1rem', margin: '0.75rem 0 0.25rem' }}>Who can see them?</h3>
      <p className="cal-sub" style={{ marginTop: 0 }}>This sets every event. You can change one event at a time in step 3.</p>
      {Object.entries(VISIBILITY).map(([key, v]) => {
        const disabled = key === 'members' && host === VWB_HOST
        return (
          <label key={key} className={'cal-choice' + (visibility === key ? ' is-on' : '') + (disabled ? ' is-disabled' : '')}>
            <input type="radio" name="imp-visibility" value={key} checked={visibility === key} disabled={disabled} onChange={() => setVisibility(key)} />
            <span>{v.label}<small>{disabled ? 'Only for events hosted by a group.' : v.desc}</small></span>
          </label>
        )
      })}
      <label className={'cal-choice' + (allAges ? ' is-on' : '')}>
        <input type="checkbox" checked={allAges} onChange={(e) => setAllAges(e.target.checked)} />
        <span>All ages welcome
          <small>Leave this off and they show as adults 18 and over. You can change one event at a time later.</small>
        </span>
      </label>

      {parsed && (
        <>
          <h2 style={{ fontSize: '1.05rem', margin: '1.25rem 0 0.5rem' }}>3. Pick what to bring in</h2>
          {parsed.events.length === 0 ? (
            <p className="cal-sub">No upcoming events in that file{parsed.skippedPast ? ' (' + parsed.skippedPast + ' past ' + (parsed.skippedPast === 1 ? 'one was' : 'ones were') + ' left out)' : ''}.</p>
          ) : (
            <>
              <p className="cal-sub" role="status">
                {picked.size} of {selectable.length} ticked.
                {parsed.skippedPast > 0 && ' ' + parsed.skippedPast + ' past ' + (parsed.skippedPast === 1 ? 'event is' : 'events are') + ' left out.'}
                {dupes.size > 0 && ' ' + dupes.size + ' already on your calendar.'}
                {parsed.repeating > 0 && ' Repeating events are listed one date at a time, up to a year ahead.'}
              </p>
              <div className="cal-actions" style={{ flexDirection: 'row', gap: '0.5rem' }}>
                <button type="button" className="btn btn-outline" style={{ minHeight: '44px', flex: 1 }} onClick={() => setPicked(new Set(selectable.slice(0, MAX_IMPORT).map((e) => e.key)))}>Tick all</button>
                <button type="button" className="btn btn-outline" style={{ minHeight: '44px', flex: 1 }} onClick={() => setPicked(new Set())}>Clear</button>
              </div>
              {selectable.length > MAX_IMPORT && <p className="cal-sub">You can bring in up to {MAX_IMPORT} at a time. Run the import again for the rest.</p>}
              <div style={{ marginTop: '0.5rem' }}>
                {parsed.events.map((ev) => {
                  const isDupe = dupes.has(ev.key)
                  return (
                    <div key={ev.key}>
                      <label className={'cal-choice' + (picked.has(ev.key) ? ' is-on' : '') + (isDupe ? ' is-disabled' : '')} style={picked.has(ev.key) ? { marginBottom: '0.25rem' } : undefined}>
                        <input type="checkbox" checked={picked.has(ev.key)} disabled={isDupe} onChange={() => toggle(ev.key)} />
                        <span>{ev.title}
                          <small>{when(ev)}{ev.location ? ' · ' + ev.location : ''}{isDupe ? ' · Already on your calendar' : ''}</small>
                        </span>
                      </label>
                      {picked.has(ev.key) && (
                        <div className="form-field" style={{ margin: '0 0 0.75rem 0.5rem' }}>
                          <label htmlFor={'imp-vis-' + ev.key} style={{ fontSize: '0.85rem' }}>Who can see this one?</label>
                          <select id={'imp-vis-' + ev.key} value={overrides[ev.key] || ''} onChange={(e) => setOverrides((o) => { const n = { ...o }; if (e.target.value) n[ev.key] = e.target.value; else delete n[ev.key]; return n })}>
                            <option value="">Same as above ({VISIBILITY[visibility].label})</option>
                            {Object.entries(VISIBILITY).map(([k, v]) => <option key={k} value={k} disabled={k === 'members' && host === VWB_HOST}>{v.label}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {parsed.events.some((e) => e.allDay) && <p className="cal-sub">All-day events come in starting at 12:00 AM. Edit them afterward to set a time.</p>}
              <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '48px', marginTop: '1rem' }} onClick={doImport} disabled={busy}>
                {busy ? 'Bringing them in...' : 'Bring in ' + picked.size + (picked.size === 1 ? ' event' : ' events')}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
