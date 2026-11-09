import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { askConfirm, tell } from './AdminDialog'
import { useT } from '../utils/lang'

// Banning, for VWB admins and the founder (see vwb-bans.sql).
// A ban signs the person out, blocks their login and their email from
// signing up again, and hides their requests, offers, and posts from
// everyone but admins. Nothing is deleted, so "Undo ban" restores it all.
// Only the founder can ban an admin. Nobody can ban the founder.

const REASONS = [
  'Harassment or threats',
  'Predatory or unsafe behavior',
  'Scams, or asking for money or private information',
  'Hate speech or discrimination',
  'Impersonation or fake account',
  'Spam or selling',
  'Getting around a block or an earlier ban',
  'Other (explain below)',
]

// The "Are you sure?" window. `target` is { userId, name, role } for a
// member, or { email } for banning an email with no account.
export function BanDialog({ target, onClose, onDone }) {
  const t = useT()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const firstRef = useRef(null)
  const who = target.name || target.email || t('this person')
  // Banning a Hope Ambassador or anyone who leads a village, group or organization takes two admins unless
  // the founder does it (vwb-admin-safety.sql). Then this asks instead.
  const { isFounder } = useAuth()
  const [needsSecond, setNeedsSecond] = useState(false)
  useEffect(() => {
    if (isFounder || !target.userId) return
    supabase.rpc('is_trusted_person', { p_user: target.userId }).then(({ data, error }) => {
      if (error) { console.error('[BanDialog] is_trusted_person', error); return }
      setNeedsSecond(!!data)
    })
  }, [isFounder, target.userId])

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function doBan() {
    if (!reason) { setError(t('Pick a reason.')); return }
    if (reason.startsWith('Other') && !details.trim()) { setError(t('Say briefly what happened.')); return }
    if (!sure) { setError(t('Check the box to confirm.')); return }
    setBusy(true); setError('')
    const fullReason = reason + (details.trim() ? ': ' + details.trim() : '')
    if (needsSecond) {
      const { error: askErr } = await supabase.rpc('ban_request_ask', { p_target: target.userId, p_reason: fullReason.slice(0, 500) })
      setBusy(false)
      if (askErr) { console.error('[BanDialog] ban_request_ask', askErr); setError(askErr.message ? t(askErr.message) : t('Could not ask. Try again.')); return }
      onDone({ asked: true })
      return
    }
    const { error: err } = await supabase.rpc('ban_account', {
      p_reason: fullReason.slice(0, 500),
      p_user: target.userId || null,
      p_email: target.userId ? null : target.email,
    })
    setBusy(false)
    if (err) { console.error('[BanDialog] ban_account', err); setError(err.message ? t(err.message) : t('Could not ban. Try again.')); return }
    onDone()
  }

  return (
    <>
      <button type="button" className="app-dialog-scrim" aria-label={t('Close')} tabIndex={-1} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="ban-title" className="app-dialog">
        <h2 id="ban-title">{t('Ban {name}?', { name: who })}</h2>
        {needsSecond && (
          <p className="groups-note"><strong>{t('{name} is a Hope Ambassador, or leads a village, group or crew.', { name: who })}</strong> {t('A second admin has to agree before the ban happens. Your request shows in Reports for the other admins.')}</p>
        )}
        <p className="groups-note">
          {target.email
            ? t("They'll be signed out and can't log back in. This email can't be used to sign up again. Their requests, offers, and posts will be hidden from everyone but admins. You can undo this later.")
            : t("They'll be signed out and can't log back in. Their email can't be used to sign up again. Their requests, offers, and posts will be hidden from everyone but admins. You can undo this later.")}
        </p>
        <fieldset className="group-fieldset">
          <legend>{t('Why?')}</legend>
          {REASONS.map((r, i) => (
            <label key={r} className="group-radio">
              <input ref={i === 0 ? firstRef : undefined} type="radio" name="ban-reason" value={r} checked={reason === r} onChange={() => { setReason(r); setError('') }} />
              {t(r)}
            </label>
          ))}
        </fieldset>
        <label htmlFor="ban-details" className="group-label">{t('What happened? (seen only by admins)')}</label>
        <textarea id="ban-details" rows={3} maxLength={400} value={details} onChange={(e) => setDetails(e.target.value)} />
        <label className="group-radio">
          <input type="checkbox" checked={sure} onChange={(e) => { setSure(e.target.checked); setError('') }} />
          {t("Yes, I'm sure I want to ban {name}.", { name: who })}
        </label>
        {error && <p className="groups-error" role="alert">{error}</p>}
        <div className="groups-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>{t('Cancel')}</button>
          <button type="button" className="btn ban-btn-danger" onClick={doBan} disabled={busy}>{busy ? (needsSecond ? t('Asking...') : t('Banning...')) : (needsSecond ? t('Ask to ban') : t('Ban'))}</button>
        </div>
      </div>
    </>
  )
}

