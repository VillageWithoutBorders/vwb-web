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
        {/* Always here, left to right: Home (the globe), Calendar, Dashboard (in the middle), Alerts, Your corner. */}
        <nav className="app-header-inner header-nav" aria-label="Top menu">
          <Link to="/" className={'header-btn' + (pathname === '/' ? ' on' : '')} aria-current={pathname === '/' ? 'page' : undefined} aria-label="Home: your networks on the globe" data-tour="top-home">
            <img className="header-btn-logo" src="/images/vwb_header.png" alt="" width="26" height="26" />
            <span className="header-btn-label" aria-hidden="true">Home</span>
          </Link>
          <Link to="/calendar" className={'header-btn' + (pathname.startsWith('/calendar') ? ' on' : '')} aria-current={pathname === '/calendar' ? 'page' : undefined} aria-label="Calendar" data-tour="top-calendar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
            <span className="header-btn-label" aria-hidden="true">Calendar</span>
          </Link>
          <Link to="/home" className={'header-btn' + (pathname === '/home' ? ' on' : '')} aria-current={pathname === '/home' ? 'page' : undefined} aria-label="Dashboard: your tasks and what is near you" data-tour="top-dashboard">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>
            <span className="header-btn-label" aria-hidden="true">Dashboard</span>
          </Link>
          {/* Tap for your 5 newest alerts, with "See all alerts" at the bottom. */}
          <AlertsMenu />
          <MeButton />
        </nav>
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
