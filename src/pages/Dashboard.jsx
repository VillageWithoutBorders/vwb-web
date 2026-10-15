import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { getMyLocation } from '../utils/location'
import { peekReturnTo } from '../utils/returnTo'
import PushBanner from '../components/PushBanner'
import InstallBanner from '../components/InstallBanner'
import RecoveryNudge from '../components/RecoveryNudge'
import AmbassadorBanner from '../components/AmbassadorBanner'
import HomeTasks from '../components/HomeTasks'
import Icon from '../components/Icon'
import NearbyNeedTiles from '../components/NearbyNeedTiles'

function VillageAsk() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Only ask people who have not answered yet.
  if (!profile || profile.village_opt_in !== null && profile.village_opt_in !== undefined) return null

  async function answer(yes) {
    setSaving(true); setError('')
    const { error: err } = await supabase.from('helper_profiles').update({ village_opt_in: yes }).eq('user_id', profile.user_id)
    if (err) { console.error('[VillageAsk]', err); setError('Could not save that. Try again.'); setSaving(false); return }
    await refreshProfile()
    setSaving(false)
    if (yes && !profile.zip_code) { navigate('/profile'); return }
    // Yes opens the list of village chats near them. They read the warning and join from there.
    if (yes) navigate('/find-village')
  }

  return (
    <div className="village-ask" role="region" aria-label="Local village chat">
      <p className="village-ask-title"><span aria-hidden="true">&#127969;</span> Join a village chat?</p>
      <p className="village-ask-text">Village chats are for neighbors in your area. We use your zip code to find them. You can join more than one, and you can leave any time from your Profile.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="village-ask-buttons">
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => answer(true)}>Yes, join</button>
        <button type="button" className="btn btn-outline" disabled={saving} onClick={() => answer(false)}>No thanks</button>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { profile, isAdmin, organizations } = useAuth()
  // Founders and admins can open any group's dashboard, even if they aren't a member.
  const runsAGroup = organizations.some((o) => o.role === 'admin' || o.role === 'organizer')
  const navigate = useNavigate()
  const location = useLocation()
  const displayName = profile?.display_name || 'Neighbor'
  const successMessage = location.state?.message

  // Coming back from "confirm your email" after tapping Sign up on an event:
  // send them to that event instead of leaving them on the home screen.
  useEffect(() => {
    const back = peekReturnTo()
    if (back) navigate(back, { replace: true })
  }, [navigate])

  return (
    <div className="dashboard">
      {successMessage && (
        <p className="form-success" role="status" style={{ marginBottom: '1rem' }}>
          {successMessage}
        </p>
      )}
      {profile?.is_hope_ambassador && (
        <div style={{ marginBottom: "0.75rem", background: "linear-gradient(135deg, var(--success-bg), var(--border))", border: "2px solid var(--accent)", borderRadius: "16px", padding: "0.6rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
          <span style={{ fontSize: "1.5rem" }}>&#9733;</span>
          <div>
            <span style={{ display: "block", color: "var(--accent)", fontWeight: 700, fontSize: "0.8rem", lineHeight: 1.2 }}>Hope Ambassador</span>
            <span style={{ color: "var(--accent)", fontSize: "0.65rem" }}>Active and ready to help</span>
          </div>
        </div>
      )}
      <div className="welcome-section">
        <h1>Welcome back, {displayName}</h1>
        <p className="welcome-sub">What do you need today?</p>
      </div>
      {/* Community, SkillShare, and Messages already live in the bottom tab
          bar, so they're deliberately left out here rather than repeated.
          Home keeps two big buttons and a short More row. Ambassador and admin
          tools sit in a closed fold. The Emergency button stays at the bottom. */}
      <div className="home-primary">
        <button type="button" className="btn btn-primary home-btn" onClick={() => navigate('/ask')}>
          <span aria-hidden="true">&#127384;</span> Ask for help
        </button>
        <button type="button" className="btn btn-outline home-btn" onClick={() => navigate('/skillshare')}>
          <span aria-hidden="true">&#128154;</span> I can help
        </button>
      </div>
      <HomeTasks />
      {(profile?.is_hope_ambassador || isAdmin) && <NearbyNeedTiles />}
      <AmbassadorBanner />
      <VillageAsk />
      <PushBanner />
      <InstallBanner />
      <RecoveryNudge />
      <p className="home-more-label">More</p>
      <div className="home-tiles">
        <button type="button" className="home-tile" aria-label="Find help: food, housing, safety, and more near you" onClick={() => navigate('/community/resources')}>
          <span className="home-tile-icon" aria-hidden="true"><Icon name="heart-hands" /></span>Find help
        </button>
        <button type="button" className="home-tile" aria-label="Community: what is happening and who is organizing near you" onClick={() => navigate('/community')}>
          <span className="home-tile-icon" aria-hidden="true"><Icon name="people" /></span>Community
        </button>
        <button type="button" className="home-tile" aria-label="Cottage Chats and Campfires: your private chats, invites, and join links" onClick={() => navigate('/groups')}>
          <span className="home-tile-icon" aria-hidden="true">&#129309;</span>Chats
        </button>
        <button type="button" className="home-tile" aria-label="Village Square: announcements and your village chat" onClick={() => navigate('/campfire')}>
          <span className="home-tile-icon" aria-hidden="true">&#128227;</span>Square
        </button>
        <button type="button" className="home-tile" aria-label="Village Map: see every village and how they connect" onClick={() => navigate('/villages')}>
          <span className="home-tile-icon" aria-hidden="true">&#128506;</span>Map
        </button>
        {runsAGroup && (
          <button type="button" className="home-tile" aria-label="Organization Dashboard: events, members, needs and offers for your organization" onClick={() => navigate('/org-dashboard')}>
            <span className="home-tile-icon" aria-hidden="true">&#127968;</span>My organization
          </button>
        )}
      </div>
      {(profile?.is_hope_ambassador || isAdmin) && (
        <details className="home-fold">
          <summary>Ambassador and admin tools</summary>
          <div className="quick-actions">
            <button className="action-card" onClick={() => navigate('/campfire')}>
              <span className="action-icon" aria-hidden="true">&#128227;</span>
              <span className="action-label">Village Square</span>
              <span className="action-desc">Chat with fellow ambassadors and admins</span>
            </button>
            {isAdmin && (
              <button className="action-card" onClick={() => navigate('/admin')}>
                <span className="action-icon" aria-hidden="true">&#9881;</span>
                <span className="action-label">Admin Panel</span>
                <span className="action-desc">Reports, users, villages, and approvals</span>
              </button>
            )}
          </div>
        </details>
      )}
      <button data-tour="emergency" onClick={() => navigate('/emergency')} style={{ display: "flex", alignItems: "center", gap: "0.75rem", width: "100%", marginTop: "1.25rem", padding: "1rem 1.25rem", borderRadius: "12px", border: "2px solid var(--warn)", background: "linear-gradient(135deg, var(--warn-bg), var(--warn-bg))", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontSize: "2rem", lineHeight: 1, color: "var(--warn)" }}>&#9888;</span>
        <div>
          <span style={{ display: "block", color: "var(--gold)", fontWeight: 700, fontSize: "1rem" }}>Emergency Response</span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Floods, storms, fires, and outages that hit many neighbors</span>
        </div>
      </button>
    </div>
  )
}
