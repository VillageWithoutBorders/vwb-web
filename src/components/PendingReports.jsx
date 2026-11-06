import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { usePendingReports, sendPendingReports, removePendingReport, sendReportAnyway } from '../utils/pendingReports'
import { usePendingEventActions, sendPendingEventActions, removeEventAction } from '../utils/pendingEventActions'
import Icon from './Icon'
import { useT, t } from '../utils/lang'

// Emergency reports (Nov 5), and check-ins and sign-ups on an emergency (Nov 5),
// saved with no signal. Shows at the top of the page until they send, tries again
// when the signal comes back, and says when they went out. If someone else reported
// the same emergency in the meantime, it asks first.

const STATUS_WORDS = { safe: 'Safe', need_help: 'Needs Help', evacuated: 'Evacuated', sheltering: 'Sheltering' }

function ago(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 2) return t('just now')
  if (min < 60) return t('{n} minutes ago', { n: min })
  const h = Math.round(min / 60)
  if (h < 24) return h === 1 ? t('1 hour ago') : t('{n} hours ago', { n: h })
  const d = Math.round(h / 24)
  return d === 1 ? t('yesterday') : t('{n} days ago', { n: d })
}

function actionLabel(a) {
  if (a.kind === 'checkin') return t('Check-in: {status}', { status: t(STATUS_WORDS[a.row.status] || a.row.status) })
  return a.row.role === 'affected' ? t('Sign up as affected') : t('Sign up to help')
}

function sentNote(reports, actions) {
  if (reports.length === 1 && !actions.length) return t('Your saved emergency report was sent. Neighbors can see it now.')
  if (reports.length > 1 && !actions.length) return t('Your {n} saved emergency reports were sent. Neighbors can see them now.', { n: reports.length })
  if (!reports.length && actions.length === 1) return actions[0].kind === 'checkin' ? t('Your check-in was sent.') : t('Your sign-up was sent.')
  return t('Your saved emergency updates were sent.')
}

