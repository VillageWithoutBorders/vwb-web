// Turns web addresses and email addresses inside plain text into links.
// Email opens the phone's mail app (mailto:). Only http(s) addresses become
// web links. Everything else stays plain text, so nothing can be injected.
const PATTERN = /(https?:\/\/[^\s<]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g
const linkStyle = { color: '#4ecca3', overflowWrap: 'anywhere' }

export default function Linkify({ text }) {
  if (!text) return null
  const parts = String(text).split(PATTERN)
  return parts.map((part, i) => {
    if (i % 2 === 0) return part
    // Keep sentence punctuation (period, comma, closing bracket) out of the link.
    const trail = (part.match(/[.,;:!?)\]]+$/) || [''])[0]
    const core = trail ? part.slice(0, -trail.length) : part
    const isWeb = /^https?:\/\//i.test(core)
    return (
      <span key={i}>
        <a
          href={isWeb ? core : 'mailto:' + core}
          {...(isWeb ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          style={linkStyle}
        >{core}</a>
        {trail}
      </span>
    )
  })
}
