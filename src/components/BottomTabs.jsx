import { NavLink, useLocation } from 'react-router-dom'
import { useUnreadCount } from '../context/UnreadCountContext'
import Icon from './Icon'
import { useSimpleView } from '../utils/simpleView'

// Bottom bar: things to do. Find Help, Offer Help, Calendar, Messages (Oct 25, Jade).
// Places, My Corner, and My Tools (alerts and role tools) are in the top bar.

const HELP = ['/help-doors', '/skillshare', '/tasks', '/ask', '/post-offer', '/community/resources']
// Which action tab lights up. Find resources and the Help doors sit under Find Help.
const ASK = ['/ask', '/community/resources', '/help-doors']
const OFFER = ['/skillshare', '/post-offer', '/tasks']
const under = (path, list) => list.some((p) => path === p || path.startsWith(p + '/'))

export default function BottomTabs() {
  const { unreadCount } = useUnreadCount()
  const { pathname } = useLocation()
  const simple = useSimpleView()
  const helpOn = under(pathname, HELP)
  const askOn = under(pathname, ASK)
  const offerOn = under(pathname, OFFER)
  const calendarOn = under(pathname, ['/calendar'])

  // Simple view: three big doors. Home, Help, Messages. Nothing else.
  if (simple) {
    return (
      <nav className="bottom-tabs" aria-label="Main navigation">
        <div className="bottom-tabs-inner">
          <NavLink to="/" end className={({ isActive }) => 'tab-item' + (isActive || pathname === '/today' ? ' active' : '')} data-tour="home">
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

  return (
    <nav className="bottom-tabs" aria-label="Main navigation">
      <div className="bottom-tabs-inner">
        <NavLink to="/ask" className={() => 'tab-item' + (askOn ? ' active' : '')} data-tour="ask">
          <span className="tab-icon tab-icon-pic" aria-hidden="true"><Icon name="raise-hand" size={26} /></span>
          <span className="tab-label">Ask for Help</span>
        </NavLink>
        <NavLink to="/skillshare" className={() => 'tab-item' + (offerOn ? ' active' : '')} data-tour="offer">
          <span className="tab-icon tab-icon-pic" aria-hidden="true"><Icon name="heart" size={26} /></span>
          <span className="tab-label">Offer Help</span>
        </NavLink>
        <NavLink to="/calendar" className={() => 'tab-item' + (calendarOn ? ' active' : '')} data-tour="calendar">
          <span className="tab-icon tab-icon-pic" aria-hidden="true"><Icon name="calendar" size={26} /></span>
          <span className="tab-label">Calendar</span>
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
