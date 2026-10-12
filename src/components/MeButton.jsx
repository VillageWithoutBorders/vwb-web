import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Your letter in the top bar. Opens Your corner: profile, past tasks, settings, and more.
// VWB never shows photos, so this is always a letter.
export default function MeButton() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const letter = ((profile?.display_name || '').trim().charAt(0) || '?').toUpperCase()
  const here = pathname === '/me'
  return (
    <Link
      to="/me"
      className={'me-btn' + (here ? ' on' : '')}
      data-tour="me"
      aria-label="Your corner: profile, settings, and more"
      aria-current={here ? 'page' : undefined}
    >
      <span aria-hidden="true">{letter}</span>
    </Link>
  )
}
