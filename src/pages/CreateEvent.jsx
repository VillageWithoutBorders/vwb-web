import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { getMyLocation } from '../utils/location'
import { useGoBack } from '../components/BackLink'
import Icon from '../components/Icon'

// Report an emergency. Two steps:
//   1. Who this is for: many neighbors hit at once. One household asks for help instead.
//      Someone in danger calls 911 first. What happens after you report.
//   2. The form. The reporter is the first coordinator, so they join the
//      Response Camp chat when the event is verified.

const EVENT_TYPES = ['Flood', 'Storm', 'Tornado', 'Fire', 'Ice/Snow', 'Power Outage', 'Housing Crisis', 'Other']

function textSimilarity(a, b) {
  if (!a && !b) return 1
  if (!a || !b) return 0
  a = a.toLowerCase().trim()
  b = b.toLowerCase().trim()
  if (a === b) return 1
  const wordsA = new Set(a.split(/\s+/))
  const wordsB = new Set(b.split(/\s+/))
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  if (union === 0) return 0
  return intersection / union
}

function eventSimilarity(draft, existing) {
  const typeScore = draft.eventType === existing.event_type ? 1 : 0
  const titleScore = textSimilarity(draft.title, existing.title)
  const descScore = textSimilarity(draft.description, existing.description)
  const locationScore = textSimilarity(draft.locationName, existing.location_name)
  // Weighted: type 30%, title 35%, location 20%, description 15%
  return (typeScore * 0.30) + (titleScore * 0.35) + (locationScore * 0.20) + (descScore * 0.15)
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 1) return 'Just now'
  if (hrs < 24) return hrs + 'h ago'
  return Math.floor(hrs / 24) + 'd ago'
}

