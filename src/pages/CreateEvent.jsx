import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { getCurrentPosition } from '../utils/location'

const EVENT_TYPES = ['Flood', 'Storm', 'Tornado', 'Fire', 'Ice/Snow', 'Power Outage', 'Housing Crisis', 'Other']

const fieldStyle = { display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid #444', background: '#1a1a1a', color: '#fff', fontSize: '1rem', boxSizing: 'border-box' }
const labelStyle = { display: 'block', marginBottom: '0.25rem', marginTop: '1rem', fontWeight: 600, color: '#ccc' }

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

export default function CreateEvent() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState('')
  const [locationName, setLocationName] = useState('')
  const [radius, setRadius] = useState(15)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [dupMatch, setDupMatch] = useState(null)

  async function checkDuplicates() {
    const { data: existing } = await supabase
      .from('emergency_events')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    if (!existing || existing.length === 0) return null

    const draft = { eventType, title: title.trim(), description: description.trim(), locationName: locationName.trim() }
    let bestMatch = null
    let bestScore = 0

    for (const ev of existing) {
      const score = eventSimilarity(draft, ev)
      if (score > bestScore) {
        bestScore = score
        bestMatch = ev
      }
    }

    return bestScore >= 0.70 ? bestMatch : null
  }

  async function createEvent() {
    setSubmitting(true)

    let lat = null
    let lng = null
    try {
      const loc = await getCurrentPosition()
      if (loc && loc.lat) { lat = loc.lat; lng = loc.lng }
    } catch (err) {}

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
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    await supabase.from('event_signups').insert({
      event_id: data.id,
      user_id: user.id,
      role: 'coordinator',
    })

    setSubmitting(false)
    navigate('/emergency/' + data.id)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError('Give the event a name'); return }
    if (!eventType) { setError('Pick an event type'); return }

    setSubmitting(true)
    const match = await checkDuplicates()
    setSubmitting(false)

    if (match) {
      setDupMatch(match)
      return
    }

    await createEvent()
  }

  function timeAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime()
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 1) return 'Just now'
    if (hrs < 24) return hrs + 'h ago'
    return Math.floor(hrs / 24) + 'd ago'
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem' }}>&#8592;</button>
        <h1 style={{ color: '#ffcc00', margin: 0, fontSize: '1.5rem' }}>Create Emergency Event</h1>
      </div>
      <p style={{ color: '#aaa', marginBottom: '1.5rem' }}>Alert your community about an emergency. Neighbors can sign up as affected or as responders.</p>

      <form onSubmit={handleSubmit}>
        {error && <div style={{ background: '#5c1a1a', color: '#ff9999', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem' }}>{error}</div>}

        <label style={labelStyle}>Event type</label>
        <select style={fieldStyle} value={eventType} onChange={e => setEventType(e.target.value)}>
          <option value="">Choose a type</option>
          {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <label style={labelStyle}>Event name</label>
        <input style={fieldStyle} type="text" placeholder="e.g. August 2026 Flooding, Ringgold Ice Storm" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} />

        <label style={labelStyle}>What is happening?</label>
        <textarea style={{ ...fieldStyle, minHeight: '100px', resize: 'vertical' }} placeholder="Describe the situation, what areas are affected, what kind of help is needed..." value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} />

        <label style={labelStyle}>Affected area</label>
        <input style={fieldStyle} type="text" placeholder="e.g. Ringgold, Catoosa County, Tunnel Hill" value={locationName} onChange={e => setLocationName(e.target.value)} maxLength={100} />

        <label style={labelStyle}>Response radius: {radius} miles</label>
        <input type="range" min={5} max={50} step={5} value={radius} onChange={e => setRadius(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#ff6644', cursor: 'pointer' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '0.7rem' }}>
          <span>5 mi</span><span>25 mi</span><span>50 mi</span>
        </div>

        <button type="submit" disabled={submitting} style={{ display: 'block', width: '100%', marginTop: '1.5rem', padding: '0.875rem', borderRadius: '8px', border: 'none', background: '#ff6644', color: '#fff', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Checking...' : 'Create Event'}
        </button>
      </form>

      {dupMatch && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setDupMatch(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#1e1e1e', border: '1px solid #444', borderRadius: '12px', maxWidth: '440px', width: '100%', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1rem 0.75rem', borderBottom: '1px solid #333' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#ffaa44' }}>Is this the same event?</h2>
              <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.35rem 0 0' }}>An existing event looks similar to what you are reporting.</p>
            </div>
            <div style={{ padding: '1rem' }}>
              <div style={{ background: '#2a2a2a', borderRadius: '8px', padding: '0.75rem', border: '1px solid #333' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ background: '#ff6644', color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{dupMatch.event_type}</span>
                  {dupMatch.verified && <span style={{ background: '#1a4a3a', color: '#4ecca3', fontSize: '0.6rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }}>&#10003; Verified</span>}
                  <span style={{ color: '#666', fontSize: '0.75rem', marginLeft: 'auto' }}>{timeAgo(dupMatch.created_at)}</span>
                </div>
                <p style={{ margin: '0 0 0.35rem', fontWeight: 700, fontSize: '1rem', color: '#fff' }}>{dupMatch.title}</p>
                {dupMatch.location_name && <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.25rem' }}>{dupMatch.location_name}</p>}
                {dupMatch.description && <p style={{ color: '#999', fontSize: '0.8rem', margin: '0.25rem 0 0', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{dupMatch.description}</p>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem 1rem', borderTop: '1px solid #333' }}>
              <button onClick={() => { setDupMatch(null); navigate('/emergency/' + dupMatch.id) }} style={{ flex: 1, padding: '0.7rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>Same Event</button>
              <button onClick={() => { setDupMatch(null); createEvent() }} style={{ flex: 1, padding: '0.7rem', borderRadius: '8px', border: '1px solid #ff6644', background: 'none', color: '#ff6644', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>Different Event</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
