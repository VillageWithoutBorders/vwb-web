import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import VouchButton from '../components/VouchButton'

export default function PublicProfile() {
  const { userId } = useParams()
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [reputation, setReputation] = useState(null)
  const [myVote, setMyVote] = useState(null)
  const [tab, setTab] = useState('requests')
  const [requests, setRequests] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState(false)
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

    const { data: hp } = await supabase
      .from('helper_profiles')
      .select('user_id, display_name, is_hope_ambassador, avatar_url, created_at, neighborhood, show_location, role')
      .eq('user_id', userId)
      .maybeSingle()

    setProfile(hp)

    const { data: rep } = await supabase
      .from('user_reputation')
      .select('upvotes, downvotes, net_score')
      .eq('user_id', userId)
      .maybeSingle()

    setReputation(rep)

    if (user?.id && user.id !== userId) {
      const { data: vote } = await supabase
        .from('user_votes')
        .select('vote')
        .eq('voter_id', user.id)
        .eq('voted_for_id', userId)
        .maybeSingle()
      setMyVote(vote?.vote || null)
    }

    setLoading(false)
    const { count: doneCount } = await supabase.from("help_requests").select("id", { count: "exact", head: true }).eq("requester_id", userId).eq("status", "completed")
    setCompletedCount(doneCount || 0)
  }

  async function loadRequests() {
    const { data } = await supabase
      .from('help_requests')
      .select('id, skill_needed, created_at, status')
      .eq('requester_id', userId)
      .or("archived_at.not.is.null,status.eq.completed")
      .order('created_at', { ascending: false })
      .limit(50)

    const { data: helped } = await supabase
      .from('skill_matches')
      .select('request_id, created_at, help_requests(id, skill_needed, created_at, status)')
      .eq('helper_id', userId)
      .eq('accepted', true)
      .limit(50)

    const helpedRequests = (helped || [])
      .filter(m => m.help_requests)
      .map(m => ({ ...m.help_requests, role: 'helper', match_date: m.created_at }))

    const ownRequests = (data || []).map(r => ({ ...r, role: 'requester' }))

    setRequests([...ownRequests, ...helpedRequests].sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    ))
  }

  async function loadEvents() {
    const { data: signups } = await supabase
      .from('event_signups')
      .select('event_id, role, created_at, emergency_events(id, title, event_type, created_at, status)')
      .eq('user_id', userId)
      .limit(50)

    setEvents(
      (signups || [])
        .filter(s => s.emergency_events)
        .map(s => ({ ...s.emergency_events, signup_role: s.role, signup_date: s.created_at }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    )
  }

  async function castVote(voteValue) {
    if (!user?.id || user.id === userId || voting) return
    setVoting(true)

    if (myVote === voteValue) {
      await supabase.from('user_votes').delete().eq('voter_id', user.id).eq('voted_for_id', userId)
      setMyVote(null)
    } else if (myVote !== null) {
      await supabase.from('user_votes').update({ vote: voteValue, updated_at: new Date().toISOString() }).eq('voter_id', user.id).eq('voted_for_id', userId)
      setMyVote(voteValue)
    } else {
      await supabase.from('user_votes').insert({ voter_id: user.id, voted_for_id: userId, vote: voteValue })
      setMyVote(voteValue)
    }

    const { data: rep } = await supabase.from('user_reputation').select('upvotes, downvotes, net_score').eq('user_id', userId).maybeSingle()
    setReputation(rep)
    setVoting(false)
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  if (loading) {
    return <div className="feed-loading"><div className="feed-loading-spinner" /><p>Loading profile...</p></div>
  }

  if (!profile) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Profile not found</div>
  }

  const isOwnProfile = user?.id === userId
  const avatarUrl = profile.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${userId}`
  const netScore = reputation?.net_score || 0

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>

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

      {/* Reputation + Vouches row */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.25rem', padding: '0.75rem 1rem', background: '#1a1a1a', borderRadius: '12px', border: '1px solid #333' }}>
        <VouchButton userId={userId} size="sm" showCount={true} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: netScore > 0 ? '#4ecca3' : netScore < 0 ? '#ff6666' : '#888', fontWeight: 700, fontSize: '1.1rem' }}>
            {netScore > 0 ? '+' : ''}{netScore}
          </span>
          <span style={{ color: '#888', fontSize: '0.8rem' }}>reputation</span>
        </div>

        {!isOwnProfile && user?.id && (
          <div style={{ display: 'flex', gap: '0.35rem', marginLeft: 'auto' }}>
            <button
              onClick={() => castVote(1)}
              disabled={voting}
              style={{
                padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid ' + (myVote === 1 ? '#4ecca3' : '#444'),
                background: myVote === 1 ? '#1a4a3a' : 'transparent', color: myVote === 1 ? '#4ecca3' : '#888',
                cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
              }}
              title="Upvote"
            >
              &#9650;
            </button>
            <button
              onClick={() => castVote(-1)}
              disabled={voting}
              style={{
                padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid ' + (myVote === -1 ? '#ff6666' : '#444'),
                background: myVote === -1 ? '#3a1a1a' : 'transparent', color: myVote === -1 ? '#ff6666' : '#888',
                cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
              }}
              title="Downvote"
            >
              &#9660;
            </button>
          </div>
        )}
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
