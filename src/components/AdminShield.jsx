import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon'
import { useAdminInbox } from '../hooks/useAdminInbox'

// The admin entrance in the top bar. Only VWB admins and founders see it.
// The number is how many things are waiting in the shared Admin inbox:
// red when something is urgent, gold otherwise.
export default function AdminShield() {
  const { pathname } = useLocation()
  const { total, urgent } = useAdminInbox()
  const on = pathname === '/admin' || pathname.startsWith('/admin/')
  const label = total > 0 ? 'Admin, ' + total + ' waiting' + (urgent ? ', some urgent' : '') : 'Admin'
  return (
    <Link to="/admin?tab=inbox" className={'header-btn' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} aria-label={label} data-tour="top-admin">
      <Icon name="shield" size={26} className="header-btn-pic" />
      <span className="header-btn-label" aria-hidden="true">Admin</span>
      {total > 0 && <span className={'bell-badge' + (urgent ? '' : ' admin-badge-calm')} aria-hidden="true">{total > 9 ? '9+' : total}</span>}
    </Link>
  )
}
