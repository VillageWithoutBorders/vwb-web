import { useState } from 'react'
import { readTextSize as read, applyTextSize } from '../utils/textSize'
import { savePrefs } from '../utils/uiPrefs'
import { usePrefsRefresh } from '../hooks/usePrefsRefresh'
import { useT } from '../utils/lang'

// Settings > Text size (Oct 27, Jade). Saved on this phone and on the account (Nov 1).
const CHOICES = [
  { k: 'normal', label: 'Normal', size: '1rem' },
  { k: 'large', label: 'Large', size: '1.2rem' },
  { k: 'larger', label: 'Larger', size: '1.4rem' },
  { k: 'largest', label: 'Largest', size: '1.6rem' },
]

export default function TextSizePicker() {
  const t = useT()
  const [size, setSize] = useState(read())
  usePrefsRefresh(() => setSize(read()))
  function choose(k) { applyTextSize(k); setSize(k); savePrefs({ text: k }) }
  return (
    <div className="profile-details" style={{ marginBottom: '1rem' }}>
      <div className="detail-section-header" id="textsize-h">{t('Text size')}</div>
      <div role="radiogroup" aria-labelledby="textsize-h" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr))', gap: '0.5rem', padding: '0.5rem 1rem 0.25rem' }}>
        {CHOICES.map((c) => (
          <button key={c.k} type="button" role="radio" aria-checked={size === c.k} onClick={() => choose(c.k)}
            style={{ minHeight: 56, borderRadius: 12, cursor: 'pointer', font: 'inherit', fontWeight: 700, fontSize: c.size, padding: '0.4rem', minWidth: 0, lineHeight: 1.15,
              border: '2px solid ' + (size === c.k ? 'var(--accent)' : 'var(--border)'),
              background: size === c.k ? 'var(--green-light)' : 'var(--surface-2)', color: 'var(--text)' }}>
            {t(c.label)}
          </button>
        ))}
      </div>
      <p style={{ margin: 0, padding: '0.25rem 1rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('Makes all the words and buttons bigger, everywhere in the app.')}</p>
    </div>
  )
}
