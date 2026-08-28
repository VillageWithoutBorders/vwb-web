import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

export default function EmergencyEvents() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [mySignups, setMySignups] = useState({})

  useEffect(() => { loadEvents() }, [])

  async function loadEvents() {
    setLoading(true)
    const { data } = await supabase.from('emergency_events').select('*').eq('status', 'active').order('created_at', { ascending: false })
    if (data) setEvents(data)
    const { data: signups } = await supabase.from('event_signups').select('event_id, role').eq('user_id', user.id)
    if (signups) {
      const map = {}
      signups.forEach(s => { map[s.event_id] = s.role })
      setMySignups(map)
    }
    setLoading(false)
  }

  function timeAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime()
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 1) return 'Just now'
    if (hrs < 24) return hrs + 'h ago'
    return Math.floor(hrs / 24) + 'd ago'
  }

  const isAdmin = profile?.role === 'admin' || profile?.role === 'organizer' || profile?.is_hope_ambassador

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#4ecca3' }}>Emergency Response</h1>
          <p style={{ color: '#888', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>Active events in your area</p>
        </div>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer' }}>&#8592;</button>
      </div>

      {isAdmin && (
        <button onClick={() => navigate('/emergency/create')} style={{ display: 'block', width: '100%', padding: '0.75rem', borderRadius: '10px', border: '2px dashed #4ecca3', background: 'none', color: '#4ecca3', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', marginBottom: '1rem' }}>
          + Create Emergency Event
        </button>
      )}

      {loading && <p style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>Loading...</p>}

      {!loading && events.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>&#127783;</p>
          <p style={{ fontWeight: 700 }}>No active emergencies</p>
          <p style={{ color: '#888', fontSize: '0.875rem' }}>When a disaster or emergency happens, events will appear here.</p>
        </div>
      )}

      {!loading && events.map(ev => {
        const myRole = mySignups[ev.id]
        return (
          <div key={ev.id} onClick={() => navigate('/emergency/' + ev.id)} style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '12px', padding: '1rem', marginBottom: '0.75rem', cursor: 'pointer', borderLeft: ev.status === 'active' ? '4px solid #ff6644' : '4px solid #444' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ background: '#ff6644', color: '#fff', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>{ev.event_type || 'Emergency'}</span>
                <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1.1rem' }}>{ev.title}</h3>
              </div>
              <span style={{ color: '#888', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{timeAgo(ev.created_at)}</span>
            </div>
            {ev.location_name && <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0.25rem 0' }}>{ev.location_name}</p>}
            {ev.description && <p style={{ color: '#999', fontSize: '0.85rem', margin: '0.25rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ev.description}</p>}
            {myRole && (
              <span style={{ display: 'inline-block', marginTop: '0.5rem', background: myRole === 'responder' ? '#1a4a3a' : myRole === 'coordinator' ? '#1a3a5a' : '#4a3a1a', color: myRole === 'responder' ? '#4ecca3' : myRole === 'coordinator' ? '#66aaff' : '#ffaa44', fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
                {myRole === 'responder' ? 'Signed up to help' : myRole === 'coordinator' ? 'Coordinator' : 'Signed up as affected'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}