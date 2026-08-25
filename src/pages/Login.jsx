import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const SKILL_OPTIONS = [
  'Mold Cleanup', 'Drywall Repair', 'Plumbing', 'Electrical',
  'Tree Removal', 'Roof Tarps', 'Mucking Out', 'Childcare',
  'Pet Care', 'Translation', 'Transport', 'Meal Prep',
  'Tech Help', 'Paperwork Help', 'Heavy Lifting', 'Yard Work',
]

export default function Login() {
  const [mode, setMode] = useState('signin')
  const [step, setStep] = useState(1)

  // Step 1 fields
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [wantAmbassador, setWantAmbassador] = useState(false)

  // Step 2 fields (Hope Ambassador)
  const [selectedSkills, setSelectedSkills] = useState([])
  const [availability, setAvailability] = useState('')
  const [interests, setInterests] = useState('')

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  const totalSteps = wantAmbassador ? 2 : 1

  function passwordStrength(pw) {
    if (!pw) return { label: '', cls: '' }
    let score = 0
    if (pw.length >= 6) score++
    if (pw.length >= 10) score++
    if (/[A-Z]/.test(pw)) score++
    if (/[0-9]/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++

    if (score <= 2) return { label: 'Weak', cls: 'strength-weak' }
    if (score <= 3) return { label: 'Fair', cls: 'strength-fair' }
    return { label: 'Strong', cls: 'strength-strong' }
  }

  function toggleSkill(skill) {
    setSelectedSkills((prev) =>
      prev.includes(skill)
        ? prev.filter((s) => s !== skill)
        : [...prev, skill]
    )
  }

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { error } = await signIn(email, password)
    if (error) {
      setError(error.message)
    } else {
      navigate('/')
    }
    setSubmitting(false)
  }

  function handleNext(e) {
    e.preventDefault()
    setError('')

    if (!displayName.trim()) {
      setError('Please enter your name.')
      return
    }
    if (!email.trim()) {
      setError('Please enter your email.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (wantAmbassador) {
      setStep(2)
    } else {
      handleSignUp()
    }
  }

  async function handleSignUp() {
    setError('')
    setSubmitting(true)

    const { error } = await signUp(
      email,
      password,
      displayName.trim(),
      wantAmbassador
    )

    if (error) {
      setError(error.message)
      setSubmitting(false)
      return
    }

    // Store ambassador data locally until first login
    if (wantAmbassador) {
      localStorage.setItem('vwb_ambassador_pending', JSON.stringify({
        skills: selectedSkills,
        availability,
        interests,
      }))
    }

    setMessage('Check your email to confirm your account, then sign in.')
    setMode('signin')
    setStep(1)
    setSubmitting(false)
  }

  async function handleStep2Submit(e) {
    e.preventDefault()
    if (selectedSkills.length === 0) {
      setError('Please select at least one skill.')
      return
    }
    handleSignUp()
  }

  const strength = passwordStrength(password)

  // ---- Sign In ----
  if (mode === 'signin') {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1>Village Without Borders</h1>
            <p className="login-subtitle">Neighbors helping neighbors</p>
          </div>

          <form onSubmit={handleSignIn} className="login-form">
            <h2>Sign in</h2>

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
                autoComplete="current-password"
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
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>

            <p className="login-toggle">
              Don't have an account?{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setMode('signup')
                  setError('')
                  setMessage('')
                }}
              >
                Sign up
              </button>
            </p>
          </form>
        </div>
      </div>
    )
  }

  // ---- Sign Up Step 1 ----
  if (step === 1) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1>Village Without Borders</h1>
            <p className="login-subtitle">Neighbors helping neighbors</p>
          </div>

          <form onSubmit={handleNext} className="login-form">
            <div className="step-indicator">
              <span className="step-text">Step 1 of {totalSteps}</span>
              <div className="step-bar">
                <div
                  className="step-fill"
                  style={{ width: `${(1 / totalSteps) * 100}%` }}
                />
              </div>
            </div>

            <h2>Create your account</h2>

            <div className="form-field">
              <label htmlFor="displayName">Your name or nickname</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="What should we call you?"
                autoComplete="name"
              />
            </div>

            <div className="form-field">
              <label htmlFor="signupEmail">Email</label>
              <input
                id="signupEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="signupPassword">Password</label>
              <input
                id="signupPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                minLength={6}
                required
              />
              {password && (
                <div className="password-strength">
                  <div className={`strength-bar ${strength.cls}`} />
                  <span className="strength-label">{strength.label}</span>
                </div>
              )}
            </div>

            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={wantAmbassador}
                onChange={(e) => setWantAmbassador(e.target.checked)}
              />
              <span>I want to sign up as a Hope Ambassador</span>
            </label>

            {error && <p className="form-error" role="alert">{error}</p>}

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={submitting}
            >
              {wantAmbassador ? 'Next' : submitting ? 'Creating account...' : 'Create account'}
            </button>

            <p className="login-toggle">
              Already have an account?{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setMode('signin')
                  setStep(1)
                  setError('')
                }}
              >
                Sign in
              </button>
            </p>
          </form>
        </div>
      </div>
    )
  }

  // ---- Sign Up Step 2: Hope Ambassador ----
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Village Without Borders</h1>
          <p className="login-subtitle">Become a Hope Ambassador</p>
        </div>

        <form onSubmit={handleStep2Submit} className="login-form">
          <div className="step-indicator">
            <span className="step-text">Step 2 of 2</span>
            <div className="step-bar">
              <div className="step-fill" style={{ width: '100%' }} />
            </div>
          </div>

          <h2>Tell us about your skills</h2>

          <div className="form-field">
            <label>What can you help with?</label>
            <div className="skill-grid">
              {SKILL_OPTIONS.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  className={`skill-chip ${selectedSkills.includes(skill) ? 'active' : ''}`}
                  onClick={() => toggleSkill(skill)}
                >
                  {skill}
                </button>
              ))}
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="availability">When are you generally available?</label>
            <input
              id="availability"
              type="text"
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
              placeholder="e.g., Weekday mornings, weekends"
            />
          </div>

          <div className="form-field">
            <label htmlFor="interests">Anything else you'd like us to know?</label>
            <textarea
              id="interests"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="Your interests, experience, or why you want to help"
              rows={3}
            />
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="form-row">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ flex: 1 }}
            >
              {submitting ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
