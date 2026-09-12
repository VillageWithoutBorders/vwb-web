import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

export default function Help() {
  const { user } = useAuth()
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [sendingFeedback, setSendingFeedback] = useState(false)

  async function submitFeedback() {
    setSendingFeedback(true)
    const { error } = await supabase.from('feedback').insert({ user_id: user.id, body: feedbackText.trim() })
    setSendingFeedback(false)
    if (error) { console.error('Failed to submit feedback:', error); alert('Could not submit your feedback. Try again.'); return }
    setFeedbackSent(true)
    setFeedbackText('')
  }

  return (
    <div className="help-page">
      <h1>Help &amp; Feedback</h1>

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

      <div className="help-section">
        <h2>Feedback</h2>
        <p>Tell us what your community needs. Your input shapes what we build next.</p>
        {feedbackSent ? (
          <p style={{ color: '#4ecca3', fontWeight: 600 }}>Thank you! Your feedback has been submitted.</p>
        ) : (
          <>
            <textarea
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder="What would help your community? What should we build next?"
              aria-label="Feedback for Village Without Borders"
              rows={3}
              maxLength={2000}
              style={{ display: 'block', width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.9rem', resize: 'vertical', marginBottom: '0.5rem', boxSizing: 'border-box' }}
            />
            <button
              disabled={!feedbackText.trim() || sendingFeedback}
              onClick={submitFeedback}
              style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', opacity: (!feedbackText.trim() || sendingFeedback) ? 0.5 : 1 }}
            >
              {sendingFeedback ? 'Sending...' : 'Submit Feedback'}
            </button>
          </>
        )}
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
