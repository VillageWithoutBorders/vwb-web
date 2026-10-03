import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { resetAccountToBase } from '../utils/resetAccount'
import { startAppTour } from '../components/AppTour'
import { fetchMyDevices, removeMyDevice, getDeviceId } from '../lib/e2ee'
import RecoveryKeySection from '../components/RecoveryKeySection'

// A plain read on how strong a new password is. Length matters most.
function passwordStrength(pw) {
  if (pw.length < 8) return { label: 'Too short. Use at least 8 characters.', level: 0 }
  let score = 0
  if (pw.length >= 12) score++
  if (pw.length >= 16) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { label: 'Fair. A longer password helps most.', level: 1 }
  if (score <= 3) return { label: 'Good', level: 2 }
  return { label: 'Strong', level: 3 }
}

function reportError(context, error, userMessage) {
  if (!error) return false
  console.error(`[Settings:${context}]`, error)
  if (userMessage) alert(userMessage)
  return true
}

export default function Settings() {
  const { user, profile, isAdmin, isFounder, signOut, signOutEverywhere, refreshProfile, refreshMfa } = useAuth()
  const navigate = useNavigate()

  const [showEmailChange, setShowEmailChange] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [emailMessage, setEmailMessage] = useState('')

  const [resetting, setResetting] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [resetError, setResetErrorMsg] = useState('')

  const [readReceipts, setReadReceipts] = useState(true)
  const [safetyCheckins, setSafetyCheckins] = useState(true)
  const [blockedUsers, setBlockedUsers] = useState([])
  const [devices, setDevices] = useState([])
  const [thisDeviceId, setThisDeviceId] = useState(null)
  const [devicesLoaded, setDevicesLoaded] = useState(false)
  const [removingDevice, setRemovingDevice] = useState(null)
  const [deviceNote, setDeviceNote] = useState('')
  const [signingOutAll, setSigningOutAll] = useState(false)

  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwMessage, setPwMessage] = useState('')

  const [twoStep, setTwoStep] = useState(null) // the verified authenticator, if any
  const [twoStepLoaded, setTwoStepLoaded] = useState(false)
  const [enroll, setEnroll] = useState(null) // { id, qr, secret } while setting up
  const [twoStepCode, setTwoStepCode] = useState('')
  const [twoStepBusy, setTwoStepBusy] = useState(false)
  const [twoStepError, setTwoStepError] = useState('')
  const [twoStepMessage, setTwoStepMessage] = useState('')

  const [showDelete, setShowDelete] = useState(false)
  const [deletePw, setDeletePw] = useState('')
  const [deleteWord, setDeleteWord] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [signOutAllError, setSignOutAllError] = useState('')

  useEffect(() => {
    if (!user) return
    let alive = true
    Promise.all([fetchMyDevices(user.id), getDeviceId()]).then(([list, mine]) => {
      if (!alive) return
      setDevices(list)
      setThisDeviceId(mine)
      setDevicesLoaded(true)
    })
    return () => { alive = false }
  }, [user])

  useEffect(() => {
    async function loadPrivacyPrefs() {
      const { data, error } = await supabase.from('helper_profiles').select('read_receipts_enabled, safety_checkins_enabled').eq('user_id', user.id).maybeSingle()
      reportError('loadPrivacyPrefs', error)
      if (data) {
        setReadReceipts(data.read_receipts_enabled !== false)
        setSafetyCheckins(data.safety_checkins_enabled !== false)
      }
    }
    async function loadBlockedUsers() {
      const { data, error } = await supabase.from('blocks').select('id, blocked_id').eq('blocker_id', user.id)
      reportError('loadBlockedUsers', error)
      if (data && data.length > 0) {
        const names = await Promise.all(data.map(async (b) => {
          const { data: p, error: profErr } = await supabase.from('helper_profiles_public').select('display_name').eq('user_id', b.blocked_id).maybeSingle()
          if (profErr) console.error('[Settings:loadBlockedUsers]', profErr)
          return { ...b, name: p?.display_name || 'Unknown' }
        }))
        setBlockedUsers(names)
      } else {
        setBlockedUsers([])
      }
    }
    if (user?.id) { loadPrivacyPrefs(); loadBlockedUsers() }
  }, [user?.id])

  async function handleEmailChange() {
    if (!newEmail.trim() || !newEmail.includes('@')) { setEmailError('Enter a valid email address.'); return }
    setEmailSaving(true); setEmailError(''); setEmailMessage('')
    const { error: updateError } = await supabase.auth.updateUser({ email: newEmail.trim() })
    reportError('handleEmailChange', updateError)
    if (updateError) { setEmailError(updateError.message); setEmailSaving(false); return }
    setEmailMessage('Check your old and new email for confirmation links. Your login email updates once you confirm.')
    setEmailSaving(false)
    setShowEmailChange(false)
    setNewEmail('')
  }

  // Steps this account back down to a plain Neighbor: clears Ambassador
  // status and details plus any admin coverage-area info. Also doubles as
  // Jade's own quick way to reset an account she's testing with. Founder
  // accounts are never affected (resetAccountToBase guards this too).
  async function handleResetToBase() {
    if (!confirm('Reset your account back to a plain Neighbor? This clears your Ambassador status, skills, availability, and any admin coverage area.')) return
    setResetting(true); setResetErrorMsg(''); setResetMessage('')
    const { error: resetErr } = await resetAccountToBase(user.id, { currentRole: profile?.role })
    reportError('handleResetToBase', resetErr)
    if (resetErr) { setResetErrorMsg('Could not reset your account. Try again.'); setResetting(false); return }
    await refreshProfile()
    setResetMessage('Your account has been reset to Neighbor status.')
    setResetting(false)
  }

  async function savePrivacyPref(col, val) {
    const { error } = await supabase.from('helper_profiles').update({ [col]: val }).eq('user_id', user.id)
    reportError('savePrivacyPref', error)
    return !error
  }

  async function toggleReadReceipts() {
    const v = !readReceipts
    setReadReceipts(v)
    const ok = await savePrivacyPref('read_receipts_enabled', v)
    if (!ok) { setReadReceipts(!v); alert('Could not save this setting. Try again.') }
  }

  async function toggleSafetyCheckins() {
    const v = !safetyCheckins
    setSafetyCheckins(v)
    const ok = await savePrivacyPref('safety_checkins_enabled', v)
    if (!ok) { setSafetyCheckins(!v); alert('Could not save this setting. Try again.') }
  }

  async function unblockUser(blockId) {
    const { error } = await supabase.from('blocks').delete().eq('id', blockId)
    if (error) { console.error('[Settings:unblockUser]', error); alert('Could not unblock this user. Try again.'); return }
    setBlockedUsers((prev) => prev.filter((b) => b.id !== blockId))
  }

  async function removeDevice(d) {
    if (!confirm('Remove ' + (d.label || 'this device') + '? New private messages will stop being sent to it. Messages already on it stay readable there.')) return
    setRemovingDevice(d.deviceId); setDeviceNote('')
    const ok = await removeMyDevice(user.id, d.deviceId)
    setRemovingDevice(null)
    if (!ok) { setDeviceNote("We couldn't remove that device. Try again."); return }
    setDevices((prev) => prev.filter((x) => x.deviceId !== d.deviceId))
    setDeviceNote('Removed.')
  }

  useEffect(() => {
    let alive = true
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!alive) return
      if (error) console.error('[Settings:listFactors]', error)
      setTwoStep(data?.totp?.[0] || null)
      setTwoStepLoaded(true)
    })
    return () => { alive = false }
  }, [])

  async function startTwoStep() {
    setTwoStepError(''); setTwoStepMessage(''); setTwoStepBusy(true)
    // Clear any half-finished setup from an earlier try.
    const { data: existing } = await supabase.auth.mfa.listFactors()
    for (const f of existing?.all || []) {
      if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' })
    setTwoStepBusy(false)
    if (error || !data) {
      console.error('[Settings:enroll]', error)
      setTwoStepError("We couldn't start two-step login. Try again in a moment.")
      return
    }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    setTwoStepCode('')
  }

  async function confirmTwoStep(e) {
    e.preventDefault()
    setTwoStepError('')
    const clean = twoStepCode.replace(/\s/g, '')
    if (!/^\d{6}$/.test(clean)) { setTwoStepError('Enter the 6-digit code from your authenticator app.'); return }
    setTwoStepBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: clean })
    if (error) {
      setTwoStepBusy(false)
      console.error('[Settings:verifyTwoStep]', error)
      setTwoStepError('That code did not work. Try the newest one.')
      return
    }
    const { data } = await supabase.auth.mfa.listFactors()
    setTwoStep(data?.totp?.[0] || null)
    setEnroll(null); setTwoStepCode(''); setTwoStepBusy(false)
    setTwoStepMessage('Two-step login is on. You will enter a code each time you sign in.')
    await refreshMfa()
  }

  async function cancelTwoStep() {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.id })
    setEnroll(null); setTwoStepCode(''); setTwoStepError('')
  }

  async function turnOffTwoStep() {
    if (!confirm('Turn off two-step login? Your account will be protected by your password alone.')) return
    setTwoStepError(''); setTwoStepMessage(''); setTwoStepBusy(true)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: twoStep.id })
    setTwoStepBusy(false)
    if (error) {
      console.error('[Settings:unenroll]', error)
      setTwoStepError("We couldn't turn it off. Sign out, sign in with your code, and try again.")
      return
    }
    setTwoStep(null)
    setTwoStepMessage('Two-step login is off.')
  }

  // Shows the database's own short message when it is plain, otherwise a general one.
  function plainError(err, fallback) {
    if (err?.code === 'PGRST202') return 'This needs a quick database update first (vwb-security.sql).'
    return err?.message && err.message.length < 160 ? err.message : fallback
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPwError(''); setPwMessage('')
    if (!currentPw) { setPwError('Enter your current password.'); return }
    if (newPw.length < 8) { setPwError('Your new password needs at least 8 characters.'); return }
    if (newPw !== confirmPw) { setPwError('The new passwords do not match.'); return }
    if (newPw === currentPw) { setPwError('Choose a password different from your current one.'); return }
    setPwSaving(true)
    const { data: ok, error: checkErr } = await supabase.rpc('verify_my_password', { p_password: currentPw })
    if (checkErr) { setPwSaving(false); console.error('[Settings:verifyPassword]', checkErr); setPwError(plainError(checkErr, "We couldn't check your password. Try again.")); return }
    if (!ok) { setPwSaving(false); setPwError('That is not your current password.'); return }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) { setPwSaving(false); console.error('[Settings:changePassword]', error); setPwError(plainError(error, "We couldn't change your password. Try again.")); return }
    // Every other device has to sign in again with the new password.
    const { error: othersErr } = await supabase.auth.signOut({ scope: 'others' })
    if (othersErr) console.error('[Settings:signOutOthers]', othersErr)
    setPwSaving(false)
    setCurrentPw(''); setNewPw(''); setConfirmPw(''); setShowPasswordForm(false)
    setPwMessage('Password changed. Your other devices were signed out.')
  }

  async function handleDeleteAccount(e) {
    e.preventDefault()
    setDeleteError('')
    if (!deletePw) { setDeleteError('Enter your password.'); return }
    if (deleteWord !== 'DELETE') { setDeleteError('Type DELETE in capital letters to confirm.'); return }
    setDeleting(true)
    const { data: ok, error: checkErr } = await supabase.rpc('verify_my_password', { p_password: deletePw })
    if (checkErr) { setDeleting(false); console.error('[Settings:verifyPassword]', checkErr); setDeleteError(plainError(checkErr, "We couldn't check your password. Try again.")); return }
    if (!ok) { setDeleting(false); setDeleteError('That is not your password.'); return }
    const { error } = await supabase.rpc('delete_my_account', { p_confirm: deleteWord })
    if (error) { setDeleting(false); console.error('[Settings:deleteAccount]', error); setDeleteError(plainError(error, "We couldn't delete your account. Nothing was changed.")); return }
    await signOut()
    navigate('/welcome', { replace: true })
  }

  async function handleSignOutEverywhere() {
    if (!confirm('Sign out of every device, including this one? You will need to sign in again on each of them.')) return
    setSigningOutAll(true); setSignOutAllError('')
    const ok = await signOutEverywhere()
    setSigningOutAll(false)
    if (!ok) setSignOutAllError("We couldn't sign you out everywhere. Check your connection and try again.")
  }

  function shortDate(iso) {
    return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null
  }

  return (
    <div className="profile-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={() => navigate('/profile')} aria-label="Back to Profile" style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer' }}>&#8592;</button>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#4ecca3' }}>Settings &amp; Privacy</h1>
      </div>

      <button type="button" className="btn btn-outline btn-full" onClick={startAppTour} style={{ minHeight: '44px', marginBottom: '1rem' }}>
        <span aria-hidden="true">{'\u{1F9ED}'}</span> Take the app tour again
      </button>

      <div className="profile-details">
        <div className="detail-row">
          <span className="detail-label">Email</span>
          <span className="detail-value">{user?.email}</span>
        </div>
        {!showEmailChange ? (
          <div style={{ textAlign: 'right', padding: '0 1rem 0.75rem' }}>
            <button type="button" className="link-button" style={{ fontSize: '0.8125rem' }} onClick={() => { setShowEmailChange(true); setEmailError(''); setEmailMessage('') }}>
              Change email
            </button>
          </div>
        ) : (
          <div className="form-field" style={{ padding: '0 1rem 0.75rem' }}>
            <label htmlFor="newEmail">New email address</label>
            <input id="newEmail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="you@example.com" />
            {emailError && <p className="form-error" role="alert">{emailError}</p>}
            <div className="form-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => { setShowEmailChange(false); setNewEmail(''); setEmailError('') }} disabled={emailSaving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleEmailChange} disabled={emailSaving} style={{ flex: 1 }}>
                {emailSaving ? 'Sending...' : 'Send confirmation'}
              </button>
            </div>
          </div>
        )}
        {emailMessage && <p className="form-success" role="status">{emailMessage}</p>}
      </div>

      <div className="profile-details" style={{ marginTop: '1rem' }}>
        <div className="detail-section-header">Password</div>
        {!showPasswordForm ? (
          <div className="detail-row">
            <span className="detail-value" style={{ textAlign: 'left' }}>Use a password you don't use anywhere else.</span>
            <button type="button" className="link-button" style={{ fontSize: '0.8125rem' }} onClick={() => { setShowPasswordForm(true); setPwError(''); setPwMessage('') }}>
              Change password
            </button>
          </div>
        ) : (
          <form onSubmit={handleChangePassword} className="form-field" style={{ padding: '0 1rem 0.75rem' }} noValidate>
            <label htmlFor="currentPw">Current password</label>
            <input id="currentPw" type={showPw ? 'text' : 'password'} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" />
            <label htmlFor="newPw" style={{ marginTop: '0.75rem' }}>New password</label>
            <input id="newPw" type={showPw ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" aria-describedby="newPwStrength" />
            {newPw && (
              <div id="newPwStrength" style={{ marginTop: '0.4rem' }}>
                <div style={{ height: '6px', borderRadius: '3px', background: '#333', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: (passwordStrength(newPw).level + 1) * 25 + '%', background: ['#ff6666', '#ffaa44', '#8fc', '#4ecca3'][passwordStrength(newPw).level] }} />
                </div>
                <span className="field-hint">{passwordStrength(newPw).label}</span>
              </div>
            )}
            <label htmlFor="confirmPw" style={{ marginTop: '0.75rem' }}>Type the new password again</label>
            <input id="confirmPw" type={showPw ? 'text' : 'password'} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', minHeight: '44px' }}>
              <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> Show passwords
            </label>
            <span className="field-hint">When you change it, every other device is signed out.</span>
            {pwError && <p className="form-error" role="alert">{pwError}</p>}
            <div className="form-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => { setShowPasswordForm(false); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwError('') }} disabled={pwSaving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={pwSaving} style={{ flex: 1 }}>{pwSaving ? 'Saving...' : 'Change password'}</button>
            </div>
          </form>
        )}
        {pwMessage && <p className="form-success" role="status" style={{ padding: '0 1rem 0.75rem' }}>{pwMessage}</p>}
      </div>

      <div className="profile-details" style={{ marginTop: '1rem' }}>
        <div className="detail-section-header">Two-Step Login</div>
        {twoStepLoaded && !enroll && !twoStep && (
          <div className="detail-row">
            <span className="detail-value" style={{ textAlign: 'left' }}>Add a code from an authenticator app to sign in. Strongly recommended for admins.</span>
            <button type="button" className="link-button" style={{ fontSize: '0.8125rem' }} onClick={startTwoStep} disabled={twoStepBusy}>
              {twoStepBusy ? 'Starting...' : 'Turn on'}
            </button>
          </div>
        )}
        {twoStepLoaded && !enroll && twoStep && (
          <div className="detail-row">
            <span className="detail-value" style={{ textAlign: 'left' }}>On. You enter a 6-digit code each time you sign in.</span>
            <button type="button" className="link-button" style={{ fontSize: '0.8125rem', color: '#ff6666' }} onClick={turnOffTwoStep} disabled={twoStepBusy}>
              Turn off
            </button>
          </div>
        )}
        {enroll && (
          <form onSubmit={confirmTwoStep} className="form-field" style={{ padding: '0 1rem 0.75rem' }} noValidate>
            <p className="field-hint">1. Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, or your password manager) and scan this picture.</p>
            <img src={enroll.qr} alt="QR code to scan with your authenticator app" width={180} height={180} style={{ background: '#fff', padding: '8px', borderRadius: '8px', display: 'block', margin: '0.5rem 0', maxWidth: '100%', height: 'auto' }} />
            <p className="field-hint">Can't scan it? Type this key into the app instead:</p>
            <code style={{ display: 'block', wordBreak: 'break-all', padding: '0.5rem', background: '#1a1a1a', borderRadius: '6px', fontSize: '0.85rem' }}>{enroll.secret}</code>
            <p className="field-hint" style={{ marginTop: '0.75rem' }}>2. Enter the 6-digit code the app shows.</p>
            <label htmlFor="twoStepCode" className="sr-only">6-digit code</label>
            <input id="twoStepCode" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={twoStepCode} onChange={(e) => setTwoStepCode(e.target.value)} />
            <p className="field-hint">Keep your phone safe. If you lose it, an admin can reset this for you after you email info@villagewithoutborders.org.</p>
            <div className="form-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={cancelTwoStep} disabled={twoStepBusy}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={twoStepBusy} style={{ flex: 1 }}>{twoStepBusy ? 'Checking...' : 'Turn on'}</button>
            </div>
          </form>
        )}
        {twoStepError && <p className="form-error" role="alert" style={{ padding: '0 1rem 0.75rem' }}>{twoStepError}</p>}
        {twoStepMessage && <p className="form-success" role="status" style={{ padding: '0 1rem 0.75rem' }}>{twoStepMessage}</p>}
      </div>

      <div className="profile-details" style={{ marginTop: '1rem' }}>
        <div className="detail-section-header">Privacy &amp; Safety</div>
        <div className="privacy-toggle-row">
          <div>
            <span className="privacy-toggle-label">Read receipts</span>
            <p className="privacy-toggle-desc">Show when you have read a message. If you turn this off, you won't see when others read yours either.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={readReceipts}
            aria-label="Read receipts"
            className={`toggle-switch${readReceipts ? ' on' : ''}`}
            onClick={toggleReadReceipts}
          >
            <span className="toggle-switch-knob" />
          </button>
        </div>
        <div className="privacy-toggle-row">
          <div>
            <span className="privacy-toggle-label">Safety check-ins</span>
            <p className="privacy-toggle-desc">Receive periodic check-in prompts during active help sessions</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={safetyCheckins}
            aria-label="Safety check-ins"
            className={`toggle-switch${safetyCheckins ? ' on' : ''}`}
            onClick={toggleSafetyCheckins}
          >
            <span className="toggle-switch-knob" />
          </button>
        </div>
        <div className="detail-row">
          <span className="detail-label">More message settings</span>
          <button type="button" className="link-button" style={{ fontSize: '0.8125rem' }} onClick={() => navigate('/messages')}>
            Open Messages
          </button>
        </div>
      </div>

      <div className="profile-details" style={{ marginTop: '0.75rem' }}>
        <div className="detail-section-header">Blocked Neighbors</div>
        {blockedUsers.length === 0 ? (
          <div className="detail-row">
            <span className="detail-value" style={{ textAlign: 'left' }}>You haven't blocked anyone</span>
          </div>
        ) : (
          blockedUsers.map((b) => (
            <div key={b.id} className="blocked-user-row">
              <span className="privacy-toggle-label">{b.name}</span>
              <button type="button" className="link-button" style={{ fontSize: '0.8125rem' }} onClick={() => unblockUser(b.id)}>
                Unblock
              </button>
            </div>
          ))
        )}
      </div>

      <RecoveryKeySection />

      <div className="profile-details" style={{ marginTop: '0.75rem' }}>
        <div className="detail-section-header">Your Devices</div>
        <div className="detail-row">
          <span className="detail-value" style={{ textAlign: 'left', fontSize: '0.8125rem' }}>
            Private messages are locked separately for each device. Open VWB once on each device you use so it can read new messages. A new device can't read messages sent before it was added.
          </span>
        </div>
        {devicesLoaded && devices.length === 0 && (
          <div className="detail-row">
            <span className="detail-value" style={{ textAlign: 'left' }}>No devices found yet</span>
          </div>
        )}
        {devices.map((d) => {
          const mine = d.deviceId === thisDeviceId
          const stale = d.lastSeen && Date.now() - new Date(d.lastSeen).getTime() > 60 * 24 * 3600 * 1000
          return (
            <div key={d.deviceId} className="blocked-user-row">
              <div>
                <span className="privacy-toggle-label">{d.label || 'Device (name not saved yet)'}{mine ? ' (this device)' : ''}</span>
                <p className="privacy-toggle-desc">
                  Added {shortDate(d.addedAt)}
                  {d.lastSeen ? ' \u00b7 Last used ' + shortDate(d.lastSeen) : ''}
                  {stale ? ' \u00b7 Not used in a while' : ''}
                </p>
              </div>
              {!mine && (
                <button type="button" className="link-button" style={{ fontSize: '0.8125rem' }} onClick={() => removeDevice(d)} disabled={removingDevice === d.deviceId}>
                  {removingDevice === d.deviceId ? 'Removing...' : 'Remove'}
                </button>
              )}
            </div>
          )
        })}
        {deviceNote && <p className="form-success" role="status" style={{ padding: '0 1rem 0.75rem' }}>{deviceNote}</p>}
        <div style={{ padding: '0 1rem 1rem' }}>
          <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px', color: '#ff6666', borderColor: '#ff6666' }} onClick={handleSignOutEverywhere} disabled={signingOutAll}>
            {signingOutAll ? 'Signing out...' : 'Sign out of all devices'}
          </button>
          <p className="privacy-toggle-desc" style={{ marginTop: '0.5rem' }}>
            Use this if you lost a device or think someone else got into your account. Other devices are signed out within about an hour. Your private message history stays on each device.
          </p>
          {signOutAllError && <p className="form-error" role="alert">{signOutAllError}</p>}
        </div>
      </div>

      <div className="profile-details" style={{ marginTop: '0.75rem' }}>
        <div className="detail-section-header">Delete My Account</div>
        {!showDelete ? (
          <div className="detail-row">
            <span className="detail-value" style={{ textAlign: 'left' }}>Leave Village Without Borders for good.</span>
            <button type="button" className="link-button" style={{ fontSize: '0.8125rem', color: '#ff6666' }} onClick={() => { setShowDelete(true); setDeleteError('') }}>
              Delete account
            </button>
          </div>
        ) : (
          <form onSubmit={handleDeleteAccount} className="form-field" style={{ padding: '0 1rem 0.75rem' }} noValidate>
            <p className="field-hint" style={{ marginBottom: '0.5rem' }}>
              This removes your account and cannot be undone. Your profile, messages, and sign-ups go with it. If you lead a group that has other members, hand leadership to someone first.
            </p>
            <label htmlFor="deletePw">Your password</label>
            <input id="deletePw" type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} autoComplete="current-password" />
            <label htmlFor="deleteWord" style={{ marginTop: '0.75rem' }}>Type DELETE to confirm</label>
            <input id="deleteWord" type="text" value={deleteWord} onChange={(e) => setDeleteWord(e.target.value)} autoComplete="off" autoCapitalize="characters" />
            {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
            <div className="form-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => { setShowDelete(false); setDeletePw(''); setDeleteWord(''); setDeleteError('') }} disabled={deleting}>Cancel</button>
              <button type="submit" className="btn btn-outline" style={{ flex: 1, color: '#ff6666', borderColor: '#ff6666' }} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete my account'}</button>
            </div>
          </form>
        )}
      </div>

      {resetMessage && <p className="form-success" role="status" style={{ marginTop: '1rem' }}>{resetMessage}</p>}
      {resetError && <p className="form-error" role="alert" style={{ marginTop: '1rem' }}>{resetError}</p>}

      <div className="form-row" style={{ marginTop: '1.5rem' }}>
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={signOut}>Sign out</button>
        {!isFounder && (profile?.is_hope_ambassador || isAdmin || (profile?.skills?.length > 0)) && (
          <button className="btn btn-outline" style={{ flex: 1, borderColor: '#666', color: '#999' }} onClick={handleResetToBase} disabled={resetting}>
            {resetting ? 'Resetting...' : 'Reset to Neighbor'}
          </button>
        )}
      </div>
    </div>
  )
}
