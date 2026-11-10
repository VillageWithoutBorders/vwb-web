import Icon from '../components/Icon'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { needsFullSetup } from '../utils/startPath'
import { applyPrefs, devicePrefs, savePrefs } from '../utils/uiPrefs'
import { firstRunPaused } from '../utils/firstVillage'
import { useAuth } from '../context/AuthContext'
import { useSimpleView, setSimpleLocal, isSimpleView } from '../utils/simpleView'
import SimpleOffer from '../components/SimpleOffer'
import ReadAloud from '../components/ReadAloud'
import PendingAsks from '../components/PendingAsks'
import PendingReports from '../components/PendingReports'
import EmergencyBanner from '../components/EmergencyBanner'
import { useT } from '../utils/lang'
import BottomTabs from '../components/BottomTabs'
import MeButton, { MyCornerButton } from '../components/MeButton'
import AlertsButton from '../components/AlertsButton'
import WhatButton from '../components/WhatButton'
import QrSheetHost from '../components/QrSheet'
import { useAdminInbox } from '../hooks/useAdminInbox'
import AppTour from '../components/AppTour'
import KeyRestorePrompt from '../components/KeyRestorePrompt'
import { PageBackContext, FrameBack } from '../components/BackLink'
import { calmMotion } from '../utils/motion'

