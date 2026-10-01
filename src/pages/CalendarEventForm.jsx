import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { DISTANCE_OPTIONS, VISIBILITY, placeFromZip } from '../utils/calendar'
import { EVENT_TEMPLATES, addMinutes } from '../utils/eventTemplates'

const VWB_HOST = 'vwb'

function pad(n) { return String(n).padStart(2, '0') }
function toDateInput(iso) { const d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
function toTimeInput(iso) { const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()) }
function combine(date, time) { return date && time ? new Date(date + 'T' + time).toISOString() : null }

// Post or edit an event. Only VWB admins and organizers of an approved group
// can post (the database enforces this too; this page just explains it).
export default function CalendarEventForm() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const { user, isAdmin, organizations } = useAuth()

  const hostOrgs = organizations.filter((o) => o.role === 'admin' || o.role === 'organizer')
  const hostChoices = [
    ...(isAdmin ? [{ id: VWB_HOST, name: 'Village Without Borders' }] : []),
    ...hostOrgs.map((o) => ({ id: o.id, name: o.name })),
  ]

  // Where the event is: the host types the zip code, and we look up the
  // town name and the zip's center point. Starts blank. No place is ever
  // assumed. `place` is { name, lat, lng } once found.
  const [zip, setZip] = useState('')
  const [place, setPlace] = useState(null)
  const [zipState, setZipState] = useState('') // '' | 'looking' | 'notfound'
  const [form, setForm] = useState({
    host: hostChoices[0]?.id || '',
    title: '',
    description: '',
    date: '',
    startTime: '',
    endTime: '',
    locationName: '',
    address: '',
    radius: 25,
    visibility: 'public',
    hideAddress: false,
    signupEnabled: false,
    signupLimit: '',
    allAges: false,
    teensCanHelp: false,
  })
  // New events start by picking a kind of event (see eventTemplates.js),
  // or "Start from scratch". null = still choosing.
  const [templateKey, setTemplateKey] = useState(editing ? 'editing' : null)
  const [durationMins, setDurationMins] = useState(0)
  const [endTouched, setEndTouched] = useState(false)
  const [loaded, setLoaded] = useState(!editing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!editing) return
    supabase.from('calendar_events').select('*').eq('id', id).maybeSingle().then(({ data, error: err }) => {
      if (err || !data) { setError("We couldn't open this event for editing. You may not be one of its organizers."); setLoaded(true); return }
      setForm({
        host: data.organization_id || VWB_HOST,
        title: data.title || '',
        description: data.description || '',
        date: toDateInput(data.starts_at),
        startTime: toTimeInput(data.starts_at),
        endTime: data.ends_at ? toTimeInput(data.ends_at) : '',
        locationName: data.location_name || '',
        address: data.address || '',
        radius: Number(data.show_radius_miles) || 25,
        visibility: data.visibility,
        hideAddress: !!data.hide_address,
        signupEnabled: !!data.signup_enabled,
        signupLimit: data.signup_limit ? String(data.signup_limit) : '',
        allAges: !!data.all_ages,
        teensCanHelp: !!data.teens_can_help,
      })
      if (data.town && data.latitude != null && data.longitude != null) {
        setPlace({ name: data.town, lat: Number(data.latitude), lng: Number(data.longitude) })
      }
      setLoaded(true)
    })
  }, [editing, id]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyTemplate(t) {
    if (!t) {
      setTemplateKey('blank')
      setDurationMins(0)
      return
    }
    setForm((f) => ({
      ...f,
      title: t.title,
      description: t.description,
      // Members-only needs a group behind it; VWB-hosted falls back to invite-only.
      visibility: t.visibility === 'members' && f.host === VWB_HOST ? 'invite' : t.visibility,
      signupEnabled: t.signupEnabled,
      signupLimit: t.signupLimit ? String(t.signupLimit) : '',
      hideAddress: t.hideAddress,
      radius: t.radius,
      endTime: f.startTime && !endTouched ? addMinutes(f.startTime, t.durationMins) : f.endTime,
    }))
    setDurationMins(t.durationMins)
    setTemplateKey(t.key)
  }

  function changeTemplate() {
    if ((form.title || form.description) && !confirm('Pick a different kind of event? This replaces the name and description you have now.')) return
    setForm((f) => ({ ...f, title: '', description: '' }))
    setTemplateKey(null)
  }

  async function changeZip(value) {
    const clean = value.replace(/[^0-9]/g, '').slice(0, 5)
    setZip(clean)
    if (clean.length < 5) { setZipState(''); if (!editing) setPlace(null); return }
    setZipState('looking')
    const found = await placeFromZip(clean)
    if (found) { setPlace({ name: found.name, lat: found.lat, lng: found.lng }); setZipState('') } else { setPlace(null); setZipState('notfound') }
  }

  function set(field, value) {
    if (field === 'endTime') setEndTouched(true)
    setForm((f) => {
      const next = { ...f, [field]: value }
      // Fill in the end time from the event type's usual length, until the
      // host sets an end time themselves.
      if (field === 'startTime' && durationMins && !endTouched) next.endTime = addMinutes(value, durationMins)
      // "Members only" needs a group behind it.
      if (field === 'host' && value === VWB_HOST && f.visibility === 'members') next.visibility = 'public'
      // Teens helping only makes sense when all ages are welcome.
      if (field === 'allAges' && !value) next.teensCanHelp = false
      return next
    })
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    if (!form.title.trim()) { setError('Give your event a name.'); return }
    if (!form.date || !form.startTime) { setError('Pick a date and a start time.'); return }
    const startsAt = combine(form.date, form.startTime)
    let endsAt = form.endTime ? combine(form.date, form.endTime) : null
    if (endsAt && new Date(endsAt) < new Date(startsAt)) {
      // An end time earlier than the start means it runs past midnight.
      const d = new Date(endsAt); d.setDate(d.getDate() + 1); endsAt = d.toISOString()
    }
    const limit = form.signupLimit ? parseInt(form.signupLimit, 10) : null
    if (form.signupEnabled && form.signupLimit && (!limit || limit < 1)) { setError('The number of spots should be 1 or more, or left blank for no limit.'); return }

    if (!place) { setError("Enter the zip code where the event is happening."); return }
    const row = {
      organization_id: form.host === VWB_HOST ? null : form.host,
      title: form.title.trim(),
      description: form.description.trim() || null,
      starts_at: startsAt,
      ends_at: endsAt,
      location_name: form.locationName.trim() || null,
      address: form.address.trim() || null,
      town: place.name,
      latitude: place.lat,
      longitude: place.lng,
      show_radius_miles: form.radius,
      visibility: form.visibility,
      hide_address: form.hideAddress,
      signup_enabled: form.signupEnabled,
      signup_limit: form.signupEnabled ? limit : null,
      all_ages: form.allAges,
      teens_can_help: form.allAges && form.teensCanHelp,
    }

    setSaving(true)
    const q = editing
      ? supabase.from('calendar_events').update(row).eq('id', id).select('id').single()
      : supabase.from('calendar_events').insert({ ...row, created_by: user.id }).select('id').single()
    const { data, error: err } = await q
    setSaving(false)
    if (err || !data) {
      console.error('save calendar event', err)
      setError("We couldn't save this event. Check the details and try again.")
      return
    }
    navigate('/events/' + data.id)
  }

  if (!editing && hostChoices.length === 0) {
    return (
      <div className="cal-page">
        <h1 style={{ color: '#4ecca3' }}>Post an event</h1>
        <p>Events can be posted by organizers of a group that's part of Village Without Borders, and by VWB admins.</p>
        <p className="cal-sub">If you run a group and want to post events here, reach out to Village Without Borders to get your group set up.</p>
        <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={() => navigate('/calendar')}>Back to the calendar</button>
      </div>
    )
  }

  if (!loaded) return <p className="cal-empty">Loading...</p>

  if (!editing && templateKey === null) {
    return (
      <div className="cal-page">
        <div className="cal-head">
          <h1>New event</h1>
          <button type="button" onClick={() => navigate(-1)} className="link-button" style={{ minHeight: '44px' }}>Cancel</button>
        </div>
        <h2 className="evt-pick-title">What kind of event?</h2>
        <p className="cal-sub">Pick one to get a head start. You can change anything after.</p>
        <div className="evt-pick-grid">
          {EVENT_TEMPLATES.map((t) => (
            <button key={t.key} type="button" className="evt-pick" onClick={() => applyTemplate(t)}>
              <span className="evt-pick-icon" aria-hidden="true">{t.icon}</span>
              <span className="evt-pick-name">{t.name}</span>
              <span className="evt-pick-blurb">{t.blurb}</span>
            </button>
          ))}
          <button type="button" className="evt-pick evt-pick-blank" onClick={() => applyTemplate(null)}>
            <span className="evt-pick-icon" aria-hidden="true">{'\u270F\uFE0F'}</span>
            <span className="evt-pick-name">Start from scratch</span>
            <span className="evt-pick-blurb">A blank form</span>
          </button>
        </div>
      </div>
    )
  }

  const chosen = EVENT_TEMPLATES.find((t) => t.key === templateKey)

  return (
    <div className="cal-page">
      <div className="cal-head">
        <h1>{editing ? 'Edit event' : 'New event'}</h1>
        <button type="button" onClick={() => navigate(-1)} className="link-button" style={{ minHeight: '44px' }}>Cancel</button>
      </div>

      {!editing && (
        <p className="evt-chosen">
          {chosen ? <><span aria-hidden="true">{chosen.icon}</span> {chosen.name}</> : 'Starting from scratch'}
          {' · '}
          <button type="button" className="link-button" onClick={changeTemplate}>Change</button>
        </p>
      )}
      {chosen && <p className="cal-sub">We filled in a starting outline. Replace the parts after each colon with your details, and delete any lines you don't need.</p>}

      {error && <p className="cal-error" role="alert">{error}</p>}

      <form onSubmit={save} noValidate>
        {!editing && hostChoices.length > 1 && (
          <div className="form-field">
            <label htmlFor="ev-host">Who's hosting?</label>
            <select id="ev-host" value={form.host} onChange={(e) => set('host', e.target.value)}>
              {hostChoices.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
        )}

        <div className="form-field">
          <label htmlFor="ev-title">Event name</label>
          <input id="ev-title" type="text" maxLength={140} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="For example: Fall food drive" required />
        </div>

        <div className="form-field">
          <label htmlFor="ev-desc">What's happening? (optional)</label>
          <textarea id="ev-desc" rows={chosen ? 12 : 4} maxLength={4000} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What people will do, what to bring, who it's for" />
        </div>

        <div className="form-field">
          <label htmlFor="ev-date">Date</label>
          <input id="ev-date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
        </div>
        <div className="cal-row2">
          <div className="form-field">
            <label htmlFor="ev-start">Starts</label>
            <input id="ev-start" type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="ev-end">Ends (optional)</label>
            <input id="ev-end" type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="ev-zip">{editing && place ? 'Zip code (to change the town)' : 'Zip code where it\'s happening'}</label>
          <input id="ev-zip" type="text" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]*" maxLength={5} value={zip} onChange={(e) => changeZip(e.target.value)} placeholder="12345" aria-describedby="ev-zip-note" required={!place} />
          <p id="ev-zip-note" className={'evt-zip-note' + (zipState === 'notfound' ? ' is-error' : '')} role="status">
            {zipState === 'looking' && 'Looking it up...'}
            {zipState === 'notfound' && "We couldn't find that zip code. Check it and try again."}
            {!zipState && place && <>&#10003; {place.name}. The calendar shows this town, and measures distance from the middle of the zip code.</>}
            {!zipState && !place && 'We use it to show the town and to reach people nearby.'}
          </p>
        </div>
        <div className="form-field">
          <label htmlFor="ev-place">Place name (optional)</label>
          <input id="ev-place" type="text" value={form.locationName} onChange={(e) => set('locationName', e.target.value)} placeholder="For example: the public library" />
        </div>
        <div className="form-field">
          <label htmlFor="ev-address">Street address (optional)</label>
          <input id="ev-address" type="text" autoComplete="street-address" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <label className={'cal-choice' + (form.hideAddress ? ' is-on' : '')}>
          <input type="checkbox" checked={form.hideAddress} onChange={(e) => set('hideAddress', e.target.checked)} />
          <span>Only show the place and address to people who sign up
            <small>Everyone else just sees the town. Good for events at someone's home.</small>
          </span>
        </label>

        <h2 style={{ fontSize: '1.05rem', margin: '1.25rem 0 0.5rem' }}>Who can see it?</h2>
        {Object.entries(VISIBILITY).map(([key, v]) => {
          const disabled = key === 'members' && form.host === VWB_HOST
          return (
            <label key={key} className={'cal-choice' + (form.visibility === key ? ' is-on' : '') + (disabled ? ' is-disabled' : '')}>
              <input type="radio" name="visibility" value={key} checked={form.visibility === key} disabled={disabled} onChange={() => set('visibility', key)} />
              <span>{v.label}<small>{disabled ? 'Only for events hosted by a group.' : v.desc}</small></span>
            </label>
          )
        })}

        {(form.visibility === 'public' || form.visibility === 'account') && (
          <div className="form-field" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="ev-radius">Show it to people within</label>
            <select id="ev-radius" value={form.radius} onChange={(e) => set('radius', Number(e.target.value))}>
              {DISTANCE_OPTIONS.map((m) => <option key={m} value={m}>{m} miles of {place?.name || 'the event'}</option>)}
            </select>
          </div>
        )}

        <h2 style={{ fontSize: '1.05rem', margin: '1.25rem 0 0.5rem' }}>Who can come?</h2>
        <p className="cal-sub" style={{ marginTop: 0 }}>Every event is for adults 18 and over unless you tick this. Accounts are for adults, so teens never sign up on their own.</p>
        <label className={'cal-choice' + (form.allAges ? ' is-on' : '')}>
          <input type="checkbox" checked={form.allAges} onChange={(e) => set('allAges', e.target.checked)} />
          <span>All ages welcome
            <small>Kids and teens can come and join in. Show it to anyone looking at the calendar, no account needed.</small>
          </span>
        </label>
        {form.allAges && (
          <label className={'cal-choice' + (form.teensCanHelp ? ' is-on' : '')}>
            <input type="checkbox" checked={form.teensCanHelp} onChange={(e) => set('teensCanHelp', e.target.checked)} />
            <span>Teens can help, with a parent or guardian
              <small>A parent or guardian signs up as an adult and brings them. You are not asked for any details about the teen.</small>
            </span>
          </label>
        )}

        <h2 style={{ fontSize: '1.05rem', margin: '1.25rem 0 0.5rem' }}>Volunteers</h2>
        <label className={'cal-choice' + (form.signupEnabled ? ' is-on' : '')}>
          <input type="checkbox" checked={form.signupEnabled} onChange={(e) => set('signupEnabled', e.target.checked)} />
          <span>Let people sign up
            <small>You'll see who signed up and any notes they leave.</small>
          </span>
        </label>
        {form.signupEnabled && (
          <div className="form-field">
            <label htmlFor="ev-limit">How many spots? (leave blank for no limit)</label>
            <input id="ev-limit" type="number" inputMode="numeric" min={1} value={form.signupLimit} onChange={(e) => set('signupLimit', e.target.value)} />
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-full" style={{ minHeight: '48px', marginTop: '1rem' }} disabled={saving}>
          {saving ? 'Saving...' : editing ? 'Save changes' : 'Post event'}
        </button>
      </form>
    </div>
  )
}
