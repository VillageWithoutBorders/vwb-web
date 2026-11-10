import { useState } from 'react'
import { getLang, setLangLocal, useT } from '../utils/lang'
import { savePrefs } from '../utils/uiPrefs'
import { usePrefsRefresh } from '../hooks/usePrefsRefresh'

// Settings > Easy to use: Language (Nov 3). Each choice is written in its own
// language, so anyone can find theirs. Saved on the account like text size.
const CHOICES = [
  { k: 'en', label: 'English' },
  { k: 'es', label: 'Español' },
]

export default function LanguagePicker() {
  const t = useT()
  const [lang, setLang] = useState(getLang())
  const [busy, setBusy] = useState(false)
  usePrefsRefresh(() => setLang(getLang()))
  async function choose(k) {
    if (k === lang || busy) return
    setBusy(true)
    await setLangLocal(k)
    setLang(getLang())
    setBusy(false)
    savePrefs({ lang: k })
  }
  return (
    <div className="profile-details" style={{ marginBottom: '1rem' }}>
      <div className="detail-section-header" id="lang-h">{t('Language')} <span aria-hidden="true">/ {lang === 'es' ? 'Language' : 'Idioma'}</span></div>
      <div role="radiogroup" aria-labelledby="lang-h" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem', padding: '0.5rem 1rem 0.25rem' }}>
        {CHOICES.map((c) => (
          <button key={c.k} type="button" role="radio" aria-checked={lang === c.k} lang={c.k} disabled={busy} onClick={() => choose(c.k)}
            style={{ minHeight: 56, borderRadius: 12, cursor: 'pointer', font: 'inherit', fontWeight: 700, fontSize: '1rem', padding: '0.4rem',
              border: '2px solid ' + (lang === c.k ? 'var(--accent)' : 'var(--border)'),
              background: lang === c.k ? 'var(--green-light)' : 'var(--surface-2)', color: 'var(--text)' }}>
            {c.label}
          </button>
        ))}
      </div>
      <p style={{ margin: 0, padding: '0.25rem 1rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        {t('Spanish is new. Some pages are still in English.')}
      </p>
    </div>
  )
}
