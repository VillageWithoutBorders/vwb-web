import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { getCurrentPosition } from '../utils/location'
import PushBanner from '../components/PushBanner'
import InstallBanner from '../components/InstallBanner'
import AmbassadorBanner from '../components/AmbassadorBanner'

// A few tiles for Hope Ambassadors and admins: how much open need there is
// nearby right now, grouped by urgency. Same radius idea as the SkillShare
// feed, but not filtered to your own skills, since this is meant to show
// the community's need as a whole.
function NearbyNeedTiles() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [counts, setCounts] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const loc = await getCurrentPosition()
      const radius = profile?.radius_miles || 10
      const { data, error } = await supabase.rpc('nearby_open_request_counts', {
        helper_lat: loc.lat, helper_lng: loc.lng, helper_radius: radius,
      })
      if (cancelled) return
      if (error) { console.error('Failed to load nearby request counts:', error); setReady(false); return }
      const byUrgency = {}
      for (const row of data || []) byUrgency[row.urgency] = row.request_count
      setCounts(byUrgency)
      setReady(true)
    }
    load()
    return () => { cancelled = true }
  }, [profile?.radius_miles])

  if (!ready) return null

  const now = counts.now || 0
  const today = counts.today || 0
  const later = (counts.this_week || 0) + (counts.flexible || 0)
  const total = now + today + later

  const tiles = [
    { label: 'Open near you', value: total, color: '#4ecca3' },
    { label: 'Right now', value: now, color: '#ff6666' },
    { label: 'Today', value: today, color: '#ffaa44' },
    { label: 'This week or later', value: later, color: '#8fc' },
  ]

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
        Need nearby
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
        {tiles.map(t => (
          <button
            key={t.label}
            onClick={() => navigate('/skillshare')}
            style={{ textAlign: 'left', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #333', background: '#1e1e1e', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: t.color }}>{t.value}</div>
            <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.15rem' }}>{t.label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const displayName = profile?.display_name || 'Neighbor'
  const successMessage = location.state?.message
  return (
    <div className="dashboard">
      {successMessage && (
        <p className="form-success" role="status" style={{ marginBottom: '1rem' }}>
          {successMessage}
        </p>
      )}
      {profile?.is_hope_ambassador && (
        <div style={{ marginBottom: "0.75rem", background: "linear-gradient(135deg, #1a4a3a, #2d5a45)", border: "2px solid #4ecca3", borderRadius: "16px", padding: "0.6rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
          <span style={{ fontSize: "1.5rem" }}>&#9733;</span>
          <div>
            <span style={{ display: "block", color: "#4ecca3", fontWeight: 700, fontSize: "0.8rem", lineHeight: 1.2 }}>Hope Ambassador</span>
            <span style={{ color: "#8fc", fontSize: "0.65rem" }}>Active and ready to help</span>
          </div>
        </div>
      )}
      <AmbassadorBanner />
      {(profile?.is_hope_ambassador || isAdmin) && <NearbyNeedTiles />}
      <PushBanner />
      <InstallBanner />
      <div className="welcome-section">
        <h1>Welcome back, {displayName}</h1>
        <p className="welcome-sub">What do you need today?</p>
      </div>
      {/* Community, SkillShare, and Messages already live in the bottom tab
          bar, so they're deliberately left out here rather than repeated.
          What's left are the things that don't have a tab of their own. */}
      <div className="quick-actions">
        <button className="action-card" onClick={() => navigate('/ask')}>
          <span className="action-icon" aria-hidden="true">&#127384;</span>
          <span className="action-label">Ask for Help</span>
          <span className="action-desc">Post a request for your community</span>
        </button>
        {(profile?.is_hope_ambassador || isAdmin) && (
          <button className="action-card" onClick={() => navigate('/campfire')}>
            <span className="action-icon" aria-hidden="true">&#128293;</span>
            <span className="action-label">Campfire</span>
            <span className="action-desc">Chat with fellow ambassadors and admins</span>
          </button>
        )}
        {isAdmin && (
          <button className="action-card" onClick={() => navigate('/admin')}>
            <span className="action-icon" aria-hidden="true">&#9881;</span>
            <span className="action-label">Admin Panel</span>
            <span className="action-desc">Reports, users, villages, and approvals</span>
          </button>
        )}
      </div>
      <button onClick={() => navigate('/emergency')} style={{ display: "flex", alignItems: "center", gap: "0.75rem", width: "100%", marginTop: "1.25rem", padding: "1rem 1.25rem", borderRadius: "12px", border: "2px solid #ffaa44", background: "linear-gradient(135deg, #2e2a1a, #3a3020)", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontSize: "2rem", lineHeight: 1, color: "#ffaa44" }}>&#9888;</span>
        <div>
          <span style={{ display: "block", color: "#ffcc00", fontWeight: 700, fontSize: "1rem" }}>Emergency Response</span>
          <span style={{ color: "#cc9999", fontSize: "0.8rem" }}>View active emergencies or report a new one</span>
        </div>
      </button>
    </div>
  )
}
