import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { startAppTour, SampleCard } from '../components/AppTour'
import { useGoBack } from '../components/BackLink'
import { tell } from '../components/AdminDialog'
import { useT } from '../utils/lang'

export default function Help() {
  const t = useT()
  const { user } = useAuth()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackKind, setFeedbackKind] = useState('problem')
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [sendingFeedback, setSendingFeedback] = useState(false)
  const [practice, setPractice] = useState(false)

  async function submitFeedback() {
    setSendingFeedback(true)
    const { error } = await supabase.from('feedback').insert({ user_id: user.id, body: (feedbackKind === 'problem' ? '[Problem] ' : '[Idea] ') + feedbackText.trim() })
    setSendingFeedback(false)
    if (error) { console.error('Failed to submit feedback:', error); tell(t('Could not submit your feedback. Try again.'), { tone: 'error' }); return }
    setFeedbackSent(true)
    setFeedbackText('')
  }

  return (
    <div className="help-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button onClick={() => goBack('/')} aria-label={t('Go back')} style={{ minWidth: 44, minHeight: 44, background: 'none', border: 'none', color: 'var(--accent)', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem', flexShrink: 0 }}>&#8592;</button>
        <h1 style={{ margin: 0 }}>{t('App guide and feedback')}</h1>
      </div>

      <div className="help-section help-tour-card">
        <h2>{t('New here, or feeling lost?')}</h2>
        <p>{t('Take a one-minute tour of the app. It shows you where everything is.')}</p>
        <button type="button" className="btn btn-primary btn-full" onClick={startAppTour}>{t('Take the tour')}</button>
        {/* Nov 10 (Jade): practice moved out of the tour. Nothing is saved and nobody is told. */}
        {practice
          ? <SampleCard />
          : <button type="button" className="btn btn-outline btn-full" onClick={() => setPractice(true)}>{t('Try a pretend request')}</button>}
        <p>{t('Not sure what something is? Tap the ? and then tap it. Or hold your finger on it.')}</p>
      </div>

      <div className="help-section">
        <h2>{t('About Village Without Borders')}</h2>
        <p>{t("We're a mutual aid network serving Northwest Georgia and the Chattanooga Valley. Neighbors helping neighbors with housing, disaster recovery, and daily needs.")}</p>
      </div>

      <div className="help-section">
        <h2>{t('How it works')}</h2>
        <div className="help-steps">
          <div className="help-step">
            <span className="help-step-num">1</span>
            <div>
              <strong>{t('Ask for Help')}</strong>
              <p>{t('Post what you need. Neighbors see your name and town, never your address.')}</p>
            </div>
          </div>
          <div className="help-step">
            <span className="help-step-num">2</span>
            <div>
              <strong>{t('A neighbor offers')}</strong>
              <p>{t('Neighbors near you see your request and can offer to help.')}</p>
            </div>
          </div>
          <div className="help-step">
            <span className="help-step-num">3</span>
            <div>
              <strong>{t('You say yes')}</strong>
              <p>{t('You pick who helps. Then you message each other to set a time.')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="help-section">
        <h2>{t('Your privacy')}</h2>
        <p>{t('We take privacy seriously. Your exact location is never stored. Encrypted fields protect your personal information. You choose what to share and with whom.')}</p>
      </div>

      <div className="help-section" id="report-a-problem">
        <h2>{t('Report a problem or share an idea')}</h2>
        <p>{t('Something broken, confusing, or unsafe? Tell us. Your idea about what your community needs is welcome too. To report a person, use the Report button on their profile.')}</p>
        {feedbackSent ? (
          <p style={{ color: 'var(--accent)', fontWeight: 600 }}>{t('Thank you! We got it and an admin will read it.')}</p>
        ) : (
          <>
            <div role="radiogroup" aria-label={t('What kind of message is this?')} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              {[['problem', 'Report a problem'], ['idea', 'Share an idea']].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={feedbackKind === k}
                  onClick={() => setFeedbackKind(k)}
                  style={{ flex: 1, minHeight: '44px', padding: '0.5rem', borderRadius: '8px', border: feedbackKind === k ? '2px solid var(--accent)' : '1px solid var(--border-strong)', background: feedbackKind === k ? 'var(--accent)' : 'var(--surface-2)', color: feedbackKind === k ? 'var(--on-accent)' : 'var(--text-strong)', fontWeight: 600, cursor: 'pointer' }}
                >{t(label)}</button>
              ))}
            </div>
            <textarea
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder={feedbackKind === 'problem' ? t('What happened? What were you trying to do?') : t('What would help your community? What should we build next?')}
              aria-label={feedbackKind === 'problem' ? t('Describe the problem') : t('Describe your idea')}
              rows={4}
              maxLength={2000}
              style={{ display: 'block', width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)', fontSize: '1rem', resize: 'vertical', marginBottom: '0.5rem', boxSizing: 'border-box' }}
            />
            <button
              disabled={!feedbackText.trim() || sendingFeedback}
              onClick={submitFeedback}
              style={{ minHeight: '44px', padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer', opacity: (!feedbackText.trim() || sendingFeedback) ? 0.5 : 1 }}
            >
              {sendingFeedback ? t('Sending...') : t('Send')}
            </button>
          </>
        )}
      </div>

      <div className="help-section">
        <h2>{t('Who runs this')}</h2>
        <p>{t('Village Without Borders is a volunteer-run mutual aid network in Northwest Georgia. It was started by Jade Michalski in Ringgold, GA. It is not part of any political party or campaign, and no one is paid to help you here.')}</p>
      </div>

      <div className="help-section">
        <h2>{t('Need to talk to someone?')}</h2>
        <p>
          {t('Reach us at')}{' '}
          <a href="mailto:info@villagewithoutborders.org">
            info@villagewithoutborders.org
          </a>
        </p>
      </div>
    </div>
  )
}
