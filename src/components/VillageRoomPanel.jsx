import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Inside a village Campfire or Sidechat (GroupBoard). Shows:
// - "Still taking part?" when you have been asked.
// - For the person who started it: who is asking to join, Shown or Hidden,
//   and quiet members (removable 7 days after they were asked).
// - Add a neighbor from this village (Campfire: active members; Sidechat: its starter).
// Renders nothing for chats that are not tied to a village.
export default function VillageRoomPanel({ groupId, onInfo, onLeave, onChanged }) {
  const [room, setRoom] = useState(null)
  const [asks, setAsks] = useState([])
  const [quiet, setQuiet] = useState([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [people, setPeople] = useState([])

  async function load() {
    const { data, error } = await supabase.rpc('village_room_info', { p_group: groupId })
    if (error) { console.error('Failed to load village room:', error); return }
    const r = (data || [])[0] || null
    setRoom(r)
    onInfo?.(r)
    if (r && r.i_started && r.kind === 'campfire') {
      const [a, q] = await Promise.all([
        supabase.rpc('village_campfire_asks_list', { p_group: groupId }),
        supabase.rpc('village_campfire_quiet', { p_group: groupId }),
      ])
      if (a.error) console.error('Failed to load asks:', a.error)
      if (q.error) console.error('Failed to load quiet members:', q.error)
      setAsks(a.data || [])
      setQuiet(q.data || [])
    }
  }
  useEffect(() => { load() }, [groupId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!adding || !room) return
    let alive = true
    const t = setTimeout(() => {
      supabase.rpc('village_people', { p_village: room.village_id, p_search: search.trim() || null, p_limit: 30 }).then(({ data, error }) => {
        if (!alive) return
        if (error) { console.error('Failed to load neighbors:', error); return }
        setPeople(data || [])
      })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [adding, search, room])

  async function run(key, fn, ok) {
    setBusy(key); setNote('')
    const { data, error } = await fn()
    setBusy('')
    if (error) { console.error('Village room action failed:', error); setNote("We couldn't do that. Try again."); return null }
    if (ok) setNote(typeof ok === 'function' ? ok(data) : ok)
    await load()
    onChanged?.()
    return data
  }

  if (!room) return null
  const bar = { padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)', display: 'grid', gap: '0.5rem', fontSize: '0.95rem' }
  const row = { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', minHeight: 44 }
  const small = { minHeight: 44, padding: '0 0.9rem' }

  return (
    <div>
      {room.check_in_waiting && (
        <div style={{ ...bar, background: 'var(--warn-bg)', color: 'var(--gold)' }} role="status">
          <p style={{ margin: 0 }}>Still taking part? It has been two weeks since you posted or sparked here.</p>
          <div style={row}>
            <button type="button" className="btn btn-primary" style={small} disabled={busy === 'stay'} onClick={() => run('stay', () => supabase.rpc('still_in_village_campfire', { p_group: groupId }), 'Thanks. You are still in.')}>Yes, I'm still here</button>
            <button type="button" className="btn btn-outline" style={small} onClick={onLeave}>Leave</button>
          </div>
        </div>
      )}

      {room.i_started && room.kind === 'campfire' && (
        <div style={bar}>
          <div style={row}>
            <span style={{ flex: 1, minWidth: '10rem' }}>{room.shown ? 'Shown: neighbors in ' + room.village_name + ' can find it and ask to join.' : 'Hidden: only people in it can see it.'}</span>
            <button type="button" className="btn btn-outline" style={small} disabled={busy === 'shown'}
              onClick={() => run('shown', () => supabase.rpc('set_village_campfire_shown', { p_group: groupId, p_shown: !room.shown }), room.shown ? 'Now hidden.' : 'Now shown.')}>
              {room.shown ? 'Make it hidden' : 'Make it shown'}
            </button>
          </div>
          {asks.map((a) => (
            <div key={a.user_id} style={row}>
              <span style={{ flex: 1, minWidth: '8rem' }}><b>{a.display_name}</b> asked to join</span>
              <button type="button" className="btn btn-primary" style={small} disabled={busy === 'y' + a.user_id} onClick={() => run('y' + a.user_id, () => supabase.rpc('answer_village_campfire_ask', { p_group: groupId, p_user: a.user_id, p_accept: true }), a.display_name + ' is in.')}>Say yes</button>
              <button type="button" className="btn btn-outline" style={small} disabled={busy === 'n' + a.user_id} onClick={() => run('n' + a.user_id, () => supabase.rpc('answer_village_campfire_ask', { p_group: groupId, p_user: a.user_id, p_accept: false }), 'Okay. They were not added.')}>Not now</button>
            </div>
          ))}
          {quiet.map((q) => (
            <div key={q.user_id} style={row}>
              <span style={{ flex: 1, minWidth: '8rem' }}><b>{q.display_name}</b> was asked "Still taking part?" on {new Date(q.asked_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{q.can_remove ? ' and has not answered.' : '. You can remove them after 7 days with no answer.'}</span>
              {q.can_remove && (
                <button type="button" className="btn btn-outline" style={small} disabled={busy === 'r' + q.user_id}
                  onClick={() => { if (confirm('Take ' + q.display_name + ' out of this Campfire? They can ask to join again.')) run('r' + q.user_id, () => supabase.rpc('remove_quiet_campfire_member', { p_group: groupId, p_user: q.user_id }), (d) => (d === 'removed' ? q.display_name + ' was taken out.' : 'Not yet.')) }}>Remove</button>
              )}
            </div>
          ))}
        </div>
      )}

      {room.i_can_add && (
        <div style={bar}>
          {!adding
            ? <button type="button" className="btn btn-outline btn-full" style={{ minHeight: 44 }} onClick={() => setAdding(true)}>Add a neighbor from {room.village_name}</button>
            : <>
                <label htmlFor="vrp-search" className="sr-only">Search neighbors</label>
                <input id="vrp-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={'Search neighbors in ' + room.village_name} autoComplete="off"
                  style={{ minHeight: 48, fontSize: '1rem', padding: '0 12px', borderRadius: 12, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)' }} />
                {people.map((p) => (
                  <div key={p.user_id} style={row}>
                    <span style={{ flex: 1 }}>{p.display_name || 'A neighbor'}</span>
                    <button type="button" className="btn btn-primary" style={small} disabled={busy === 'a' + p.user_id}
                      onClick={() => run('a' + p.user_id, () => supabase.rpc('add_to_village_room', { p_group: groupId, p_user: p.user_id }),
                        (d) => (d === 'added' ? (p.display_name || 'They') + ' was added.' : d === 'already' ? 'Already in.' : d === 'notactive' ? 'Only active members can add people.' : "You can't add this person."))}>Add</button>
                  </div>
                ))}
                <button type="button" className="btn btn-outline" style={small} onClick={() => { setAdding(false); setSearch('') }}>Done</button>
              </>}
        </div>
      )}
      {note && <p role="status" style={{ margin: 0, padding: '0.4rem 1rem', color: 'var(--accent)', fontSize: '0.9rem' }}>{note}</p>}
    </div>
  )
}
