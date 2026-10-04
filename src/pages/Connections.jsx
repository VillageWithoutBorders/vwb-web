import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import AvatarDisplay, { UserName } from '../components/AvatarDisplay'

const WHY = {
  messaged: 'Messaged',
  task: 'Helped on a task',
  vouched: 'Vouched',
  group: 'Same group',
}

const FILTERS = [
  { key: 'all', label: 'Everyone' },
  { key: 'messaged', label: 'Messaged' },
  { key: 'task', label: 'Tasks' },
  { key: 'vouched', label: 'Vouches' },
  { key: 'group', label: 'Groups' },
]

function sinceText(iso) {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days < 1) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return days + ' days ago'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const chip = (on) => ({
  minHeight: 44, padding: '0 0.9rem', borderRadius: 22, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
  border: '1px solid ' + (on ? '#4ecca3' : '#444'), background: on ? '#4ecca3' : 'none', color: on ? '#1a1a1a' : '#ccc',
})

export default function Connections() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    supabase.rpc('my_connections').then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('my_connections failed', error); setFailed(true); setRows([]); return }
      setRows(data || [])
    })
    return () => { alive = false }
  }, [])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (rows || []).filter((r) =>
      (filter === 'all' || (r.reasons || []).includes(filter)) &&
      (!term || (r.display_name || '').toLowerCase().includes(term)))
  }, [rows, filter, q])

  return (
    <div className="cal-page" style={{ maxWidth: '100%', boxSizing: 'border-box', overflowWrap: 'anywhere' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <button type="button" onClick={() => navigate(-1)} aria-label="Back" style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer', minWidth: 44, minHeight: 44 }}>&#8592;</button>
        <h1 style={{ margin: 0 }}>Connections</h1>
      </div>
      <p className="cal-sub">Neighbors you have messaged, helped, vouched for, or shared a group with.</p>

      <label htmlFor="conn-search" style={{ display: 'block', fontWeight: 600, margin: '0.75rem 0 0.25rem' }}>Find someone</label>
      <input
        id="conn-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name"
        autoComplete="off"
        style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, fontSize: 16, padding: '0 0.75rem', borderRadius: 8, border: '1px solid #444', background: '#111', color: '#eee' }}
      />

      <div role="group" aria-label="Filter connections" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.75rem 0' }}>
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} style={chip(filter === f.key)}>{f.label}</button>
        ))}
      </div>

      {rows === null && <p className="cal-empty">Loading...</p>}
      {failed && <p className="cal-error">We could not load your connections. Check your connection and try again.</p>}
      {rows !== null && !failed && rows.length === 0 && (
        <p className="cal-empty">No connections yet. When you message, help, or vouch for a neighbor, they will show up here.</p>
      )}
      {rows !== null && rows.length > 0 && shown.length === 0 && <p className="cal-empty">No one matches.</p>}

      {shown.map((r) => (
        <div key={r.user_id} className="cal-card" style={{ boxSizing: 'border-box', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <AvatarDisplay url={r.avatar_url} userId={r.user_id} size={40} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                <UserName userId={r.user_id} name={r.display_name} style={{ fontWeight: 700 }} />
                {r.is_ambassador && <span style={{ background: '#1a4a3a', color: '#4ecca3', fontSize: '0.7rem', fontWeight: 600, padding: '1px 6px', borderRadius: 4 }}>Ambassador</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.3rem' }}>
                {(r.reasons || []).map((k) => (
                  <span key={k} style={{ background: '#2a2a2a', color: '#ddd', fontSize: '0.75rem', padding: '2px 8px', borderRadius: 10 }}>{WHY[k] || k}</span>
                ))}
              </div>
              {r.last_at && <div style={{ color: '#aaa', fontSize: '0.8rem', marginTop: '0.3rem' }}>{sinceText(r.last_at)}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" onClick={() => navigate(r.conversation_id ? '/conversation/' + r.conversation_id : '/u/' + r.user_id)}
              style={{ minHeight: 44, padding: '0 1rem', borderRadius: 8, border: '1px solid #4ecca3', background: 'none', color: '#4ecca3', fontWeight: 600, cursor: 'pointer' }}>
              {r.conversation_id ? 'Open messages' : 'Say hello'}
            </button>
            <button type="button" onClick={() => navigate('/u/' + r.user_id)}
              style={{ minHeight: 44, padding: '0 1rem', borderRadius: 8, border: '1px solid #444', background: 'none', color: '#ccc', cursor: 'pointer' }}>
              View profile
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
