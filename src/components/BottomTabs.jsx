import { NavLink, useLocation } from 'react-router-dom'
import { useUnreadCount } from '../context/UnreadCountContext'

// Four doors: Home, Help, Village, Messages.
// Home opens the globe (the start screen). Your day (/home) sits one step in.
// Village opens your own village, or the village map if you have not joined one.
// Help holds SkillShare and Tasks. Village holds the community, map, chats by place, and calendar.
// Your profile and settings live behind your avatar in the top bar (Your corner).

const HELP = ['/skillshare', '/tasks', '/ask', '/post-offer']
const HOME = ['/', '/home']
const VILLAGE = ['/village', '/community', '/villages', '/find-village', '/campfire', '/calendar', '/orgs', '/org-dashboard', '/emergency']
const under = (path, list) => list.some((p) => path === p || path.startsWith(p + '/'))

export default function BottomTabs() {
  const { unreadCount } = useUnreadCount()
  const { pathname } = useLocation()
  const homeOn = HOME.includes(pathname)
  const helpOn = under(pathname, HELP)
  const villageOn = under(pathname, VILLAGE)

  return (
    <nav className="bottom-tabs" aria-label="Main navigation">
      <div className="bottom-tabs-inner">
      <NavLink to="/" end className={() => 'tab-item' + (homeOn ? ' active' : '')} data-tour="home">
        <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
        <span className="tab-label">Home</span>
      </NavLink>
      <NavLink to="/skillshare" className={({ isActive }) => 'tab-item' + (isActive || helpOn ? ' active' : '')} data-tour="help">
        <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 000-7.8z" /></svg>
        <span className="tab-label">Help</span>
      </NavLink>
      <NavLink to="/village" className={({ isActive }) => 'tab-item' + (isActive || villageOn ? ' active' : '')} data-tour="village">
        <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2l-5 7h3l-4 6h5v7h2v-7h5l-4-6h3z" /></svg>
        <span className="tab-label">Village</span>
      </NavLink>
      <NavLink to="/messages" className="tab-item" data-tour="messages" style={{ position: 'relative' }}>
        <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
        {unreadCount > 0 && (
          <span aria-label={unreadCount + ' unread'} style={{ position: 'absolute', top: '2px', right: '50%', transform: 'translateX(12px)', background: 'var(--danger)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, borderRadius: '9px', minWidth: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', lineHeight: 1 }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        <span className="tab-label">Messages</span>
      </NavLink>
      </div>
    </nav>
  )
}
