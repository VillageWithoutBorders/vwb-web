import { useState } from 'react'
import { readReadButton, applyReadButton } from '../utils/readButton'
import { savePrefs } from '../utils/uiPrefs'
import { usePrefsRefresh } from '../hooks/usePrefsRefresh'
import { useT } from '../utils/lang'

// Settings > Easy to use > Using: the "Read this to me" button in the full view (Nov 10, Jade).
// Simple view always has it, so this shows only in the full view.
const CHOICES = [
  { k: 'off', label: 'Off' },
  { k: 'on', label: 'On' },
]

export default function ReadButtonPicker() {
  const t = useT()
  const [v, setV] = useState(readReadButton())
  usePrefsRefresh(() => setV(readReadButton()))
  function choose(k) { applyReadButton(k); setV(k); savePrefs({ read: k }) }
  return (
    <div className="profile-details" style={{ marginBottom: '1rem' }}>
      <div className="detail-section-header" id="readbtn-h">{t('Read this to me button')}</div>
      <div role="radiogroup" aria-labelledby="readbtn-h" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem', padding: '0.5rem 1rem 0.25rem' }}>
        {CHOICES.map((c) => (
          <button key={c.k} type="button" role="radio" aria-checked={v === c.k} onClick={() => choose(c.k)}
            data-tip={t(c.k === 'on' ? 'Show the Read this to me button at the top of each page.' : 'Hide the Read this to me button.')}
            style={{ minHeight: 56, borderRadius: 12, cursor: 'pointer', font: 'inherit', fontWeight: 700, fontSize: '1rem', padding: '0.4rem',
              border: '2px solid ' + (v === c.k ? 'var(--accent)' : 'var(--border)'),
              background: v === c.k ? 'var(--green-light)' : 'var(--surface-2)', color: 'var(--text)' }}>
            {t(c.label)}
          </button>
        ))}
      </div>
      <p className="settings-help" style={{ margin: 0, padding: '0.25rem 1rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('Your phone reads the page out loud. Tap any words to read from there.')}</p>
    </div>
  )
}
