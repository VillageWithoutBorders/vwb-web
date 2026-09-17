import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import VouchButton from '../components/VouchButton'

export default function PublicProfile() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('requests')
  const [requests, setRequests] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [completedCount, setCompletedCount] = useState(0)

  useEffect(() => {
    if (userId) loadProfile()
  }, [userId])

  useEffect(() => {
    if (userId) {
      if (tab === 'requests') loadRequests()
      else loadEvents()
    }
  }, [userId, tab])

  async function loadProfile() {
    setLoading(true)

    const { data: hp, error: hpErr } = await supabase
      .from('helper_profiles_public')
      .select('user_id, display_name, is_hope_ambassador, avatar_url, created_at, neighborhood, show_location, role')
      .eq('user_id', userId)
      .maybeSingle()
    if (hpErr) console.error('Failed to load profile:', hpErr)

    setProfile(hp)

    setLoading(false)
    const { count: doneCount, error: countErr } = await supabase.from("help_requests").select("id", { count: "exact", head: true }).eq("requester_id", userId).eq("status", "completed")
    if (countErr) console.error('Failed to load completed request count:', countErr)
    setCompletedCount(doneCount || 0)
  }

  async function loadRequests() {
    const { data, error: reqErr } = await supabase
      .from('help_requests')
      .select('id, skill_needed, created_at, status')
      .eq('requester_id', userId)
      .or("archived_at.not.is.null,status.eq.completed")
      .order('created_at', { ascending: false })
      .limit(50)
    if (reqErr) console.error('Failed to load requests:', reqErr)

    const { data: helped, error: helpedErr } = await supabase
      .from('skill_matches')
      .select('request_id, created_at, help_requests(id, skill_needed, created_at, status)')
      .eq('helper_id', userId)
      .eq('accepted', true)
      .limit(50)
    if (helpedErr) console.error('Failed to load helped requests:', helpedErr)

    const helpedRequests = (helped || [])
      .filter(m => m.help_requests)
      .map(m => ({ ...m.help_requests, role: 'helper', match_date: m.created_at }))

    const ownRequests = (data || []).map(r => ({ ...r, role: 'requester' }))

    setRequests([...ownRequests, ...helpedRequests].sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    ))
  }

  async function loadEvents() {
    const { data: signups, error: signupsErr } = await supabase
      .from('event_signups')
      .select('event_id, role, created_at, emergency_events(id, title, event_type, created_at, status)')
      .eq('user_id', userId)
      .limit(50)
    if (signupsErr) console.error('Failed to load event participation:', signupsErr)

    setEvents(
      (signups || [])
        .filter(s => s.emergency_events)
        .map(s => ({ ...s.emergency_events, signup_role: s.role, signup_date: s.created_at }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    )
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  if (loading) {
    return <div className="feed-loading"><div className="feed-loading-spinner" /><p>Loading profile...</p></div>
  }

  if (!profile) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
        <button onClick={() => navigate(-1)} aria-label="Go back" style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem' }}>&#8592;</button>
        <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Profile not found</div>
      </div>
    )
  }

  const avatarUrl = profile.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${userId}`

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
      <button onClick={() => navigate(-1)} aria-label="Go back" style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem', marginBottom: '0.5rem' }}>&#8592;</button>

      {/* Profile header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
        <img
          src={avatarUrl}
          alt=""
          style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#222', border: '2px solid #333' }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{profile.display_name || 'Neighbor'}</h1>
            {profile.is_hope_ambassador && (
              <span style={{ background: '#1a4a3a', color: '#4ecca3', fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
                Hope Ambassador
              </span>
            )}
          </div>
          <div style={{ color: '#999', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Member since {formatDate(profile.created_at)}
          </div>
          {profile.show_location && profile.neighborhood && (
            <div style={{ color: '#888', fontSize: '0.8rem' }}>{profile.neighborhood}</div>
          )}
        </div>
      </div>

      {/* Vouches */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.25rem', padding: '0.75rem 1rem', background: '#1a1a1a', borderRadius: '12px', border: '1px solid #333' }}>
        <VouchButton userId={userId} size="sm" showCount={true} />
      </div>

      {/* Tabs */}
      <div className="tasks-tabs" style={{ marginBottom: '1rem' }}>
        <button className={'tasks-tab' + (tab === 'requests' ? ' tasks-tab-active' : '')} onClick={() => setTab('requests')}>
          Requests {completedCount > 0 && <span style={{ marginLeft: "0.3rem", background: "#1a4a3a", color: "#4ecca3", fontSize: "0.65rem", fontWeight: 700, padding: "1px 6px", borderRadius: "8px" }}>{completedCount} completed</span>}
        </button>
        <button className={'tasks-tab' + (tab === 'events' ? ' tasks-tab-active' : '')} onClick={() => setTab('events')}>
          Events
        </button>
      </div>

      {/* Requests tab */}
      {tab === 'requests' && (
        requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>No completed requests yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {requests.map((r, i) => (
              <div key={r.id + '-' + r.role + '-' + i} style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>{r.skill_needed}</div>
                  <div style={{ color: '#888', fontSize: '0.75rem' }}>
                    {r.role === 'helper' ? 'Helped' : 'Requested'} &middot; {formatDate(r.created_at)}
                  </div>
                </div>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                  background: r.status === 'completed' ? '#1a2e26' : '#2a2518',
                  color: r.status === 'completed' ? '#4ecca3' : '#b8860b',
                }}>
                  {r.status === 'completed' ? 'Completed' : r.status}
                </span>
              </div>
            ))}
          </div>
        )
      )}

      {/* Events tab */}
      {tab === 'events' && (
        events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>No event participation yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {events.map((e, i) => (
              <div key={e.id + '-' + i} style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>{e.title}</div>
                  <div style={{ color: '#888', fontSize: '0.75rem' }}>
                    {e.event_type} &middot; {formatDate(e.created_at)}
                  </div>
                </div>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                  background: e.status === 'closed' ? '#1a2e26' : '#2a2518',
                  color: e.status === 'closed' ? '#4ecca3' : '#b8860b',
                }}>
                  {e.status === 'closed' ? 'Resolved' : 'Active'}
                </span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}