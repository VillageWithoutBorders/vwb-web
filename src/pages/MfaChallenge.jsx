import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

// The second step of signing in, for accounts that turned on two-step login.
// Shown instead of the app until the 6-digit code from their authenticator
// app is entered.
export default function MfaChallenge() {
  const { signOut, refreshMfa } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const clean = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(clean)) { setError('Enter the 6-digit code from your authenticator app.'); return }
    setBusy(true)
    const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors()
    const factor = factors?.totp?.[0]
    if (listErr || !factor) {
      setBusy(false)
      console.error('[MfaChallenge] listFactors', listErr)
      setError("We couldn't find your two-step login. Sign out and sign in again.")
      return
    }
    const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: clean })
    setBusy(false)
    if (verifyErr) {
      console.error('[MfaChallenge] verify', verifyErr)
      setCode('')
      setError('That code did not work. Check that the clock on your phone is right, then try the newest code.')
      return
    }
    await refreshMfa()
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Village Without Borders</h1>
          <p className="login-subtitle">One more step</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <h2>Two-step login</h2>
          <p className="field-hint">Open your authenticator app and enter the 6-digit code for Village Without Borders.</p>
          <div className="form-field">
            <label htmlFor="mfaCode">6-digit code</label>
            <input id="mfaCode" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{busy ? 'Checking...' : 'Continue'}</button>
          <p className="login-toggle">
            Lost your phone? Email info@villagewithoutborders.org from the address on your account.
          </p>
          <button type="button" className="link-button" onClick={signOut} style={{ fontSize: '0.875rem' }}>Sign out</button>
        </form>
      </div>
    </div>
  )
}
