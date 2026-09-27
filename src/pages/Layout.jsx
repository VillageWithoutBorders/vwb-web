import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import BottomTabs from '../components/BottomTabs'
import AppMenu from '../components/AppMenu'
import { useNotifications } from '../hooks/useNotifications'
import AppTour from '../components/AppTour'

export default function Layout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // Chats fill the space between the top bar and the tabs, edge to edge,
  // instead of sitting inside the padded page column.
  const isChat = pathname === '/campfire' || pathname.startsWith('/conversation/')
  const { unreadCount } = useNotifications()

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          {/* The logo is a plain way home, like on most apps and websites. */}
          <Link to="/" className="header-logo" aria-label="Village Without Borders, go to Home">
            <img src="/images/vwb_header.png" alt="" width="40" height="40" />
          </Link>
          <div className="header-actions">
            <button
              type="button"
              className="header-btn"
              onClick={() => navigate('/notifications')}
              aria-label={unreadCount > 0 ? `Alerts, ${unreadCount} new` : 'Alerts'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
              <span className="header-btn-label" aria-hidden="true">Alerts</span>
              {unreadCount > 0 && <span className="bell-badge" aria-hidden="true">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            <AppMenu />
          </div>
        </div>
      </header>
      <main className={'app-main' + (isChat ? ' app-main-chat' : '')}>
        <Outlet />
      </main>
      <BottomTabs />
      <AppTour />
    </div>
  )
}
