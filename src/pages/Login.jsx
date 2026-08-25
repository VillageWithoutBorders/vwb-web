import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setSubmitting(true)

    if (isSignUp) {
      if (!displayName.trim()) {
        setError('Please enter a display name.')
        setSubmitting(false)
        return
      }

      const { error } = await signUp(email, password, displayName.trim())

      if (error) {
        setError(error.message)
      } else {
        setMessage('Check your email to confirm your account, then sign in.')
        setIsSignUp(false)
      }
    } else {
      const { error } = await signIn(email, password)

      if (error) {
        setError(error.message)
      } else {
        navigate('/')
      }
    }

    setSubmitting(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Village Without Borders</h1>
          <p className="login-subtitle">Neighbors helping neighbors</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <h2>{isSignUp ? 'Create account' : 'Sign in'}</h2>

          {isSignUp && (
            <div className="form-field">
              <label htmlFor="displayName">What should we call you?</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your first name or nickname"
                autoComplete="name"
              />
            </div>
          )}

          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={6}
              required
            />
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={submitting}
          >
            {submitting
              ? 'Working...'
              : isSignUp
                ? 'Create account'
                : 'Sign in'}
          </button>

          <p className="login-toggle">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError('')
                setMessage('')
              }}
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
