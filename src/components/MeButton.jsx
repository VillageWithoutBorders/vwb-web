import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSimpleView } from '../utils/simpleView'

// Your picture in the top bar (Oct 22). Opens your cottage: your own map, with
// Your corner (profile, settings, QR code, app help) under it.
// Simple view has no maps, so there it opens Your corner on its own.
// Shows the avatar you made (or the drawn one others see). The letter shows only if it can't load.
export default function MeButton() {
  const { user, profile } = useAuth()
  const { pathname } = useLocation()
  const simple = useSimpleView()
  const [failed, setFailed] = useState(false)
  const letter = ((profile?.display_name || '').trim().charAt(0) || '?').toUpperCase()
  const src = profile?.avatar_url || 'https://api.dicebear.com/7.x/thumbs/svg?seed=' + (user?.id || 'default')
  const to = simple ? '/me' : '/cottage'
  const here = pathname === to
  return (
    <Link
      to={to}
      className={'header-btn me-btn' + (here ? ' on' : '')}
      data-tour="me"
      aria-label={simple ? 'Your corner: profile, settings, and more' : 'Your cottage: your map, profile, and settings'}
      aria-current={here ? 'page' : undefined}
    >
      {failed
        ? <span className="me-btn-letter" aria-hidden="true">{letter}</span>
        : <img className="me-btn-img" src={src} alt="" width="26" height="26" onError={() => setFailed(true)} />}
      <span className="header-btn-label" aria-hidden="true">{simple ? 'Your corner' : 'Cottage'}</span>
    </Link>
  )
}
