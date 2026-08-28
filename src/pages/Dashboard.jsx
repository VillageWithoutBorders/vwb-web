import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'

export default function Dashboard() {
  const { profile } = useAuth()
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

      <div className="welcome-section">
        <h1>Welcome back, {displayName}</h1>
        <p className="welcome-sub">What do you need today?</p>
      </div>

      <div className="quick-actions">
        <button
          className="action-card"
          onClick={() => navigate('/ask')}
        >
          <span className="action-icon" aria-hidden="true">🤲</span>
          <span className="action-label">Ask for Help</span>
          <span className="action-desc">Post a request for your community</span>
        </button>

        <button
          className="action-card"
          onClick={() => navigate('/skillshare')}
        >
          <span className="action-icon" aria-hidden="true">🌱</span>
          <span className="action-label">SkillShare</span>
          <span className="action-desc">See what neighbors are offering</span>
        </button>

        <button
          className="action-card"
          onClick={() => navigate('/community')}
        >
          <span className="action-icon" aria-hidden="true">🔨</span>
          <span className="action-label">Community</span>
          <span className="action-desc">Resource library, events, and feedback</span>
        </button>
        <button
          className="action-card"
          onClick={() => navigate('/messages')}
        >
          <span className="action-icon" aria-hidden="true">💬</span>
          <span className="action-label">Messages</span>
          <span className="action-desc">Resource library, events, and feedback</span>
        </button>
      </div>

      {profile?.is_hope_ambassador && (
        <div className="ambassador-banner">
          <span className="ambassador-badge">Hope Ambassador</span>
          <p>You're signed up to help. We'll match you with requests in your area.</p>
        </div>
      )}
    </div>
  )
}
