import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import Icon from './Icon'
import { timeAgo } from '../utils/notificationDisplay'
import { tell } from './AdminDialog'
import { adminAlertLink } from '../utils/alertLink'
import { useT, tAlert } from '../utils/lang'

// "Needs you": the first thing an admin sees. One shared list for every
// admin and founder (see hooks/useAdminInbox.js), urgent items first, each
// with one button that opens the right place. Under it, the latest admin
// alerts (the same ones that buzz admins' phones).

const ICONS = {
  emergency: 'siren',
  member_report: 'flag',
  task_issue: 'flag',
  resource_report: 'books',
  resource_suggestion: 'books',
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
  const t = useT()
  const [recent, setRecent] = useState([])
  const [recentFailed, setRecentFailed] = useState(false)
  // On a phone the alert list gets long: show the newest 5, the rest on request.
  const [showAll, setShowAll] = useState(false)
  const { items, loaded, failed, mark, clearedCount } = inbox
  const [busyKind, setBusyKind] = useState(null)
  // Who opened which item in the last 30 minutes (vwb-admin-round3.sql).
  const [claims, setClaims] = useState([])

  useEffect(() => {
    let alive = true
    supabase.rpc('admin_inbox_claims_now').then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('[AdminInbox] claims failed:', error); return }
      setClaims(data || [])
    })
    return () => { alive = false }
  }, [items])

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
    supabase.rpc('admin_inbox_claim', { p_kind: item.kind }).then(({ error }) => {
      if (error) console.error('[AdminInbox] claim failed:', error)
    })
    if (item.link) navigate(item.link)
    else if (item.tab) onOpenTab(item.tab)
  }

  function openAlert(a) {
    const link = adminAlertLink(a)
    // Already there (for example the inbox itself): go to the top so the tap shows.
    if (link === window.location.pathname + window.location.search) { window.scrollTo({ top: 0 }); return }
    navigate(link)
  }

  function minsAgo(ts) {
    const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
    return m < 1 ? t('just now') : m === 1 ? t('1 minute ago') : t('{n} minutes ago', { n: m })
  }
  // "Sam opened this 5 minutes ago" for other admins; your own shows as "You opened this".
  function onIt(kind) {
    const c = claims.filter((x) => x.kind === kind)
    if (c.length === 0) return ''
    const others = c.filter((x) => !x.mine)
    if (others.length === 0) return t('You opened this {when}', { when: minsAgo(c[0].claimed_at) })
    return t('{names} opened this {when}', { names: others.map((x) => x.admin_name).join(' ' + t('and') + ' '), when: minsAgo(others[0].claimed_at) })
  }

  // Clear and Flag for later are shared: every admin sees the change (Oct 25).
  async function markIt(i, how) {
    if (!mark) return
    setBusyKind(i.kind)
    const err = await mark(i, how)
    setBusyKind(null)
    if (err) { tell(err.code === 'PGRST202' ? t('This needs a database update first (vwb-admin-inbox-marks.sql).') : t('Could not do that. Try again.'), { tone: 'error' }); return }
    if (how === 'cleared') tell(t('{label} cleared. It comes back when something new comes in.', { label: t(i.label) }), { action: { label: t('Undo'), run: () => mark(i, i.later ? 'later' : null) } })
    else if (how === 'later') tell(t('{label} flagged for later.', { label: t(i.label) }), { action: { label: t('Undo'), run: () => mark(i, null) } })
  }

  const urgent = items.filter((i) => i.urgent && !i.later)
  const waiting = items.filter((i) => !i.urgent && !i.later && !i.info)
  const info = items.filter((i) => i.info)
  const later = items.filter((i) => i.later)

  const row = (i) => (
    <li key={i.kind} className="admin-inbox-item">
      <button type="button" className={'admin-inbox-row' + (i.urgent ? ' urgent' : '') + (i.later ? ' later' : '')} onClick={() => open(i)}>
        <span className="admin-inbox-icon" aria-hidden="true"><Icon name={ICONS[i.kind] || 'inbox'} size={28} /></span>
        <span className="admin-inbox-text">
          <span className="admin-inbox-label">{t(i.label)}</span>
          <span className="admin-inbox-meta">{i.oldest ? t('{n} waiting · oldest {when}', { n: i.how_many, when: timeAgo(i.oldest) }) : t('{n} waiting', { n: i.how_many })}</span>
          {onIt(i.kind) && <span className="admin-inbox-onit">{onIt(i.kind)}</span>}
          {i.later && <span className="admin-inbox-onit">{i.laterMine ? t('Flagged for later by you') : t('Flagged for later by {name}', { name: i.laterBy || t('an admin') })}{i.laterAt ? ', ' + timeAgo(i.laterAt) : ''}</span>}
        </span>
        <span className="admin-inbox-open">{t('Open [button]').replace(' [button]', '')}</span>
      </button>
      {mark && (
        <div className="admin-inbox-actions">
          {i.later
            ? <button type="button" className="btn btn-outline" disabled={busyKind === i.kind} onClick={() => markIt(i, null)}><Icon name="inbox" size={20} /> {t('Back to waiting')}</button>
            : <button type="button" className="btn btn-outline" disabled={busyKind === i.kind} onClick={() => markIt(i, 'later')}><Icon name="flag" size={20} /> {t('Flag for later')}</button>}
          <button type="button" className="btn btn-outline" disabled={busyKind === i.kind} onClick={() => markIt(i, 'cleared')}><Icon name="check" size={20} /> {t('Clear')}</button>
        </div>
      )}
    </li>
  )

  return (
    <section aria-labelledby="adminInboxTitle">
      <h2 id="adminInboxTitle" className="admin-section-title">{t('Needs you')}</h2>
      <p className="admin-section-note">{t('Shared by every admin. When one of you handles something, it leaves this list for everyone.')}</p>

      {failed && (
        <p className="admin-inbox-problem" role="alert">{t("The inbox couldn't load. If this keeps happening, the database step (vwb-admin-inbox.sql) may not be run yet.")}</p>
      )}
      {!failed && !loaded && <p className="admin-section-note">{t('Loading...')}</p>}
      {!failed && loaded && urgent.length + waiting.length === 0 && (
        <p className="admin-inbox-empty"><Icon name="check" size={28} /> {t("You're all caught up.")}</p>
      )}

      {urgent.length > 0 && (
        <>
          <h3 className="admin-inbox-group urgent">{t('Urgent')}</h3>
          <ul className="admin-inbox-list">{urgent.map(row)}</ul>
        </>
      )}
      {waiting.length > 0 && (
        <>
          <h3 className="admin-inbox-group">{t('Waiting')}</h3>
          <ul className="admin-inbox-list">{waiting.map(row)}</ul>
        </>
      )}
      {info.length > 0 && (
        <>
          <h3 className="admin-inbox-group">{t('Good to know')}</h3>
          <p className="admin-section-note">{t("How things stand. These don't count in the number on your tools button.")}</p>
          <ul className="admin-inbox-list">{info.map(row)}</ul>
        </>
      )}
      {later.length > 0 && (
        <>
          <h3 className="admin-inbox-group">{t('Later')}</h3>
          <p className="admin-section-note">{t("Flagged for later. These don't count in the number on your tools button.")}</p>
          <ul className="admin-inbox-list">{later.map(row)}</ul>
        </>
      )}
      {clearedCount > 0 && (
        <p className="admin-section-note">{t(clearedCount === 1 ? '1 row is cleared. Cleared rows come back on their own when something new comes in.' : '{n} rows are cleared. Cleared rows come back on their own when something new comes in.', { n: clearedCount })}</p>
      )}

      <h3 className="admin-inbox-group">{t('Latest admin alerts')}</h3>
      {recentFailed ? (
        <p className="admin-section-note">{t("Alerts couldn't load.")}</p>
      ) : recent.length === 0 ? (
        <p className="admin-section-note">{t("No admin alerts yet. New ones also go to every admin's phone.")}</p>
      ) : (
        <ul className="admin-alert-list">
          {(showAll ? recent : recent.slice(0, 5)).map((a) => (
            <li key={a.id}>
              <button type="button" className="admin-alert-row" onClick={() => openAlert(a)}>
                <span className="admin-alert-title">
                  {a.urgent && <span className="admin-urgent-tag">{t('Urgent')}</span>}
                  {tAlert(a.title)}
                </span>
                {a.body && <span className="admin-alert-body">{tAlert(a.body)}</span>}
                <span className="admin-alert-time">{timeAgo(a.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!recentFailed && recent.length > 5 && (
        <button type="button" className="btn btn-outline btn-full" onClick={() => setShowAll((v) => !v)}>
          {showAll ? t('Show fewer alerts') : t('Show {n} older alerts', { n: recent.length - 5 })}
        </button>
      )}
    </section>
  )
}
