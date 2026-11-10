import { Link, useLocation } from 'react-router-dom'
import { useSimpleView } from '../utils/simpleView'
import Icon from './Icon'
import MyAvatar from './MyAvatar'
import { useT } from '../utils/lang'

// Cottage in the top bar. Opens your cottage: your own map, with My Corner under it.
// Oct 25 (Jade): the top bar shows the cottage icon, the same one as Cottage Chats. Your avatar is on My Corner, next to it.
// Simple view has no maps or My Corner tab, so there it keeps your picture and opens My Corner.
// The Admin inbox number (Nov 10): it used to sit on My Tools. Now it sits on My Corner,
// where Your roles lives. Soft gold unless something is urgent.
function InboxBadge({ n, urgent }) {
  if (!(n > 0)) return null
  return <span className={'bell-badge' + (urgent ? '' : ' admin-badge-calm')} aria-hidden="true">{n > 9 ? '9+' : n}</span>
}
function inboxWords(t, n, urgent) {
  if (!(n > 0)) return ''
  return ', ' + t(urgent ? '{n} waiting in the Admin inbox, some urgent' : '{n} waiting in the Admin inbox', { n })
}

export default function MeButton({ adminWaiting = 0, adminUrgent = false }) {
  const { pathname } = useLocation()
  const simple = useSimpleView()
  const t = useT()
  const to = simple ? '/me' : '/cottage'
  const here = pathname === to
  return (
    <Link
      to={to}
      className={'header-btn me-btn' + (here ? ' on' : '')}
      data-tour="me"
      data-tip={simple ? t('My Corner: your profile, settings, and account.') : t('My Cottage: your own place. Your garden, chats, calendar, groups, connections, and who can visit.')}
      aria-label={simple ? t('My Corner: profile, settings, and more') + inboxWords(t, adminWaiting, adminUrgent) : t('My Cottage: your own map')}
      aria-current={here ? 'page' : undefined}
    >
      {simple ? <MyAvatar size={26} /> : <Icon name="cottage" size={26} className="header-btn-pic" />}
      <span className="header-btn-label" aria-hidden="true">{simple ? t('My Corner') : <><span className="header-my">{t('My ')}</span>{t('Cottage')}</>}</span>
      {simple && <InboxBadge n={adminWaiting} urgent={adminUrgent} />}
    </Link>
  )
}

// My Corner in the top bar (Oct 25, Jade): your avatar. Opens /me: your profile,
// account, settings, and your roles (Nov 10).
const CORNER = ['/me', '/profile', '/settings', '/my-code', '/trail']
export function MyCornerButton({ adminWaiting = 0, adminUrgent = false }) {
  const t = useT()
  const { pathname } = useLocation()
  const here = CORNER.some((p) => pathname === p || pathname.startsWith(p + '/'))
  return (
    <Link to="/me" className={'header-btn me-btn' + (here ? ' on' : '')} data-tour="corner" data-tip={t('My Corner: your profile, settings, and account.')}
      aria-label={t('My Corner: your profile, account, and settings') + inboxWords(t, adminWaiting, adminUrgent)} aria-current={pathname === '/me' ? 'page' : undefined}>
      <MyAvatar size={26} />
      <span className="header-btn-label" aria-hidden="true"><span className="header-my">{t('My ')}</span>{t('Corner')}</span>
      <InboxBadge n={adminWaiting} urgent={adminUrgent} />
    </Link>
  )
}
