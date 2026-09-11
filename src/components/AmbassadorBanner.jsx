import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Encourages any Neighbor who isn't already a Hope Ambassador to become one.
// Dismissible like InstallBanner/PushBanner, and re-appears after a couple
// weeks rather than being gone forever after one "Not now" tap.
export default function AmbassadorBanner() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!profile) return
    if (profile.is_hope_ambassador || isAdmin) return

    const dismissed = localStorage.getItem('vwb_ambassador_dismissed')
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10)
      if (Date.now() - dismissedAt < 14 * 24 * 60 * 60 * 1000) return
    }
    setVisible(true)
  }, [profile, isAdmin])

  function handleDismiss() {
    localStorage.setItem('vwb_ambassador_dismissed', Date.now().toString())
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="push-banner">
      <div className="push-banner-content">
        <span className="push-banner-icon" aria-hidden="true">&#9733;</span>
        <div className="push-banner-text">
          <strong>Become a Hope Ambassador</strong>
          <p>Share a skill, an hour, or a ride, and we'll match you with neighbors nearby who need one. Most people who join VWB sign up as an Ambassador.</p>
        </div>
      </div>
      <div className="push-banner-actions">
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/profile')}>Get started</button>
        <button className="push-banner-dismiss" onClick={handleDismiss}>Not now</button>
      </div>
    </div>
  )
}
