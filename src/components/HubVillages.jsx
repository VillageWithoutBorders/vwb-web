import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'
import { useT } from '../utils/lang'

// The Villages section of the Messages hub: Announcements, the village chats
// you joined, and the Ambassadors room for people who can open it. The
// database decides which boards a person can read, so this lists only what
// comes back. Nothing here shows who is in a village.
// Nov 7 (Jade): onOpen (computers, inside Messages) opens the chat beside the list.
export default function HubVillages({ onOpen, selectedId }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [boards, setBoards] = useState(null)
  const [mine, setMine] = useState(new Set())
  const [unread, setUnread] = useState({})
  const [failed, setFailed] = useState(false)
  const t = useT()

  useEffect(() => {
    let alive = true
    async function load() {
      const [b, m, u] = await Promise.all([
        supabase.from('campfire_boards').select('id, name, village_id, is_general, sort_order, sister_a, event_id, closed_at').eq('archived', false),
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
    const timer = setInterval(load, 30000)
    window.addEventListener('vwb:village-read', load)
    return () => { alive = false; clearInterval(timer); window.removeEventListener('vwb:village-read', load) }
  }, [user.id])

  const general = (boards || []).filter((b) => b.is_general)
  const villages = (boards || []).filter((b) => b.village_id && mine.has(b.village_id)).sort((a, b) => a.name.localeCompare(b.name))
  // Nov 19 (Jade): the other chats were all labeled as Ambassador rooms, even the
  // Sister Campfires and Response Camps. Each kind now has its own heading and note.
  const others = (boards || []).filter((b) => !b.is_general && !b.village_id)
  const sisters = others.filter((b) => b.sister_a)
  const camps = others.filter((b) => !b.sister_a && b.event_id)
  const rooms = others.filter((b) => !b.sister_a && !b.event_id)
  const closedNote = t('Closed. You can read it, but not post.')
  const head = (id, text) => <div className="hub-section-head" style={{ marginTop: '1rem' }}><h2 id={id}>{text}</h2></div>

  function card(b, icon, note) {
    const n = unread[b.id] || 0
    return (
      <button key={b.id} type="button" className={'cal-card' + (selectedId && (selectedId === b.id || (selectedId === 'square' && b.is_general)) ? ' hub-row-on' : '')} style={{ width: '100%', textAlign: 'left', minHeight: '44px', marginBottom: '0.6rem', ...(n > 0 ? { borderLeft: '4px solid var(--danger)' } : {}) }}
        aria-current={selectedId === b.id ? 'true' : undefined}
        aria-label={b.name + (n ? ', ' + t('{n} new', { n }) : '')} onClick={() => (onOpen ? onOpen(b.id) : navigate('/village-square?board=' + b.id))}>
        <span className="cal-card-title"><Icon name={icon} /> {b.name}{n > 0 && <span className="hub-tab-count" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{t('{n} new', { n: n > 9 ? '9+' : n })}</span>}</span>
        <span className="cal-card-meta">{note}</span>
      </button>
    )
  }

  return (
    <div className="cal-page" style={{ maxWidth: '100%', boxSizing: 'border-box', overflowWrap: 'anywhere' }}>
      <p className="cal-sub" style={{ marginTop: 0 }}>{t('Announcements are for everyone. A village chat can be read only by the neighbors who joined it.')}</p>
      {boards === null && <p className="cal-empty">{t('Loading...')}</p>}
      {failed && <p className="cal-error">{t('We could not load your village chats. Check your connection and try again.')}</p>}
      {general.map((b) => card(b, '📣', t('Updates from VWB. Read only.')))}
      {villages.map((b) => card(b, '🏘️', t('Your village chat')))}
      {sisters.length > 0 && head('hub-sisters', t('Sister Villages'))}
      {sisters.map((b) => card(b, '🌉', b.closed_at ? closedNote : t('A shared chat for two Sister Villages')))}
      {camps.length > 0 && head('hub-camps', t('Response Camps'))}
      {camps.map((b) => card(b, '⛺', b.closed_at ? closedNote : t('For neighbors helping in this emergency')))}
      {rooms.length > 0 && head('hub-rooms', t('Ambassador rooms'))}
      {rooms.map((b) => card(b, '🗝', t('Only Ambassadors can read this')))}
      {boards !== null && !failed && villages.length === 0 && (
        <p className="cal-empty">{profile?.zip_code ? t('You have not joined a village chat yet.') : t('Add your zip code on your Profile to find your village chat.')}</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
        {!profile?.zip_code && (
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/profile')}>{t('Go to my Profile')}</button>
        )}
        <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/find-village')}>{t('Find, join, or start a village chat')}</button>
        <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/world')}>{t('See the village map')}</button>
      </div>
    </div>
  )
}
