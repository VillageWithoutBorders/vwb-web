import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import { markNotificationRead, markAllNotificationsRead, deleteNotification } from '../utils/notificationHelpers'

const TYPE_ICONS = {
  message: '\u{1F4AC}',
  match_request: '\u{1F91D}',
  match_accepted: '\u2705',
  match_declined: '\u274C',
  task_update: '\u{1F4CB}',
  emergency: '\u{1F6A8}',
  vouch: '\u2B50',
  task_complete: '\u2705',
  resource_approved: '\u{1F4DA}'
}

const TYPE_COLORS = {
  message: '#3b82f6',
  match_request: '#8b5cf6',
  match_accepted: '#10b981',
  match_declined: '#ef4444',
  task_update: '#f59e0b',
  emergency: '#dc2626',
  vouch: '#eab308',
  task_complete: '#10b981',
  resource_approved: '#06b6d4'
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return mins + 'm ago'
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hrs + 'h ago'
  const days = Math.floor(hrs / 24)
  if (days < 7) return days + 'd ago'
  return new Date(dateStr).toLocaleDateString()
}

export default function Notifications() {
  const { user } = useAuth()
  const { notifications, unreadCount, loading, refresh } = useNotifications()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications

  const unread = filtered.filter(n => !n.read)
  const read = filtered.filter(n => n.read)

  async function handleTap(notification) {
    if (!notification.read) {
      await markNotificationRead(notification.id)
    }
    await refresh()
    if (notification.link) {
      navigate(notification.link)
    }
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead(user?.id)
    await refresh()
  }

  async function handleDelete(e, id) {
    e.stopPropagation()
    await deleteNotification(id)
    await refresh()
  }

  if (loading) {
    return (
      <div className="notifications-page">
        <div className="notifications-loading">Loading notifications...</div>
      </div>
    )
  }

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <h1>Notifications</h1>
        <div className="notifications-actions">
          {unreadCount > 0 && (
            <button className="btn-mark-all-read" onClick={handleMarkAllRead}>
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="notifications-filters">
        <button
          className={'filter-chip' + (filter === 'all' ? ' active' : '')}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={'filter-chip' + (filter === 'unread' ? ' active' : '')}
          onClick={() => setFilter('unread')}
        >
          {'Unread' + (unreadCount > 0 ? ' (' + unreadCount + ')' : '')}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="notifications-empty">
          <span className="empty-icon">{'\u{1F514}'}</span>
          <p>{filter === 'unread' ? "You're all caught up!" : 'No notifications yet'}</p>
        </div>
      ) : (
        <div className="notifications-list">
          {unread.length > 0 && (
            <>
              <div className="notifications-section-label">New</div>
              {unread.map(n => (
                <NotificationCard key={n.id} notification={n} onTap={handleTap} onDelete={handleDelete} />
              ))}
            </>
          )}
          {read.length > 0 && filter === 'all' && (
            <>
              <div className="notifications-section-label">Earlier</div>
              {read.map(n => (
                <NotificationCard key={n.id} notification={n} onTap={handleTap} onDelete={handleDelete} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function NotificationCard({ notification, onTap, onDelete }) {
  const icon = TYPE_ICONS[notification.type] || '\u{1F514}'
  const color = TYPE_COLORS[notification.type] || '#6b7280'

  return (
    <div
      className={'notification-card ' + (notification.read ? 'read' : 'unread')}
      onClick={() => onTap(notification)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onTap(notification) }}
    >
      <div className="notification-icon" style={{ background: color + '20', color: color }}>
        {icon}
      </div>
      <div className="notification-content">
        <div className="notification-title">{notification.title}</div>
        {notification.body && (
          <div className="notification-body">{notification.body}</div>
        )}
        <div className="notification-time">{timeAgo(notification.created_at)}</div>
      </div>
      <div className="notification-actions">
        {!notification.read && <span className="unread-dot" />}
        <button
          className="notification-delete"
          onClick={(e) => onDelete(e, notification.id)}
          aria-label="Delete notification"
        >
          &times;
        </button>
      </div>
    </div>
  )
}