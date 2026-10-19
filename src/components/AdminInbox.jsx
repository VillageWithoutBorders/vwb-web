import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import Icon from './Icon'
import { timeAgo } from '../utils/notificationDisplay'

// "Needs you": the first thing an admin sees. One shared list for every
// admin and founder (see hooks/useAdminInbox.js), urgent items first, each
// with one button that opens the right place. Under it, the latest admin
// alerts (the same ones that buzz admins' phones).

const ICONS = {
  emergency: 'siren',
  member_report: 'flag',
  task_issue: 'flag',
  resource_report: 'books',
  event_close: 'calendar',
  ambassador_application: 'star',
  admin_application: 'shield',
  resource_claim: 'key',
  organization: 'houses',
  group_response: 'tent',
  help_message: 'envelope',
  crn_preview: 'folder',
}

export default function AdminInbox({ inbox, onOpenTab }) {
  const navigate = useNavigate()
  const [recent, setRecent] = useState([])
  const [recentFailed, setRecentFailed] = useState(false)
  const { items, loaded, failed } = inbox

  useEffect(() => {
    let alive = true
    supabase.from('admin_alerts').select('id, kind, title, body, link, urgent, created_at')
      .order('created_at', { ascending: false }).limit(15)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) { console.error('[AdminInbox] admin_alerts failed:', error); setRecentFailed(true); return }
        setRecent(data || [])
      })
    return () => { alive = false }
  }, [items])

  function open(item) {
    if (item.link) navigate(item.link)
    else if (item.tab) onOpenTab(item.tab)
  }

  function openAlert(a) {
    const link = a.link || '/admin?tab=inbox'
    navigate(link)
  }

  const urgent = items.filter((i) => i.urgent)
  const waiting = items.filter((i) => !i.urgent)

  const row = (i) => (
    <li key={i.kind}>
      <button type="button" className={'admin-inbox-row' + (i.urgent ? ' urgent' : '')} onClick={() => open(i)}>
        <span className="admin-inbox-icon" aria-hidden="true"><Icon name={ICONS[i.kind] || 'inbox'} size={28} /></span>
        <span className="admin-inbox-text">
          <span className="admin-inbox-label">{i.label}</span>
          <span className="admin-inbox-meta">{i.how_many} waiting{i.oldest ? ' · oldest ' + timeAgo(i.oldest) : ''}</span>
        </span>
        <span className="admin-inbox-open">Open</span>
      </button>
    </li>
  )

  return (
    <section aria-labelledby="adminInboxTitle">
      <h2 id="adminInboxTitle" className="admin-section-title">Needs you</h2>
      <p className="admin-section-note">Shared by every admin. When one of you handles something, it leaves this list for everyone.</p>

      {failed && (
        <p className="admin-inbox-problem" role="alert">The inbox couldn't load. If this keeps happening, the database step (vwb-admin-inbox.sql) may not be run yet.</p>
      )}
      {!failed && !loaded && <p className="admin-section-note">Loading...</p>}
      {!failed && loaded && items.length === 0 && (
        <p className="admin-inbox-empty"><Icon name="check" size={28} /> You're all caught up.</p>
      )}

      {urgent.length > 0 && (
        <>
          <h3 className="admin-inbox-group urgent">Urgent</h3>
          <ul className="admin-inbox-list">{urgent.map(row)}</ul>
        </>
      )}
      {waiting.length > 0 && (
        <>
          <h3 className="admin-inbox-group">Waiting</h3>
          <ul className="admin-inbox-list">{waiting.map(row)}</ul>
        </>
      )}

      <h3 className="admin-inbox-group">Latest admin alerts</h3>
      {recentFailed ? (
        <p className="admin-section-note">Alerts couldn't load.</p>
      ) : recent.length === 0 ? (
        <p className="admin-section-note">No admin alerts yet. New ones also go to every admin's phone.</p>
      ) : (
        <ul className="admin-alert-list">
          {recent.map((a) => (
            <li key={a.id}>
              <button type="button" className="admin-alert-row" onClick={() => openAlert(a)}>
                <span className="admin-alert-title">
                  {a.urgent && <span className="admin-urgent-tag">Urgent</span>}
                  {a.title}
                </span>
                {a.body && <span className="admin-alert-body">{a.body}</span>}
                <span className="admin-alert-time">{timeAgo(a.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
