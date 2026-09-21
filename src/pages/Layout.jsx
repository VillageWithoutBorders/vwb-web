import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import BottomTabs from '../components/BottomTabs'
import LogoMenu from '../components/LogoMenu'
import { useNotifications } from '../hooks/useNotifications'

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
          <LogoMenu />
          <button className="header-bell" onClick={() => navigate('/notifications')} aria-label="Notifications">
            <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
            {unreadCount > 0 && <span className="bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
        </div>
      </header>
      <main className={'app-main' + (isChat ? ' app-main-chat' : '')}>
        <Outlet />
      </main>
      <BottomTabs />
    </div>
  )
}
