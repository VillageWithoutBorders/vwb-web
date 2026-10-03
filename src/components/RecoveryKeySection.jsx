import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { createRecoveryBackup, getRecoveryStatus, restoreFromRecoveryCode } from '../lib/e2ee'

// Settings section: make or replace the recovery key, or use one to bring
// old private messages back on this device.
export default function RecoveryKeySection() {
  const { user } = useAuth()
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState(null) // shown once, right after it is made
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [entered, setEntered] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!user) return
    getRecoveryStatus(user.id).then(setStatus)
  }, [user])

  // Arriving from the home screen reminder (/settings#recovery).
  useEffect(() => {
    if (window.location.hash === '#recovery') document.getElementById('recovery')?.scrollIntoView({ block: 'start' })
  }, [])

  async function make() {
    if (status?.exists && !confirm('Make a new recovery key? Your old one will stop working.')) return
    setBusy(true); setError(''); setNote('')
    const result = await createRecoveryBackup(user.id)
    setBusy(false)
    if (result.error) { setError(result.error); return }
    setCode(result.code); setSaved(false); setCopied(false)
    setStatus({ exists: true, updatedAt: new Date().toISOString() })
  }

  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true) } catch (e) { setCopied(false) }
  }

  function download() {
    const text = 'Village Without Borders recovery key\n\n' + code + '\n\nKeep this somewhere private. Anyone who has it and can sign in to your account can read your private messages. VWB cannot recover it for you.\n'
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'vwb-recovery-key.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function restore(e) {
    e.preventDefault()
    setBusy(true); setError(''); setNote('')
    const result = await restoreFromRecoveryCode(user.id, entered)
    setBusy(false)
    if (result === 'restored') { window.location.reload(); return }
    if (result === 'wrong-code') setError("That recovery key didn't work. Check it and try again.")
    else if (result === 'no-backup') setError("There's no recovery key saved for this account yet.")
    else setError('Could not restore. Check your connection and try again.')
  }

  return (
    <div className="profile-details" id="recovery" style={{ marginTop: '0.75rem' }}>
      <div className="detail-section-header">Recovery key</div>
      <div style={{ padding: '0 1rem 1rem' }}>
        <p className="privacy-toggle-desc" style={{ marginTop: 0 }}>
          Your private messages are locked with a key that lives only on this device. If you clear your browser, lose your phone, or switch devices, old messages can't be opened. A recovery key lets you bring them back. We never see it, so we can't open your messages either.
        </p>
        <p className="privacy-toggle-desc">
          {status?.exists
            ? 'Recovery key set up' + (status.updatedAt ? ' on ' + new Date(status.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '') + '.'
            : 'You have not set up a recovery key yet.'}
        </p>
        <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} onClick={make} disabled={busy}>
          {busy && !restoring ? 'Working...' : (status?.exists ? 'Make a new recovery key' : 'Make my recovery key')}
        </button>
        <button type="button" className="link-button" style={{ marginTop: '0.75rem', minHeight: '44px' }} onClick={() => { setRestoring(r => !r); setError('') }}>
          {restoring ? 'Cancel' : 'I have a recovery key. Restore my messages.'}
        </button>
        {restoring && (
          <form onSubmit={restore} style={{ marginTop: '0.5rem' }}>
            <label htmlFor="restore-code" className="privacy-toggle-label">Your recovery key</label>
            <input id="restore-code" type="text" className="group-search" value={entered} onChange={e => setEntered(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" />
            <p className="privacy-toggle-desc">Restoring replaces the key on this device. Messages sent to this device since it lost its key stay locked.</p>
            <button type="submit" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} disabled={busy || !entered.trim()}>{busy ? 'Restoring...' : 'Restore'}</button>
          </form>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {note && <p className="form-success" role="status">{note}</p>}
      </div>

      {code && (
        <>
          <button type="button" className="app-dialog-scrim" aria-label="Close" tabIndex={-1} onClick={() => saved && setCode(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="recovery-title" className="key-dialog">
            <h3 id="recovery-title">Save your recovery key</h3>
            <p>This is the only time we will show it. Write it down or save it somewhere private, like a password manager. We can't get it back for you.</p>
            <p className="key-code" aria-label="Your recovery key">{code}</p>
            <div className="key-actions">
              <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
              <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={download}>Download</button>
            </div>
            <p className="privacy-toggle-desc">Anyone who has this key and can sign in to your account could read your private messages. Don't share it.</p>
            <label className="key-check">
              <input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />
              <span>I saved my recovery key</span>
            </label>
            <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} disabled={!saved} onClick={() => setCode(null)}>Done</button>
          </div>
        </>
      )}
    </div>
  )
}
