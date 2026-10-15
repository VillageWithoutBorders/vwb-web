import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Your avatar in the top bar. Opens Your corner: profile, past tasks, settings, and more.
// Shows the avatar you made (or the drawn one others see). The letter shows only if it can't load.
export default function MeButton() {
  const { user, profile } = useAuth()
  const { pathname } = useLocation()
  const [failed, setFailed] = useState(false)
  const letter = ((profile?.display_name || '').trim().charAt(0) || '?').toUpperCase()
  const src = profile?.avatar_url || 'https://api.dicebear.com/7.x/thumbs/svg?seed=' + (user?.id || 'default')
  const here = pathname === '/me'
  return (
    <Link
      to="/me"
      className={'header-btn me-btn' + (here ? ' on' : '')}
      data-tour="me"
      aria-label="Your corner: profile, settings, and more"
      aria-current={here ? 'page' : undefined}
    >
      {failed
        ? <span className="me-btn-letter" aria-hidden="true">{letter}</span>
        : <img className="me-btn-img" src={src} alt="" width="26" height="26" onError={() => setFailed(true)} />}
      <span className="header-btn-label" aria-hidden="true">You</span>
    </Link>
  )
}
