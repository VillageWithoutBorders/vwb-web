import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { resetAccountToBase } from '../utils/resetAccount'
import { fetchMyDevices, removeMyDevice, getDeviceId } from '../lib/e2ee'
import RecoveryKeySection from '../components/RecoveryKeySection'
import DevicesSheet from '../components/DevicesSheet'
import AppearancePicker from '../components/AppearancePicker'
import WidthPicker from '../components/WidthPicker'
import ReadButtonPicker from '../components/ReadButtonPicker'
import VillageChatsSwitch from '../components/VillageChatsSwitch'
import { useSimpleView } from '../utils/simpleView'
import SimpleViewPicker from '../components/SimpleViewPicker'
import TextSizePicker from '../components/TextSizePicker'
import MotionPicker from '../components/MotionPicker'
import LanguagePicker from '../components/LanguagePicker'
import { useT, getLang } from '../utils/lang'
import AreaPicker from '../components/AreaPicker'
import { placesEnabled } from '../utils/places'
import Icon from '../components/Icon'
import { askConfirm, tell } from '../components/AdminDialog'

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
  if (userMessage) tell(userMessage, { tone: 'error' })
  return true
}

export default function Settings() {
  const t = useT()
  const simpleOn = useSimpleView()
  const { user, profile, isAdmin, isFounder, signOut, signOutEverywhere, refreshProfile, refreshMfa } = useAuth()
  // Round C (Nov 10): after Full setup is done, the button says Change, not Set up.
  const setupDone = !!profile?.setup_done_at
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
  // Nov 8 (Jade): Your devices opens as a pop-up.
  const [showDevices, setShowDevices] = useState(false)
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

  // Two tabs (Oct 27, Jade): "Easy to use" (Simple view, text size, light or dark,
  // the app tour) and "Account and privacy" (everything else). /settings?tab=account
  // opens the second one, and so do the #two-step and #recovery links.
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(() => {
    const h = window.location.hash
    return params.get('tab') === 'account' || h === '#two-step' || h === '#recovery' ? 'account' : 'easy'
  })
  function pickTab(key) {
    setTab(key)
    setParams(key === 'account' ? { tab: 'account' } : {}, { replace: true })
  }
  const tabStyle = (on) => ({
    minHeight: '48px', padding: '0.5rem 0.75rem', borderRadius: '12px', lineHeight: 1.25, border: 'none', cursor: 'pointer',
    fontSize: '1rem', fontWeight: 700, background: on ? 'var(--accent)' : 'var(--surface-2)', color: on ? 'var(--on-accent)' : 'var(--text-soft)',
  })

  // The Admin page links here (/settings#two-step) when two-step login is off.
  useEffect(() => {
    if (window.location.hash !== '#two-step') return
    const timer = setTimeout(() => document.getElementById('two-step')?.scrollIntoView({ block: 'start' }), 300)
    return () => clearTimeout(timer)
  }, [])

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
          return { ...b, name: p?.display_name || t('Unknown') }
        }))
        setBlockedUsers(names)
      } else {
        setBlockedUsers([])
      }
    }
    if (user?.id) { loadPrivacyPrefs(); loadBlockedUsers() }
  }, [user?.id])

  async function handleEmailChange() {
    if (!newEmail.trim() || !newEmail.includes('@')) { setEmailError(t('Enter a valid email address.')); return }
    setEmailSaving(true); setEmailError(''); setEmailMessage('')
    const { error: updateError } = await supabase.auth.updateUser({ email: newEmail.trim() })
    reportError('handleEmailChange', updateError)
    if (updateError) { setEmailError(updateError.message); setEmailSaving(false); return }
    setEmailMessage(t('Check your old and new email for confirmation links. Your login email updates once you confirm.'))
    setEmailSaving(false)
    setShowEmailChange(false)
    setNewEmail('')
  }

  // Steps this account back down to a plain Neighbor: clears Ambassador
  // status and details plus any admin coverage-area info. Also doubles as
  // Jade's own quick way to reset an account she's testing with. Founder
  // accounts are never affected (resetAccountToBase guards this too).
  async function handleResetToBase() {
    if (!(await askConfirm(t('Reset your account back to a plain Neighbor? This clears your Ambassador status, skills, availability, and any admin coverage area.')))) return
    setResetting(true); setResetErrorMsg(''); setResetMessage('')
    const { error: resetErr } = await resetAccountToBase(user.id, { currentRole: profile?.role })
    reportError('handleResetToBase', resetErr)
    if (resetErr) { setResetErrorMsg(t('Could not reset your account. Try again.')); setResetting(false); return }
    await refreshProfile()
    setResetMessage(t('Your account has been reset to Neighbor status.'))
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
    if (!ok) { setReadReceipts(!v); tell(t('Could not save this setting. Try again.'), { tone: 'error' }) }
  }

  async function toggleSafetyCheckins() {
    const v = !safetyCheckins
    setSafetyCheckins(v)
    const ok = await savePrivacyPref('safety_checkins_enabled', v)
    if (!ok) { setSafetyCheckins(!v); tell(t('Could not save this setting. Try again.'), { tone: 'error' }) }
  }

  async function unblockUser(blockId) {
    const { error } = await supabase.from('blocks').delete().eq('id', blockId)
    if (error) { console.error('[Settings:unblockUser]', error); tell(t('Could not unblock this user. Try again.'), { tone: 'error' }); return }
    setBlockedUsers((prev) => prev.filter((b) => b.id !== blockId))
  }

  async function removeDevice(d) {
    if (!(await askConfirm(t('Remove {name}? New private messages will stop being sent to it. Messages already on it stay readable there.', { name: d.label || t('this device') })))) return
    setRemovingDevice(d.deviceId); setDeviceNote('')
    const ok = await removeMyDevice(user.id, d.deviceId)
    setRemovingDevice(null)
    if (!ok) { setDeviceNote(t("We couldn't remove that device. Try again.")); return }
    setDevices((prev) => prev.filter((x) => x.deviceId !== d.deviceId))
    setDeviceNote(t('Removed.'))
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
      setTwoStepError(t("We couldn't start two-step login. Try again in a moment."))
      return
    }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    setTwoStepCode('')
  }

  async function confirmTwoStep(e) {
    e.preventDefault()
    setTwoStepError('')
    const clean = twoStepCode.replace(/\s/g, '')
    if (!/^\d{6}$/.test(clean)) { setTwoStepError(t('Enter the 6-digit code from your authenticator app.')); return }
    setTwoStepBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: clean })
    if (error) {
      setTwoStepBusy(false)
      console.error('[Settings:verifyTwoStep]', error)
      setTwoStepError(t('That code did not work. Try the newest one.'))
      return
    }
    const { data } = await supabase.auth.mfa.listFactors()
    setTwoStep(data?.totp?.[0] || null)
    setEnroll(null); setTwoStepCode(''); setTwoStepBusy(false)
    setTwoStepMessage(t('Two-step login is on. You will enter a code each time you sign in.'))
    await refreshMfa()
  }

  async function cancelTwoStep() {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.id })
    setEnroll(null); setTwoStepCode(''); setTwoStepError('')
  }

  async function turnOffTwoStep() {
    if (!(await askConfirm(t('Turn off two-step login? Your account will be protected by your password alone.')))) return
    setTwoStepError(''); setTwoStepMessage(''); setTwoStepBusy(true)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: twoStep.id })
    setTwoStepBusy(false)
    if (error) {
      console.error('[Settings:unenroll]', error)
      setTwoStepError(t("We couldn't turn it off. Sign out, sign in with your code, and try again."))
      return
    }
    setTwoStep(null)
    setTwoStepMessage(t('Two-step login is off.'))
  }

  // Shows the database's own short message when it is plain, otherwise a general one.
  function plainError(err, fallback) {
    if (err?.code === 'PGRST202') return t('This needs a quick database update first (vwb-security.sql).')
    return err?.message && err.message.length < 160 ? err.message : fallback
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPwError(''); setPwMessage('')
    if (!currentPw) { setPwError(t('Enter your current password.')); return }
    if (newPw.length < 8) { setPwError(t('Your new password needs at least 8 characters.')); return }
    if (newPw !== confirmPw) { setPwError(t('The new passwords do not match.')); return }
    if (newPw === currentPw) { setPwError(t('Choose a password different from your current one.')); return }
    setPwSaving(true)
    const { data: ok, error: checkErr } = await supabase.rpc('verify_my_password', { p_password: currentPw })
    if (checkErr) { setPwSaving(false); console.error('[Settings:verifyPassword]', checkErr); setPwError(plainError(checkErr, t("We couldn't check your password. Try again."))); return }
    if (!ok) { setPwSaving(false); setPwError(t('That is not your current password.')); return }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) { setPwSaving(false); console.error('[Settings:changePassword]', error); setPwError(plainError(error, t("We couldn't change your password. Try again."))); return }
    // Every other device has to sign in again with the new password.
    const { error: othersErr } = await supabase.auth.signOut({ scope: 'others' })
    if (othersErr) console.error('[Settings:signOutOthers]', othersErr)
    setPwSaving(false)
    setCurrentPw(''); setNewPw(''); setConfirmPw(''); setShowPasswordForm(false)
    setPwMessage(t('Password changed. Your other devices were signed out.'))
  }

  async function handleDeleteAccount(e) {
    e.preventDefault()
    setDeleteError('')
    if (!deletePw) { setDeleteError(t('Enter your password.')); return }
    if (deleteWord !== 'DELETE') { setDeleteError(t('Type DELETE in capital letters to confirm.')); return }
    setDeleting(true)
    const { data: ok, error: checkErr } = await supabase.rpc('verify_my_password', { p_password: deletePw })
    if (checkErr) { setDeleting(false); console.error('[Settings:verifyPassword]', checkErr); setDeleteError(plainError(checkErr, t("We couldn't check your password. Try again."))); return }
    if (!ok) { setDeleting(false); setDeleteError(t('That is not your password.')); return }
    const { error } = await supabase.rpc('delete_my_account', { p_confirm: deleteWord })
    if (error) { setDeleting(false); console.error('[Settings:deleteAccount]', error); setDeleteError(plainError(error, t("We couldn't delete your account. Nothing was changed."))); return }
    await signOut()
    navigate('/welcome', { replace: true })
  }

  async function handleSignOutEverywhere() {
    if (!(await askConfirm(t('Sign out of every device, including this one? You will need to sign in again on each of them.')))) return
    setSigningOutAll(true); setSignOutAllError('')
    const ok = await signOutEverywhere()
    setSigningOutAll(false)
    if (!ok) setSignOutAllError(t("We couldn't sign you out everywhere. Check your connection and try again."))
  }

  function shortDate(iso) {
    return iso ? new Date(iso).toLocaleDateString(getLang() === 'es' ? 'es' : undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null
  }

  return (
    <div className="profile-page settings-page">
      {/* Nov 7 (Jade): the frame's Back button and the same title as every other page. */}
      <h1 className="settings-title">{t('Settings')}</h1>

      <div role="tablist" aria-label={t('Settings')} className="hub-tabs" style={{ marginTop: 0, marginBottom: '1rem' }}>
        <button type="button" role="tab" id="settings-tab-easy" aria-selected={tab === 'easy'} aria-controls="settings-panel" style={tabStyle(tab === 'easy')} onClick={() => pickTab('easy')}>
          {t('Easy to use')}
        </button>
        <button type="button" role="tab" id="settings-tab-account" aria-selected={tab === 'account'} aria-controls="settings-panel" style={tabStyle(tab === 'account')} onClick={() => pickTab('account')}>
          {t('Account and privacy')}
        </button>
      </div>

      <div role="tabpanel" id="settings-panel" className={tab === 'account' ? 'settings-account' : undefined} aria-labelledby={'settings-tab-' + tab}>
      {tab === 'easy' && (
        <>
          <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t('Changes save right away and follow you to any phone.')}</p>

          {/* Nov 8 (Jade): three columns on a computer so it all fits on one screen:
              Seeing (with Language first), Using, and Learning the app.
              Language stays first, so someone who can't read English finds it fast (Nov 3). */}
          <div className="settings-cols">
          <div className="settings-col">
          <LanguagePicker />

          <h2 className="settings-group-h">{t('Seeing')}</h2>
          <TextSizePicker />
          <AppearancePicker />
          </div>

          <div className="settings-col">
          <h2 className="settings-group-h">{t('Using')}</h2>
          <SimpleViewPicker />
          {simpleOn && <WidthPicker />}
          {!simpleOn && <ReadButtonPicker />}
          <MotionPicker />
          </div>

          <div className="settings-col">
          <h2 className="settings-group-h">{t('Your avatar and cottage')}</h2>
          {/* Round C (Nov 10): the tour lives on My Corner now. Full setup stays here: a way back
              for Quick start people who said Not now, and a way to change things after. */}
          <button type="button" className="btn btn-outline btn-full" onClick={() => navigate('/setup')} style={{ minHeight: '48px' }}>
            <span aria-hidden="true"><Icon name="cottage" /></span> {t(setupDone ? 'Change my avatar and cottage' : 'Set up your avatar and cottage')}
          </button>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t(setupDone ? 'Make your avatar, pick your skills, and name your cottage.' : 'Make your avatar, pick your skills, and name your cottage. About 10 minutes. Finishing it turns on the full app.')}</p>
          </div>
          </div>
        </>
      )}

      {tab === 'account' && (
      <>
      {/* Nov 8 (Jade): calm, same-shaped cards. On a computer: two rows of four.
          Signing in: Email, Password, Two-step login, Recovery key.
          Privacy: Privacy and safety, Blocked neighbors, Your devices, Delete my account. */}
      {placesEnabled && <AreaPicker />}
      {/* Round A4 (Nov 10): moved here from your profile. */}
      <VillageChatsSwitch />

      <div className="profile-details">
        <div className="detail-section-header">{t('Email')}</div>
        {!showEmailChange ? (
          <div className="detail-row">
            <span className="detail-value" style={{ textAlign: 'left', overflowWrap: 'anywhere' }}>{user?.email}</span>
            <button type="button" className="link-button" style={{ fontSize: '0.8125rem' }} onClick={() => { setShowEmailChange(true); setEmailError(''); setEmailMessage('') }}>
              {t('Change email')}
            </button>
          </div>
        ) : (
          <div className="form-field" style={{ padding: '0 1rem 0.75rem' }}>
            <label htmlFor="newEmail">{t('New email address')}</label>
            <input id="newEmail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="you@example.com" />
            {emailError && <p className="form-error" role="alert">{emailError}</p>}
            <div className="form-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => { setShowEmailChange(false); setNewEmail(''); setEmailError('') }} disabled={emailSaving}>{t('Cancel')}</button>
              <button type="button" className="btn btn-primary" onClick={handleEmailChange} disabled={emailSaving} style={{ flex: 1 }}>
                {emailSaving ? t('Sending...') : t('Send confirmation')}
              </button>
            </div>
          </div>
        )}
        {emailMessage && <p className="form-success" role="status">{emailMessage}</p>}
      </div>

      <div className="profile-details" style={{ marginTop: '1rem' }}>
        <div className="detail-section-header">{t('Password')}</div>
        {!showPasswordForm ? (
          <div className="detail-row">
            <span className="detail-value" style={{ textAlign: 'left' }}>{t("Use a password you don't use anywhere else.")}</span>
            <button type="button" className="link-button" style={{ fontSize: '0.8125rem' }} onClick={() => { setShowPasswordForm(true); setPwError(''); setPwMessage('') }}>
              {t('Change password')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleChangePassword} className="form-field" style={{ padding: '0 1rem 0.75rem' }} noValidate>
            <label htmlFor="currentPw">{t('Current password')}</label>
            <input id="currentPw" type={showPw ? 'text' : 'password'} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" />
            <label htmlFor="newPw" style={{ marginTop: '0.75rem' }}>{t('New password')}</label>
            <input id="newPw" type={showPw ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" aria-describedby="newPwStrength" />
            {newPw && (
              <div id="newPwStrength" style={{ marginTop: '0.4rem' }}>
                <div style={{ height: '6px', borderRadius: '3px', background: 'var(--surface-3)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: (passwordStrength(newPw).level + 1) * 25 + '%', background: ['var(--danger)', 'var(--warn)', 'var(--accent)', 'var(--accent)'][passwordStrength(newPw).level] }} />
                </div>
                <span className="field-hint">{t(passwordStrength(newPw).label)}</span>
              </div>
            )}
            <label htmlFor="confirmPw" style={{ marginTop: '0.75rem' }}>{t('Type the new password again')}</label>
            <input id="confirmPw" type={showPw ? 'text' : 'password'} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', minHeight: '44px' }}>
              <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> {t('Show passwords')}
            </label>
            <span className="field-hint">{t('When you change it, every other device is signed out.')}</span>
            {pwError && <p className="form-error" role="alert">{pwError}</p>}
            <div className="form-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => { setShowPasswordForm(false); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwError('') }} disabled={pwSaving}>{t('Cancel')}</button>
              <button type="submit" className="btn btn-primary" disabled={pwSaving} style={{ flex: 1 }}>{pwSaving ? t('Saving...') : t('Change password')}</button>
            </div>
          </form>
        )}
        {pwMessage && <p className="form-success" role="status" style={{ padding: '0 1rem 0.75rem' }}>{pwMessage}</p>}
      </div>

      <div className="profile-details" id="two-step" style={{ marginTop: '1rem', scrollMarginTop: 'calc(var(--header-height) + 1rem)' }}>
        <div className="detail-section-header">{t('Two-Step Login')}</div>
        {twoStepLoaded && !enroll && !twoStep && (
          <div className="detail-row">
            <span className="detail-value" style={{ textAlign: 'left' }}>{t('Add a code from an authenticator app to sign in. Strongly recommended for admins.')}</span>
            <button type="button" className="link-button" style={{ fontSize: '0.8125rem' }} onClick={startTwoStep} disabled={twoStepBusy}>
              {twoStepBusy ? t('Starting...') : t('Turn on')}
            </button>
          </div>
        )}
        {twoStepLoaded && !enroll && twoStep && (
          <div className="detail-row">
            <span className="detail-value" style={{ textAlign: 'left' }}>{t('On. You enter a 6-digit code each time you sign in.')}</span>
            <button type="button" className="link-button" style={{ fontSize: '0.8125rem', color: 'var(--danger)' }} onClick={turnOffTwoStep} disabled={twoStepBusy}>
              {t('Turn off')}
            </button>
          </div>
        )}
        {enroll && (
          <form onSubmit={confirmTwoStep} className="form-field" style={{ padding: '0 1rem 0.75rem' }} noValidate>
            <p className="field-hint">{t('1. Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, or your password manager) and scan this picture.')}</p>
            <img src={enroll.qr} alt={t('QR code to scan with your authenticator app')} width={180} height={180} style={{ background: '#fff', padding: '8px', borderRadius: '8px', display: 'block', margin: '0.5rem 0', maxWidth: '100%', height: 'auto' }} />
            <p className="field-hint">{t("Can't scan it? Type this key into the app instead:")}</p>
            <code style={{ display: 'block', wordBreak: 'break-all', padding: '0.5rem', background: 'var(--surface)', borderRadius: '6px', fontSize: '0.85rem' }}>{enroll.secret}</code>
            <p className="field-hint" style={{ marginTop: '0.75rem' }}>{t('2. Enter the 6-digit code the app shows.')}</p>
            <label htmlFor="twoStepCode" className="sr-only">{t('6-digit code')}</label>
            <input id="twoStepCode" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={twoStepCode} onChange={(e) => setTwoStepCode(e.target.value)} />
            <p className="field-hint">{t('Keep your phone safe. If you lose it, an admin can reset this for you after you email info@villagewithoutborders.org.')}</p>
            <div className="form-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={cancelTwoStep} disabled={twoStepBusy}>{t('Cancel')}</button>
              <button type="submit" className="btn btn-primary" disabled={twoStepBusy} style={{ flex: 1 }}>{twoStepBusy ? t('Checking...') : t('Turn on')}</button>
            </div>
          </form>
        )}
        {twoStepError && <p className="form-error" role="alert" style={{ padding: '0 1rem 0.75rem' }}>{twoStepError}</p>}
        {twoStepMessage && <p className="form-success" role="status" style={{ padding: '0 1rem 0.75rem' }}>{twoStepMessage}</p>}
      </div>

      <RecoveryKeySection />

      <div className="profile-details" style={{ marginTop: '1rem' }}>
        <div className="detail-section-header">{t('Privacy and Safety')}</div>
        <div className="privacy-toggle-row">
          <div>
            <span className="privacy-toggle-label">{t('Read receipts')}</span>
            <p className="privacy-toggle-desc">{t("Show when you have read a message. If you turn this off, you won't see when others read yours either.")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={readReceipts}
            aria-label={t('Read receipts')}
            className={`toggle-switch${readReceipts ? ' on' : ''}`}
            onClick={toggleReadReceipts}
          >
            <span className="toggle-switch-knob" />
          </button>
        </div>
        <div className="privacy-toggle-row">
          <div>
            <span className="privacy-toggle-label">{t('Safety check-ins')}</span>
            <p className="privacy-toggle-desc">{t('Receive periodic check-in prompts during active help sessions')}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={safetyCheckins}
            aria-label={t('Safety check-ins')}
            className={`toggle-switch${safetyCheckins ? ' on' : ''}`}
            onClick={toggleSafetyCheckins}
          >
            <span className="toggle-switch-knob" />
          </button>
        </div>
        <div className="detail-row">
          <button type="button" className="link-button" style={{ fontSize: '0.8125rem' }} onClick={() => navigate('/messages')}>
            {t('More message settings')}
          </button>
        </div>
      </div>

      <div className="profile-details" style={{ marginTop: '0.75rem' }}>
        <div className="detail-section-header">{t('Blocked Neighbors')}</div>
        {blockedUsers.length === 0 ? (
          <div className="detail-row">
            <span className="detail-value" style={{ textAlign: 'left' }}>{t("You haven't blocked anyone")}</span>
          </div>
        ) : (
          blockedUsers.map((b) => (
            <div key={b.id} className="blocked-user-row">
              <span className="privacy-toggle-label">{b.name}</span>
              <button type="button" className="link-button" style={{ fontSize: '0.8125rem' }} onClick={() => unblockUser(b.id)}>
                {t('Unblock')}
              </button>
            </div>
          ))
        )}
      </div>
      <div className="profile-details" style={{ marginTop: '0.75rem' }}>
        <div className="detail-section-header">{t('Your Devices')}</div>
        <div className="detail-row">
          <span className="detail-value" style={{ textAlign: 'left' }}>
            {!devicesLoaded ? t('Loading...') : devices.length === 1 ? t('1 phone or computer can read your private messages.') : t('{n} phones and computers can read your private messages.', { n: devices.length })}
          </span>
          <button type="button" className="link-button" style={{ fontSize: '0.8125rem' }} onClick={() => setShowDevices(true)}>
            {t('See my devices')}
          </button>
        </div>
        {deviceNote && <p className="form-success" role="status" style={{ padding: '0 1rem 0.75rem' }}>{deviceNote}</p>}
      </div>
      {/* Nov 8 (Jade): the full list opens in a pop-up, so the page stays calm. */}
      {showDevices && (
        <DevicesSheet onClose={() => setShowDevices(false)}>
          <p className="privacy-toggle-desc" style={{ margin: '0 0 0.5rem' }}>
            {t("Private messages are locked separately for each device. Open VWB once on each device you use so it can read new messages. A new device can't read messages sent before it was added.")}
          </p>
          <div className="profile-details" style={{ margin: 0 }}>
        {devicesLoaded && devices.length === 0 && (
            <div className="detail-row">
              <span className="detail-value" style={{ textAlign: 'left' }}>{t('No devices found yet')}</span>
            </div>
          )}
          {(() => {
            const sorted = [...devices].sort((a, b) => (b.deviceId === thisDeviceId) - (a.deviceId === thisDeviceId) || new Date(b.lastSeen || b.addedAt || 0) - new Date(a.lastSeen || a.addedAt || 0))
            return sorted
          })().map((d) => {
            const mine = d.deviceId === thisDeviceId
            const stale = d.lastSeen && Date.now() - new Date(d.lastSeen).getTime() > 60 * 24 * 3600 * 1000
            return (
              <div key={d.deviceId} className="blocked-user-row">
                <div>
                  <span className="privacy-toggle-label">{d.label || t('Device (name not saved yet)')}{mine ? ' (' + t('this device') + ')' : ''}</span>
                  <p className="privacy-toggle-desc">
                    {t('Added {date}', { date: shortDate(d.addedAt) })}
                    {d.lastSeen ? ' \u00b7 ' + t('Last used {date}', { date: shortDate(d.lastSeen) }) : ''}
                    {stale ? ' \u00b7 ' + t('Not used in a while') : ''}
                  </p>
                </div>
                {!mine && (
                  <button type="button" className="link-button" style={{ fontSize: '0.8125rem' }} onClick={() => removeDevice(d)} disabled={removingDevice === d.deviceId}>
                    {removingDevice === d.deviceId ? t('Removing...') : t('Remove')}
                  </button>
                )}
              </div>
            )
          })}
          </div>
          {deviceNote && <p className="form-success" role="status">{deviceNote}</p>}
        <div style={{ padding: '0.75rem 0 0' }}>
          <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleSignOutEverywhere} disabled={signingOutAll}>
            {signingOutAll ? t('Signing out...') : t('Sign out of all devices')}
          </button>
          <p className="privacy-toggle-desc" style={{ marginTop: '0.5rem' }}>
            {t('Use this if you lost a device or think someone else got into your account. Other devices are signed out within about an hour. Your private message history stays on each device.')}
          </p>
          {signOutAllError && <p className="form-error" role="alert">{signOutAllError}</p>}
        </div>
        </DevicesSheet>
      )}

      <div className="profile-details" style={{ marginTop: '0.75rem' }}>
        {/* Nov 8 (Jade): Sign out lives here too, with leaving, so it's one calm card. */}
        <div className="detail-section-header">{t('Sign out or leave')}</div>
        {!showDelete ? (
          <div className="detail-row">
            <span className="detail-value" style={{ textAlign: 'left' }}>{t('Sign out on this device, or leave Village Without Borders for good.')}</span>
            <button type="button" className="link-button settings-signout" style={{ fontSize: '0.8125rem' }} onClick={signOut}>{t('Sign out')}</button>
            {!isFounder && (profile?.is_hope_ambassador || isAdmin || (profile?.skills?.length > 0)) && (
              <button type="button" className="link-button settings-reset" style={{ fontSize: '0.8125rem' }} onClick={handleResetToBase} disabled={resetting}>
                {resetting ? t('Resetting...') : t('Reset to Neighbor')}
              </button>
            )}
            <button type="button" className="link-button" style={{ fontSize: '0.8125rem', color: 'var(--danger)' }} onClick={() => { setShowDelete(true); setDeleteError('') }}>
              {t('Delete account')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleDeleteAccount} className="form-field" style={{ padding: '0 1rem 0.75rem' }} noValidate>
            <p className="field-hint" style={{ marginBottom: '0.5rem' }}>
              {t('This removes your account and cannot be undone. Your profile, messages, and sign-ups go with it. If you lead a group that has other members, hand leadership to someone first.')}
            </p>
            <label htmlFor="deletePw">{t('Your password')}</label>
            <input id="deletePw" type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} autoComplete="current-password" />
            <label htmlFor="deleteWord" style={{ marginTop: '0.75rem' }}>{t('Type DELETE to confirm')}</label>
            <input id="deleteWord" type="text" value={deleteWord} onChange={(e) => setDeleteWord(e.target.value)} autoComplete="off" autoCapitalize="characters" />
            {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
            <div className="form-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => { setShowDelete(false); setDeletePw(''); setDeleteWord(''); setDeleteError('') }} disabled={deleting}>{t('Cancel')}</button>
              <button type="submit" className="btn btn-outline" style={{ flex: 1, color: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={deleting}>{deleting ? t('Deleting...') : t('Delete my account')}</button>
            </div>
          </form>
        )}
      </div>

      {resetMessage && <p className="form-success" role="status" style={{ marginTop: '1rem' }}>{resetMessage}</p>}
      {resetError && <p className="form-error" role="alert" style={{ marginTop: '1rem' }}>{resetError}</p>}

      </>
      )}
      </div>
    </div>
  )
}
