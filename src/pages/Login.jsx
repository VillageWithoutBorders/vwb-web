import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import AvailabilityPicker from '../components/AvailabilityPicker'

export default function Login() {
  const [searchParams] = useSearchParams()
  // /welcome links here with ?mode=signup so "Get Started" drops people
  // straight into account creation instead of the sign-in form.
  const [mode, setMode] = useState(searchParams.get('mode') === 'signup' ? 'signup' : 'signin')
  const [step, setStep] = useState(1)

  const [skillOptions, setSkillOptions] = useState([])
  const [villages, setVillages] = useState([])
  const [villageId, setVillageId] = useState('')

  useEffect(() => {
    async function loadSkills() {
      const { data, error } = await supabase
        .from('skill_categories')
        .select('title')
        .order('id')
      if (error) { console.error('Failed to load skill categories:', error); return }
      if (data) setSkillOptions(data.map((s) => s.title))
    }
    loadSkills()
  }, [])

  // Only asked about explicitly when there's an actual choice to make. With
  // one active village, everyone just lands there, no need to make someone
  // pick from a list of one.
  useEffect(() => {
    async function loadVillages() {
      const { data, error } = await supabase
        .from('villages')
        .select('id, name, region_label, is_default')
        .eq('active', true)
        .order('name')
      if (error) { console.error('Failed to load villages:', error); return }
      if (data) {
        setVillages(data)
        const def = data.find((c) => c.is_default) || data[0]
        if (def) setVillageId(def.id)
      }
    }
    loadVillages()
  }, [])

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Defaults to true: joining as a Hope Ambassador is the path most neighbors
  // take, so signup treats it as the expected next step rather than an extra
  // people have to actively opt into.
  const [wantAmbassador, setWantAmbassador] = useState(true)

  const [selectedSkills, setSelectedSkills] = useState([])
  const [availability, setAvailability] = useState('')
  const [interests, setInterests] = useState('')
  const [howKnown, setHowKnown] = useState('')
  const [radiusMiles, setRadiusMiles] = useState(10)
  // Opt-in, off by default, mirrors the field on the in-app ambassador
  // signup in Profile.jsx. See that file for the reasoning.
  const [campfireNotify, setCampfireNotify] = useState(false)

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [resetSent, setResetSent] = useState(false)

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
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    )
  }

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError(error.message)
      setShowForgot(true)
    } else {
      navigate('/')
    }
    setSubmitting(false)
  }

  async function handleForgotPassword() {
    if (!email.trim()) { setError('Enter your email first, then tap Forgot password.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    })
    if (error) { setError(error.message); return }
    setResetSent(true)
    setError('')
  }

  function handleNext(e) {
    e.preventDefault()
    setError('')
    if (!displayName.trim()) { setError('Please enter your name.'); return }
    if (!email.trim()) { setError('Please enter your email.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (wantAmbassador) { setStep(2) } else { handleSignUp() }
  }

  async function handleSignUp() {
    setError('')
    setSubmitting(true)
    if (villageId) localStorage.setItem('vwb_pending_village_id', villageId)
    const { error } = await signUp(email, password, displayName.trim(), wantAmbassador)
    if (error) { setError(error.message); setSubmitting(false); return }
    if (wantAmbassador) {
      localStorage.setItem('vwb_ambassador_pending', JSON.stringify({
        skills: selectedSkills, availability, interests, radius_miles: radiusMiles,
        how_known: howKnown.trim(),
        campfire_notifications_enabled: campfireNotify,
      }))
    }
    setMessage('Check your email to confirm your account, then sign in.')
    setMode('signin')
    setStep(1)
    setSubmitting(false)
  }

  async function handleStep2Submit(e) {
    e.preventDefault()
    if (selectedSkills.length === 0) { setError('Please select at least one skill.'); return }
    if (!howKnown.trim()) { setError('Please tell us how you know this community, or who can vouch for you.'); return }
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
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
            </div>
            <div className="form-field">
              <label htmlFor="password">Password</label>
              <div className="password-input-wrap"><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></div>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="form-success" role="status">{message}</p>}
            {resetSent && <p className="form-success" role="status">Password reset email sent. Check your inbox.</p>}
            {showForgot && !resetSent && (
              <button type="button" className="link-button" onClick={handleForgotPassword} style={{ fontSize: '0.875rem' }}>
                Forgot password?
              </button>
            )}
            <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
            <p className="login-toggle">
              Don't have an account?{' '}
              <button type="button" className="link-button" onClick={() => { setMode('signup'); setError(''); setMessage('') }}>
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
                <div className="step-fill" style={{ width: `${(1 / totalSteps) * 100}%` }} />
              </div>
            </div>
            <h2>Create your account</h2>
            <div className="form-field">
              <label htmlFor="displayName">Your name or nickname</label>
              <input id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="What should we call you?" autoComplete="name" />
            </div>
            <div className="form-field">
              <label htmlFor="signupEmail">Email</label>
              <input id="signupEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
            </div>
            <div className="form-field">
              <label htmlFor="signupPassword">Password</label>
              <div className="password-input-wrap">
                <input id="signupPassword" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" minLength={6} required />
                <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {password && (
                <div className="password-strength">
                  <div className={`strength-bar ${strength.cls}`} />
                  <span className="strength-label">{strength.label}</span>
                </div>
              )}
            </div>
            {villages.length > 1 && (
              <div className="form-field">
                <label htmlFor="villageSelect">Your village</label>
                <select id="villageSelect" value={villageId} onChange={(e) => setVillageId(e.target.value)}>
                  {villages.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.region_label ? ' — ' + c.region_label : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <label className="checkbox-field" style={{ background: 'var(--green-light)', borderRadius: '10px', padding: '0.75rem 1rem', alignItems: 'flex-start' }}>
              <input type="checkbox" checked={wantAmbassador} onChange={(e) => setWantAmbassador(e.target.checked)} />
              <span>
                <strong style={{ display: 'block', marginBottom: '0.15rem' }}>Apply to be a Hope Ambassador</strong>
                Share a few skills and hours you can spare. An admin looks over each application so this stays a community people can trust. Uncheck this if you'd rather just look around for now.
              </span>
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
              {wantAmbassador ? 'Next' : submitting ? 'Creating account...' : 'Create account'}
            </button>
            <p className="login-toggle">
              Already have an account?{' '}
              <button type="button" className="link-button" onClick={() => { setMode('signin'); setStep(1); setError('') }}>
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
          <p className="login-subtitle">Apply to be a Hope Ambassador</p>
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
              {skillOptions.map((skill) => (
                <button key={skill} type="button" className={`skill-chip ${selectedSkills.includes(skill) ? 'active' : ''}`} onClick={() => toggleSkill(skill)}>
                  {skill}
                </button>
              ))}
            </div>
          </div>
          <div className="form-field">
            <label>How far can you help? ({radiusMiles} miles)</label>
            <input type="range" min={1} max={50} value={radiusMiles} onChange={(e) => setRadiusMiles(Number(e.target.value))} className="radius-slider" />
            <div className="radius-labels">
              <span>1 mi</span>
              <span>25 mi</span>
              <span>50 mi</span>
            </div>
          </div>
          <div className="form-field">
            <label>When are you generally available?</label>
            <AvailabilityPicker value={availability} onChange={setAvailability} />
          </div>
          <div className="form-field">
            <label htmlFor="interests">Anything else you'd like us to know?</label>
            <textarea id="interests" value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="Your interests, experience, or why you want to help" rows={3} />
          </div>
          <div className="form-field">
            <label htmlFor="howKnown">How do you know this community, or who can vouch for you?</label>
            <textarea id="howKnown" value={howKnown} onChange={(e) => setHowKnown(e.target.value)} placeholder="A neighbor, a group, an event, or a name an admin can reach out to" rows={2} />
          </div>
          <p style={{ fontSize: '0.8rem', color: '#888', margin: '0 0 0.75rem' }}>An admin reads every application before anyone joins the Campfire. Until then you can still ask for help, offer help, and look around.</p>
          <label className="checkbox-field" style={{ background: 'var(--green-light)', borderRadius: '10px', padding: '0.75rem 1rem', alignItems: 'flex-start' }}>
            <input type="checkbox" checked={campfireNotify} onChange={(e) => setCampfireNotify(e.target.checked)} />
            <span>
              <strong style={{ display: 'block', marginBottom: '0.15rem' }}>Notify me about Campfire messages</strong>
              The Campfire is the group chat for Ambassadors and admins. Leave this unchecked and you can still read it anytime, you just won't get a push for every message. Change this later from Campfire's settings.
            </span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-row">
            <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>Back</button>
            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ flex: 1 }}>
              {submitting ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}