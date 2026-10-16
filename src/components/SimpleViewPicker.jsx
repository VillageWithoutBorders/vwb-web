import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { saveSimpleView, useSimpleView } from '../utils/simpleView'

// Settings > Simple view. Saved on the account, so it follows you to any phone.
export default function SimpleViewPicker() {
  const { refreshProfile } = useAuth()
  const simple = useSimpleView()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function choose(v) {
    if (v === simple) return
    setBusy(true); setNote('')
    const ok = await saveSimpleView(v)
    if (refreshProfile) await refreshProfile()
    setBusy(false)
    setNote(ok ? '' : "Saved on this phone. We couldn't save it to your account, so try again later.")
  }

  const opt = (v, label, desc) => (
    <button type="button" role="radio" aria-checked={simple === v} disabled={busy} onClick={() => choose(v)}
      style={{ minHeight: 64, borderRadius: 12, cursor: 'pointer', font: 'inherit', textAlign: 'left', padding: '0.6rem 0.8rem',
        border: '2px solid ' + (simple === v ? 'var(--accent)' : 'var(--border)'),
        background: simple === v ? 'var(--green-light)' : 'var(--surface-2)', color: 'var(--text)' }}>
      <b style={{ display: 'block', fontSize: '1rem' }}>{label}</b>
      <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{desc}</span>
    </button>
  )

  return (
    <div className="profile-details" style={{ marginBottom: '1rem' }}>
      <div className="detail-section-header" id="simple-h">Simple view</div>
      <div role="radiogroup" aria-labelledby="simple-h" style={{ display: 'grid', gap: '0.5rem', padding: '0.5rem 1rem 0.25rem' }}>
        {opt(true, 'Simple', 'Bigger words and buttons. Just ask for help, help others, and messages.')}
        {opt(false, 'Everything', 'The full app with villages, the globe, Campfires, and more.')}
      </div>
      <p role="status" style={{ margin: 0, padding: '0.25rem 1rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        {note || 'Saved to your account, so it follows you to any phone.'}
      </p>
    </div>
  )
}
