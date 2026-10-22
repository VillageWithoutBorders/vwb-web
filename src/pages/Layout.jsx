import Icon from '../components/Icon'
import { useCallback, useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSimpleView, setSimpleLocal, isSimpleView } from '../utils/simpleView'
import SimpleOffer from '../components/SimpleOffer'
import BottomTabs from '../components/BottomTabs'
import MeButton from '../components/MeButton'
import AlertsMenu from '../components/AlertsMenu'
import AdminShield from '../components/AdminShield'
import AppTour from '../components/AppTour'
import KeyRestorePrompt from '../components/KeyRestorePrompt'
import { PageBackContext, FrameBack } from '../components/BackLink'

export default function Layout() {
  const { pathname } = useLocation()
  const { profile, isAdmin } = useAuth()
  const simple = useSimpleView()
  // The account says which view to use. Follow it on this phone too.
  useEffect(() => {
    const v = profile?.simple_view
    if (typeof v === 'boolean' && v !== isSimpleView()) setSimpleLocal(v)
  }, [profile?.simple_view])
  // Chats fill the space between the top bar and the tabs, edge to edge,
  // instead of sitting inside the padded page column.
  // World pages (the globe, a village, an organization) fill the whole screen
  // with their own teal background, edge to edge.
  const isWorld = (pathname === '/' && !simple) || pathname === '/world' || pathname === '/cottage' || /^\/village\/[^/]+$/.test(pathname) || /^\/orgs\/[^/]+$/.test(pathname)
  const isChat = pathname === '/village-square' || pathname.startsWith('/conversation/') || /^\/groups\/[^/]+$/.test(pathname)

  // Back button on every page (Oct 22, Jade). Not on Home (the globe), and not on chats,
  // which have their own back arrow. Pages with their own BackLink hide this one.
  const [ownBacks, setOwnBacks] = useState(0)
  const tellFrame = useCallback((n) => setOwnBacks((c) => c + n), [])
  const showBack = !ownBacks && !isChat && pathname !== '/' && pathname !== '/world'

  // The Admin page gets a wider column on a computer for its side menu.
  const isAdminPage = pathname === '/admin'

  return (
    <div className="app-shell">
      <header className="app-header">
        {/* Always here, left to right: World (the globe), Calendar, Today (in the middle), Alerts, your cottage. */}
        <nav className={'app-header-inner header-nav' + (isAdmin ? ' header-nav-admin' : '')} aria-label="Top menu">
          {!simple && (<>
          <Link to="/world" className={'header-btn' + (pathname === '/world' ? ' on' : '')} aria-current={pathname === '/world' ? 'page' : undefined} aria-label="World: your networks on the globe" data-tour="top-home">
            <img className="header-btn-logo" src="/images/vwb_header-v2.png" alt="" width="26" height="26" />
            <span className="header-btn-label" aria-hidden="true">World</span>
          </Link>
          <Link to="/calendar" className={'header-btn' + (pathname.startsWith('/calendar') ? ' on' : '')} aria-current={pathname === '/calendar' ? 'page' : undefined} aria-label="Calendar" data-tour="top-calendar">
            <Icon name="calendar" size={26} className="header-btn-pic" />
            <span className="header-btn-label" aria-hidden="true">Calendar</span>
          </Link>
          <Link to="/today" className={'header-btn' + (pathname === '/today' ? ' on' : '')} aria-current={pathname === '/today' ? 'page' : undefined} aria-label="Today: what needs you, your shortcuts and places" data-tour="top-dashboard">
            <Icon name="clipboard" size={26} className="header-btn-pic" />
            <span className="header-btn-label" aria-hidden="true">Today</span>
          </Link>
          </>)}
          {/* Admins and founders: the shield opens the shared Admin inbox. */}
          {/* On phones the shield moves to My tools in the bottom bar, so the top bar stays calm (Oct 22). */}
          {isAdmin && <span className="header-admin-wide"><AdminShield /></span>}
          {/* Tap for your 5 newest alerts, with "See all alerts" at the bottom. */}
          <AlertsMenu />
          <MeButton />
        </nav>
      </header>
      <main className={'app-main' + (isChat ? ' app-main-chat' : '') + (isWorld ? ' app-main-world' : '') + (isAdminPage ? ' app-main-admin' : '')}>
        {showBack && <FrameBack world={isWorld} />}
        <PageBackContext.Provider value={tellFrame}>
          <Outlet />
        </PageBackContext.Provider>
      </main>
      <BottomTabs />
      <SimpleOffer />
      <AppTour />
      <KeyRestorePrompt />
    </div>
  )
}
