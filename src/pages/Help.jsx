import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { startAppTour } from '../components/AppTour'
import { useGoBack } from '../components/BackLink'

export default function Help() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackKind, setFeedbackKind] = useState('problem')
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [sendingFeedback, setSendingFeedback] = useState(false)

  async function submitFeedback() {
    setSendingFeedback(true)
    const { error } = await supabase.from('feedback').insert({ user_id: user.id, body: (feedbackKind === 'problem' ? '[Problem] ' : '[Idea] ') + feedbackText.trim() })
    setSendingFeedback(false)
    if (error) { console.error('Failed to submit feedback:', error); alert('Could not submit your feedback. Try again.'); return }
    setFeedbackSent(true)
    setFeedbackText('')
  }

  return (
    <div className="help-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button onClick={() => goBack('/')} aria-label="Go back" style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem', flexShrink: 0 }}>&#8592;</button>
        <h1 style={{ margin: 0 }}>Help &amp; Feedback</h1>
      </div>

      <div className="help-section help-tour-card">
        <h2>New here, or feeling lost?</h2>
        <p>Take a one-minute tour of the app. It shows you where everything is.</p>
        <button type="button" className="btn btn-primary btn-full" onClick={startAppTour}>Take the tour</button>
      </div>

      <div className="help-section">
        <h2>About Village Without Borders</h2>
        <p>
          We're a mutual aid network serving Northwest Georgia and the
          Chattanooga Valley. Neighbors helping neighbors with housing,
          disaster recovery, and daily needs.
        </p>
      </div>

      <div className="help-section">
        <h2>How it works</h2>
        <div className="help-steps">
          <div className="help-step">
            <span className="help-step-num">1</span>
            <div>
              <strong>Ask for help</strong>
              <p>Post what you need. Only your name and general area are shared.</p>
            </div>
          </div>
          <div className="help-step">
            <span className="help-step-num">2</span>
            <div>
              <strong>Get matched</strong>
              <p>Hope Ambassadors in your area see the request and reach out.</p>
            </div>
          </div>
          <div className="help-step">
            <span className="help-step-num">3</span>
            <div>
              <strong>Connect directly</strong>
              <p>We put you in touch. No personal info is stored after the match.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="help-section">
        <h2>Your privacy</h2>
        <p>
          We take privacy seriously. Your exact location is never stored.
          Encrypted fields protect your personal information.
          You choose what to share and with whom.
        </p>
      </div>

      <div className="help-section" id="report-a-problem">
        <h2>Report a problem or share an idea</h2>
        <p>Something broken, confusing, or unsafe? Tell us. Your idea about what your community needs is welcome too. To report a person, use the Report button on their profile.</p>
        {feedbackSent ? (
          <p style={{ color: '#4ecca3', fontWeight: 600 }}>Thank you! We got it and an admin will read it.</p>
        ) : (
          <>
            <div role="radiogroup" aria-label="What kind of message is this?" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              {[['problem', 'Report a problem'], ['idea', 'Share an idea']].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={feedbackKind === k}
                  onClick={() => setFeedbackKind(k)}
                  style={{ flex: 1, minHeight: '44px', padding: '0.5rem', borderRadius: '8px', border: feedbackKind === k ? '2px solid #4ecca3' : '1px solid #444', background: feedbackKind === k ? '#1d3a31' : '#222', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                >{label}</button>
              ))}
            </div>
            <textarea
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder={feedbackKind === 'problem' ? 'What happened? What were you trying to do?' : 'What would help your community? What should we build next?'}
              aria-label={feedbackKind === 'problem' ? 'Describe the problem' : 'Describe your idea'}
              rows={4}
              maxLength={2000}
              style={{ display: 'block', width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '1rem', resize: 'vertical', marginBottom: '0.5rem', boxSizing: 'border-box' }}
            />
            <button
              disabled={!feedbackText.trim() || sendingFeedback}
              onClick={submitFeedback}
              style={{ minHeight: '44px', padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', opacity: (!feedbackText.trim() || sendingFeedback) ? 0.5 : 1 }}
            >
              {sendingFeedback ? 'Sending...' : 'Send'}
            </button>
          </>
        )}
      </div>

      <div className="help-section">
        <h2>Who runs this</h2>
        <p>
          Village Without Borders is a volunteer-run mutual aid network in
          Northwest Georgia. It was started by Jade Michalski in Ringgold, GA.
          It is not part of any political party or campaign, and no one is paid
          to help you here.
        </p>
      </div>

      <div className="help-section">
        <h2>Need to talk to someone?</h2>
        <p>
          Reach us at{' '}
          <a href="mailto:info@villagewithoutborders.org">
            info@villagewithoutborders.org
          </a>
        </p>
      </div>
    </div>
  )
}
