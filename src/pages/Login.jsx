import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { peekReturnTo } from '../utils/returnTo'
import GroupedSkillChips from '../components/GroupedSkillChips'
import { loadSkillCategories } from '../utils/skillGroups'
import AvailabilityPicker from '../components/AvailabilityPicker'
import Turnstile, { TURNSTILE_SITE_KEY } from '../components/Turnstile'
import Icon from '../components/Icon'

// Shown when a banned account tries to log in, or gets signed out by the
// ban check in AuthContext.
const CAPTCHA_MESSAGE = 'Please finish the quick "are you a person?" check, then try again.'

// Supabase says "captcha verification process failed" when the human
// check token is missing, used up, or expired.
function isCaptchaError(error) {
  return /captcha/i.test(error?.message || '')
}

const BANNED_MESSAGE = 'This account has been removed for breaking the community guidelines. To appeal, email info@villagewithoutborders.org.'

export default function Login() {
  const [searchParams] = useSearchParams()
  // /welcome links here with ?mode=signup so "Get Started" drops people
  // straight into account creation instead of the sign-in form.
  const [mode, setMode] = useState(searchParams.get('mode') === 'signup' ? 'signup' : 'signin')
  const [step, setStep] = useState(1)

  const [skillOptions, setSkillOptions] = useState([])

  useEffect(() => {
    async function loadSkills() {
      setSkillOptions(await loadSkillCategories())
    }
    loadSkills()
  }, [])


  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Off by default (Oct 21): sign up stays one step. Neighbors can apply to be
  // a Hope Ambassador later, inside the app (Profile > Become a Hope Ambassador).
  const [wantAmbassador, setWantAmbassador] = useState(false)
  // Accounts are for adults (see Terms). We ask for a confirmation, never a
  // birthdate, so nothing about age is stored.
  const [isAdult, setIsAdult] = useState(false)

  const [selectedSkills, setSelectedSkills] = useState([])
  const [availability, setAvailability] = useState('')
  const [interests, setInterests] = useState('')
  const [howKnown, setHowKnown] = useState('')
  const [radiusMiles, setRadiusMiles] = useState(10)
  // Opt-in, off by default, mirrors the field on the in-app ambassador
  // signup in Profile.jsx. See that file for the reasoning.
  const [campfireNotify, setCampfireNotify] = useState(false)

  // Human check (Turnstile). A token works once, so bump captchaKey after
  // every try to get a fresh one.
  const [captcha, setCaptcha] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)
  const needCaptcha = !!TURNSTILE_SITE_KEY && !captcha
  // A token from another screen can be stale or used up. Start fresh
  // whenever the screen changes, so Safari gets a clean check.
  useEffect(() => { setCaptcha(''); setCaptchaKey((k) => k + 1) }, [mode, step, wantAmbassador])
  // Say why the button is grey instead of leaving people stuck.
  const captchaHint = needCaptcha ? <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem' }}>Finish the "are you a person?" check above. On iPhone it can take a few seconds or ask you to tap a box.</p> : null

  // If the ban check just signed this account out, explain why once.
  const [error, setError] = useState(() => {
    try {
      if (localStorage.getItem('vwb_banned_notice')) { localStorage.removeItem('vwb_banned_notice'); return BANNED_MESSAGE }
    } catch { /* private mode */ }
    return ''
  })
  const [message, setMessage] = useState('')
  // After sign up: a "Check your email" screen with Resend, instead of a line on the sign-in form.
  const [sentTo, setSentTo] = useState('')
  const [resendNote, setResendNote] = useState('')
  const [resending, setResending] = useState(false)
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
    const { error } = await signIn(email, password, captcha)
    setCaptchaKey((k) => k + 1)
    if (error) {
      if (isCaptchaError(error)) { setError(CAPTCHA_MESSAGE); setSubmitting(false); return }
      if (error.code === 'user_banned' || /banned/i.test(error.message || '')) {
        setError(BANNED_MESSAGE)
        setSubmitting(false)
        return
      }
      setError(error.message)
      setShowForgot(true)
    } else {
      navigate(peekReturnTo() || '/')
    }
    setSubmitting(false)
  }

  async function handleForgotPassword() {
    if (!email.trim()) { setError('Enter your email first, then tap Forgot password.'); return }
    if (needCaptcha) { setError(CAPTCHA_MESSAGE); return }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
      captchaToken: captcha || undefined,
    })
    setCaptchaKey((k) => k + 1)
    if (error) { setError(isCaptchaError(error) ? CAPTCHA_MESSAGE : error.message); return }
    setResetSent(true)
    setError('')
  }

  function handleNext(e) {
    e.preventDefault()
    setError('')
    if (!displayName.trim()) { setError('Please enter your name.'); return }
    if (!email.trim()) { setError('Please enter your email.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (!isAdult) { setError('Please confirm you are 18 or older to make an account.'); return }
    if (wantAmbassador) { setStep(2) } else { handleSignUp() }
  }

  async function handleSignUp() {
    setError('')
    setSubmitting(true)
    const ambassadorPending = wantAmbassador ? {
      skills: selectedSkills, availability, interests, radius_miles: radiusMiles,
      how_known: howKnown.trim(),
      campfire_notifications_enabled: campfireNotify,
    } : null
    const { error } = await signUp(email, password, displayName.trim(), wantAmbassador, captcha, ambassadorPending ? { ambassador_pending: ambassadorPending } : {})
    setCaptchaKey((k) => k + 1)
    if (error) {
      // A banned email or a throwaway email service is refused by the
      // database, which Supabase reports as "Database error saving new user".
      setError(isCaptchaError(error) ? CAPTCHA_MESSAGE
        : /database error/i.test(error.message || '') ? "We couldn't create an account with this email. Please use your regular email, not a temporary one. If you think this is a mistake, email info@villagewithoutborders.org."
        : error.message)
      setSubmitting(false)
      return
    }
    if (wantAmbassador) {
      try { localStorage.setItem('vwb_ambassador_pending', JSON.stringify(ambassadorPending)) } catch { /* private mode: saved on the account too */ }
    }
    setSentTo(email.trim())
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

  async function resendConfirm() {
    setResending(true); setResendNote('')
    const { error: rErr } = await supabase.auth.resend({ type: 'signup', email: sentTo })
    setResending(false)
    if (rErr) { console.error('Failed to resend confirmation email:', rErr); setResendNote("We couldn't send it again just now. Wait a minute and try again."); return }
    setResendNote('Sent again. It can take a few minutes.')
  }

  // ---- Check your email (right after sign up) ----
  if (sentTo) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1>Check your email</h1>
            <p className="login-subtitle">One last step</p>
          </div>
          <div className="login-form check-email">
            <p>We sent a link to <b>{sentTo}</b>. Tap it to finish making your account, then come back and sign in.</p>
            <p>Can't find it? Look in Spam, Junk, or Promotions. It comes from Village Without Borders.</p>
            {resendNote && <p className="form-success" role="status">{resendNote}</p>}
            <button type="button" className="btn btn-outline btn-full" onClick={resendConfirm} disabled={resending}>{resending ? 'Sending...' : 'Send it again'}</button>
            <button type="button" className="btn btn-primary btn-full" onClick={() => { setSentTo(''); setResendNote('') }}>I tapped the link. Sign in</button>
          </div>
        </div>
      </div>
    )
  }

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
            <Turnstile onToken={setCaptcha} resetKey={captchaKey} />{captchaHint}
            <button type="submit" className="btn btn-primary btn-full" disabled={submitting || needCaptcha}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
            <p className="login-toggle">
              Don't have an account?{' '}
              <button type="button" className="link-button" onClick={() => { setMode('signup'); setError(''); setMessage('') }}>
                Sign up
              </button>
            </p>
            <p className="login-toggle">
              <button type="button" className="link-button" onClick={() => navigate('/welcome')} style={{ minHeight: '44px' }}>
                New here? See what this app is for
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
            <label className="checkbox-field">
              <input type="checkbox" checked={isAdult} onChange={(e) => setIsAdult(e.target.checked)} />
              <span>I am 18 or older. Accounts are for adults.</span>
            </label>
            <p style={{ fontSize: '0.875rem', margin: '-0.5rem 0 1rem', color: 'var(--text-secondary)' }}>
              Under 18? You don't need an account to look around. <a href="/resources">Find local resources</a> or <a href="/calendar/embed">see the community calendar</a>.
            </p>
            <label className="checkbox-field" style={{ background: 'var(--green-light)', borderRadius: '10px', padding: '0.75rem 1rem', alignItems: 'flex-start' }}>
              <input type="checkbox" checked={wantAmbassador} onChange={(e) => setWantAmbassador(e.target.checked)} />
              <span>
                <strong style={{ display: 'block', marginBottom: '0.15rem' }}>Apply to be a Hope Ambassador</strong>
                Share a few skills and hours you can spare. An admin looks over each application so this stays a community people can trust. You can also apply later from your Profile.
              </span>
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            {!wantAmbassador && <Turnstile resetKey={captchaKey} onToken={setCaptcha} />}
            {!wantAmbassador && captchaHint}
            {(() => {
              // Say what is still missing, so nobody is stuck at a grey button.
              const missing = [
                !displayName.trim() && 'your name',
                !email.trim() && 'your email',
                password.length < 6 && 'a password of 6 or more letters or numbers',
                !isAdult && 'the 18 or older box',
                !wantAmbassador && needCaptcha && 'the person check',
              ].filter(Boolean)
              return missing.length > 0 && (displayName || email || password) ? (
                <p className="signup-missing" role="status">Still needed: {missing.join(', ')}.</p>
              ) : null
            })()}
            <button type="submit" className="btn btn-primary btn-full" disabled={submitting || (!wantAmbassador && needCaptcha)}>
              {wantAmbassador ? 'Next' : submitting ? 'Creating account...' : 'Create account'}
            </button>
            <p className="login-toggle">
              Already have an account?{' '}
              <button type="button" className="link-button" onClick={() => { setMode('signin'); setStep(1); setError('') }}>
                Sign in
              </button>
            </p>
            <p className="login-toggle">
              <button type="button" className="link-button" onClick={() => navigate('/welcome')} style={{ minHeight: '44px' }}>
                What is this app?
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
          <div className="later-note">
            <span className="later-note-icon" aria-hidden="true"><Icon name="sprout" /></span>
            <span>No need to get it perfect. Pick at least one skill to start. You can change your skills, distance, and hours anytime in your Profile.</span>
          </div>
          <div className="form-field">
            <label>What can you help with?</label>
            <GroupedSkillChips selected={selectedSkills} skills={skillOptions} renderChip={(skill) => (
              <button key={skill} type="button" className={`skill-chip ${selectedSkills.includes(skill) ? 'active' : ''}`} onClick={() => toggleSkill(skill)}>
                {skill}
              </button>
            )} />
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
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>An admin reads every application before anyone becomes an Ambassador. Until then you can still ask for help, offer help, and look around.</p>
          <label className="checkbox-field" style={{ background: 'var(--green-light)', borderRadius: '10px', padding: '0.75rem 1rem', alignItems: 'flex-start' }}>
            <input type="checkbox" checked={campfireNotify} onChange={(e) => setCampfireNotify(e.target.checked)} />
            <span>
              <strong style={{ display: 'block', marginBottom: '0.15rem' }}>Notify me about Village Square messages</strong>
              The Village Square holds Announcements, the Ambassadors board, and the village chats you join. Leave this unchecked and you can still read it anytime, you just won't get a push for every message. Change this later from Village Square's settings.
            </span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Turnstile onToken={setCaptcha} resetKey={captchaKey} />{captchaHint}
          <div className="form-row">
            <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>Back</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || needCaptcha} style={{ flex: 1 }}>
              {submitting ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}