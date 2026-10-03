import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Volunteer side: the shifts on an event, with a button to take or give up each.
// Organizers also see who took each one.
function clock(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function EventShifts({ eventId, token, user, canManage, past, cancelled, onSignIn, onChanged, onLoaded }) {
  const [shifts, setShifts] = useState(null)
  const [people, setPeople] = useState({})
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_event_shifts', { p_event: Number(eventId), p_token: token || null })
    if (error) { console.error('list_event_shifts', error); setShifts([]); if (onLoaded) onLoaded(0); return }
    setShifts(data || [])
    if (onLoaded) onLoaded((data || []).length)
    if (canManage && (data || []).length) {
      const { data: v, error: vErr } = await supabase.rpc('list_event_shift_volunteers', { p_event: Number(eventId) })
      if (vErr) console.error('list_event_shift_volunteers', vErr)
      const by = {}
      ;(v || []).forEach((x) => { (by[x.shift_id] = by[x.shift_id] || []).push(x.display_name) })
      setPeople(by)
    }
  }, [eventId, token, canManage]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load, user?.id])

  async function take(s) {
    setBusy(s.id); setMessage('')
    const { data, error } = await supabase.rpc('take_event_shift', { p_shift: s.id, p_token: token || null })
    setBusy(null)
    if (error) { setMessage(error.message || 'Something went wrong. Try again.'); return }
    if (data === 'full') setMessage('Sorry, that shift just filled up.')
    else setMessage('You took "' + s.label + '". Thank you!')
    await load()
    if (onChanged) onChanged()
  }

  async function giveUp(s) {
    setBusy(s.id); setMessage('')
    const { error } = await supabase.rpc('drop_event_shift', { p_shift: s.id })
    setBusy(null)
    if (error) { setMessage('Could not give up the shift. Try again.'); return }
    setMessage('You gave up "' + s.label + '".')
    await load()
    if (onChanged) onChanged()
  }

  if (!shifts || shifts.length === 0) return null

  return (
    <section className="cal-box" aria-label="Shifts">
      <h2>Pick a shift</h2>
      {!user && !past && !cancelled && (
        <p className="cal-sub" style={{ marginTop: 0 }}>Taking a shift needs a free Village Without Borders account, so organizers know who is coming.</p>
      )}
      {message && <p role="status" style={{ color: '#7fe0bf' }}>{message}</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {shifts.map((s) => {
          const left = s.capacity - s.taken
          const full = left <= 0
          return (
            <li key={s.id} style={{ padding: '0.75rem', background: '#1e1e1e', border: '1px solid ' + (s.mine ? '#4ecca3' : '#333'), borderRadius: '10px' }}>
              <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{s.label}</div>
              {s.starts_at && <div style={{ fontSize: '0.9rem', color: '#ccc' }}>{clock(s.starts_at)}{s.ends_at ? ' to ' + clock(s.ends_at) : ''}</div>}
              <div style={{ fontSize: '0.9rem', color: full ? '#e0b84c' : '#aaa' }}>{s.taken} of {s.capacity} spots filled{full ? '. Full.' : ''}</div>
              {canManage && people[s.id] && people[s.id].length > 0 && (
                <div style={{ fontSize: '0.85rem', color: '#ccc', marginTop: '0.2rem', overflowWrap: 'anywhere' }}>Signed up: {people[s.id].join(', ')}</div>
              )}
              {!past && !cancelled && (
                !user ? (
                  <button type="button" className="btn btn-primary" style={{ minHeight: '48px', marginTop: '0.5rem' }} onClick={onSignIn}>Sign up to take this shift</button>
                ) : s.mine ? (
                  <button type="button" className="btn btn-outline" style={{ minHeight: '48px', marginTop: '0.5rem' }} disabled={busy === s.id} onClick={() => giveUp(s)}>You are in. Give up this shift</button>
                ) : full ? null : (
                  <button type="button" className="btn btn-primary" style={{ minHeight: '48px', marginTop: '0.5rem' }} disabled={busy === s.id} onClick={() => take(s)}>{busy === s.id ? 'Saving...' : 'Take this shift'}</button>
                )
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