export default function PendingReports() {
  useT()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const uid = user?.id
  const reports = usePendingReports(uid)
  const actions = usePendingEventActions(uid)
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(null)
  // Remove takes two taps, so one stray tap never loses anything.
  const [sure, setSure] = useState('')
  const waitingReports = reports.filter((r) => !r.problem).length
  const waitingActions = actions.filter((a) => !a.problem).length
  const waiting = waitingReports + waitingActions
  const total = reports.length + actions.length

  async function tryNow() {
    if (!uid || busy) return
    setBusy(true)
    const outReports = await sendPendingReports(uid)
    const outActions = await sendPendingEventActions(uid)
    setBusy(false)
    if (outReports.length || outActions.length) setSent({ reports: outReports, actions: outActions })
  }

  // Try when the page opens, when the signal comes back, when the app comes
  // back to the front, and every 30 seconds while something is waiting.
  useEffect(() => {
    if (!uid) return
    const up = () => { setOnline(true); tryNow() }
    const down = () => setOnline(false)
    const seen = () => { if (document.visibilityState === 'visible') tryNow() }
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    document.addEventListener('visibilitychange', seen)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      document.removeEventListener('visibilitychange', seen)
    }
  }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!uid || !waiting) return
    tryNow()
    const timer = setInterval(tryNow, 30000)
    return () => clearInterval(timer)
  }, [uid, waiting]) // eslint-disable-line react-hooks/exhaustive-deps

  function openMatch(r) {
    removePendingReport(uid, r.key)
    navigate('/emergency/' + r.match.id)
  }

  function differentOne(r) {
    sendReportAnyway(uid, r.key)
    tryNow()
  }

  function removeButton(key, name, remove) {
    return (
      <button type="button" className={'pa-remove' + (sure === key ? ' sure' : '')}
        onClick={() => { if (sure === key) { remove(); setSure('') } else setSure(key) }}
        aria-label={t(sure === key ? 'Tap again to remove the saved report {title}' : 'Remove the saved report {title}', { title: name })}>
        {t(sure === key ? 'Tap again to remove' : 'Remove')}
      </button>
    )
  }

  // Report an emergency has its own "Saved on your phone" screen.
  if (!uid || (!total && !sent) || pathname === '/emergency/create') return null

  const note = sent ? sentNote(sent.reports, sent.actions) : ''
  const onlyReports = !actions.length
  const openOne = sent && sent.reports.length === 1 && !sent.actions.length ? sent.reports[0].id : null

  return (
    <section className="pending-asks pending-reports" aria-labelledby="pr-h">
      {sent && !total && (
        <div className="pa-sent" role="status">
          <Icon name="check" size={28} />
          <span id="pr-h">{note}</span>
          {openOne && <button type="button" className="pa-ok" onClick={() => { setSent(null); navigate('/emergency/' + openOne) }}>{t('Open it')}</button>}
          <button type="button" className="pa-ok" onClick={() => setSent(null)}>{t('OK')}</button>
        </div>
      )}
      {total > 0 && (
        <>
          <h2 id="pr-h" className="pa-title">
            {waiting === 0 ? (onlyReports ? t('A saved emergency report needs you') : t('A saved emergency update needs you'))
              : onlyReports ? (waiting === 1 ? t('1 emergency report is waiting for signal') : t('{n} emergency reports are waiting for signal', { n: waiting }))
              : waiting === 1 ? t('1 emergency update is waiting for signal') : t('{n} emergency updates are waiting for signal', { n: waiting })}
          </h2>
          {waiting > 0 && (
            <p className="pa-text" role="status">
              {t(online && busy ? 'Sending now...'
                : online ? 'It will send by itself in a moment.'
                : 'No signal right now. It will send by itself when your phone has signal. Keep the app open if you can.')}
            </p>
          )}
          <p className="pa-text pr-911"><b>{t('Someone in danger right now?')}</b> <a href="tel:911">{t('Call 911')}</a></p>
          {sent && <p className="pa-text" role="status">{note}</p>}
          <ul className="pa-list">
            {reports.map((r) => (
              <li key={r.key} className="pa-item">
                <span className="pa-what">
                  <b>{t(r.row.event_type)}: {r.row.title}</b>
                  <small>{t('Saved {when}', { when: ago(r.saved_at) })}</small>
                  {r.problem === 'similar' && r.match && (
                    <small className="pr-similar">{t('While you had no signal, someone reported something like this: {title}. Is it the same emergency?', { title: r.match.title })}</small>
                  )}
                  {r.problem && r.problem !== 'similar' && <small className="pa-problem">{t('Not sent:')} {t(r.problem)}</small>}
                </span>
                {r.problem === 'similar' && r.match && (
                  <span className="pr-choices">
                    <button type="button" className="pa-ok" onClick={() => openMatch(r)}>{t('Same one, open it')}</button>
                    <button type="button" className="pa-ok" onClick={() => differentOne(r)}>{t('No, it is different')}</button>
                  </span>
                )}
                {removeButton(r.key, r.row.title, () => removePendingReport(uid, r.key))}
              </li>
            ))}
            {actions.map((a) => (
              <li key={a.key} className="pa-item">
                <span className="pa-what">
                  <b>{actionLabel(a)}</b>
                  {a.event_title && <small>{a.event_title}</small>}
                  <small>{t('Saved {when}', { when: ago(a.saved_at) })}</small>
                  {a.problem && <small className="pa-problem">{t('Not sent:')} {t(a.problem)}</small>}
                </span>
                {removeButton(a.key, actionLabel(a), () => removeEventAction(uid, a.key))}
              </li>
            ))}
          </ul>
          {waiting > 0 && online && (
            <button type="button" className="btn btn-primary pa-send" disabled={busy} onClick={tryNow}>
              {t(busy ? 'Sending...' : 'Send now')}
            </button>
          )}
        </>
      )}
    </section>
  )
}
