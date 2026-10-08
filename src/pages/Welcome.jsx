import { useState } from 'react'
import { Link } from 'react-router-dom'

const COLORS = {
  bg: '#121212',
  card: '#1e1e1e',
  cardAlt: '#182420',
  border: '#333',
  text: '#e8e8e8',
  textDim: '#ddd',
  textMuted: '#8a8a8a',
  green: '#4ecca3',
  greenDark: '#2d6a4f',
  greenLight: '#1a332a',
  orange: '#ff6644',
  orangeText: '#ffaa44',
}

const pageStyle = { background: COLORS.bg, color: COLORS.text, minHeight: '100vh' }

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
  padding: '1rem',
  maxWidth: '1000px',
  margin: '0 auto',
}

const sectionStyle = { maxWidth: '760px', margin: '0 auto', padding: '2.5rem 1.25rem' }

const cardStyle = {
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  borderRadius: '14px',
  padding: '1.5rem',
}

const btnPrimary = {
  display: 'inline-block',
  padding: '0.85rem 1.5rem',
  borderRadius: '10px',
  border: 'none',
  background: COLORS.green,
  color: '#0d1f18',
  fontWeight: 700,
  fontSize: '1rem',
  textDecoration: 'none',
  cursor: 'pointer',
  textAlign: 'center',
}

const btnSecondary = {
  display: 'inline-block',
  padding: '0.85rem 1.5rem',
  borderRadius: '10px',
  border: `1px solid ${COLORS.green}`,
  background: 'none',
  color: COLORS.green,
  fontWeight: 700,
  fontSize: '1rem',
  textDecoration: 'none',
  cursor: 'pointer',
  textAlign: 'center',
}

const eyebrow = {
  fontSize: '0.75rem',
  fontWeight: 700,
  color: COLORS.green,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '0.5rem',
}

const STEPS = [
  {
    icon: '🙋',
    title: 'Ask or offer',
    body: 'Post what you need, like a repair, a ride, tutoring, or someone to check in on you. Or post a skill you can offer, like plumbing, teaching, tech help, or just time and a listening ear.',
  },
  {
    icon: '🌿',
    title: 'Get matched nearby',
    body: "The app only shows you people and requests close to you, so help is realistic to actually give and receive quickly. Not a stranger three hours away.",
  },
  {
    icon: '🤝',
    title: 'Help happens',
    body: 'Both sides have to say yes before anyone connects. Once the help is done, you can leave feedback, which builds trust over time.',
  },
]

const SAFETY_POINTS = [
  'Every account needs a working email address. We do not check IDs, so use the same good sense you would with anyone new.',
  'Both people have to say yes before anyone connects. No surprise matches.',
  'After a task, both people can say how it went. Neighbors can also vouch for people they know.',
  'Private messages, Cottage Chats, and organization chats are end-to-end encrypted.',
  'You can block anyone, or report a problem to VWB admins.',
  'Village chats are for neighbors in that village. Only people who joined a village chat can open it. VWB admins cannot open it, but village chats are not encrypted the way private messages are.',
  'Locations are rounded, and your exact address is never shown. You choose what appears on your public profile.',
]

