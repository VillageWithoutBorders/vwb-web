import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

// The Villages section of the Messages hub: Announcements, the village chats
// you joined, and the Ambassadors room for people who can open it. The
// database decides which boards a person can read, so this lists only what
// comes back. Nothing here shows who is in a village.
export default function HubVillages() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [boards, setBoards] = useState(null)
  const [mine, setMine] = useState(new Set())
  const [unread, setUnread] = useState({})
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      const [b, m, u] = await Promise.all([
        supabase.from('campfire_boards').select('id, name, village_id, is_general, sort_order').eq('archived', false),
        supabase.from('village_members').select('village_id').eq('user_id', user.id),
        supabase.rpc('campfire_unread'),
      ])
      if (!alive) return
      if (b.error) { console.error('Failed to load village boards:', b.error); setFailed(true); setBoards([]); return }
      if (m.error) console.error('Failed to load your villages:', m.error)
      if (u.error) console.error('Failed to load unread village chats:', u.error)
      setMine(new Set((m.data || []).map((r) => r.village_id)))
      const map = {}
      for (const r of u.data || []) map[r.board_id] = Number(r.unread)
      setUnread(map)
      setBoards(b.data || [])
    }
    load()
    const t = setInterval(load, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [user.id])

  const general = (boards || []).filter((b) => b.is_general)
  const villages = (boards || []).filter((b) => b.village_id && mine.has(b.village_id)).sort((a, b) => a.name.localeCompare(b.name))
  const rooms = (boards || []).filter((b) => !b.is_general && !b.village_id)

  function card(b, icon, note) {
    const n = unread[b.id] || 0
    return (
      <button key={b.id} type="button" className="cal-card" style={{ width: '100%', textAlign: 'left', minHeight: '44px', marginBottom: '0.6rem' }}
        aria-label={b.name + (n ? ', ' + n + ' new' : '')} onClick={() => navigate('/campfire?board=' + b.id)}>
        <span className="cal-card-title"><span aria-hidden="true">{icon}</span> {b.name}{n > 0 && <span style={{ marginLeft: '0.5rem', color: '#4ecca3', fontWeight: 700 }}>{n > 9 ? '9+' : n} new</span>}</span>
        <span className="cal-card-meta">{note}</span>
      </button>
    )
  }

  return (
    <div className="cal-page" style={{ maxWidth: '100%', boxSizing: 'border-box', overflowWrap: 'anywhere' }}>
      <p className="cal-sub" style={{ marginTop: 0 }}>Announcements are for everyone. A village chat can be read only by the neighbors who joined it.</p>
      {boards === null && <p className="cal-empty">Loading...</p>}
      {failed && <p className="cal-error">We could not load your village chats. Check your connection and try again.</p>}
      {general.map((b) => card(b, '📣', 'Updates from VWB. Read only.'))}
      {villages.map((b) => card(b, '🏘️', 'Your village chat'))}
      {rooms.map((b) => card(b, '🔥', 'A private room for Ambassadors'))}
      {boards !== null && !failed && villages.length === 0 && (
        <p className="cal-empty">{profile?.zip_code ? 'You have not joined a village chat yet.' : 'Add your zip code on your Profile to find your village chat.'}</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
        {!profile?.zip_code && (
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/profile')}>Go to my Profile</button>
        )}
        <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/find-village')}>Find, join, or start a village chat</button>
        <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/villages')}>See the village map</button>
      </div>
    </div>
  )
}
