import { useState } from 'react'
import { readWidth, applyWidth } from '../utils/pageWidth'
import { savePrefs } from '../utils/uiPrefs'
import { usePrefsRefresh } from '../hooks/usePrefsRefresh'
import { useT } from '../utils/lang'

// Settings > Easy to use > Using: Page width (Nov 8, Jade). Shown in Simple view.
const CHOICES = [
  { k: 'calm', label: 'Calm and narrow' },
  { k: 'full', label: 'Fill the screen' },
]

export default function WidthPicker() {
  const t = useT()
  const [w, setW] = useState(readWidth())
  usePrefsRefresh(() => setW(readWidth()))
  function choose(k) { applyWidth(k); setW(k); savePrefs({ width: k }) }
  return (
    <div className="profile-details" style={{ marginBottom: '1rem' }}>
      <div className="detail-section-header" id="width-h">{t('Page width on a computer')}</div>
      <div role="radiogroup" aria-labelledby="width-h" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem', padding: '0.5rem 1rem 0.25rem' }}>
        {CHOICES.map((c) => (
          <button key={c.k} type="button" role="radio" aria-checked={w === c.k} onClick={() => choose(c.k)}
            style={{ minHeight: 56, borderRadius: 12, cursor: 'pointer', font: 'inherit', fontWeight: 700, fontSize: '1rem', padding: '0.4rem',
              border: '2px solid ' + (w === c.k ? 'var(--accent)' : 'var(--border)'),
              background: w === c.k ? 'var(--green-light)' : 'var(--surface-2)', color: 'var(--text)' }}>
            {t(c.label)}
          </button>
        ))}
      </div>
      <p style={{ margin: 0, padding: '0.25rem 1rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('On a big screen, pages can stay narrow and easy to follow, or spread out to use the whole screen. Phones always fit the screen.')}</p>
    </div>
  )
}
