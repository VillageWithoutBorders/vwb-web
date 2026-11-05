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
import { useGoBack } from '../components/BackLink'
import Icon from '../components/Icon'
import { personalAlertLink } from '../utils/alertLink'
import { useT, tAlert } from '../utils/lang'

export default function Notifications() {
  const t = useT()
  const { user } = useAuth()
  const { notifications, unreadCount, loading, refresh, markSeen } = useNotifications()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const [filter, setFilter] = useState('all')
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
      onToggleFollowUp={handleToggleFollowUp}
    />
  )

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => goBack('/')} aria-label={t('Go back')} className="notifications-back">&#8592;</button>
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

      {filtered.length === 0 ? (
        <div className="notifications-empty">
          <span className="empty-icon" aria-hidden="true"><Icon name={filter === 'followup' ? 'flag' : 'bell'} /></span>
          <p>
            {filter === 'unread'
              ? t("You're all caught up!")
              : filter === 'followup'
                ? t('Nothing flagged. Tap the flag on an alert to come back to it later.')
                : t('No notifications yet')}
          </p>
        </div>
      ) : (
        <div className="notifications-list">
          {filter === 'followup' ? (
            filtered.map(card)
          ) : (
            <>
              {unread.length > 0 && (
                <>
                  <div className="notifications-section-label">{t('New')}</div>
                  {unread.map(card)}
                </>
              )}
              {read.length > 0 && filter === 'all' && (
                <>
                  <div className="notifications-section-label">{t('Earlier')}</div>
                  {read.map(card)}
                </>
              )}
            </>
          )}
        </div>
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

function NotificationCard({ notification, onTap, onDelete, onToggleFollowUp }) {
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
          className="notification-flag"
          aria-pressed={flagged}
          onClick={(e) => onToggleFollowUp(e, notification)}
          aria-label={flagged ? t('Remove follow up flag') : t('Flag to follow up')}
        >
          <span aria-hidden="true"><Icon name="flag" /></span>
        </button>
        <button
          type="button"
          className="notification-delete"
          onClick={(e) => onDelete(e, notification.id)}
          aria-label={t('Delete notification')}
        >
          &times;
        </button>
      </div>
    </div>
  )
}
