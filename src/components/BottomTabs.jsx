import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useUnreadCount } from '../context/UnreadCountContext'
import { useMyTools } from '../hooks/useMyTools'
import { useAdminInbox } from '../hooks/useAdminInbox'
import Icon from './Icon'
import { useSimpleView } from '../utils/simpleView'

// Bottom bar: three doors everyone has (Help, Village, Messages) and a fourth
// that depends on who you are. Home, Calendar, Dashboard, Alerts and You live in the top bar.
//   Neighbor: Emergency.  One role: that role's tools.  More than one: My tools (a short list).

const HELP = ['/help-doors', '/skillshare', '/tasks', '/ask', '/post-offer', '/community/resources']
const VILLAGE = ['/village', '/cottage', '/community', '/villages', '/find-village', '/campfire', '/orgs', '/start-group']
const under = (path, list) => list.some((p) => path === p || path.startsWith(p + '/'))

export default function BottomTabs() {
  const { unreadCount } = useUnreadCount()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const tools = useMyTools()
  // VWB admins: the admin inbox count shows on My tools (the top bar shield is hidden on phones).
  const { total: adminWaiting } = useAdminInbox()
  const simple = useSimpleView()
  const [sheet, setSheet] = useState(false)
  const sheetRef = useRef(null)
  const lastFocus = useRef(null)

  const emergency = { key: 'emergency', label: 'Emergency', icon: 'siren', to: '/emergency' }
  const fourth = tools.length === 0 ? emergency : tools.length === 1 ? tools[0] : { key: 'tools', label: 'My tools', icon: 'toolbox' }
  const toolPaths = [...tools.map((t) => t.to), '/emergency', '/org-dashboard', '/admin', '/ambassador']
  const fourthOn = toolPaths.some((p) => pathname === p || pathname.startsWith(p + '/')) || /^\/village\/[^/]+\/keeper$/.test(pathname)
  const helpOn = under(pathname, HELP)
  const villageOn = !fourthOn && !under(pathname, HELP) && under(pathname, VILLAGE)

  useEffect(() => {
    if (!sheet) return
    const first = sheetRef.current && sheetRef.current.querySelector('button, a')
    if (first) first.focus()
    function onKey(e) { if (e.key === 'Escape') closeSheet() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])

  // Simple view: three big doors. Home, Help, Messages. Nothing else.
  if (simple) {
    return (
      <nav className="bottom-tabs" aria-label="Main navigation">
        <div className="bottom-tabs-inner">
          <NavLink to="/" end className={({ isActive }) => 'tab-item' + (isActive || pathname === '/home' ? ' active' : '')} data-tour="home">
            <span className="tab-icon tab-icon-pic" aria-hidden="true"><Icon name="house" size={26} /></span>
            <span className="tab-label">Home</span>
          </NavLink>
          <NavLink to="/help-doors" className={({ isActive }) => 'tab-item' + (isActive || helpOn ? ' active' : '')} data-tour="help">
            <span className="tab-icon tab-icon-pic" aria-hidden="true"><Icon name="heart-hands" size={26} /></span>
            <span className="tab-label">Help</span>
          </NavLink>
          <NavLink to="/messages" className="tab-item" data-tour="messages" style={{ position: 'relative' }}>
            <span className="tab-icon tab-icon-pic" aria-hidden="true"><Icon name="envelope" size={26} /></span>
            {unreadCount > 0 && (
              <span aria-label={unreadCount + ' unread'} className="tab-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
            <span className="tab-label">Messages</span>
          </NavLink>
        </div>
      </nav>
    )
  }

  function closeSheet() { setSheet(false); if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus() }
  function go(to) { setSheet(false); navigate(to) }

  return (
    <>
      <nav className="bottom-tabs" aria-label="Main navigation">
        <div className="bottom-tabs-inner">
          <NavLink to="/help-doors" className={({ isActive }) => 'tab-item' + (isActive || helpOn ? ' active' : '')} data-tour="help">
            <span className="tab-icon tab-icon-pic" aria-hidden="true"><Icon name="heart-hands" size={26} /></span>
            <span className="tab-label">Help</span>
          </NavLink>
          <NavLink to="/village" className={({ isActive }) => 'tab-item' + (isActive || villageOn ? ' active' : '')} data-tour="village">
            <span className="tab-icon tab-icon-pic" aria-hidden="true"><Icon name="houses" size={26} /></span>
            <span className="tab-label">Village</span>
          </NavLink>
          <NavLink to="/messages" className="tab-item" data-tour="messages" style={{ position: 'relative' }}>
            <span className="tab-icon tab-icon-pic" aria-hidden="true"><Icon name="envelope" size={26} /></span>
            {unreadCount > 0 && (
              <span aria-label={unreadCount + ' unread'} className="tab-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
            <span className="tab-label">Messages</span>
          </NavLink>
          {fourth.to ? (
            <NavLink to={fourth.to} className={() => 'tab-item' + (fourthOn ? ' active' : '')} data-tour="role-tab" aria-label={fourth.name ? fourth.label + ': ' + fourth.name : undefined}>
              <span className="tab-icon tab-icon-pic" aria-hidden="true"><Icon name={fourth.icon} size={26} /></span>
              <span className="tab-label">{fourth.label}</span>
            </NavLink>
          ) : (
            <button type="button" className={'tab-item tab-item-btn' + (fourthOn ? ' active' : '')} data-tour="role-tab" aria-haspopup="dialog" aria-expanded={sheet}
              onClick={() => { lastFocus.current = document.activeElement; setSheet(true) }}>
              <span className="tab-icon tab-icon-pic" aria-hidden="true"><Icon name={fourth.icon} size={26} /></span>
              {adminWaiting > 0 && <span aria-label={adminWaiting + ' waiting in the admin inbox'} className="tab-badge tab-badge-admin">{adminWaiting > 9 ? '9+' : adminWaiting}</span>}
              <span className="tab-label">{fourth.label}</span>
            </button>
          )}
        </div>
      </nav>

      {sheet && (
        <div className="tools-shade" onClick={(e) => { if (e.target === e.currentTarget) closeSheet() }}>
          <div className="tools-sheet" role="dialog" aria-modal="true" aria-labelledby="tools-title" ref={sheetRef}>
            <h2 id="tools-title">My tools</h2>
            <ul className="tools-list">
              {[...tools, emergency].map((t) => (
                <li key={t.key}>
                  <button type="button" className="tools-row" onClick={() => go(t.to)}>
                    <Icon name={t.icon} size={28} />
                    <span><b>{t.label}</b>{t.name && <small>{t.name}</small>}{t.key === 'admin' && adminWaiting > 0 && <small>{adminWaiting} waiting in the inbox</small>}</span>
                    <span className="tools-arrow" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-outline btn-full" onClick={closeSheet}>Close</button>
          </div>
        </div>
      )}
    </>
  )
}
