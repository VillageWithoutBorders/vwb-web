import { Link, useLocation } from 'react-router-dom'
import { useSimpleView } from '../utils/simpleView'
import Icon from './Icon'
import MyAvatar from './MyAvatar'

// Cottage in the top bar. Opens your cottage: your own map, with My Corner under it.
// Oct 25 (Jade): the top bar shows the cottage icon, the same one as Cottage Chats. Your avatar is on My Corner, next to it.
// Simple view has no maps or My Corner tab, so there it keeps your picture and opens My Corner.
export default function MeButton() {
  const { pathname } = useLocation()
  const simple = useSimpleView()
  const to = simple ? '/me' : '/cottage'
  const here = pathname === to
  return (
    <Link
      to={to}
      className={'header-btn me-btn' + (here ? ' on' : '')}
      data-tour="me"
      aria-label={simple ? 'My Corner: profile, settings, and more' : 'My Cottage: your own map'}
      aria-current={here ? 'page' : undefined}
    >
      {simple ? <MyAvatar size={26} /> : <Icon name="cottage" size={26} className="header-btn-pic" />}
      <span className="header-btn-label" aria-hidden="true">{simple ? 'My Corner' : <><span className="header-my">My </span>Cottage</>}</span>
    </Link>
  )
}

// My Corner in the top bar (Oct 25, Jade): your avatar. Opens /me: your profile,
// account, and settings.
const CORNER = ['/me', '/profile', '/settings', '/my-code', '/trail']
export function MyCornerButton() {
  const { pathname } = useLocation()
  const here = CORNER.some((p) => pathname === p || pathname.startsWith(p + '/'))
  return (
    <Link to="/me" className={'header-btn me-btn' + (here ? ' on' : '')} data-tour="corner"
      aria-label="My Corner: your profile, account, and settings" aria-current={pathname === '/me' ? 'page' : undefined}>
      <MyAvatar size={26} />
      <span className="header-btn-label" aria-hidden="true"><span className="header-my">My </span>Corner</span>
    </Link>
  )
}
