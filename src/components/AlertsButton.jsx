import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon'
import { useNotifications } from '../hooks/useNotifications'
import { useT } from '../utils/lang'

// Alerts in the top bar (Nov 10, Jade): a bell on the right, for everyone.
// It opens the Alerts page. The number shows how many are new, and clears
// once the page is seen. Role tools moved to My Corner > Your roles.
export default function AlertsButton() {
  const t = useT()
  const { pathname } = useLocation()
  const { badgeCount = 0 } = useNotifications()
  const here = pathname === '/notifications'
  const label = badgeCount > 0
    ? t('Alerts') + ', ' + t(badgeCount === 1 ? '1 new alert' : '{n} new alerts', { n: badgeCount })
    : t('Alerts')
  return (
    <Link to="/notifications" className={'header-btn' + (here ? ' on' : '')} data-tour="alerts"
      data-tip={t('See your alerts.')} aria-label={label} aria-current={here ? 'page' : undefined}>
      <Icon name="bell" size={26} className="header-btn-pic" />
      <span className="header-btn-label" aria-hidden="true">{t('Alerts')}</span>
      {badgeCount > 0 && <span className="bell-badge" aria-hidden="true">{badgeCount > 9 ? '9+' : badgeCount}</span>}
    </Link>
  )
}
