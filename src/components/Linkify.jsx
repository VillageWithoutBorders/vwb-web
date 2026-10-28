// Turns web addresses, email addresses and US phone numbers inside plain text into links.
// Email opens the phone's mail app (mailto:), a phone number opens the dialer (tel:,
// Oct 28). Only http(s) addresses become web links. Everything else stays plain text,
// so nothing can be injected.
const PATTERN = /(https?:\/\/[^\s<]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+|(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b)/g
const PHONE = /^(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}$/
const linkStyle = { color: 'var(--accent)', overflowWrap: 'anywhere' }

export default function Linkify({ text }) {
  if (!text) return null
  const parts = String(text).split(PATTERN)
  return parts.map((part, i) => {
    if (i % 2 === 0) return part
    // Keep sentence punctuation (period, comma, closing bracket) out of the link.
    const trail = (part.match(/[.,;:!?)\]]+$/) || [''])[0]
    const core = trail ? part.slice(0, -trail.length) : part
    const isWeb = /^https?:\/\//i.test(core)
    const isPhone = !isWeb && PHONE.test(core)
    return (
      <span key={i}>
        <a
          href={isWeb ? core : isPhone ? 'tel:' + core.replace(/[^0-9+]/g, '') : 'mailto:' + core}
          {...(isWeb ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          style={linkStyle}
        >{core}</a>
        {trail}
      </span>
    )
  })
}