export default function CreateEvent() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState('')
  const [locationName, setLocationName] = useState('')
  const [radius, setRadius] = useState(15)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [dupMatch, setDupMatch] = useState(null)
  const [villageName, setVillageName] = useState('')
  const headingRef = useRef(null)

  // Which village the report goes to (the database picks the reporter's village).
  useEffect(() => {
    if (!profile?.village_id) return
    supabase.from('villages').select('name').eq('id', profile.village_id).maybeSingle().then(({ data, error: vErr }) => {
      if (vErr) console.error('Failed to load your village name:', vErr)
      if (data?.name) setVillageName(data.name)
    })
  }, [profile?.village_id])

  // Each step starts at the top with its heading focused, for screen readers.
  useEffect(() => {
    window.scrollTo(0, 0)
    headingRef.current?.focus()
  }, [step])

  async function checkDuplicates() {
    const { data: existing, error: dupErr } = await supabase
      .from('emergency_events')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    if (dupErr) { console.error('Failed to check for duplicate events:', dupErr); return null }
    if (!existing || existing.length === 0) return null

    const draft = { eventType, title: title.trim(), description: description.trim(), locationName: locationName.trim() }
    let bestMatch = null
    let bestScore = 0
    for (const ev of existing) {
      const score = eventSimilarity(draft, ev)
      if (score > bestScore) { bestScore = score; bestMatch = ev }
    }
    return bestScore >= 0.70 ? bestMatch : null
  }

  async function createEvent() {
    setSubmitting(true)
    // The center of the reporter's zip code area. VWB never asks the phone where it is.
    let lat = null
    let lng = null
    const loc = getMyLocation(profile)
    if (loc) { lat = loc.lat; lng = loc.lng }

    const { data, error: insertErr } = await supabase.from('emergency_events').insert({
      title: title.trim(),
      description: description.trim() || null,
      event_type: eventType,
      location_name: locationName.trim() || null,
      latitude: lat,
      longitude: lng,
      radius_miles: radius,
      created_by: user.id,
    }).select().single()

    if (insertErr) {
      console.error('Failed to create emergency event:', insertErr)
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    const { error: signupErr } = await supabase.from('event_signups').insert({
      event_id: data.id,
      user_id: user.id,
      role: 'coordinator',
    })
    if (signupErr) console.error('Failed to record event creator as coordinator:', signupErr)

    setSubmitting(false)
    navigate('/emergency/' + data.id)
  }

  function showFieldError(errs) {
    setFieldErrors(errs)
    const first = ['ce-type', 'ce-title', 'ce-area'].find((id) => errs[id])
    if (first) {
      const el = document.getElementById(first)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus({ preventScroll: true })
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const errs = {}
    if (!eventType) errs['ce-type'] = 'Pick what kind of emergency this is.'
    if (!title.trim()) errs['ce-title'] = 'Give it a short name, like "Ringgold Flooding".'
    if (!locationName.trim()) errs['ce-area'] = 'Tell neighbors where: a town, county, or road.'
    if (Object.keys(errs).length) { showFieldError(errs); return }
    setFieldErrors({})

    setSubmitting(true)
    const match = await checkDuplicates()
    setSubmitting(false)
    if (match) { setDupMatch(match); return }
    await createEvent()
  }

  const errFor = (id) => fieldErrors[id] ? <p id={id + '-err'} className="ce-err" role="alert">{fieldErrors[id]}</p> : null

  return (
    <div className="ce-page">
      <div className="ce-head">
        <button type="button" className="ce-back" onClick={() => (step === 2 ? setStep(1) : goBack('/emergency'))} aria-label={step === 2 ? 'Back to step 1' : 'Back to Emergency Response'}>&#8592;</button>
        <div>
          <p className="ce-step">Step {step} of 2</p>
          <h1 ref={headingRef} tabIndex={-1} className="ce-title">{step === 1 ? 'Report an emergency' : 'Tell neighbors what happened'}</h1>
        </div>
      </div>
      <div className="ce-progress" aria-hidden="true"><span style={{ width: step === 1 ? '50%' : '100%' }} /></div>

      {step === 1 && (
        <>
          <section className="ce-card" aria-labelledby="ce-who">
            <h2 id="ce-who" className="ce-h2"><Icon name="siren" /> Who this is for</h2>
            <p>Use this when something hits <b>many neighbors at once</b>: a flood, storm, tornado, fire, ice, a long power outage, or many families losing their homes.</p>
          </section>

          <section className="ce-card ce-card-danger" aria-labelledby="ce-911">
            <h2 id="ce-911" className="ce-h2"><Icon name="phone" /> Someone in danger right now?</h2>
            <p>Call 911 first. This app does not reach emergency services.</p>
            <a className="btn ce-btn ce-btn-danger" href="tel:911">Call 911</a>
          </section>

          <section className="ce-card" aria-labelledby="ce-one">
            <h2 id="ce-one" className="ce-h2"><Icon name="raise-hand" /> Just you or one household?</h2>
            <p>Ask for help instead. Neighbors near you see it right away.</p>
            <button type="button" className="btn btn-outline ce-btn" onClick={() => navigate('/ask')}>Ask for help</button>
          </section>

          <section className="ce-card" aria-labelledby="ce-next">
            <h2 id="ce-next" className="ce-h2"><Icon name="clipboard" /> What happens after you report</h2>
            <ol className="ce-list">
              <li>Neighbors{villageName ? ' in ' + villageName : ' in your village'} see it as waiting to be checked.</li>
              <li>Two neighbors confirm it, or a Hope Ambassador or VWB admin checks it.</li>
              <li>A Response Camp chat opens for everyone who signs up to help. Emergency crews that cover your village are asked to take it on.</li>
              <li>You are the first coordinator. You add what is needed and close it when it is over.</li>
            </ol>
          </section>

          <div className="ce-actions">
            <button type="button" className="btn btn-primary ce-btn ce-btn-go" onClick={() => setStep(2)}>Yes, many neighbors are affected</button>
          </div>
        </>
      )}

      {step === 2 && (
        <form onSubmit={handleSubmit} noValidate>
          {error && <div className="ce-banner" role="alert">{error}</div>}

          <label htmlFor="ce-type" className="ce-label">What kind of emergency?</label>
          <select id="ce-type" className={'ce-field' + (fieldErrors['ce-type'] ? ' ce-field-bad' : '')} value={eventType} aria-invalid={!!fieldErrors['ce-type']} aria-describedby={fieldErrors['ce-type'] ? 'ce-type-err' : undefined}
            onChange={e => { setEventType(e.target.value); setFieldErrors(f => ({ ...f, 'ce-type': undefined })) }}>
            <option value="">Choose one</option>
            {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {errFor('ce-type')}

          <label htmlFor="ce-title" className="ce-label">Short name</label>
          <input id="ce-title" className={'ce-field' + (fieldErrors['ce-title'] ? ' ce-field-bad' : '')} type="text" placeholder="Ringgold Flooding" value={title} maxLength={120} autoComplete="off" aria-invalid={!!fieldErrors['ce-title']} aria-describedby={fieldErrors['ce-title'] ? 'ce-title-err' : undefined}
            onChange={e => { setTitle(e.target.value); setFieldErrors(f => ({ ...f, 'ce-title': undefined })) }} />
          {errFor('ce-title')}

          <label htmlFor="ce-area" className="ce-label">Where?</label>
          <p className="ce-hint" id="ce-area-hint">A town, county, or road. Never a home address.</p>
          <input id="ce-area" className={'ce-field' + (fieldErrors['ce-area'] ? ' ce-field-bad' : '')} type="text" placeholder="East Ringgold, near the creek" value={locationName} maxLength={100} autoComplete="address-level2" aria-invalid={!!fieldErrors['ce-area']} aria-describedby={'ce-area-hint' + (fieldErrors['ce-area'] ? ' ce-area-err' : '')}
            onChange={e => { setLocationName(e.target.value); setFieldErrors(f => ({ ...f, 'ce-area': undefined })) }} />
          {errFor('ce-area')}

          <label htmlFor="ce-desc" className="ce-label">What is happening? <span className="ce-optional">(optional)</span></label>
          <p className="ce-hint" id="ce-desc-hint">What you see, which streets, and what kind of help would make a difference.</p>
          <textarea id="ce-desc" className="ce-field ce-area" rows={4} value={description} maxLength={2000} aria-describedby="ce-desc-hint" onChange={e => setDescription(e.target.value)} />

          <label htmlFor="ce-radius" className="ce-label">How far does it reach? <b>{radius} miles</b></label>
          <input id="ce-radius" className="ce-range" type="range" min={5} max={50} step={5} value={radius} onChange={e => setRadius(parseInt(e.target.value))} aria-valuetext={radius + ' miles'} />
          <div className="ce-range-labels" aria-hidden="true"><span>5 mi</span><span>25 mi</span><span>50 mi</span></div>

          <p className="ce-hint ce-where">
            {villageName ? 'This goes to ' + villageName + '. ' : ''}When you tap Report, your phone may ask to share your location. It is rounded to about a mile so the event lands in the right place. You can say no.
          </p>

          <div className="ce-actions">
            <button type="submit" disabled={submitting} className="btn ce-btn ce-btn-danger ce-btn-go">
              {submitting ? 'Checking...' : 'Report emergency'}
            </button>
          </div>
        </form>
      )}

      {dupMatch && (
        <div className="ce-modal" onClick={() => setDupMatch(null)}>
          <div className="ce-sheet" role="dialog" aria-modal="true" aria-labelledby="ce-dup-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="ce-dup-title" className="ce-h2">Is this the same emergency?</h2>
            <p className="ce-hint">Someone already reported something that looks like this. Joining it keeps everyone in one place.</p>
            <div className="ce-dup">
              <p className="ce-dup-meta">
                <span className="ce-chip">{dupMatch.event_type}</span>
                {dupMatch.verified && <span className="ce-chip ce-chip-ok">Verified</span>}
                <span className="ce-dup-time">{timeAgo(dupMatch.created_at)}</span>
              </p>
              <p className="ce-dup-name">{dupMatch.title}</p>
              {dupMatch.location_name && <p className="ce-hint">{dupMatch.location_name}</p>}
            </div>
            <div className="ce-actions ce-actions-row">
              <button type="button" className="btn btn-primary ce-btn" onClick={() => { setDupMatch(null); navigate('/emergency/' + dupMatch.id) }}>Same one, open it</button>
              <button type="button" className="btn btn-outline ce-btn" onClick={() => { setDupMatch(null); createEvent() }}>No, it is different</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
