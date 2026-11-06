import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { usePendingReports, sendPendingReports, removePendingReport, sendReportAnyway } from '../utils/pendingReports'
import Icon from './Icon'
import { useT, t } from '../utils/lang'

// Emergency reports saved with no signal (Nov 5). Shows at the top of the page until
// they send, tries again when the signal comes back, and says when they went out.
// If someone else reported the same thing in the meantime, it asks first.

function ago(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 2) return t('just now')
  if (min < 60) return t('{n} minutes ago', { n: min })
  const h = Math.round(min / 60)
  if (h < 24) return h === 1 ? t('1 hour ago') : t('{n} hours ago', { n: h })
  const d = Math.round(h / 24)
  return d === 1 ? t('yesterday') : t('{n} days ago', { n: d })
}

export default function PendingReports() {
  useT()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const uid = user?.id
  const list = usePendingReports(uid)
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState([])
  // Remove takes two taps, so one stray tap never loses a report.
  const [sure, setSure] = useState('')
  const waiting = list.filter((r) => !r.problem).length

  async function tryNow() {
    if (!uid || busy) return
    setBusy(true)
    const out = await sendPendingReports(uid)
    setBusy(false)
    if (out.length) setSent(out)
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

  // Report an emergency has its own "Saved on your phone" screen.
  if (!uid || (!list.length && !sent.length) || pathname === '/emergency/create') return null

  return (
    <section className="pending-asks pending-reports" aria-labelledby="pr-h">
      {sent.length > 0 && !list.length && (
        <div className="pa-sent" role="status">
          <Icon name="check" size={28} />
          <span id="pr-h">{sent.length === 1 ? t('Your saved emergency report was sent. Neighbors can see it now.') : t('Your {n} saved emergency reports were sent. Neighbors can see them now.', { n: sent.length })}</span>
          {sent.length === 1 && <button type="button" className="pa-ok" onClick={() => { const id = sent[0].id; setSent([]); navigate('/emergency/' + id) }}>{t('Open it')}</button>}
          <button type="button" className="pa-ok" onClick={() => setSent([])}>{t('OK')}</button>
        </div>
      )}
      {list.length > 0 && (
        <>
          <h2 id="pr-h" className="pa-title">
            {waiting === 0 ? t('A saved emergency report needs you')
              : waiting === 1 ? t('1 emergency report is waiting for signal')
              : t('{n} emergency reports are waiting for signal', { n: waiting })}
          </h2>
          {waiting > 0 && (
            <p className="pa-text" role="status">
              {t(online && busy ? 'Sending now...'
                : online ? 'It will send by itself in a moment.'
                : 'No signal right now. It will send by itself when your phone has signal. Keep the app open if you can.')}
            </p>
          )}
          <p className="pa-text pr-911"><b>{t('Someone in danger right now?')}</b> <a href="tel:911">{t('Call 911')}</a></p>
          {sent.length > 0 && <p className="pa-text" role="status">{sent.length === 1 ? t('Your saved emergency report was sent. Neighbors can see it now.') : t('Your {n} saved emergency reports were sent. Neighbors can see them now.', { n: sent.length })}</p>}
          <ul className="pa-list">
            {list.map((r) => (
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
                <button type="button" className={'pa-remove' + (sure === r.key ? ' sure' : '')}
                  onClick={() => { if (sure === r.key) { removePendingReport(uid, r.key); setSure('') } else setSure(r.key) }}
                  aria-label={t(sure === r.key ? 'Tap again to remove the saved report {title}' : 'Remove the saved report {title}', { title: r.row.title })}>
                  {t(sure === r.key ? 'Tap again to remove' : 'Remove')}
                </button>
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
