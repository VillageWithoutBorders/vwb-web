import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { needsKeyRestore, restoreFromRecoveryCode, startFreshKey } from '../lib/e2ee'

// Shown when someone signs in on a device that has no message key but has a
// recovery key on file (a new phone, or cleared browser data). They can
// restore their old messages or start fresh.
export default function KeyRestorePrompt() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    let alive = true
    needsKeyRestore(user.id).then(needs => { if (alive) setOpen(needs) })
    return () => { alive = false }
  }, [user])

  if (!open) return null

  async function restore(e) {
    e.preventDefault()
    setBusy(true); setError('')
    const result = await restoreFromRecoveryCode(user.id, code)
    setBusy(false)
    if (result === 'restored') { window.location.reload(); return }
    setError(result === 'wrong-code' ? "That recovery key didn't work. Check it and try again." : 'Could not restore. Check your connection and try again.')
  }

  async function fresh() {
    if (!confirm('Start fresh? Messages from before can only be read again if you restore with your recovery key later. New messages will work normally.')) return
    setBusy(true)
    await startFreshKey(user.id)
    setBusy(false)
    setOpen(false)
  }

  return (
    <>
      <div className="app-dialog-scrim" />
      <div role="dialog" aria-modal="true" aria-labelledby="restore-title" className="key-dialog">
        <h3 id="restore-title">Restore your private messages?</h3>
        <p>This device can't open your older private messages yet. Enter your recovery key to bring them back.</p>
        <form onSubmit={restore}>
          <label htmlFor="restore-prompt-code" className="privacy-toggle-label">Your recovery key</label>
          <input id="restore-prompt-code" type="text" className="group-search" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" autoFocus />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-full" style={{ minHeight: '44px', marginTop: '0.5rem' }} disabled={busy || !code.trim()}>{busy ? 'Working...' : 'Restore my messages'}</button>
        </form>
        <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px', marginTop: '0.5rem' }} onClick={fresh} disabled={busy}>Start fresh without them</button>
      </div>
    </>
  )
}
