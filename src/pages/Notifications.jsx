import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  setNotificationFollowUp,
  clearAllNotifications
} from '../utils/notificationHelpers'
import { TYPE_ICONS, TYPE_COLORS, timeAgo } from '../utils/notificationDisplay'
import Icon from '../components/Icon'
import { personalAlertLink } from '../utils/alertLink'
import { useT, tAlert } from '../utils/lang'
import { supabase } from '../supabaseClient'
import { alertKindName, canMute } from '../utils/alertKinds'
import { useMenuPosition } from '../utils/useMenuPosition'
import '../desktop-me.css'

export default function Notifications() {
  const t = useT()
  const { user, profile, refreshProfile } = useAuth()
  const { notifications, unreadCount, loading, refresh, markSeen } = useNotifications()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Round E part 2 (Nov 10): Mute this, one tap, with Undo.
  const [muteNote, setMuteNote] = useState(null)
  const muteReady = !!profile && Object.prototype.hasOwnProperty.call(profile, 'muted_alert_types')
  const mutedTypes = (muteReady && Array.isArray(profile.muted_alert_types)) ? profile.muted_alert_types : []
  async function setMute(type, mute) {
    setError('')
    const { error: err } = await supabase.rpc('mute_alert_type', { p_type: type, p_mute: mute })
    if (err) { showError(err); return }
    await refreshProfile()
    setMuteNote(mute ? type : null)
  }

  // Nov 20 (Jade): Flag and Mute live behind one ⋯ button on each alert,
  // so each card has two buttons instead of four. One menu for the whole page.
  const { menuRef, menuStyle, openMenu, closeMenu } = useMenuPosition('right')
  const [menuFor, setMenuFor] = useState(null)
  function closeOptions() { setMenuFor(null); closeMenu() }
  useEffect(() => {
    if (!menuFor) return
    function onKey(e) { if (e.key === 'Escape') closeOptions() }
    function onScroll() { closeOptions() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll) }
  }, [menuFor]) // eslint-disable-line react-hooks/exhaustive-deps

  // Opening this page clears the top-bar badge right away. Alerts you
  // haven't tapped still show under "New" until you do.
  useEffect(() => { markSeen(); refresh() }, [markSeen, refresh])

  // Escape closes the "Clear all" window.
  useEffect(() => {
    if (!confirmClear) return
    function onKey(e) { if (e.key === 'Escape') setConfirmClear(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmClear])

  const followUps = notifications.filter(n => n.follow_up)
  const clearable = notifications.filter(n => !n.follow_up)

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : filter === 'followup'
      ? followUps
      : notifications

  const unread = filtered.filter(n => !n.read)
  const read = filtered.filter(n => n.read)

  function showError(err) {
    // 42703 means the follow_up column isn't in the database yet.
    setError(err && err.code === '42703'
      ? t('Follow up needs a quick database update first (vwb-notification-followup.sql).')
      : t('Something went wrong. Please try again.'))
  }

  async function handleTap(notification) {
    if (!notification.read) {
      await markNotificationRead(notification.id)
    }
    await refresh()
    // Every alert opens somewhere (Oct 28): its own link, or the page for its kind.
    const link = personalAlertLink(notification)
    if (link !== '/notifications') navigate(link)
  }

  async function handleMarkAllRead() {
    setError('')
    await markAllNotificationsRead(user?.id)
    await refresh()
  }

  async function handleDelete(e, id) {
    e.stopPropagation()
    setError('')
    await deleteNotification(id)
    await refresh()
  }

  async function handleToggleFollowUp(e, notification) {
    e.stopPropagation()
    setError('')
    const { error: err } = await setNotificationFollowUp(notification.id, !notification.follow_up)
    if (err) { showError(err); return }
    await refresh()
  }

  async function handleClearAll() {
    setBusy(true)
    setError('')
    const { error: err } = await clearAllNotifications(user?.id)
    setBusy(false)
    setConfirmClear(false)
    if (err) { showError(err); return }
    await refresh()
  }

  if (loading) {
    return (
      <div className="notifications-page">
        <div className="notifications-loading">{t('Loading notifications...')}</div>
      </div>
    )
  }

  const card = n => (
    <NotificationCard
      key={n.id}
      notification={n}
      onTap={handleTap}
      onDelete={handleDelete}
      menuOpen={menuFor?.id === n.id}
      onMore={(e) => { e.stopPropagation(); if (menuFor?.id === n.id) { closeOptions(); return } setMenuFor(n); openMenu(e) }}
    />
  )

  // Nov 7 (Jade): on a computer, the page and new alerts on the left, earlier alerts
  // on the right, each side scrolling by itself (desktop-me.css). Phones are the same list.
  const split = filter === 'all' && read.length > 0
  return (
    <div className={'notifications-page nt-page' + (split ? ' nt-split' : '')}>
      <div className="nt-left">
      <div className="notifications-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Nov 7 (Jade): the frame's Back button, like every other page. */}
          <h1>{t('Alerts')}</h1>
        </div>
        <div className="notifications-actions">
          {unreadCount > 0 && (
            <button type="button" className="btn-mark-all-read" onClick={handleMarkAllRead}>
              {t('Mark all read')}
            </button>
          )}
          {clearable.length > 0 && (
            <button type="button" className="btn-mark-all-read btn-clear-all" onClick={() => setConfirmClear(true)}>
              {t('Clear all')}
            </button>
          )}
        </div>
      </div>

      <div className="notifications-filters">
        <button
          type="button"
          aria-pressed={filter === 'all'}
          className={'filter-chip' + (filter === 'all' ? ' active' : '')}
          onClick={() => setFilter('all')}
        >
          {t('All')}
        </button>
        <button
          type="button"
          aria-pressed={filter === 'unread'}
          className={'filter-chip' + (filter === 'unread' ? ' active' : '')}
          onClick={() => setFilter('unread')}
        >
          {t('Unread') + (unreadCount > 0 ? ' (' + unreadCount + ')' : '')}
        </button>
        <button
          type="button"
          aria-pressed={filter === 'followup'}
          className={'filter-chip' + (filter === 'followup' ? ' active' : '')}
          onClick={() => setFilter('followup')}
        >
          {t('Follow up') + (followUps.length > 0 ? ' (' + followUps.length + ')' : '')}
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {muteNote && (
        <p className="notif-mute-note" role="status">
          {t('Muted: {kind}. You will not get phone alerts like this. They still show here.', { kind: t(alertKindName(muteNote)) })}{' '}
          <button type="button" className="link-button" onClick={() => setMute(muteNote, false)}>{t('Undo')}</button>
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="notifications-empty">
          <span className="empty-icon" aria-hidden="true"><Icon name={filter === 'followup' ? 'flag' : 'bell'} /></span>
          <p>
            {filter === 'unread'
              ? t("You're all caught up!")
              : filter === 'followup'
                ? t('Nothing flagged. Tap \u22EF on an alert and pick Flag to follow up to come back to it later.')
                : t('No notifications yet')}
          </p>
        </div>
      ) : filter === 'followup' ? (
        <div className="notifications-list">{filtered.map(card)}</div>
      ) : unread.length > 0 ? (
        <div className="notifications-list">
          <div className="notifications-section-label">{t('New')}</div>
          {unread.map(card)}
        </div>
      ) : split && <p className="nt-none-new">{t('No new alerts.')}</p>}
      </div>

      {split && (
        <div className="nt-right">
          <div className="notifications-list">
            <div className="notifications-section-label">{t('Earlier')}</div>
            {read.map(card)}
          </div>
        </div>
      )}

      {menuFor && (
        <>
          <button type="button" className="nt-menu-scrim" aria-label={t('Close')} tabIndex={-1} onClick={closeOptions} />
          <div ref={menuRef} className="nt-menu" role="menu" style={menuStyle}>
            <button type="button" role="menuitem" className="nt-menu-item" autoFocus
              onClick={(e) => { const n = menuFor; closeOptions(); handleToggleFollowUp(e, n) }}>
              <Icon name="flag" /> {menuFor.follow_up ? t('Remove follow up flag') : t('Flag to follow up')}
            </button>
            {muteReady && canMute(menuFor.type) && (mutedTypes.includes(menuFor.type) ? (
              <button type="button" role="menuitem" className="nt-menu-item"
                onClick={() => { const n = menuFor; closeOptions(); setMute(n.type, false) }}>
                <Icon name="bell" /> {t('Turn phone alerts like this back on')}
              </button>
            ) : (
              <button type="button" role="menuitem" className="nt-menu-item"
                onClick={() => { const n = menuFor; closeOptions(); setMute(n.type, true) }}>
                <Icon name="bell" /> {t('Mute phone alerts like this')}
              </button>
            ))}
          </div>
        </>
      )}

      {confirmClear && (
        <>
          <button type="button" className="app-dialog-scrim" aria-label={t('Close')} tabIndex={-1} onClick={() => setConfirmClear(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="clearAlertsTitle" className="app-dialog">
            <h2 id="clearAlertsTitle" className="app-dialog-title">{t('Clear all alerts?')}</h2>
            <p className="app-dialog-text">
              {t('This deletes your alerts for good.')}
              {followUps.length > 0 ? ' ' + t('Alerts you flagged to follow up will stay.') : ''}
            </p>
            <div className="app-dialog-buttons">
              <button type="button" className="btn btn-full app-dialog-danger" onClick={handleClearAll} disabled={busy}>
                {busy ? t('Clearing...') : t('Clear all')}
              </button>
              <button type="button" className="btn btn-outline btn-full" onClick={() => setConfirmClear(false)} autoFocus>{t('Cancel')}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function NotificationCard({ notification, onTap, onDelete, onMore, menuOpen }) {
  const t = useT()
  const icon = TYPE_ICONS[notification.type] || '\u{1F514}'
  const color = TYPE_COLORS[notification.type] || '#6b7280'
  const flagged = !!notification.follow_up

  return (
    <div
      className={'notification-card ' + (notification.read ? 'read' : 'unread') + (flagged ? ' flagged' : '')}
      onClick={() => onTap(notification)}
      role="button"
      tabIndex={0}
      // Only react when the card itself has focus, so pressing Enter on the
      // flag or delete button doesn't also open the alert.
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onTap(notification) } }}
      aria-label={(notification.read ? '' : t('New') + '. ') + (flagged ? t('Flagged to follow up.') + ' ' : '') + tAlert(notification.title)}
    >
      <div className="notification-icon" aria-hidden="true" style={{ background: color + '26', color: color }}>
        <Icon name={icon} />
      </div>
      <div className="notification-content">
        <div className="notification-title">{tAlert(notification.title)}</div>
        {notification.body && (
          <div className="notification-body">{tAlert(notification.body)}</div>
        )}
        <div className="notification-meta">
          <span className="notification-time">{timeAgo(notification.created_at)}</span>
          {flagged && (
            <span className="notification-followup-badge"><span aria-hidden="true"><Icon name="flag" /></span> {t('Follow up')}</span>
          )}
        </div>
      </div>
      <div className="notification-actions">
        {!notification.read && <span className="unread-dot" aria-hidden="true" />}
        <button
          type="button"
          className="notification-more"
          aria-haspopup="menu"
          aria-expanded={!!menuOpen}
          onClick={onMore}
          aria-label={t('More for this alert: flag or mute')}
        >
          <span aria-hidden="true">&#8943;</span>
        </button>
        <button
          type="button"
          className="notification-delete"
          onClick={(e) => onDelete(e, notification.id)}
          aria-label={t('Clear this alert')}
        >
          &times;
        </button>
      </div>
    </div>
  )
}
