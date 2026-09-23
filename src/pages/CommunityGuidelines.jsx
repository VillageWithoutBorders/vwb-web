import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

// Logs every Supabase error to the console with context so failures never vanish silently.
// Pass a userMessage to also alert the person and let the caller bail out.
function reportError(context, error, userMessage) {
  if (!error) return false
  console.error(`[CommunityGuidelines:${context}]`, error)
  if (userMessage) alert(userMessage)
  return true
}

const COLORS = {
  bg: '#121212',
  card: '#1e1e1e',
  border: '#333',
  text: '#e8e8e8',
  textDim: '#ddd',
  textMuted: '#8a8a8a',
  green: '#4ecca3',
  greenDark: '#2d6a4f',
  dotInactive: '#3a3a3a',
}

const CARDS = [
  {
    icon: '🏡',
    title: "You're joining a village",
    body: 'Village Without Borders works because neighbors look out for each other, not because a big staff is watching every corner.',
    points: [
      'You agree before anyone connects with you',
      'You can block or report anyone, any time',
      'Trust builds over time, between real people',
    ],
    footer: "Admins are here to help when you need them, but you're never stuck waiting on one to keep yourself safe.",
  },
  {
    icon: '🤝',
    title: 'How we treat each other',
    body: 'Everyone here deserves to feel safe and respected. This is not allowed on Village Without Borders:',
    points: [
      'Predatory behavior of any kind',
      'Harassment, threats, or intimidation',
      'Using the app to sell things, scam people, or spam requests',
      'Misusing a Hope Ambassador or Admin role',
    ],
    footer: 'Breaking these rules can get your account reset or removed.',
  },
  {
    icon: '🔒',
    title: 'What stays private',
    body: "Your exact address is never shown to anyone. You choose what shows up on your public profile.",
    points: [
      'Direct messages are end-to-end encrypted. Only you and the person you\'re messaging can read them, not even us',
      'If someone files a report, they attach their own copy of the messages being reported. We can\'t pull up a conversation ourselves',
      "Campfire (the group chat) isn't encrypted the same way. Admins can see what's posted there, so keep sensitive details out of it",
      "Please don't share someone else's personal information without asking them first",
    ],
    footer: null,
  },
  {
    icon: '🛡️',
    title: 'Your safety tools',
    body: 'These are always in your hands, not just an admin\'s:',
    points: [
      'Block anyone, any time, no explanation needed',
      'Report anything that feels wrong straight to a local admin',
      'Vouch for people you have actually helped or been helped by',
    ],
    footer: "Nobody gets matched with you unless you say yes first.",
  },
  {
    icon: '⚡',
    title: "Emergencies, and what we can't promise",
    body: 'The emergency feature is for urgent situations, like storm damage, flooding, or a safety concern that needs help fast. Everything else goes through the regular request system.',
    points: [
      'Village Without Borders connects you with neighbors',
      "We can't guarantee how any interaction goes",
      'We verify email addresses and display names, not government ID',
    ],
    footer: 'Use good judgment when you meet someone new.',
  },
]

export default function CommunityGuidelines({ onAgree }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [agreeing, setAgreeing] = useState(false)

  const isLast = index === CARDS.length - 1
  const card = CARDS[index]

  function goBack() {
    setIndex(i => Math.max(0, i - 1))
  }

  function goNext() {
    setIndex(i => Math.min(CARDS.length - 1, i + 1))
  }

  async function handleAgree() {
    if (!user) { reportError('handleAgree', { message: 'no user' }, 'Please log in again to continue.'); return }
    setAgreeing(true)
    const { error } = await supabase
      .from('helper_profiles')
      .update({ guidelines_accepted_at: new Date().toISOString() })
      .eq('user_id', user.id)
    setAgreeing(false)
    if (reportError('handleAgree', error, 'Could not save your agreement. Please try again.')) return

    if (onAgree) {
      onAgree()
    } else {
      navigate('/')
    }
  }

  return (
    <div style={{ background: COLORS.bg, color: COLORS.text, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: '480px', width: '100%', margin: '0 auto', padding: '1.5rem 1.25rem', flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* Progress dots */}
        <div
          role="progressbar"
          aria-valuenow={index + 1}
          aria-valuemin={1}
          aria-valuemax={CARDS.length}
          aria-label={`Step ${index + 1} of ${CARDS.length}`}
          style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginBottom: '2rem', marginTop: '0.5rem' }}
        >
          {CARDS.map((c, i) => (
            <span
              key={c.title}
              aria-hidden="true"
              style={{
                width: i === index ? '20px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: i === index ? COLORS.green : (i < index ? COLORS.greenDark : COLORS.dotInactive),
                transition: 'width 0.2s ease, background 0.2s ease',
              }}
            />
          ))}
        </div>

        {/* Card */}
        <div
          key={card.title}
          role="group"
          aria-label={`${index + 1} of ${CARDS.length}: ${card.title}`}
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '1rem' }} aria-hidden="true">{card.icon}</div>
          <h1 style={{ fontSize: '1.4rem', textAlign: 'center', margin: '0 0 1rem', color: COLORS.text }}>{card.title}</h1>
          <p style={{ fontSize: '1rem', lineHeight: 1.6, color: COLORS.textDim, margin: '0 0 1rem' }}>{card.body}</p>

          {card.points && (
            <ul style={{ margin: '0 0 1rem', padding: 0, listStyle: 'none' }}>
              {card.points.map(point => (
                <li key={point} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.5rem 0', borderTop: `1px solid ${COLORS.border}` }}>
                  <span aria-hidden="true" style={{ color: COLORS.green, fontWeight: 700, flexShrink: 0 }}>&#10003;</span>
                  <span style={{ color: COLORS.textDim, fontSize: '0.92rem', lineHeight: 1.5 }}>{point}</span>
                </li>
              ))}
            </ul>
          )}

          {card.footer && (
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: COLORS.textMuted, margin: 0 }}>{card.footer}</p>
          )}
        </div>

        {/* Full terms link, shown on the last card only */}
        {isLast && (
          <p style={{ textAlign: 'center', margin: '1rem 0 0' }}>
            <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.green, fontSize: '0.85rem', textDecoration: 'underline' }}>
              Read the full Terms of Use
            </a>
          </p>
        )}

        {/* Nav buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1rem' }}>
          {index > 0 && (
            <button
              onClick={goBack}
              disabled={agreeing}
              style={{
                flex: 1,
                padding: '0.85rem',
                borderRadius: '10px',
                border: `1px solid ${COLORS.green}`,
                background: 'none',
                color: COLORS.green,
                fontWeight: 700,
                fontSize: '1rem',
                cursor: agreeing ? 'default' : 'pointer',
                opacity: agreeing ? 0.6 : 1,
              }}
            >
              Back
            </button>
          )}

          {!isLast ? (
            <button
              onClick={goNext}
              style={{
                flex: 2,
                padding: '0.85rem',
                borderRadius: '10px',
                border: 'none',
                background: COLORS.green,
                color: '#0d1f18',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
              }}
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleAgree}
              disabled={agreeing}
              style={{
                flex: 2,
                padding: '0.85rem',
                borderRadius: '10px',
                border: 'none',
                background: COLORS.green,
                color: '#0d1f18',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: agreeing ? 'default' : 'pointer',
                opacity: agreeing ? 0.7 : 1,
              }}
            >
              {agreeing ? 'Saving...' : 'I Agree'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
