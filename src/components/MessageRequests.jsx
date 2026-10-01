import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

// People who asked to message you. Nothing opens until you say yes.
export default function MessageRequests() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(0)
  const [note, setNote] = useState('')

  async function load() {
    if (!user) return
    const { data, error } = await supabase.from('message_requests')
      .select('id, from_user, note, created_at')
      .eq('to_user', user.id).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(20)
    if (error) { console.error('Failed to load message requests:', error); return }
    const ids = [...new Set((data || []).map((r) => r.from_user))]
    let names = {}
    if (ids.length) {
      const { data: ps } = await supabase.from('helper_profiles_public').select('user_id, display_name').in('user_id', ids)
      for (const p of ps || []) names[p.user_id] = p.display_name
    }
    // A blocked sender disappears from helper_profiles_public, so hide those rows.
    setRows((data || []).filter((r) => names[r.from_user] !== undefined).map((r) => ({ ...r, name: names[r.from_user] || 'A neighbor' })))
  }

  useEffect(() => { load() }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function answer(r, accept) {
    setBusy(r.id); setNote('')
    const { data, error } = await supabase.rpc('respond_message_request', { p_id: r.id, p_accept: accept })
    setBusy(0)
    if (error) { console.error('Failed to answer message request:', error); setNote("We couldn't do that. Try again."); await load(); return }
    if (accept && data) { navigate('/conversation/' + data); return }
    await load()
  }

  if (rows.length === 0) return null

  return (
    <section aria-labelledby="msg-requests" style={{ margin: '0 0 1rem', padding: '0.75rem', border: '1px solid #4ecca3', borderRadius: '12px' }}>
      <h2 id="msg-requests" style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>Message requests ({rows.length})</h2>
      <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Nothing opens until you say yes. If you decline, they are not told.</p>
      {rows.map((r) => (
        <div key={r.id} style={{ padding: '0.5rem 0', borderTop: '1px solid #333' }}>
          <div style={{ fontWeight: 700 }}>{r.name}</div>
          {r.note && <div style={{ fontSize: '0.9rem', margin: '0.25rem 0' }}>&ldquo;{r.note}&rdquo;</div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" disabled={busy === r.id} onClick={() => answer(r, true)} style={{ minHeight: '44px', padding: '0 1.25rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer' }}>Accept</button>
            <button type="button" disabled={busy === r.id} onClick={() => answer(r, false)} style={{ minHeight: '44px', padding: '0 1.25rem', borderRadius: '8px', border: '1px solid #888', background: 'none', color: 'inherit', fontWeight: 600, cursor: 'pointer' }}>Decline</button>
          </div>
        </div>
      ))}
      {note && <p role="status" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>{note}</p>}
    </section>
  )
}
