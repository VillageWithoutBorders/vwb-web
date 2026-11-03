import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useT } from '../utils/lang'

export default function ResetPassword() {
  const t = useT()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [ready, setReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    // Also check if already in recovery session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) { console.error('Failed to check for a recovery session:', error); return }
      if (session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setSubmitting(false)
      return
    }
    setMessage('Password updated! Redirecting...')
    setTimeout(() => navigate('/'), 2000)
  }

  if (!ready) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1>Village Without Borders</h1>
            <p className="login-subtitle">{t('Reset your password')}</p>
          </div>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 1rem' }}>
            {t('Loading... If this takes more than a few seconds, try clicking the reset link in your email again.')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Village Without Borders</h1>
          <p className="login-subtitle">{t('Set a new password')}</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label htmlFor="newPassword">{t('New password')}</label>
            <div className="password-input-wrap">
              <input id="newPassword" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('At least 6 characters')} minLength={6} required />
              <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={t(showPassword ? 'Hide password' : 'Show password')}>
                {t(showPassword ? 'Hide' : 'Show')}
              </button>
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="confirmPassword">{t('Confirm new password')}</label>
            <input id="confirmPassword" type={showPassword ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('Type it again')} required />
          </div>
          {error && <p className="form-error" role="alert">{t(error)}</p>}
          {message && <p className="form-success" role="status">{t(message)}</p>}
          <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
            {t(submitting ? 'Updating...' : 'Update password')}
          </button>
        </form>
      </div>
    </div>
  )
}