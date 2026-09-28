import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

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
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const firstRef = useRef(null)
  const who = target.name || target.email || 'this person'

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function doBan() {
    if (!reason) { setError('Pick a reason.'); return }
    if (reason.startsWith('Other') && !details.trim()) { setError('Say briefly what happened.'); return }
    if (!sure) { setError('Check the box to confirm.'); return }
    setBusy(true); setError('')
    const fullReason = reason + (details.trim() ? ': ' + details.trim() : '')
    const { error: err } = await supabase.rpc('ban_account', {
      p_reason: fullReason.slice(0, 500),
      p_user: target.userId || null,
      p_email: target.userId ? null : target.email,
    })
    setBusy(false)
    if (err) { console.error('[BanDialog] ban_account', err); setError(err.message || 'Could not ban. Try again.'); return }
    onDone()
  }

  return (
    <>
      <button type="button" className="app-dialog-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="ban-title" className="app-dialog">
        <h2 id="ban-title">Ban {who}?</h2>
        <p className="groups-note">
          They'll be signed out and can't log back in. {target.email ? 'This email' : 'Their email'} can't be used to sign up again.
          Their requests, offers, and posts will be hidden from everyone but admins. You can undo this later.
        </p>
        <fieldset className="group-fieldset">
          <legend>Why?</legend>
          {REASONS.map((r, i) => (
            <label key={r} className="group-radio">
              <input ref={i === 0 ? firstRef : undefined} type="radio" name="ban-reason" value={r} checked={reason === r} onChange={() => { setReason(r); setError('') }} />
              {r}
            </label>
          ))}
        </fieldset>
        <label htmlFor="ban-details" className="group-label">What happened? (seen only by admins)</label>
        <textarea id="ban-details" rows={3} maxLength={400} value={details} onChange={(e) => setDetails(e.target.value)} />
        <label className="group-radio">
          <input type="checkbox" checked={sure} onChange={(e) => { setSure(e.target.checked); setError('') }} />
          Yes, I'm sure I want to ban {who}.
        </label>
        {error && <p className="groups-error" role="alert">{error}</p>}
        <div className="groups-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="btn ban-btn-danger" onClick={doBan} disabled={busy}>{busy ? 'Banning...' : 'Ban'}</button>
        </div>
      </div>
    </>
  )
}

// The list of bans, "Ban an email address," and "Undo ban." Sits at the
// top of Admin > Users. `refreshKey` changes whenever a ban happens
// elsewhere on the page, so the list stays current.
export function BannedAccountsPanel({ refreshKey, onChange }) {
  const [open, setOpen] = useState(false)
  const [bans, setBans] = useState([])
  const [email, setEmail] = useState('')
  const [emailTarget, setEmailTarget] = useState(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => { load() }, [refreshKey])

  async function load() {
    const { data, error } = await supabase.rpc('admin_banned_accounts')
    if (error) {
      if (error.code === 'PGRST202') { setLoadError('Bans need a quick database update first (vwb-bans.sql).'); return }
      console.error('[BannedAccountsPanel] load', error); setLoadError("Couldn't load the ban list."); return
    }
    setLoadError('')
    setBans(data || [])
  }

  async function undo(b) {
    if (!confirm('Undo the ban on ' + (b.display_name || b.email) + '? They can log in again and their posts will show again. (If they were an admin, that role is not given back.)')) return
    const { error } = await supabase.rpc('unban_account', { p_email: b.email })
    if (error) { console.error('[BannedAccountsPanel] unban', error); alert('Could not undo the ban. Try again.'); return }
    load(); onChange?.()
  }

  function startEmailBan(e) {
    e.preventDefault()
    const clean = email.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) { alert('Enter a full email address.'); return }
    setEmailTarget({ email: clean })
  }

  return (
    <section className="ban-panel">
      <button type="button" className="ban-panel-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>Banned accounts ({bans.length})</span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="ban-panel-body">
          {loadError && <p className="groups-error" role="alert">{loadError}</p>}
          <form className="ban-email-form" onSubmit={startEmailBan} noValidate>
            <label htmlFor="ban-email">Ban an email address</label>
            <p className="groups-note">For someone who hasn't signed up yet, or to stop a known email from joining.</p>
            <div className="cal-zip-row">
              <input id="ban-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
              <button type="submit" className="btn ban-btn-danger">Ban</button>
            </div>
          </form>
          {bans.length === 0 && !loadError && <p className="groups-note">No one is banned.</p>}
          {bans.map(b => (
            <div key={b.email} className="ban-row">
              <div className="ban-row-main">
                <strong>{b.display_name || 'No account'}</strong>
                <span className="group-member-sub">{b.email}</span>
                <span className="group-member-sub">{b.reason}</span>
                <span className="group-member-sub">Banned {new Date(b.banned_at).toLocaleDateString()}{b.banned_by_name ? ' by ' + b.banned_by_name : ''}</span>
              </div>
              <button type="button" className="btn btn-outline group-small-btn" onClick={() => undo(b)}>Undo ban</button>
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