// The list of bans, "Ban an email address," and "Undo ban." Sits at the
// top of Admin > Users. `refreshKey` changes whenever a ban happens
// elsewhere on the page, so the list stays current.
export function BannedAccountsPanel({ refreshKey, onChange }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [bans, setBans] = useState([])
  const [email, setEmail] = useState('')
  const [emailTarget, setEmailTarget] = useState(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => { load() }, [refreshKey])

  async function load() {
    const { data, error } = await supabase.rpc('admin_banned_accounts')
    if (error) {
      if (error.code === 'PGRST202') { setLoadError(t('Bans need a quick database update first (vwb-bans.sql).')); return }
      console.error('[BannedAccountsPanel] load', error); setLoadError(t("Couldn't load the ban list.")); return
    }
    setLoadError('')
    setBans(data || [])
  }

  async function undo(b) {
    if (!(await askConfirm(t('Undo the ban on {name}? They can sign in again and their posts will show again. If they were an admin, that role is not given back.', { name: b.display_name || b.email }), { yes: t('Undo the ban') }))) return
    const { error } = await supabase.rpc('unban_account_by_id', { p_id: b.id })
    if (error) { console.error('[BannedAccountsPanel] unban', error); tell(t('Could not undo the ban. Try again.'), { tone: 'error' }); return }
    load(); onChange?.()
  }

  function startEmailBan(e) {
    e.preventDefault()
    const clean = email.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) { tell(t('Enter a full email address.'), { tone: 'error' }); return }
    setEmailTarget({ email: clean })
  }

  return (
    <section className="ban-panel">
      <button type="button" className="ban-panel-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{t('Banned accounts ({n})', { n: bans.length })}</span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="ban-panel-body">
          {loadError && <p className="groups-error" role="alert">{loadError}</p>}
          <form className="ban-email-form" onSubmit={startEmailBan} noValidate>
            <label htmlFor="ban-email">{t('Ban an email address')}</label>
            <p className="groups-note">{t("For someone who hasn't signed up yet, or to stop a known email from joining.")}</p>
            <div className="cal-zip-row">
              <input id="ban-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('name@example.com')} />
              <button type="submit" className="btn ban-btn-danger">{t('Ban')}</button>
            </div>
          </form>
          {bans.length === 0 && !loadError && <p className="groups-note">{t('No one is banned.')}</p>}
          {bans.map(b => (
            <div key={b.id ?? b.email} className="ban-row">
              <div className="ban-row-main">
                <strong>{b.display_name || t('No account')}</strong>
                <span className="group-member-sub">{b.email}</span>
                <span className="group-member-sub">{b.reason}</span>
                <span className="group-member-sub">{b.banned_by_name ? t('Banned {date} by {name}', { date: new Date(b.banned_at).toLocaleDateString(), name: b.banned_by_name }) : t('Banned {date}', { date: new Date(b.banned_at).toLocaleDateString() })}</span>
              </div>
              <button type="button" className="btn btn-outline group-small-btn" onClick={() => undo(b)}>{t('Undo ban')}</button>
            </div>
          ))}
        </div>
      )}
      {emailTarget && (
        <BanDialog target={emailTarget} onClose={() => setEmailTarget(null)} onDone={() => { setEmailTarget(null); setEmail(''); load(); onChange?.() }} />
      )}
    </section>
  )
}
