import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

// The offers you posted, with a way to delete each one for good.
export default function MyOffers() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [confirming, setConfirming] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('offers')
      .select('id, title, category, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) { console.error('MyOffers', error); return }
    setRows(data || [])
  }, [user])
  useEffect(() => { load() }, [load])

  async function remove(id) {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('delete_my_offer', { p_offer_id: id })
    setBusy(false)
    if (error) { console.error('delete_my_offer', error); setNote("Couldn't delete it. Try again."); return }
    setConfirming(null)
    setNote('Deleted.')
    load()
  }

  if (rows.length === 0 && !note) return null

  return (
    <section aria-labelledby="my-offers-h" style={{ marginBottom: '1rem' }}>
      <div id="my-offers-h" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ecca3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>My offers</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {rows.map((o) => (
          <li key={o.id} style={{ padding: '0.75rem', background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{o.title}</div>
            <div style={{ fontSize: '0.85rem', color: '#aaa' }}>{o.category} &middot; {new Date(o.created_at).toLocaleDateString()}</div>
            {confirming === o.id ? (
              <div role="alert" style={{ marginTop: '0.5rem' }}>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>Delete this offer for good? It can't be undone.</p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" disabled={busy} onClick={() => remove(o.id)} style={{ flex: 1, minHeight: '48px', borderRadius: '8px', border: 'none', background: '#c0392b', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>{busy ? 'Deleting...' : 'Yes, delete'}</button>
                  <button type="button" onClick={() => setConfirming(null)} style={{ flex: 1, minHeight: '48px', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#ccc', fontSize: '1rem', cursor: 'pointer' }}>Keep it</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => { setNote(''); setConfirming(o.id) }} style={{ marginTop: '0.5rem', minHeight: '44px', padding: '0 1rem', borderRadius: '8px', border: '1px solid #c0392b', background: 'none', color: '#ff7b6b', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }}>Delete offer</button>
            )}
          </li>
        ))}
      </ul>
      {note && <p role="status" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>{note}</p>}
    </section>
  )
}
