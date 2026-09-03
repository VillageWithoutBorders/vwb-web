import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { createNotification } from '../utils/notificationHelpers'

const VERIFY_THRESHOLD = 2

export default function EmergencyEvents() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [mySignups, setMySignups] = useState({})
  const [myUpvotes, setMyUpvotes] = useState({})

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
    const { data: upvotes } = await supabase.from('event_upvotes').select('event_id').eq('user_id', user.id)
    if (upvotes) {
      const map = {}
      upvotes.forEach(u => { map[u.event_id] = true })
      setMyUpvotes(map)
    }
    setLoading(false)
  }

  async function notifyAndPost(eventId) {
    const ev = events.find(e2 => e2.id === eventId)
    if (!ev) return
    await createNotification({
      userId: ev.created_by,
      type: 'emergency_verified',
      title: 'Emergency Verified',
      body: ev.title + ' has been verified by the community.',
      link: '/emergency/' + eventId
    })
    await supabase.from('campfire_messages').insert({
      user_id: user.id,
      body: '\ud83d\udea8 Emergency Verified: ' + ev.title + ' (' + (ev.location_name || 'Unknown area') + '). Head to the event page to sign up or add resources.'
    })
  }

  async function upvoteEvent(e, eventId) {
    e.stopPropagation()
    if (myUpvotes[eventId]) return
    await supabase.from('event_upvotes').insert({ event_id: eventId, user_id: user.id })
    const newCount = (events.find(ev => ev.id === eventId)?.upvote_count || 0) + 1
    await supabase.from('emergency_events').update({
      upvote_count: newCount,
      verified: newCount >= VERIFY_THRESHOLD ? true : undefined
    }).eq('id', eventId)
    if (newCount >= VERIFY_THRESHOLD) {
      await notifyAndPost(eventId)
    }
    await loadEvents()
  }

  async function adminVerify(e, eventId) {
    e.stopPropagation()
    await supabase.from('emergency_events').update({ verified: true }).eq('id', eventId)
    await notifyAndPost(eventId)
    await loadEvents()
  }

  function timeAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime()
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 1) return 'Just now'
    if (hrs < 24) return hrs + 'h ago'
    return Math.floor(hrs / 24) + 'd ago'
  }

  const canVerify = profile?.role === 'admin' || profile?.is_hope_ambassador
  const verified = events.filter(ev => ev.verified)
  const pending = events.filter(ev => !ev.verified)

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#ffcc00' }}>Emergency Response</h1>
          <p style={{ color: '#888', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>Active events in your area</p>
        </div>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer' }}>&#8592;</button>
      </div>

      <button onClick={() => navigate('/emergency/create')} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '1rem', borderRadius: '10px', border: '2px solid #ffaa44', background: 'linear-gradient(135deg, #2e2a1a, #3a3020)', cursor: 'pointer', textAlign: 'left', marginBottom: '1.25rem' }}>
        <span style={{ fontSize: '1.75rem' }}>&#9888;</span>
        <div>
          <span style={{ display: 'block', color: '#ffcc00', fontWeight: 700, fontSize: '0.95rem' }}>Report Active Emergency</span>
          <span style={{ color: '#cc9999', fontSize: '0.8rem' }}>Report a disaster or emergency in your area</span>
        </div>
      </button>

      {loading && <p style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>Loading...</p>}

      {!loading && events.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>&#127783;</p>
          <p style={{ fontWeight: 700 }}>No active emergencies</p>
          <p style={{ color: '#888', fontSize: '0.875rem' }}>When a disaster or emergency happens, events will appear here.</p>
        </div>
      )}

      {!loading && pending.length > 0 && (
        <>
          <p style={{ color: '#ffaa44', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>Pending verification ({pending.length})</p>
          {pending.map(ev => {
            const myRole = mySignups[ev.id]
            const voted = myUpvotes[ev.id]
            return (
              <div key={ev.id} onClick={() => navigate('/emergency/' + ev.id)} style={{ background: '#1e1e1e', border: '1px solid #444', borderRadius: '12px', padding: '1rem', marginBottom: '0.75rem', cursor: 'pointer', borderLeft: '4px solid #ffaa44', opacity: 0.9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ background: '#ffaa44', color: '#1a1a1a', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>Unverified</span>
                    {ev.created_by === user.id && <span style={{ background: '#1a3a5a', color: '#66aaff', fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', marginLeft: '0.35rem' }}>Your report</span>}
                    <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1.05rem' }}>{ev.title}</h3>
                  </div>
                  <span style={{ color: '#888', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{timeAgo(ev.created_at)}</span>
                </div>
                {ev.location_name && <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0.25rem 0' }}>{ev.location_name}</p>}
                {ev.description && <p style={{ color: '#999', fontSize: '0.85rem', margin: '0.25rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ev.description}</p>}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
                  <button onClick={(e) => upvoteEvent(e, ev.id)} disabled={voted} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', borderRadius: '8px', border: voted ? '1px solid #4ecca3' : '1px solid #666', background: voted ? '#1a3a2a' : 'none', color: voted ? '#4ecca3' : '#aaa', cursor: voted ? 'default' : 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                    &#9650; {ev.upvote_count || 0}
                  </button>
                  <span style={{ color: '#666', fontSize: '0.75rem' }}>{(ev.upvote_count || 0) + ' verified'}</span>
                  {canVerify && !voted && (
                    <button onClick={(e) => adminVerify(e, ev.id)} style={{ marginLeft: 'auto', padding: '0.4rem 0.75rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>Verify</button>
                  )}
                </div>
              </div>
            )
          })}
        </>
      )}

      {!loading && verified.length > 0 && (
        <>
          {pending.length > 0 && <p style={{ color: '#ff6644', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '1rem', marginBottom: '0.5rem' }}>Verified emergencies ({verified.length})</p>}
          {verified.map(ev => {
            const myRole = mySignups[ev.id]
            return (
              <div key={ev.id} onClick={() => navigate('/emergency/' + ev.id)} style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '12px', padding: '1rem', marginBottom: '0.75rem', cursor: 'pointer', borderLeft: '4px solid #ff6644' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ background: '#ff6644', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{ev.event_type || 'Emergency'}</span>
                    <span style={{ background: '#1a4a3a', color: '#4ecca3', fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', marginLeft: '0.35rem' }}>&#10003; Verified</span>
                    {ev.created_by === user.id && <span style={{ background: '#1a3a5a', color: '#66aaff', fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', marginLeft: '0.35rem' }}>Your report</span>}
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
        </>
      )}
    </div>
  )
}