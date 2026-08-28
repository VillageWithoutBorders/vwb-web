import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

export default function Admin() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('emergencies')
  const [loading, setLoading] = useState(true)
  const [pendingEvents, setPendingEvents] = useState([])
  const [alerts, setAlerts] = useState([])
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState({})

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadPending(), loadAlerts(), loadUsers(), loadStats()])
    setLoading(false)
  }

  async function loadPending() {
    const { data } = await supabase.from('emergency_events').select('*').eq('verified', false).eq('status', 'active').order('created_at', { ascending: false })
    if (data) setPendingEvents(data)
  }

  async function loadAlerts() {
    const { data } = await supabase.from('safety_alerts').select('*').order('created_at', { ascending: false }).limit(50)
    if (data) {
      const withNames = await Promise.all(data.map(async (a) => {
        const { data: reporter } = await supabase.from('helper_profiles').select('display_name').eq('user_id', a.reporter_id).maybeSingle()
        const { data: reported } = a.reported_user_id ? await supabase.from('helper_profiles').select('display_name').eq('user_id', a.reported_user_id).maybeSingle() : { data: null }
        return { ...a, reporter_name: reporter?.display_name || 'Unknown', reported_name: reported?.display_name || 'Unknown' }
      }))
      setAlerts(withNames)
    }
  }

  async function loadUsers() {
    const { data } = await supabase.from('helper_profiles').select('user_id, display_name, is_hope_ambassador, is_available, created_at').order('created_at', { ascending: false })
    if (data) {
      const withVouches = await Promise.all(data.map(async (u) => {
        const { count } = await supabase.from('vouches').select('id', { count: 'exact', head: true }).eq('vouched_for_id', u.user_id)
        const { data: prof } = await supabase.from('profiles').select('role').eq('id', u.user_id).maybeSingle()
        return { ...u, vouch_count: count || 0, role: prof?.role || 'member' }
      }))
      setUsers(withVouches)
    }
  }

  async function loadStats() {
    const { count: userCount } = await supabase.from('helper_profiles').select('id', { count: 'exact', head: true })
    const { count: ambassadorCount } = await supabase.from('helper_profiles').select('id', { count: 'exact', head: true }).eq('is_hope_ambassador', true)
    const { count: requestCount } = await supabase.from('help_requests').select('id', { count: 'exact', head: true })
    const { count: matchCount } = await supabase.from('skill_matches').select('id', { count: 'exact', head: true })
    const { count: eventCount } = await supabase.from('emergency_events').select('id', { count: 'exact', head: true }).eq('status', 'active')
    const { count: alertCount } = await supabase.from('safety_alerts').select('id', { count: 'exact', head: true })
    setStats({ users: userCount || 0, ambassadors: ambassadorCount || 0, requests: requestCount || 0, matches: matchCount || 0, events: eventCount || 0, alerts: alertCount || 0 })
  }

  async function verifyEvent(eventId) {
    await supabase.from('emergency_events').update({ verified: true }).eq('id', eventId)
    await loadPending()
  }

  async function rejectEvent(eventId) {
    if (!confirm('Reject and close this event report?')) return
    await supabase.from('emergency_events').update({ status: 'closed' }).eq('id', eventId)
    await loadPending()
  }

  async function promoteUser(userId, toRole) {
    if (toRole === 'ambassador') {
      await supabase.from('helper_profiles').update({ is_hope_ambassador: true }).eq('user_id', userId)
    } else if (toRole === 'admin') {
      if (!confirm('Promote this user to admin? They will have full management access.')) return
      await supabase.from('profiles').update({ role: 'admin' }).eq('id', userId)
    }
    await loadUsers()
  }

  async function demoteUser(userId) {
    if (!confirm('Remove admin role from this user?')) return
    await supabase.from('profiles').update({ role: 'member' }).eq('id', userId)
    await loadUsers()
  }

  if (profile?.role !== 'admin') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>&#128274;</p>
        <p style={{ fontWeight: 700 }}>Admin access only</p>
        <button onClick={() => navigate('/profile')} style={{ marginTop: '1rem', padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer' }}>Back to Profile</button>
      </div>
    )
  }

  function timeAgo(ts) {
    const d = new Date(ts)
    const diff = Date.now() - d.getTime()
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 1) return 'Just now'
    if (hrs < 24) return hrs + 'h ago'
    return Math.floor(hrs / 24) + 'd ago'
  }

  const tabStyle = (active) => ({ padding: '0.5rem 0.85rem', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', background: active ? '#4ecca3' : '#2a2a2a', color: active ? '#1a1a1a' : '#aaa' })
  const cardStyle = { background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem' }

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <button onClick={() => navigate('/profile')} style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer' }}>&#8592;</button>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#4ecca3' }}>Admin Panel</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4ecca3' }}>{stats.users}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Users</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4ecca3' }}>{stats.ambassadors}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Ambassadors</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4ecca3' }}>{stats.requests}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Requests</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#66aaff' }}>{stats.matches}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Matches</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ff6644' }}>{stats.events}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Events</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: stats.alerts > 0 ? '#ff4444' : '#888' }}>{stats.alerts}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Reports</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginBottom: '1rem' }}>
        <button style={tabStyle(tab === 'emergencies')} onClick={() => setTab('emergencies')}>Emergencies ({pendingEvents.length})</button>
        <button style={tabStyle(tab === 'users')} onClick={() => setTab('users')}>Users ({users.length})</button>
        <button style={tabStyle(tab === 'reports')} onClick={() => setTab('reports')}>Reports ({alerts.length})</button>
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>Loading...</p>}

      {!loading && tab === 'emergencies' && (
        <>
          {pendingEvents.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>No pending emergency reports</p>
          ) : pendingEvents.map(ev => (
            <div key={ev.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ background: '#ffaa44', color: '#1a1a1a', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>PENDING</span>
                  <h3 style={{ margin: '0.4rem 0 0.2rem', fontSize: '1rem' }}>{ev.title}</h3>
                </div>
                <span style={{ color: '#888', fontSize: '0.75rem' }}>{timeAgo(ev.created_at)}</span>
              </div>
              {ev.location_name && <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.2rem 0' }}>{ev.location_name}</p>}
              {ev.description && <p style={{ color: '#999', fontSize: '0.8rem', margin: '0.2rem 0' }}>{ev.description}</p>}
              <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.4rem 0' }}>Upvotes: {ev.upvote_count || 0} / 3 needed</p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button onClick={() => verifyEvent(ev.id)} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Approve</button>
                <button onClick={() => rejectEvent(ev.id)} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid #ff4444', background: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '0.85rem' }}>Reject</button>
              </div>
            </div>
          ))}
        </>
      )}

      {!loading && tab === 'users' && (
        <>
          {users.map(u => (
            <div key={u.user_id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{u.display_name || 'Unnamed'}</span>
                  {u.role === 'admin' && <span style={{ marginLeft: '0.4rem', background: '#1a3a5a', color: '#66aaff', fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: '4px' }}>Admin</span>}
                  {u.is_hope_ambassador && <span style={{ marginLeft: '0.4rem', background: '#1a4a3a', color: '#4ecca3', fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: '4px' }}>Ambassador</span>}
                </div>
                <span style={{ color: '#888', fontSize: '0.7rem' }}>{u.vouch_count} vouches</span>
              </div>
              <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.3rem 0 0' }}>Joined {new Date(u.created_at).toLocaleDateString()}</p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                {!u.is_hope_ambassador && (
                  <button onClick={() => promoteUser(u.user_id, 'ambassador')} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: 'none', background: '#2d5a45', color: '#4ecca3', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>Make Ambassador</button>
                )}
                {u.role !== 'admin' && u.user_id !== user.id && (
                  <button onClick={() => promoteUser(u.user_id, 'admin')} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: 'none', background: '#1a3a5a', color: '#66aaff', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>Make Admin</button>
                )}
                {u.role === 'admin' && u.user_id !== user.id && (
                  <button onClick={() => demoteUser(u.user_id)} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #ff4444', background: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '0.75rem' }}>Remove Admin</button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {!loading && tab === 'reports' && (
        <>
          {alerts.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>No safety reports</p>
          ) : alerts.map(a => (
            <div key={a.id} style={{ ...cardStyle, borderLeft: '3px solid #ff4444' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ background: '#3a1a1a', color: '#ff6666', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{a.alert_type}</span>
                <span style={{ color: '#888', fontSize: '0.75rem' }}>{timeAgo(a.created_at)}</span>
              </div>
              <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0.4rem 0 0.2rem' }}>
                <span style={{ color: '#aaa' }}>Reported by:</span> {a.reporter_name}
                {a.reported_user_id && <span style={{ color: '#aaa' }}> about </span>}
                {a.reported_user_id && a.reported_name}
              </p>
              {a.description && <p style={{ color: '#999', fontSize: '0.85rem', margin: '0.2rem 0' }}>{a.description}</p>}
            </div>
          ))}
        </>
      )}
    </div>
  )
}