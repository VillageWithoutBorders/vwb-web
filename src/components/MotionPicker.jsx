import { useState } from 'react'
import { readCalm, applyCalm } from '../utils/motion'

// Settings > Easy to use > Using: Calm motion (Oct 27, Jade).
const CHOICES = [
  { k: false, label: 'Normal' },
  { k: true, label: 'Calm' },
]

export default function MotionPicker() {
  const [calm, setCalm] = useState(readCalm())
  function choose(k) { applyCalm(k); setCalm(k) }
  return (
    <div className="profile-details" style={{ marginBottom: '1rem' }}>
      <div className="detail-section-header" id="motion-h">Motion</div>
      <div role="radiogroup" aria-labelledby="motion-h" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem', padding: '0.5rem 1rem 0.25rem' }}>
        {CHOICES.map((c) => (
          <button key={c.label} type="button" role="radio" aria-checked={calm === c.k} onClick={() => choose(c.k)}
            style={{ minHeight: 56, borderRadius: 12, cursor: 'pointer', font: 'inherit', fontWeight: 700, fontSize: '1rem', padding: '0.4rem',
              border: '2px solid ' + (calm === c.k ? 'var(--accent)' : 'var(--border)'),
              background: calm === c.k ? 'var(--green-light)' : 'var(--surface-2)', color: 'var(--text)' }}>
            {c.label}
          </button>
        ))}
      </div>
      <p style={{ margin: 0, padding: '0.25rem 1rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Calm stops moving pictures, sparkles, and sliding. Saved on this phone.</p>
    </div>
  )
}
