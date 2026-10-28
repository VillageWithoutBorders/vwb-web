import { useState } from 'react'
import { getTheme, setTheme } from '../utils/theme'
import Icon from './Icon'

// Settings > Light or dark. Light, dark, or whatever the phone is set to.
const CHOICES = [
  { k: 'auto', label: 'Match my phone', em: 'phone' },
  { k: 'light', label: 'Light', em: 'sun' },
  { k: 'dark', label: 'Dark', em: 'moon' },
]

export default function AppearancePicker() {
  const [theme, pick] = useState(getTheme())
  function choose(k) { setTheme(k); pick(k) }
  return (
    <div className="profile-details" style={{ marginBottom: '1rem' }}>
      <div className="detail-section-header" id="appearance-h">Light or dark</div>
      <div role="radiogroup" aria-labelledby="appearance-h" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem', padding: '0.5rem 1rem 0.25rem' }}>
        {CHOICES.map((c) => (
          <button key={c.k} type="button" role="radio" aria-checked={theme === c.k} onClick={() => choose(c.k)}
            style={{ minHeight: 56, borderRadius: 12, cursor: 'pointer', font: 'inherit', fontWeight: 600, fontSize: '0.9rem', padding: '0.4rem',
              border: '2px solid ' + (theme === c.k ? 'var(--accent)' : 'var(--border)'),
              background: theme === c.k ? 'var(--green-light)' : 'var(--surface-2)', color: 'var(--text)' }}>
            <span aria-hidden="true" style={{ display: 'block', fontSize: '1.2rem' }}><Icon name={c.em} /></span>{c.label}
          </button>
        ))}
      </div>
      <p style={{ margin: 0, padding: '0.25rem 1rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Saved on this phone. In the full view, map pages keep their painted colors.</p>
    </div>
  )
}
