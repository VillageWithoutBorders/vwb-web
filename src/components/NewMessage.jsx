import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { startConversation } from '../utils/startConversation'

// "New message" on the Messages page. Search finds only people you already
// know on VWB (the database decides, same rule as group invites). Picking
// someone opens your chat with them, or sends a message request if the two
// of you have never talked.
export default function NewMessage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [note, setNote] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2) { setResults([]); setSearched(false); return }
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_people_to_message', { p_query: q.replace(/[%_]/g, '') })
      if (error) { console.error('search_people_to_message', error); setNote("We couldn't search just now. Try again."); return }
      setNote('')
      setResults(data || [])
      setSearched(true)
    }, 300)
    return () => clearTimeout(t)
  }, [query, open])

  function close() {
    setOpen(false)
    setQuery('')
    setResults([])
    setSearched(false)
    setNote('')
  }

  async function pick(person) {
    if (!user || busyId) return
    setBusyId(person.user_id)
    setNote('')
    const { id, error, notice } = await startConversation(user.id, person.user_id)
    setBusyId(null)
    if (error) { setNote(error); return }
    if (notice) { setNote(notice); setQuery(''); setResults([]); setSearched(false); return }
    navigate('/conversation/' + id)
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ width: '100%', minHeight: '48px', marginBottom: '0.75rem', borderRadius: '10px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
        New message
      </button>
    )
  }

  return (
    <section aria-labelledby="new-msg-title" style={{ margin: '0 0 1rem', padding: '0.75rem', border: '1px solid #4ecca3', borderRadius: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <h2 id="new-msg-title" style={{ fontSize: '1rem', margin: 0 }}>New message</h2>
        <button type="button" onClick={close} style={{ minHeight: '44px', padding: '0 0.75rem', background: 'none', border: 'none', color: '#4ecca3', fontSize: '1rem', cursor: 'pointer' }}>Cancel</button>
      </div>
      <label htmlFor="new-msg-search" style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.35rem' }}>Search for someone you know on Village Without Borders</label>
      <input
        id="new-msg-search"
        ref={inputRef}
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Start typing a name"
        style={{ width: '100%', boxSizing: 'border-box', minHeight: '48px', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '1rem' }}
      />
      {results.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {results.map((p) => (
            <li key={p.user_id}>
              <button type="button" disabled={busyId === p.user_id} onClick={() => pick(p)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', minHeight: '52px', padding: '0.4rem 0.5rem', borderRadius: '8px', border: 'none', background: '#222', color: '#fff', fontSize: '1rem', textAlign: 'left', cursor: 'pointer' }}>
                <img src={p.avatar_url || ('https://api.dicebear.com/7.x/thumbs/svg?seed=' + p.user_id)} alt="" width={36} height={36} style={{ borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && results.length === 0 && (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          No match. This search finds people you already know here, such as someone you have messaged, vouched for, or share a group with. To message someone new, open their profile and tap Message.
        </p>
      )}
      {note && <p role="status" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>{note}</p>}
    </section>
  )
}