export default function Layout() {
  const { pathname, search, key } = useLocation()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  // Picked Full setup when signing up (Nov 1): avatar, skills and cottage come next,
  // after Find your village. "Skip setup for now" on that page ends it.
  const setupNext = needsFullSetup(user, profile) && pathname !== '/setup' && !firstRunPaused(pathname)
  useEffect(() => { if (setupNext) navigate('/setup', { replace: true }) }, [setupNext]) // eslint-disable-line react-hooks/exhaustive-deps
  // The Admin inbox count shows on My Corner in the top bar (Nov 10). Role tools live there.
  const { total: adminWaiting, urgent: adminUrgent } = useAdminInbox()
  const simple = useSimpleView()
  const t = useT()
  // The account says which view to use. Follow it on this phone too.
  useEffect(() => {
    const v = profile?.simple_view
    if (typeof v === 'boolean' && v !== isSimpleView()) setSimpleLocal(v)
  }, [profile?.simple_view])
  // Text size, Light or dark, and Motion follow the account too (Nov 1). An account that
  // never saved them takes this phone's choices, so nobody loses what they picked.
  const prefsKey = profile && Object.prototype.hasOwnProperty.call(profile, 'ui_prefs') ? JSON.stringify(profile.ui_prefs) : ''
  useEffect(() => {
    if (!prefsKey) return
    if (profile.ui_prefs) { applyPrefs(profile.ui_prefs); return }
    const mine = devicePrefs()
    if (mine.text !== 'normal' || mine.theme !== 'auto' || mine.motion !== 'normal' || mine.lang !== 'en') savePrefs(mine)
  }, [prefsKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // Chats fill the space between the top bar and the tabs, edge to edge,
  // instead of sitting inside the padded page column.
  // World pages (the globe, a village, an organization) fill the whole screen
  // with their own teal background, edge to edge.
  const isWorld = (pathname === '/' && !simple) || pathname === '/world' || pathname === '/cottage' || /^\/u\/[^/]+\/cottage$/.test(pathname) || /^\/village\/[^/]+$/.test(pathname) || /^\/orgs\/[^/]+$/.test(pathname)
  const villageHere = pathname === '/village' || /^\/village\/[^/]+$/.test(pathname)
  const isChat = pathname === '/village-square' || pathname.startsWith('/conversation/') || /^\/groups\/[^/]+$/.test(pathname)

  // Back button on every page (Oct 22, Jade). Not on Home (the globe), and not on chats,
  // which have their own back arrow. Pages with their own BackLink hide this one.
  const [ownBacks, setOwnBacks] = useState(0)
  const tellFrame = useCallback((n) => setOwnBacks((c) => c + n), [])
  // Oct 30 (Jade): not on My Corner (/me) either. It's a top-bar place, like My World.
  const showBack = !ownBacks && !isChat && pathname !== '/' && pathname !== '/me' && (simple || pathname !== '/world')

  // Ask for Help is ready even if the signal drops later (Nov 3): its screen is
  // fetched once, quietly, a few seconds after the app opens, and kept on the phone.
  useEffect(() => {
    if (!user) return
    const t = setTimeout(() => {
      import('./AskForHelp').catch(() => { /* no signal yet; it loads when opened */ })
      // Reporting an emergency too (Nov 5): storms take the signal down first.
      import('./EmergencyEvents').catch(() => {})
      import('./CreateEvent').catch(() => {})
      import('./EventDetail').catch(() => {})
      // The list of kinds of help too, kept on the phone by loadSkillCategories.
      let saved = null
      try { saved = localStorage.getItem('vwb_skill_list') } catch { /* private window */ }
      if (!saved) import('../utils/skillGroups').then((m) => m.loadSkillCategories()).catch(() => {})
    }, 5000)
    return () => clearTimeout(t)
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Every page opens at the top (Oct 22, Jade), except chats, which open at the newest
  // message, and links to a spot on a page (#corner and the like).
  useEffect(() => { try { window.history.scrollRestoration = 'manual' } catch { /* older browsers */ } }, [])
  useLayoutEffect(() => {
    if (isChat || window.location.hash) return
    window.scrollTo(0, 0)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tapping a button or tab for the page you are already on goes back to the top
  // (Oct 28, Jade). Same page and same address, but a new tap (a new location key).
  const lastPlace = useRef({ where: pathname + search, key })
  useEffect(() => {
    const where = pathname + search
    const before = lastPlace.current
    lastPlace.current = { where, key }
    if (before.where !== where || before.key === key) return
    if (isChat || window.location.hash) return
    window.scrollTo({ top: 0, behavior: calmMotion() ? 'auto' : 'smooth' })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Setup (Nov 3, Jade): no top or bottom bar, so nobody taps away halfway through.
  // The steps have their own Back and "Skip setup for now".
  const focus = pathname === '/setup'

  // The Admin page gets a wider column on a computer for its side menu.
  const isAdminPage = pathname === '/admin'

  return (
    <div className="app-shell">
      {!focus && <header className="app-header">
        {/* Oct 25 (Jade): top bar, left to right: My World, My Village, My Cottage,
            My Corner (profile, account, settings, your roles), and the Alerts bell (Nov 10).
            The bottom bar is actions: Ask for Help, Offer Help, Calendar, Messages. */}
        <nav className="app-header-inner header-nav" aria-label="Top menu">
          {!simple && (<>
          <Link to="/world" className={'header-btn' + (pathname === '/world' ? ' on' : '')} aria-current={pathname === '/world' ? 'page' : undefined} aria-label={t('My World: your networks on the globe')} data-tip={t('My World: see your villages and groups on a map of the world.')} data-tour="top-home">
            <img className="header-btn-logo" src="/images/vwb_header-v2.png" alt="" width="26" height="26" />
            <span className="header-btn-label" aria-hidden="true"><span className="header-my">{t('My ')}</span>{t('World')}</span>
          </Link>
          <Link to="/village" className={'header-btn' + (villageHere ? ' on' : '')} aria-current={villageHere ? 'page' : undefined} aria-label={t('My Village: your home village')} data-tip={t('My Village: your home village. Its chat, neighbors, groups, rules, and sister villages.')} data-tour="top-village">
            <Icon name="houses" size={26} className="header-btn-pic" />
            <span className="header-btn-label" aria-hidden="true"><span className="header-my">{t('My ')}</span>{t('Village')}</span>
          </Link>
          <MeButton />
          <MyCornerButton adminWaiting={adminWaiting} adminUrgent={adminUrgent} />
          <AlertsButton />
          </>)}
          {/* Simple view keeps it short: My Corner and Alerts. People with a role
              find their tools in My Corner > Your roles (Nov 10). */}
          {simple && <MeButton adminWaiting={adminWaiting} adminUrgent={adminUrgent} />}
          {simple && <AlertsButton />}
        </nav>
      </header>}
      <main className={'app-main' + (!focus && !isChat ? ' app-main-what' : '') + (isChat ? ' app-main-chat' : '') + (isWorld ? ' app-main-world' : '') + (isAdminPage ? ' app-main-admin' : '') + (focus ? ' app-main-focus' : '')}>
        {/* Nov 10 (Round A3): an open emergency you can act on, at the top of every page. Not in setup. */}
        {!focus && user && <EmergencyBanner />}
        {/* Read this to me (Nov 3, barriers review): Simple view pages, next to Back.
            Not on chats or the maps. */}
        {showBack
          ? <FrameBack world={isWorld}>{simple && !isChat && !isWorld && <ReadAloud />}</FrameBack>
          : simple && !isChat && !isWorld && <div className="app-back-row read-aloud-row"><ReadAloud /></div>}
        {/* Emergency reports (Nov 5) and requests (Nov 3) saved with no signal: waiting, sending, or sent. */}
        {!isChat && !isWorld && <PendingReports />}
        {!isChat && !isWorld && <PendingAsks />}
        <QrSheetHost />
        <PageBackContext.Provider value={tellFrame}>
          <Outlet />
        </PageBackContext.Provider>
      </main>
      {!focus && <BottomTabs />}
      {/* What is this? (Nov 10): not in setup, and not on chats, where it would sit on the typing box. */}
      {!focus && !isChat && <WhatButton />}
      <SimpleOffer />
      <AppTour />
      <KeyRestorePrompt />
    </div>
  )
}
