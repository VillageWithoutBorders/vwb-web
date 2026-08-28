import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { getCurrentPosition } from '../utils/location'

const EVENT_TYPES = ['Flood', 'Storm', 'Tornado', 'Fire', 'Ice/Snow', 'Power Outage', 'Housing Crisis', 'Other']

const fieldStyle = { display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid #444', background: '#1a1a1a', color: '#fff', fontSize: '1rem', boxSizing: 'border-box' }
const labelStyle = { display: 'block', marginBottom: '0.25rem', marginTop: '1rem', fontWeight: 600, color: '#ccc' }

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

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError('Give the event a name'); return }
    if (!eventType) { setError('Pick an event type'); return }

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

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem' }}>&#8592;</button>
        <h1 style={{ color: '#ff6644', margin: 0, fontSize: '1.5rem' }}>Create Emergency Event</h1>
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
          {submitting ? 'Creating...' : 'Create Event'}
        </button>
      </form>
    </div>
  )
}