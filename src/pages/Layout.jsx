import { Outlet, useNavigate } from 'react-router-dom'
import BottomTabs from '../components/BottomTabs'
import { useNotifications } from '../hooks/useNotifications'

export default function Layout() {
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()

  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="https://villagewithoutborders.org" target="_blank" rel="noopener noreferrer"><img src="/images/vwb_header.png" alt="Village Without Borders" style={{ height: "40px", borderRadius: "50%" }} /></a>
        <button className="header-bell" onClick={() => navigate('/notifications')} aria-label="Notifications">
          <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
          {unreadCount > 0 && <span className="bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </button>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <BottomTabs />
    </div>
  )
}
