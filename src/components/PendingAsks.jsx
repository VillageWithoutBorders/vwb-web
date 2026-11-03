import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { usePendingAsks, sendPendingAsks, removePendingAsk } from '../utils/pendingAsks'
import Icon from './Icon'
import { useT, t } from '../utils/lang'

// Requests saved with no signal (Nov 3). Shows at the top of the page until they
// send, tries again when the signal comes back, and says when they went out.

function ago(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 2) return t('just now')
  if (min < 60) return t('{n} minutes ago', { n: min })
  const h = Math.round(min / 60)
  if (h < 24) return h === 1 ? t('1 hour ago') : t('{n} hours ago', { n: h })
  const d = Math.round(h / 24)
  return d === 1 ? t('yesterday') : t('{n} days ago', { n: d })
}

export default function PendingAsks() {
  useT()
  const { user } = useAuth()
  const { pathname } = useLocation()
  const uid = user?.id
  const list = usePendingAsks(uid)
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const [busy, setBusy] = useState(false)
  const [sentNote, setSentNote] = useState('')
  // Remove asks twice, so one stray tap never loses a request.
  const [sure, setSure] = useState('')
  const waiting = list.filter((a) => !a.problem).length

  async function tryNow() {
    if (!uid || busy) return
    setBusy(true)
    const n = await sendPendingAsks(uid)
    setBusy(false)
    if (n > 0) setSentNote(n === 1 ? t('Your saved request was sent. Neighbors can see it now.') : t('Your {n} saved requests were sent. Neighbors can see them now.', { n }))
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
    const t = setInterval(tryNow, 30000)
    return () => clearInterval(t)
  }, [uid, waiting]) // eslint-disable-line react-hooks/exhaustive-deps

  // No signal and nothing saved: say so, so a tap that does nothing makes sense.
  // Ask for Help has its own note.
  if (uid && !online && !list.length && pathname !== '/ask') {
    return (
      <p className="pa-nosignal" role="status">
        <b>{t('No signal right now.')}</b> {t('You can still ask for help. Some pages open only with signal.')}
      </p>
    )
  }
  if (!uid || (!list.length && !sentNote)) return null

  return (
    <section className="pending-asks" aria-labelledby="pa-h">
      {sentNote && !list.length && (
        <div className="pa-sent" role="status">
          <Icon name="check" size={28} />
          <span id="pa-h">{sentNote}</span>
          <button type="button" className="pa-ok" onClick={() => setSentNote('')}>{t('OK')}</button>
        </div>
      )}
      {list.length > 0 && (
        <>
          <h2 id="pa-h" className="pa-title">
            {waiting === 0 ? t('A saved request needs you')
              : waiting === 1 ? t('1 request is waiting for signal')
              : t('{n} requests are waiting for signal', { n: waiting })}
          </h2>
          {waiting > 0 && (
            <p className="pa-text" role="status">
              {t(online && busy ? 'Sending now...'
                : online ? 'It will send by itself in a moment.'
                : 'No signal right now. It will send by itself when your phone has signal. Keep the app open if you can.')}
            </p>
          )}
          {sentNote && <p className="pa-text" role="status">{sentNote}</p>}
          <ul className="pa-list">
            {list.map((a) => (
              <li key={a.key} className="pa-item">
                <span className="pa-what">
                  <b>{a.row.for_name ? t('For {name}', { name: a.row.for_name }) + ': ' : ''}{t(a.row.skill_needed)}</b>
                  <small>{t('Saved {when}', { when: ago(a.saved_at) })}</small>
                  {a.problem && <small className="pa-problem">{t('Not sent:')} {t(a.problem)}</small>}
                </span>
                <button type="button" className={'pa-remove' + (sure === a.key ? ' sure' : '')}
                  onClick={() => { if (sure === a.key) { removePendingAsk(uid, a.key); setSure('') } else setSure(a.key) }}
                  aria-label={t(sure === a.key ? 'Tap again to remove the saved request for {skill}' : 'Remove the saved request for {skill}', { skill: t(a.row.skill_needed) })}>
                  {t(sure === a.key ? 'Tap again to remove' : 'Remove')}
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
