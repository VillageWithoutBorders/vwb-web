import { Link, Outlet, useLocation } from 'react-router-dom'
import BottomTabs from '../components/BottomTabs'
import MeButton from '../components/MeButton'
import AlertsMenu from '../components/AlertsMenu'
import AppTour from '../components/AppTour'
import KeyRestorePrompt from '../components/KeyRestorePrompt'

export default function Layout() {
  const { pathname } = useLocation()
  // Chats fill the space between the top bar and the tabs, edge to edge,
  // instead of sitting inside the padded page column.
  // World pages (the globe, a village, an organization) fill the whole screen
  // with their own teal background, edge to edge.
  const isWorld = pathname === '/' || /^\/village\/[^/]+$/.test(pathname) || /^\/orgs\/[^/]+$/.test(pathname)
  const isChat = pathname === '/campfire' || pathname.startsWith('/conversation/') || /^\/groups\/[^/]+$/.test(pathname)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          {/* The logo is a plain way home to the globe, like on most apps and websites. */}
          <Link to="/" className="header-logo" aria-label="Village Without Borders, go to the globe">
            <img src="/images/vwb_header.png" alt="" width="40" height="40" />
          </Link>
          <div className="header-actions">
            {/* Tap for your 5 newest alerts, with "See all alerts" at the bottom. */}
            <AlertsMenu />
            <MeButton />
          </div>
        </div>
      </header>
      <main className={'app-main' + (isChat ? ' app-main-chat' : '') + (isWorld ? ' app-main-world' : '')}>
        <Outlet />
      </main>
      <BottomTabs />
      <AppTour />
      <KeyRestorePrompt />
    </div>
  )
}
