import Icon from '../components/Icon'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { VISIBILITY, placeFromZip } from '../utils/calendar'
import { parseIcs } from '../utils/icsParse'
import { useT, t as tNow } from '../utils/lang'

const VWB_HOST = 'vwb'
const MAX_IMPORT = 100

function when(ev) {
  const d = new Date(ev.startsAt)
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  if (ev.allDay) return day + ' ' + tNow('(all day)')
  return day + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// One-way copy of events from another calendar (Google, Apple, Outlook,
// Facebook) using the calendar file (.ics) they export. Nothing stays
// connected: it copies once, and the events are then ordinary VWB events.
export default function CalendarImport() {
  const navigate = useNavigate()
  const t = useT()
  const [searchParams] = useSearchParams()
  const { user, isAdmin, organizations } = useAuth()

  const hostOrgs = organizations.filter((o) => o.role === 'admin' || o.role === 'organizer')
  const hostChoices = [
    ...(isAdmin ? [{ id: VWB_HOST, name: 'Village Without Borders' }] : []),
    ...hostOrgs.map((o) => ({ id: o.id, name: o.name })),
  ]

  // Council-wide only shows for a council host, like the event form (Oct 28).
  const [umbrellaIds, setUmbrellaIds] = useState([])
  const hostIdsKey = hostOrgs.map((o) => o.id).join(',')
  useEffect(() => {
    if (!hostIdsKey) return
    supabase.from('organizations').select('id').eq('is_umbrella', true).in('id', hostIdsKey.split(','))
      .then(({ data, error: err }) => {
        if (err) { console.error('[CalendarImport] council check failed:', err); return }
        setUmbrellaIds((data || []).map((o) => o.id))
      })
  }, [hostIdsKey])

  const orgParam = searchParams.get('org')
  const [host, setHost] = useState(hostChoices.some((h) => h.id === orgParam) ? orgParam : (hostChoices[0]?.id || ''))
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
    if (!umbrellaIds.includes(value) && visibility === 'affiliates') setVisibility('public')
    setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => !(v === 'members' && value === VWB_HOST) && !(v === 'affiliates' && !umbrellaIds.includes(value)))))
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
    if (file.size > 5 * 1024 * 1024) { setReadError(t('That file is too big. Export a shorter date range and try again.')); return }
    try {
      const text = await file.text()
      if (!/BEGIN:VCALENDAR/i.test(text)) { setReadError(t("That doesn't look like a calendar file. It should end in .ics.")); return }
      const result = parseIcs(text)
      const dup = await findDuplicates(result.events, host)
      setDupes(dup)
      setParsed(result)
      setPicked(new Set(result.events.filter((ev) => !dup.has(ev.key)).slice(0, MAX_IMPORT).map((ev) => ev.key)))
    } catch (err) {
      console.error('read ics', err)
      setReadError(t("We couldn't read that file. Try exporting it again."))
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
    const needsZip = parsed.events.some((ev) => picked.has(ev.key) && !ev.online)
    if (needsZip && !place) { setError(t('Enter the zip code where these events happen first.')); return }
    if (picked.size === 0) { setError(t('Tick at least one event to bring over.')); return }
    setBusy(true)
    const rows = parsed.events.filter((ev) => picked.has(ev.key)).map((ev) => ({
      organization_id: host === VWB_HOST ? null : host,
      created_by: user.id,
      title: ev.title.slice(0, 140),
      description: ev.description ? ev.description.slice(0, 4000) : null,
      starts_at: ev.startsAt,
      ends_at: ev.endsAt,
      location_name: !ev.online && ev.location ? ev.location.slice(0, 200) : null,
      address: null,
      town: ev.online ? null : place.name,
      latitude: ev.online ? null : place.lat,
      longitude: ev.online ? null : place.lng,
      show_radius_miles: 25,
      visibility: overrides[ev.key] || visibility,
      hide_address: false,
      signup_enabled: false,
      signup_limit: null,
      all_ages: allAges,
      teens_can_help: false,
      is_online: !!ev.online,
      online_link: ev.online && ev.link ? ev.link.slice(0, 500) : null,
    }))
    let added = 0
    for (let i = 0; i < rows.length; i += 25) {
      const { error: err } = await supabase.from('calendar_events').insert(rows.slice(i, i + 25))
      if (err) {
        console.error('import events', err)
        setBusy(false)
        setError(added > 0
          ? t('Brought in {n} events, then something went wrong. Reload the calendar and run the import again: events already added are skipped.', { n: added })
          : t("We couldn't bring the events in. Check the details and try again."))
        return
      }
      added += Math.min(25, rows.length - i)
    }
    setBusy(false)
    setDone(added)
    setParsed(null)
  }

  const visChoices = Object.entries(VISIBILITY).filter(([k]) => !(k === 'members' && host === VWB_HOST) && (k !== 'affiliates' || umbrellaIds.includes(host)))

  if (hostChoices.length === 0) {
    return (
      <div className="cal-page">
        <h1 style={{ color: 'var(--accent)' }}>{t('Bring in events')}</h1>
        <p>{t("Events can be brought in by organizers of a group that's part of Village Without Borders, and by VWB admins.")}</p>
        <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={() => navigate('/calendar')}>{t('Back to the calendar')}</button>
      </div>
    )
  }

  if (done != null) {
    return (
      <div className="cal-page">
        <div className="cal-empty">
          <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }} aria-hidden="true"><Icon name="sprout" /></p>
          <p style={{ fontWeight: 700, color: 'var(--text)' }} role="status">{done === 1 ? t('Brought in 1 event.') : t('Brought in {n} events.', { n: done })}</p>
          <p>{t("They're on your calendar now. Open any one to add volunteer sign-ups, hide an address, or fix a detail.")}</p>
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '48px' }} onClick={() => navigate('/calendar')}>{t('See the calendar')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="cal-page">
      <div className="cal-head">
        <h1>{t('Bring in events')}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button type="button" className="imp-help-btn" onClick={() => setHelpOpen(true)} aria-label={t('How bringing in events works')} aria-haspopup="dialog">?</button>
          <button type="button" onClick={() => navigate('/calendar')} className="link-button" style={{ minHeight: '44px' }}>{t('Cancel')}</button>
        </div>
      </div>
      {helpOpen && (
        <div className="imp-modal-back" onClick={() => setHelpOpen(false)}>
          <div className="imp-modal" role="dialog" aria-modal="true" aria-labelledby="imp-help-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="imp-help-title">{t('How to bring in events')}</h2>
            <p className="cal-sub" style={{ marginTop: 0 }}>{t('You copy events from another calendar, one time. Nothing stays connected.')}</p>
            <ol>
              <li><strong>{t("Export your calendar.")}</strong> {t("In Google, Apple, or Outlook, export it as an .ics file. Google on a computer: Settings, Import and export, Export. It gives you a zip, so open it and find the .ics file. Facebook: open the event, tap the three dots, then Add to calendar.")}</li>
              <li><strong>{t("Choose the file here.")}</strong> {t("Tap \"Choose the .ics file\" and pick it. It is read right on your device. Nothing is posted yet.")}</li>
              <li><strong>{t("Pick who hosts and where.")}</strong> {t("Choose the host, then type the zip code where the events happen. Wait for the green check and the town name.")}</li>
              <li><strong>{t("Choose who can see them.")}</strong> {t("That sets all the events. You can change any single event in the list afterward.")}</li>
              <li><strong>{t("Tick the events you want.")}</strong> {t("Past events are left out, and events already on your calendar are greyed out so nothing doubles. Events with a Zoom, Meet, or Teams link are marked Online and show for people everywhere.")}</li>
              <li><strong>{t("Tap \"Bring in.\"")}</strong> {t("Your events show on the calendar right away. Open one to add volunteer sign-ups, hide an address, or fix a detail.")}</li>
            </ol>
            <p className="cal-sub">{t('Events you bring in are adults 18 and over unless you tick "All ages welcome."')}</p>
            <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '48px' }} onClick={() => setHelpOpen(false)} autoFocus>{t('Got it')}</button>
          </div>
        </div>
      )}
      <p className="cal-sub">{t('Copy events from another calendar into Village Without Borders. It copies once, in one direction. Changes you make later on either side do not follow.')}</p>

      {error && <p className="cal-error" role="alert">{error}</p>}

      <h2 style={{ fontSize: '1.05rem', margin: '1rem 0 0.5rem' }}>{t('1. Get a calendar file')}</h2>
      <details className="cal-box" style={{ marginTop: 0 }}>
        <summary style={{ minHeight: '44px', display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}>{t('How to get the file from your calendar')}</summary>
        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.6 }}>
          <li><strong>Google Calendar</strong> {t("(on a computer): Settings, then Import and export, then Export. It downloads a zip. Open it and use the .ics file inside.")}</li>
          <li><strong>Apple Calendar</strong> {t("(Mac): File, then Export, then Export. Pick your calendar.")}</li>
          <li><strong>Outlook</strong>{t(": Calendar, then Share or Publish, then save the calendar as an .ics file.")}</li>
          <li><strong>Facebook</strong>{t(": open the event, tap the three dots, choose Add to calendar or Export event, and save the .ics file.")}</li>
        </ul>
      </details>
      <div className="form-field">
        <label htmlFor="imp-file">{t('Choose the .ics file')}</label>
        <input id="imp-file" type="file" accept=".ics,text/calendar" onChange={onFile} style={{ minHeight: '44px' }} />
        {fileName && !readError && <span className="field-hint">{fileName}</span>}
      </div>
      {readError && <p className="cal-error" role="alert">{readError}</p>}

      <h2 style={{ fontSize: '1.05rem', margin: '1.25rem 0 0.5rem' }}>{t('2. How they should show up')}</h2>
      {hostChoices.length > 1 && (
        <div className="form-field">
          <label htmlFor="imp-host">{t("Who's hosting these?")}</label>
          <select id="imp-host" value={host} onChange={(e) => changeHost(e.target.value)}>
            {hostChoices.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
      )}
      <div className="form-field">
        <label htmlFor="imp-zip">{t('Zip code where they happen')}</label>
        <input id="imp-zip" type="text" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]*" maxLength={5} value={zip} onChange={(e) => changeZip(e.target.value)} placeholder="12345" aria-describedby="imp-zip-note" />
        <p id="imp-zip-note" className={'evt-zip-note' + (zipState === 'notfound' ? ' is-error' : '')} role="status">
          {zipState === 'looking' && t('Looking it up...')}
          {zipState === 'notfound' && t("We couldn't find that zip code. Check it and try again.")}
          {!zipState && place && <>&#10003; {place.name}. {t('All the events in this file are placed here. You can change one later by editing it.')}</>}
          {!zipState && !place && t('One zip for the whole file. The calendar uses it to show the town and reach people nearby. Online events (with a Zoom or Meet link) skip it and show for everyone.')}
        </p>
      </div>

      <h3 style={{ fontSize: '1rem', margin: '0.75rem 0 0.25rem' }}>{t('Who can see them?')}</h3>
      <p className="cal-sub" style={{ marginTop: 0 }}>{t('This sets every event. You can change one event at a time in step 3.')}</p>
      {/* Only the choices that fit this host show (Oct 28). */}
      {visChoices.map(([key, v]) => (
        <label key={key} className={'cal-choice' + (visibility === key ? ' is-on' : '')}>
          <input type="radio" name="imp-visibility" value={key} checked={visibility === key} onChange={() => setVisibility(key)} />
          <span>{t(v.label)}<small>{t(v.desc)}</small></span>
        </label>
      ))}
      <label className={'cal-choice' + (allAges ? ' is-on' : '')}>
        <input type="checkbox" checked={allAges} onChange={(e) => setAllAges(e.target.checked)} />
        <span>{t('All ages welcome')}
          <small>{t('Leave this off and they show as adults 18 and over. You can change one event at a time later.')}</small>
        </span>
      </label>

      {/* Before a file is picked, say what comes next instead of ending the page here. */}
      {!parsed && (
        <>
          <h2 style={{ fontSize: '1.05rem', margin: '1.25rem 0 0.5rem' }}>{t('3. Pick what to bring in')}</h2>
          <p className="cal-sub">{t('Choose your .ics file in step 1. Your events show up here, and you pick which ones to bring in.')}</p>
          <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '48px' }} onClick={() => { const f = document.getElementById('imp-file'); if (f) { f.scrollIntoView({ block: 'center' }); f.focus() } }}>{t('Go to step 1')}</button>
        </>
      )}

      {parsed && (
        <>
          <h2 style={{ fontSize: '1.05rem', margin: '1.25rem 0 0.5rem' }}>{t('3. Pick what to bring in')}</h2>
          {parsed.events.length === 0 ? (
            <p className="cal-sub">{!parsed.skippedPast ? t('No upcoming events in that file.') : parsed.skippedPast === 1 ? t('No upcoming events in that file (1 past one was left out).') : t('No upcoming events in that file ({n} past ones were left out).', { n: parsed.skippedPast })}</p>
          ) : (
            <>
              <p className="cal-sub" role="status">
                {t('{n} of {total} ticked.', { n: picked.size, total: selectable.length })}
                {parsed.skippedPast > 0 && ' ' + (parsed.skippedPast === 1 ? t('1 past event is left out.') : t('{n} past events are left out.', { n: parsed.skippedPast }))}
                {dupes.size > 0 && ' ' + t('{n} already on your calendar.', { n: dupes.size })}
                {parsed.repeating > 0 && ' ' + t('Repeating events are listed one date at a time, up to a year ahead.')}
              </p>
              <div className="cal-actions" style={{ flexDirection: 'row', gap: '0.5rem' }}>
                <button type="button" className="btn btn-outline" style={{ minHeight: '44px', flex: 1 }} onClick={() => setPicked(new Set(selectable.slice(0, MAX_IMPORT).map((e) => e.key)))}>{t('Tick all')}</button>
                <button type="button" className="btn btn-outline" style={{ minHeight: '44px', flex: 1 }} onClick={() => setPicked(new Set())}>{t('Clear')}</button>
              </div>
              {selectable.length > MAX_IMPORT && <p className="cal-sub">{t('You can bring in up to {n} at a time. Run the import again for the rest.', { n: MAX_IMPORT })}</p>}
              <div style={{ marginTop: '0.5rem' }}>
                {parsed.events.map((ev) => {
                  const isDupe = dupes.has(ev.key)
                  return (
                    <div key={ev.key}>
                      <label className={'cal-choice' + (picked.has(ev.key) ? ' is-on' : '') + (isDupe ? ' is-disabled' : '')} style={picked.has(ev.key) ? { marginBottom: '0.25rem' } : undefined}>
                        <input type="checkbox" checked={picked.has(ev.key)} disabled={isDupe} onChange={() => toggle(ev.key)} />
                        <span>{ev.title}
                          <small>{when(ev)}{ev.online ? ' · ' + t('Online') : ev.location ? ' · ' + ev.location : ''}{isDupe ? ' · ' + t('Already on your calendar') : ''}</small>
                        </span>
                      </label>
                      {picked.has(ev.key) && (
                        <div className="form-field" style={{ margin: '0 0 0.75rem 0.5rem' }}>
                          <label htmlFor={'imp-vis-' + ev.key} style={{ fontSize: '0.85rem' }}>{t('Who can see this one?')}</label>
                          <select id={'imp-vis-' + ev.key} value={overrides[ev.key] || ''} onChange={(e) => setOverrides((o) => { const n = { ...o }; if (e.target.value) n[ev.key] = e.target.value; else delete n[ev.key]; return n })}>
                            <option value="">{t('Same as above ({label})', { label: t(VISIBILITY[visibility].label) })}</option>
                            {visChoices.map(([k, v]) => <option key={k} value={k}>{t(v.label)}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {parsed.events.some((e) => e.allDay) && <p className="cal-sub">{t('All-day events come in starting at 12:00 AM. Edit them afterward to set a time.')}</p>}
              <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '48px', marginTop: '1rem' }} onClick={doImport} disabled={busy}>
                {busy ? t('Bringing them in...') : picked.size === 1 ? t('Bring in 1 event') : t('Bring in {n} events', { n: picked.size })}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
