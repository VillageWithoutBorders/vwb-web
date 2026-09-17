import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { resetAccountToBase } from '../utils/resetAccount'

function reportError(context, error, userMessage) {
  if (!error) return false
  console.error(`[Settings:${context}]`, error)
  if (userMessage) alert(userMessage)
  return true
}

export default function Settings() {
  const { user, profile, isAdmin, isFounder, signOut, refreshProfile } = useAuth()
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

  return (
    <div className="profile-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={() => navigate('/profile')} aria-label="Back to Profile" style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer' }}>&#8592;</button>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#4ecca3' }}>Settings &amp; Privacy</h1>
      </div>

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
        <div className="detail-section-header">Privacy &amp; Safety</div>
        <div className="privacy-toggle-row">
          <div>
            <span className="privacy-toggle-label">Read receipts</span>
            <p className="privacy-toggle-desc">Let others see when you have read their messages</p>
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
