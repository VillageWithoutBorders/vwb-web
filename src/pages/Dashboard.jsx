import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import PushBanner from '../components/PushBanner'
import InstallBanner from '../components/InstallBanner'
import AmbassadorBanner from '../components/AmbassadorBanner'
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
