import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'
import { markNotificationRead } from '../utils/notificationHelpers'
import { TYPE_ICONS, TYPE_COLORS, timeAgo } from '../utils/notificationDisplay'

// The Alerts button in the top bar. Tapping it opens a small popout with
// your 5 newest alerts and a "See all alerts" button that opens the full
// Alerts page (where Mark all read, Clear all, and Follow up live).
// Built the same way as AppMenu so the two behave alike.

const SHOW = 5

export default function AlertsMenu() {
  const navigate = useNavigate()
  // badgeCount = new since you last opened Alerts (the same number the top
  // bar has always shown). It clears when the popout opens.
  const { notifications, badgeCount, refresh, markSeen } = useNotifications()
  const [open, setOpen] = useState(false)
  const [top, setTop] = useState(64)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  const recent = [...(notifications || [])]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, SHOW)

  // Open: focus the first item. Escape closes and returns focus to the button.
  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector('button')?.focus()
    function onKey(e) {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function toggle() {
    const next = !open
    if (next) {
      // Sit the popout just under the top bar, pinned to the right edge of
      // the screen, so it never runs off a small phone.
      const r = buttonRef.current?.getBoundingClientRect()
      if (r) setTop(Math.round(r.bottom + 8))
    }
    setOpen(next)
    if (next) {
      // Same as opening the page: the top-bar badge clears right away.
      markSeen?.()
      refresh?.()
    }
  }

  async function openAlert(n) {
    setOpen(false)
    if (!n.read) await markNotificationRead(n.id)
    await refresh?.()
    navigate(n.link || '/notifications')
  }

  function seeAll() {
    setOpen(false)
    navigate('/notifications')
  }

  return (
    <div className="app-menu">
      <button
        ref={buttonRef}
        type="button"
        className="header-btn"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="alertsMenuList"
        aria-haspopup="true"
        aria-label={badgeCount > 0 ? 'Alerts, ' + badgeCount + ' new' : 'Alerts'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
        <span className="header-btn-label" aria-hidden="true">Alerts</span>
        {badgeCount > 0 && <span className="bell-badge" aria-hidden="true">{badgeCount > 9 ? '9+' : badgeCount}</span>}
      </button>

      {open && (
        <>
          <button type="button" className="app-menu-scrim" aria-label="Close alerts" tabIndex={-1} onClick={() => setOpen(false)} />
          <div id="alertsMenuList" className="app-menu-list alerts-popout" ref={menuRef} style={{ position: 'fixed', top: top + 'px', right: '0.75rem', left: 'auto' }}>
            <p className="app-menu-heading">Latest alerts</p>
            {recent.length === 0 ? (
              <p className="alerts-popout-empty">You're all caught up.</p>
            ) : recent.map(n => {
              const color = TYPE_COLORS[n.type] || '#6b7280'
              return (
                <button key={n.id} type="button" className={'alerts-popout-item' + (n.read ? '' : ' unread')} onClick={() => openAlert(n)}>
                  <span className="alerts-popout-icon" aria-hidden="true" style={{ background: color + '26', color }}>
                    {TYPE_ICONS[n.type] || '\u{1F514}'}
                  </span>
                  <span className="alerts-popout-text">
                    {!n.read && <span className="sr-only">New. </span>}
                    {n.follow_up && <span className="sr-only">Flagged to follow up. </span>}
                    <span className="alerts-popout-title">{n.title}</span>
                    <span className="alerts-popout-time">
                      {timeAgo(n.created_at)}
                      {n.follow_up && <span className="alerts-popout-flag" aria-hidden="true"> {'\u2691'} Follow up</span>}
                    </span>
                  </span>
                  {!n.read && <span className="unread-dot" aria-hidden="true" />}
                </button>
              )
            })}
            <button type="button" className="alerts-popout-more" onClick={seeAll}>See all alerts</button>
          </div>
        </>
      )}
    </div>
  )
}