const FAQS = [
  {
    q: 'What is Village Without Borders?',
    a: "It's a way for neighbors to help neighbors. If you need something like a repair, a ride, tutoring, or someone to check in on you, you can ask here. If you have a skill to offer, whether that's plumbing, teaching, tech help, or just time and a listening ear, you can offer it here too. Think of it as a digital version of the way small towns used to work, where people looked out for each other without needing an agency in between.",
  },
  {
    q: 'How does it work?',
    a: 'You post what you need, or what you can offer. Neighbors nearby can see it and respond, and help stays local to your area so it comes from someone close enough to show up.',
  },
  {
    q: 'What is a village chat?',
    a: 'A village is a group of nearby zip codes with its own chat in the Village Square. You can join any village that covers your zip code, and you can be in more than one. If there is no village for your area yet, any neighbor can start one. Everyone also sees the Announcements board. Only people who joined a village chat can read it, and VWB admins cannot open it. Everyone in the chat can read it, so keep sensitive details out.',
  },
  {
    q: 'Who is this for?',
    a: 'Anyone 18 or older can make an account. Asking for help takes no application and no income check, and you can offer help right away. If you want to volunteer regularly, you can apply to be a Hope Ambassador. An admin reads each application.',
  },
  {
    q: 'Does it cost anything?',
    a: 'No. This is a mutual aid network, not a business. Nobody pays and nobody gets paid. It runs on neighbors helping neighbors.',
  },
  {
    q: 'How do you know the people on here are safe?',
    a: "We can't promise everyone is safe, and we don't check IDs. Every account needs a working email, both people have to say yes before anyone connects, and neighbors can vouch for people they know. After a task, both people can say how it went. Private messages are end-to-end encrypted. You can block anyone, or report a problem to VWB admins.",
  },
  {
    q: 'What if I just want to help, not ask for anything?',
    a: "You can offer your skills as soon as you sign up. If you want to help regularly, apply to be a Hope Ambassador. An admin reads each application, and approved Ambassadors can post in Announcements and join the Ambassadors board.",
  },
  {
    q: "What if it's an emergency?",
    a: 'For anything life-threatening, call 911 first. The emergency feature is for things like storm damage or flooding, and it alerts nearby helpers. Regular requests, like a leaky faucet, tutoring, or a ride to an appointment, use the normal request system.',
  },
  {
    q: 'Do I have to live close by to help or be helped?',
    a: 'Yes, on purpose. The app only shows you people and requests in your area, and villages are built from zip codes, so help is realistic to actually deliver and receive quickly, not a stranger three hours away.',
  },
  {
    q: 'Is my information private?',
    a: 'Your exact address is never shown to anyone, and locations are rounded. You control what appears on your public profile. Private messages, Cottage Chats, and organization chats are end-to-end encrypted. Announcements are open to every member. Village chats can be opened only by the neighbors who joined them, but they are not encrypted the same way, so keep sensitive details out of both.',
  },
  {
    q: 'What about teens and kids?',
    a: 'Accounts are for adults, 18 and over. Everyone, of any age, can look at the resource list and the community calendar without an account.',
  },
]

