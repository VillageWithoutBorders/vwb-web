import { Link, Outlet, useLocation } from 'react-router-dom'
import BottomTabs from '../components/BottomTabs'
import AppMenu from '../components/AppMenu'
import AlertsMenu from '../components/AlertsMenu'
import AppTour from '../components/AppTour'
import KeyRestorePrompt from '../components/KeyRestorePrompt'

export default function Layout() {
  const { pathname } = useLocation()
  // Chats fill the space between the top bar and the tabs, edge to edge,
  // instead of sitting inside the padded page column.
  const isChat = pathname === '/campfire' || pathname.startsWith('/conversation/') || /^\/groups\/[^/]+$/.test(pathname)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          {/* The logo is a plain way home, like on most apps and websites. */}
          <Link to="/" className="header-logo" aria-label="Village Without Borders, go to Home">
            <img src="/images/vwb_header.png" alt="" width="40" height="40" />
          </Link>
          <div className="header-actions">
            {/* Tap for your 5 newest alerts, with "See all alerts" at the bottom. */}
            <AlertsMenu />
            <AppMenu />
          </div>
        </div>
      </header>
      <main className={'app-main' + (isChat ? ' app-main-chat' : '')}>
        <Outlet />
      </main>
      <BottomTabs />
      <AppTour />
      <KeyRestorePrompt />
    </div>
  )
}
