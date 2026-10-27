import { useState } from 'react'

// Settings > Text size (Oct 27, Jade). Normal, Large, Larger. Saved on this device.
// index.html puts the class on the page before it draws, so there is no jump.
const KEY = 'vwb_text'
const CHOICES = [
  { k: 'normal', label: 'Normal', size: '1rem' },
  { k: 'large', label: 'Large', size: '1.2rem' },
  { k: 'larger', label: 'Larger', size: '1.4rem' },
]

function read() {
  try { const v = localStorage.getItem(KEY); return v === 'large' || v === 'larger' ? v : 'normal' } catch { return 'normal' }
}

export function applyTextSize(v) {
  const root = document.documentElement
  root.classList.toggle('text-large', v === 'large')
  root.classList.toggle('text-larger', v === 'larger')
  try { if (v === 'normal') localStorage.removeItem(KEY); else localStorage.setItem(KEY, v) } catch { /* private window */ }
}

export default function TextSizePicker() {
  const [size, setSize] = useState(read())
  function choose(k) { applyTextSize(k); setSize(k) }
  return (
    <div className="profile-details" style={{ marginBottom: '1rem' }}>
      <div className="detail-section-header" id="textsize-h">Text size</div>
      <div role="radiogroup" aria-labelledby="textsize-h" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(6.5rem, 1fr))', gap: '0.5rem', padding: '0.5rem 1rem 0.25rem' }}>
        {CHOICES.map((c) => (
          <button key={c.k} type="button" role="radio" aria-checked={size === c.k} onClick={() => choose(c.k)}
            style={{ minHeight: 56, borderRadius: 12, cursor: 'pointer', font: 'inherit', fontWeight: 700, fontSize: c.size, padding: '0.4rem',
              border: '2px solid ' + (size === c.k ? 'var(--accent)' : 'var(--border)'),
              background: size === c.k ? 'var(--green-light)' : 'var(--surface-2)', color: 'var(--text)' }}>
            {c.label}
          </button>
        ))}
      </div>
      <p style={{ margin: 0, padding: '0.25rem 1rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Makes all the words bigger. Saved on this phone.</p>
    </div>
  )
}