function FaqItem({ item, index, isOpen, onToggle }) {
  const panelId = `faq-panel-${index}`
  const buttonId = `faq-button-${index}`
  return (
    <div style={{ borderBottom: index < FAQS.length - 1 ? `1px solid ${COLORS.border}` : 'none' }}>
      <h3 style={{ margin: 0 }}>
        <button
          type="button"
          id={buttonId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            background: 'none',
            border: 'none',
            padding: '1rem 0',
            color: COLORS.textDim,
            fontSize: '1rem',
            fontWeight: 600,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <span>{item.q}</span>
          <span aria-hidden="true" style={{ color: COLORS.green, fontSize: '1.1rem', flexShrink: 0 }}>{isOpen ? '−' : '+'}</span>
        </button>
      </h3>
      {isOpen && (
        <div id={panelId} role="region" aria-labelledby={buttonId} style={{ paddingBottom: '1rem' }}>
          <p style={{ margin: 0, color: COLORS.textMuted, fontSize: '0.9rem', lineHeight: 1.6 }}>{item.a}</p>
        </div>
      )}
    </div>
  )
}

export default function Welcome() {
  const [openFaqIndex, setOpenFaqIndex] = useState(null)

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <img src="/images/vwb_header.png" alt="" style={{ height: '36px', borderRadius: '50%' }} />
          <span style={{ fontWeight: 700, fontSize: '1rem', color: COLORS.text }}>Village Without Borders</span>
        </div>
        <Link to="/login" style={{ ...btnSecondary, padding: '0.5rem 1rem', fontSize: '0.9rem' }}>Log In</Link>
      </header>

      <main>
        {/* Hero */}
        <section style={{ ...sectionStyle, textAlign: 'center', paddingTop: '2rem' }}>
          <h1 style={{ fontSize: '2rem', lineHeight: 1.25, margin: '0 0 0.75rem', color: COLORS.text }}>Neighbors helping neighbors</h1>
          <p style={{ fontSize: '1.05rem', color: COLORS.textDim, lineHeight: 1.6, margin: '0 auto 1.75rem', maxWidth: '520px' }}>
            If you need a hand, ask here. If you have a skill to give, offer it here. Village Without Borders matches you with people nearby, the way small towns used to look out for each other.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/login?mode=signup" style={btnPrimary}>Get Started</Link>
            <Link to="/login" style={btnSecondary}>Log In</Link>
          </div>
          <p style={{ marginTop: '1rem', color: COLORS.textMuted, fontSize: '0.8rem' }}>Free, always. No income requirement. No application to ask for help.</p>
        </section>

        {/* How it works */}
        <section style={sectionStyle}>
          <div style={eyebrow}>How it works</div>
          <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.4rem' }}>Three simple steps</h2>
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {STEPS.map((s) => (
              <div key={s.title} style={cardStyle}>
                <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }} aria-hidden="true">{s.icon}</div>
                <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem', color: COLORS.text }}>{s.title}</h3>
                <p style={{ margin: 0, color: COLORS.textMuted, fontSize: '0.875rem', lineHeight: 1.55 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Villages */}
        <section style={sectionStyle}>
          <div style={eyebrow}>Village chats</div>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem' }}>Find your village</h2>
          <p style={{ margin: '0 0 0.75rem', color: COLORS.textDim, lineHeight: 1.6 }}>
            A village is a group of neighbors in nearby zip codes, with its own chat. Join the one that covers your zip code, or start one for your area if there is not one yet.
          </p>
          <p style={{ margin: 0, color: COLORS.textMuted, fontSize: '0.9rem', lineHeight: 1.6 }}>
            Village chats can be read only by the neighbors who joined them. Private messages are the place for anything sensitive.
          </p>
        </section>

        {/* Who it's for / Hope Ambassador */}
        <section style={sectionStyle}>
          <div style={{ ...cardStyle, background: COLORS.cardAlt, borderColor: COLORS.greenDark }}>
            <div style={eyebrow}>Who it's for</div>
            <p style={{ margin: '0 0 1rem', color: COLORS.textDim, lineHeight: 1.6 }}>
              Anyone 18 or older. Whether you need help or want to give it, there is no income requirement and no application to ask for help.
            </p>
            <p style={{ margin: 0, color: COLORS.textDim, lineHeight: 1.6 }}>
              Want to help regularly? Apply to be a <strong style={{ color: COLORS.green }}>Hope Ambassador</strong>. Tell us what you're good at and when you're usually free. An admin reads each application.
            </p>
          </div>
        </section>

        {/* No account needed */}
        <section style={sectionStyle}>
          <div style={eyebrow}>No account needed</div>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem' }}>Look around first</h2>
          <p style={{ margin: '0 0 1.25rem', color: COLORS.textDim, lineHeight: 1.6 }}>
            Anyone, of any age, can find local help and see what is happening nearby. No sign-up needed.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link to="/resources" style={btnSecondary}>Find local resources</Link>
            <Link to="/calendar/embed" style={btnSecondary}>See the community calendar</Link>
          </div>
        </section>

        {/* Safety */}
        <section style={sectionStyle}>
          <div style={eyebrow}>Safety &amp; trust</div>
          <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.4rem' }}>How we keep it safe</h2>
          <div style={cardStyle}>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {SAFETY_POINTS.map((point, i) => (
                <li key={point} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', padding: '0.6rem 0', borderTop: i === 0 ? 'none' : `1px solid ${COLORS.border}` }}>
                  <span aria-hidden="true" style={{ color: COLORS.green, fontWeight: 700, flexShrink: 0 }}>&#10003;</span>
                  <span style={{ color: COLORS.textDim, fontSize: '0.9rem', lineHeight: 1.55 }}>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Emergency note */}
        <section style={sectionStyle}>
          <div style={{ ...cardStyle, background: '#2a1f16', borderColor: COLORS.orange }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>⚡</span>
              <div>
                <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem', color: COLORS.orangeText }}>Urgent situation?</h2>
                <p style={{ margin: 0, color: COLORS.textDim, fontSize: '0.9rem', lineHeight: 1.6 }}>
                  For anything life-threatening, call 911 first. Storm damage, flooding, or a safety concern that needs neighbors right away goes through a separate emergency feature that alerts nearby helpers. Everyday requests, like a leaky faucet or a ride to an appointment, use the regular request system.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={sectionStyle}>
          <div style={eyebrow}>Questions</div>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem' }}>Frequently asked questions</h2>
          <div style={{ ...cardStyle, padding: '0.25rem 1.5rem' }}>
            {FAQS.map((item, index) => (
              <FaqItem
                key={item.q}
                item={item}
                index={index}
                isOpen={openFaqIndex === index}
                onToggle={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
              />
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section style={{ ...sectionStyle, textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem' }}>Ready to meet your neighbors?</h2>
          <p style={{ margin: '0 0 1.25rem', color: COLORS.textMuted }}>It takes a couple of minutes to get started.</p>
          <Link to="/login?mode=signup" style={btnPrimary}>Get Started</Link>
        </section>
      </main>

      <footer style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: '1rem' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '1.5rem 1.25rem', textAlign: 'center' }}>
          <a href="https://villagewithoutborders.org" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.green, fontSize: '0.85rem', textDecoration: 'none' }}>
            villagewithoutborders.org &#8599;
          </a>
          <p style={{ margin: '0.5rem 0 0', color: COLORS.textMuted, fontSize: '0.75rem' }}>A project of neighbors, for neighbors.</p>
        </div>
      </footer>
    </div>
  )
}
