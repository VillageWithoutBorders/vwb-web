import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Icon from './Icon'
import ToolsSheet, { EMERGENCY, toolRows } from './ToolsSheet'
import { useNotifications } from '../hooks/useNotifications'
import { markNotificationRead } from '../utils/notificationHelpers'
import { TYPE_ICONS, TYPE_COLORS, timeAgo } from '../utils/notificationDisplay'
import { personalAlertLink } from '../utils/alertLink'
import { useAuth } from '../context/AuthContext'
import { useT, getLang, tAlert } from '../utils/lang'

// My Tools in the top bar (Oct 25, Jade). Alerts and your tools in one button.
// Opens your 5 newest alerts (with See all alerts), then the tools for your role
// (Admin, Ambassador, Organizer, crews, villages you keep) and Emergency.
// The number on it: new alerts plus anything waiting in the Admin inbox.
const SHOW = 5
const PATHS = ['/admin', '/ambassador', '/org-dashboard', '/emergency', '/notifications']

export default function MyToolsButton({ tools, adminWaiting = 0, adminUrgent = false }) {
  const { pathname } = useLocation()
  const t = useT()
  const navigate = useNavigate()
  const { notifications, badgeCount = 0, refresh, markSeen } = useNotifications()
  const { signOut } = useAuth()
  const [leaving, setLeaving] = useState(false)
  const [open, setOpen] = useState(false)
  const lastFocus = useRef(null)
  const on = PATHS.some((p) => pathname === p || pathname.startsWith(p + '/')) || /^\/village\/[^/]+\/keeper$/.test(pathname)
  const total = badgeCount + adminWaiting
  const calm = badgeCount === 0 && !adminUrgent
  const parts = []
  if (badgeCount > 0) parts.push(t(badgeCount === 1 ? '1 new alert' : '{n} new alerts', { n: badgeCount }))
  if (adminWaiting > 0) parts.push(adminWaiting + ' waiting in the Admin inbox' + (adminUrgent ? ', some urgent' : ''))
  // Oct 27 (Jade): people with no role see a plain Alerts bell. Same sheet, same place.
  const plain = (tools || []).length === 0
  const label = t(plain ? 'Alerts' : 'My Tools: alerts and tools') + (parts.length ? ', ' + parts.join(', ') : '')

  const recent = [...(notifications || [])]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, SHOW)

  function openSheet() {
    lastFocus.current = document.activeElement
    setOpen(true)
    // Same as opening the Alerts page: the new-alerts number clears.
    markSeen?.()
    refresh?.()
  }
  function close(refocus) { setOpen(false); if (refocus && lastFocus.current && lastFocus.current.focus) lastFocus.current.focus() }

  async function openAlert(n) {
    setOpen(false)
    if (!n.read) {
      try { await markNotificationRead(n.id) } catch (e) { console.error('[MyTools] mark read failed:', e) }
    }
    refresh?.()
    navigate(personalAlertLink(n))
  }

  // Log out, at the bottom of My Tools (Oct 28, Jade).
  async function logOut() {
    setLeaving(true)
    try { await signOut() } catch (e) { console.error('[MyTools] log out failed:', e) }
    setLeaving(false)
    setOpen(false)
    navigate('/welcome', { replace: true })
  }

  return (
    <>
      <button type="button" className={'header-btn' + (on ? ' on' : '')} aria-label={label} aria-haspopup="dialog" aria-expanded={open} data-tour={plain ? 'alerts' : 'top-tools'} onClick={openSheet}>
        <Icon name={plain ? 'bell' : 'toolbox'} size={26} className="header-btn-pic" />
        <span className="header-btn-label" aria-hidden="true">{plain ? t('Alerts') : <><span className="header-my">{getLang() === 'es' ? 'Mis ' : 'My '}</span>{t('Tools')}</>}</span>
        {total > 0 && <span className={'bell-badge' + (calm ? ' admin-badge-calm' : '')} aria-hidden="true">{total > 9 ? '9+' : total}</span>}
      </button>
      {open && (
        <ToolsSheet id="top-tools-title" title={t(plain ? 'Alerts' : 'My Tools')} rowsTitle={t(plain ? 'If something big happens' : 'Tools')} rows={[...toolRows(tools, adminWaiting), EMERGENCY]} onClose={close}
          footer={<button type="button" className="tools-row tools-logout" disabled={leaving} onClick={logOut}>
            <Icon name="door" size={28} />
            <span><b>{t(leaving ? 'Logging out...' : 'Log out')}</b><small>{t('You can log back in any time.')}</small></span>
          </button>}>
          <h3 className="tools-sub">{t('Alerts')}</h3>
          <div className="tools-alerts">
            {recent.length === 0 ? (
              <p className="alerts-popout-empty">{t("You're all caught up.")}</p>
            ) : recent.map((n) => {
              const color = TYPE_COLORS[n.type] || '#6b7280'
              return (
                <button key={n.id} type="button" className={'alerts-popout-item' + (n.read ? '' : ' unread')} onClick={() => openAlert(n)}>
                  <span className="alerts-popout-icon" aria-hidden="true" style={{ background: color + '26', color }}>
                    <Icon name={TYPE_ICONS[n.type] || 'bell'} />
                  </span>
                  <span className="alerts-popout-text">
                    {!n.read && <span className="sr-only">{t('New.')} </span>}
                    {n.follow_up && <span className="sr-only">Flagged to follow up. </span>}
                    <span className="alerts-popout-title">{tAlert(n.title)}</span>
                    <span className="alerts-popout-time">
                      {timeAgo(n.created_at)}
                      {n.follow_up && <span className="alerts-popout-flag" aria-hidden="true"> <Icon name="flag" /> Follow up</span>}
                    </span>
                  </span>
                  {!n.read && <span className="unread-dot" aria-hidden="true" />}
                </button>
              )
            })}
            <button type="button" className="alerts-popout-more" onClick={() => { setOpen(false); navigate('/notifications') }}>{t('See all alerts')}</button>
          </div>
        </ToolsSheet>
      )}
    </>
  )
}
