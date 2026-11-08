import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { askConfirm } from './AdminDialog'
import { useT, t } from '../utils/lang'

// Your own QR code (vwb-member-qr.sql). Used by the My QR code page and, since
// Nov 8 (Jade), the pop-up most buttons open (QrSheet.jsx). `inSheet` keeps it short.
// A neighbor points their phone camera at it and taps Connect. If they don't
// have an account yet, the same code takes them to sign up first, then back
// here to connect. Connecting counts as a vouch ("Met in person").
// The code is not your user id, and you can make a new one any time.
export default function MyCodePanel({ inSheet = false }) {
  const { profile } = useAuth()
  const [code, setCode] = useState(null)
  const [png, setPng] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useT()

  const url = code ? window.location.origin + '/connect/' + code : ''
  const name = profile?.display_name || t('Neighbor')

  useEffect(() => {
    let alive = true
    supabase.rpc('my_connect_code').then(({ data, error: err }) => {
      if (!alive) return
      if (err || !data) { console.error('my_connect_code failed:', err); setError(t('We could not load your code. Check your connection and try again.')); return }
      setCode(data)
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!url) return
    let alive = true
    QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((d) => { if (alive) setPng(d) })
      .catch((err) => { console.error('QR code failed:', err); if (alive) setError(t('We could not draw your code. You can still share the link.')) })
    return () => { alive = false }
  }, [url])

  async function share() {
    setNote('')
    try { await navigator.share({ title: t('Connect with {name} on Village Without Borders', { name }), url }) } catch { /* cancelled */ }
  }

  async function copy() {
    setNote('')
    try { await navigator.clipboard.writeText(url); setNote(t('Link copied.')) }
    catch { setNote(t('Could not copy. Press and hold the link to copy it.')) }
  }

  function save() {
    const a = document.createElement('a')
    a.href = png
    a.download = 'vwb-my-qr-code.png'
    a.click()
  }

  async function makeNew() {
    if (busy) return
    if (!(await askConfirm(t('Make a new code? Your old QR code and link will stop working. People you already connected with stay connected.')))) return
    setBusy(true); setError(''); setNote('')
    const { data, error: err } = await supabase.rpc('reset_my_connect_code')
    setBusy(false)
    if (err || !data) { console.error('reset_my_connect_code failed:', err); setError(t('Could not make a new code. Try again.')); return }
    setPng('')
    setCode(data)
    setNote(t('Your new code is ready. The old one no longer works.'))
  }

  return (
    <>
      {!inSheet && <p className="cal-sub">{t('Met a neighbor in person? Let them scan this with their phone camera. You will be connected, and it counts as a vouch.')}</p>}
      {inSheet && <p className="mycode-lead">{t('Let a neighbor you met scan this with their phone camera. It connects you and counts as a vouch.')}</p>}

      {error && <p className="form-error" role="alert">{error}</p>}
      {!code && !error && <p className="cal-empty" role="status">{t('Loading...')}</p>}

      {code && (
        <div className="mycode-card">
          {png
            ? <img className="mycode-img" src={png} width="256" height="256" alt={t('QR code to connect with {name}', { name })} />
            : <div className="mycode-img mycode-img-wait" aria-hidden="true" />}
          <p className="mycode-name">{name}</p>
          <p className="mycode-hint">{t('No account yet? The same code helps them sign up first. Accounts are for adults (18+).')}</p>
        </div>
      )}

      {code && (
        <div className={'mycode-actions' + (inSheet ? ' mycode-actions-row' : '')}>
          {typeof navigator !== 'undefined' && navigator.share && <button type="button" className="btn btn-primary btn-full" onClick={share}>{t('Share my link')}</button>}
          <button type="button" className="btn btn-outline btn-full" onClick={copy}>{t('Copy my link')}</button>
          {png && <button type="button" className="btn btn-outline btn-full" onClick={save}>{t('Save the picture')}</button>}
          {note && <p className="form-success" role="status">{note}</p>}
        </div>
      )}

      {code && (
        <section className={inSheet ? 'mycode-safety mycode-safety-small' : 'cal-box mycode-safety'} aria-labelledby={inSheet ? 'mycode-safe-s' : 'mycode-safe'}>
          <h2 id={inSheet ? 'mycode-safe-s' : 'mycode-safe'}>{t('Keep it safe')}</h2>
          <p className="cal-sub">{t('Only show your code to people you have met. Anyone who scans it can connect with you. If it ends up somewhere you did not want, make a new one.')}</p>
          <button type="button" className={inSheet ? 'link-button mycode-new' : 'btn btn-outline btn-full'} disabled={busy} onClick={makeNew}>{t(busy ? 'Making...' : 'Make a new code')}</button>
        </section>
      )}
    </>
  )
}
