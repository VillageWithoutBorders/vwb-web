import { NavLink } from 'react-router-dom'
import { useUnreadCount } from '../hooks/useUnreadCount'

export default function BottomTabs() {
  const { unreadCount } = useUnreadCount()

  return (
    <nav className="bottom-tabs" aria-label="Main navigation">
      <NavLink to="/" end className="tab-item">
        <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
        <span className="tab-label">Home</span>
      </NavLink>
      <NavLink to="/skillshare" className="tab-item">
        <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
        <span className="tab-label">SkillShare</span>
      </NavLink>
      <NavLink to="/messages" className="tab-item" style={{ position: 'relative' }}>
        <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
        {unreadCount > 0 && (
          <span style={{ position: 'absolute', top: '2px', right: '50%', transform: 'translateX(12px)', background: '#ff4444', color: '#fff', fontSize: '0.65rem', fontWeight: 700, borderRadius: '9px', minWidth: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', lineHeight: 1 }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        <span className="tab-label">Messages</span>
      </NavLink>
      <NavLink to="/tasks" className="tab-item">
        <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
        <span className="tab-label">Tasks</span>
      </NavLink>
      <NavLink to="/profile" className="tab-item">
        <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
        <span className="tab-label">Profile</span>
      </NavLink>
    </nav>
  )
}
