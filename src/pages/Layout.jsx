import Icon from '../components/Icon'
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSimpleView, setSimpleLocal, isSimpleView } from '../utils/simpleView'
import SimpleOffer from '../components/SimpleOffer'
import BottomTabs from '../components/BottomTabs'
import MeButton, { MyCornerButton } from '../components/MeButton'
import MyToolsButton from '../components/MyToolsButton'
import { useMyTools } from '../hooks/useMyTools'
import { useAdminInbox } from '../hooks/useAdminInbox'
import AppTour from '../components/AppTour'
import KeyRestorePrompt from '../components/KeyRestorePrompt'
import { PageBackContext, FrameBack } from '../components/BackLink'

export default function Layout() {
  const { pathname } = useLocation()
  const { profile } = useAuth()
  // Your role tools and the Admin inbox count, for My Tools in the top bar.
  const tools = useMyTools()
  const { total: adminWaiting, urgent: adminUrgent } = useAdminInbox()
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
  const villageHere = pathname === '/village' || /^\/village\/[^/]+$/.test(pathname)
  const isChat = pathname === '/village-square' || pathname.startsWith('/conversation/') || /^\/groups\/[^/]+$/.test(pathname)

  // Back button on every page (Oct 22, Jade). Not on Home (the globe), and not on chats,
  // which have their own back arrow. Pages with their own BackLink hide this one.
  const [ownBacks, setOwnBacks] = useState(0)
  const tellFrame = useCallback((n) => setOwnBacks((c) => c + n), [])
  const showBack = !ownBacks && !isChat && pathname !== '/' && (simple || pathname !== '/world')

  // Every page opens at the top (Oct 22, Jade), except chats, which open at the newest
  // message, and links to a spot on a page (#corner and the like).
  useEffect(() => { try { window.history.scrollRestoration = 'manual' } catch { /* older browsers */ } }, [])
  useLayoutEffect(() => {
    if (isChat || window.location.hash) return
    window.scrollTo(0, 0)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Top and bottom bars stay put on a zoomed-in phone (Oct 25, Jade). When someone pinch
  // zooms the page, the browser lets fixed bars slide away with the page. This follows the
  // part of the page you can see and keeps both bars on screen, at their normal size.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    let raf = 0
    function follow() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const s = vv.scale || 1
        if (s <= 1.01) { root.classList.remove('vv-zoomed'); return }
        const H = root.clientHeight
        root.classList.add('vv-zoomed')
        root.style.setProperty('--vv-x', vv.offsetLeft + 'px')
        root.style.setProperty('--vv-top', vv.offsetTop + 'px')
        root.style.setProperty('--vv-bottom', (vv.offsetTop + vv.height - H) + 'px')
        root.style.setProperty('--vv-s', String(1 / s))
      })
    }
    follow()
    vv.addEventListener('resize', follow)
    vv.addEventListener('scroll', follow)
    return () => { cancelAnimationFrame(raf); vv.removeEventListener('resize', follow); vv.removeEventListener('scroll', follow); root.classList.remove('vv-zoomed') }
  }, [])

  // The Admin page gets a wider column on a computer for its side menu.
  const isAdminPage = pathname === '/admin'

  return (
    <div className="app-shell">
      <header className="app-header">
        {/* Oct 25 (Jade): top bar, left to right: My World, My Village, My Cottage,
            My Corner (profile, account, settings), and My Tools (alerts and role tools).
            The bottom bar is actions: Find Help, Offer Help, Calendar, Messages. */}
        <nav className="app-header-inner header-nav" aria-label="Top menu">
          {!simple && (<>
          <Link to="/world" className={'header-btn' + (pathname === '/world' ? ' on' : '')} aria-current={pathname === '/world' ? 'page' : undefined} aria-label="My World: your networks on the globe" data-tour="top-home">
            <img className="header-btn-logo" src="/images/vwb_header-v2.png" alt="" width="26" height="26" />
            <span className="header-btn-label" aria-hidden="true"><span className="header-my">My </span>World</span>
          </Link>
          <Link to="/village" className={'header-btn' + (villageHere ? ' on' : '')} aria-current={villageHere ? 'page' : undefined} aria-label="My Village: your home village" data-tour="top-village">
            <Icon name="houses" size={26} className="header-btn-pic" />
            <span className="header-btn-label" aria-hidden="true"><span className="header-my">My </span>Village</span>
          </Link>
          <MeButton />
          <MyCornerButton />
          <MyToolsButton tools={tools} adminWaiting={adminWaiting} adminUrgent={adminUrgent} />
          </>)}
          {/* Simple view keeps it short: Alerts and My Corner. People with a role
              (Admin, Ambassador, a group or crew leader, a village Keeper) get My Tools
              in place of Alerts, so their tools and alerts stay one tap away (Oct 27). */}
          {simple && <MyToolsButton tools={tools} adminWaiting={adminWaiting} adminUrgent={adminUrgent} />}
          {simple && <MeButton />}
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
