import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../utils/lang'

// Admin review list for "claim this resource" requests.
export default function AdminResourceClaims({ claims, onChanged }) {
  const t = useT()
  const rows = claims || []
  const [busy, setBusy] = useState(null)
  const [notes, setNotes] = useState({})
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function decide(c, approve) {
    setBusy(c.id); setMsg(''); setErr('')
    const { error } = await supabase.rpc('admin_decide_resource_claim', { p_claim: c.id, p_approve: approve, p_note: notes[c.id] || '' })
    setBusy(null)
    if (error) { console.error('admin_decide_resource_claim', error); setErr(t("Couldn't save that.") + (error.message ? ' ' + t(error.message) : '')); return }
    setMsg(approve ? t('Approved. "{name}" now belongs to {org}.', { name: c.resource_name, org: c.claiming_org }) : t('Turned down.'))
    if (onChanged) onChanged()
  }

  if (rows.length === 0) return msg ? <p role="status" style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>{msg}</p> : null

  return (
    <div style={{ marginBottom: '1rem' }}>
      <p style={{ color: 'var(--warn)', fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.4rem' }}>{t('Resource claims waiting ({n})', { n: rows.length })}</p>
      {rows.map((c) => (
        <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{c.resource_name}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-soft)' }}>{t('Claimed by')} <strong>{c.claiming_org}</strong></div>
          {c.held_by && <div style={{ fontSize: '0.85rem', color: 'var(--gold)' }}>{t('Now listed under {name}. Approving moves it.', { name: c.held_by })}</div>}
          {c.note && <p style={{ margin: '0.4rem 0', fontSize: '0.85rem', color: 'var(--text)', overflowWrap: 'anywhere' }}>"{c.note}"</p>}
          <input value={notes[c.id] || ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} placeholder={t('Note if turning down (optional)')} aria-label={t('Note if turning down')} style={{ width: '100%', boxSizing: 'border-box', minHeight: '44px', padding: '0.4rem 0.6rem', margin: '0.4rem 0', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'var(--surface-sunk)', color: 'var(--text)', fontSize: '1rem' }} />
          <div className="admin-decide" style={{ display: 'flex', gap: '0.5rem' }}>
            <button disabled={busy === c.id} onClick={() => decide(c, true)} style={{ flex: 1, minHeight: '44px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer' }}>{t('Approve')}</button>
            <button disabled={busy === c.id} onClick={() => decide(c, false)} style={{ flex: 1, minHeight: '44px', borderRadius: '8px', border: '1px solid var(--error)', background: 'none', color: 'var(--danger)', fontWeight: 600, cursor: 'pointer' }}>{t('Turn down')}</button>
          </div>
        </div>
      ))}
      {err && <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{err}</p>}
      {msg && <p role="status" style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>{msg}</p>}
    </div>
  )
}
