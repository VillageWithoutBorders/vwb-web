import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// A village's Campfires or Sidechats, for the Village page sheet.
// kind: 'campfire' or 'sidechat'. The database decides who sees and does what.
// Campfire: anyone in the village starts one, Shown or Hidden. Shown ones can be asked to join.
// Sidechat: only keepers start one and pick who is in.
export default function VillageRooms({ villageId, kind, isMember, isKeeper, onChanged }) {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [starting, setStarting] = useState(false)
  const [name, setName] = useState('')
  const [shown, setShown] = useState(true)
  const [people, setPeople] = useState([])
  const [picked, setPicked] = useState([])
  const [search, setSearch] = useState('')

  async function load() {
    const { data, error: err } = await supabase.rpc('village_rooms', { p_village: villageId })
    if (err) { console.error('Failed to load village rooms:', err); setError("We couldn't load these. Check your connection and try again."); setRooms([]); return }
    setError('')
    setRooms((data || []).filter((r) => r.kind === kind))
  }
  useEffect(() => { if (isMember) load(); else setRooms([]) }, [villageId, kind, isMember]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sidechat: pick neighbors from this village.
  useEffect(() => {
    if (!starting || kind !== 'sidechat') return
    let alive = true
    const t = setTimeout(() => {
      supabase.rpc('village_people', { p_village: villageId, p_search: search.trim() || null, p_limit: 50 }).then(({ data, error: err }) => {
        if (!alive) return
        if (err) { console.error('Failed to load neighbors:', err); return }
        setPeople(data || [])
      })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [starting, kind, villageId, search])

  async function ask(r) {
    setBusy(r.id); setNote('')
    const { data, error: err } = await supabase.rpc('ask_to_join_village_campfire', { p_group: r.id })
    setBusy('')
    if (err) { console.error('Failed to ask to join:', err); setNote("We couldn't send that. Try again."); return }
    setNote(data === 'asked' ? 'Asked. The person who started it will say yes or no.' : data === 'already' ? 'You are already in.' : "We couldn't send that right now.")
    load()
  }

  async function start(e) {
    e.preventDefault()
    const n = name.trim()
    if (!n) { setNote(kind === 'sidechat' ? 'Give the sidechat a name.' : 'Give the Campfire a name.'); return }
    setBusy('start'); setNote('')
    const { data: newId, error: err } = kind === 'sidechat'
      ? await supabase.rpc('start_village_sidechat', { p_village: villageId, p_name: n, p_members: picked })
      : await supabase.rpc('start_village_campfire', { p_village: villageId, p_name: n, p_shown: shown })
    setBusy('')
    if (err || !newId) {
      console.error('Failed to start:', err)
      setNote(err?.message && err.message.length < 140 && err.code !== 'PGRST202' ? err.message : 'Could not start it. Try again.')
      return
    }
    onChanged?.()
    navigate('/groups/' + newId, { state: { justStarted: true } })
  }

  if (!isMember) return <p>Join this village to see its {kind === 'sidechat' ? 'sidechats' : 'Campfires'}.</p>

  const icon = kind === 'sidechat' ? '\u{1F4AC}' : '\u{1F525}'
  const canStart = kind === 'campfire' || isKeeper

  return <>
    <p className="vs-note">
      {kind === 'sidechat'
        ? 'Sidechats are small scrambled chats a keeper starts for a few neighbors. Only the people in one can see it.'
        : 'Campfires are scrambled chats anyone here can start. Shown ones can be found and asked to join. Hidden ones only show to the people in them.'}
    </p>
    {rooms === null && <p role="status">Loading...</p>}
    {error && <p className="vs-note" role="alert">{error}</p>}
    {rooms && rooms.length === 0 && !error && <p>{kind === 'sidechat' ? 'You are not in a sidechat here yet.' : 'No Campfires here yet. Start the first one.'}</p>}
    {rooms && rooms.map((r) => (
      r.i_am_in
        ? <button key={r.id} type="button" className="vs-row" onClick={() => navigate('/groups/' + r.id)}>
            <span aria-hidden="true">{icon}</span> {r.name}
            <small>
              {r.member_count === 1 ? '1 person' : r.member_count + ' people'}
              {kind === 'campfire' ? (r.shown ? ' · Shown' : ' · Hidden') : ''}
              {r.i_started ? ' · You started it' : ''}
              {r.asks_waiting > 0 ? ' · ' + r.asks_waiting + ' asking to join' : ''}
              {r.check_in_waiting ? ' · Still taking part?' : ''}
            </small>
          </button>
        : <div key={r.id} className="vs-sister">
            <div className="vs-item"><b><span aria-hidden="true">{icon}</span> {r.name}</b><small>{r.member_count === 1 ? '1 person' : r.member_count + ' people'}</small></div>
            <button type="button" className="btn btn-outline btn-full" disabled={busy === r.id || r.i_asked} onClick={() => ask(r)}>
              {r.i_asked ? 'You asked to join' : busy === r.id ? 'Sending...' : 'Ask to join'}
            </button>
          </div>
    ))}
    {note && <p className="vs-note" role="status">{note}</p>}

    {canStart && !starting && (
      <button type="button" className="btn btn-primary btn-full" onClick={() => { setStarting(true); setNote('') }}>
        {kind === 'sidechat' ? 'Start a sidechat' : 'Start a Campfire'}
      </button>
    )}
    {kind === 'sidechat' && !isKeeper && <p className="vs-note">Only a keeper of this village can start a sidechat.</p>}
    {starting && (
      <form onSubmit={start} noValidate style={{ display: 'grid', gap: 10 }}>
        <label htmlFor="vr-name"><b>Name</b></label>
        <input id="vr-name" type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off"
          placeholder={kind === 'sidechat' ? 'Garden crew' : 'Porch talk'}
          style={{ minHeight: 48, fontSize: '1rem', padding: '0 12px', borderRadius: 12, border: '2px solid var(--vs-line)', background: 'var(--vs-card2)', color: 'var(--vs-ink)' }} />
        {kind === 'campfire' && (
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            <legend className="vs-note">Who can find it</legend>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44 }}>
              <input type="radio" name="vr-shown" checked={shown} onChange={() => setShown(true)} style={{ width: 22, height: 22 }} />
              <span><b>Shown</b><br /><small>Neighbors here can see it and ask to join. You say yes or no.</small></span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44 }}>
              <input type="radio" name="vr-shown" checked={!shown} onChange={() => setShown(false)} style={{ width: 22, height: 22 }} />
              <span><b>Hidden</b><br /><small>Only people in it can see it. You add people from inside.</small></span>
            </label>
          </fieldset>
        )}
        {kind === 'sidechat' && <>
          <label htmlFor="vr-search"><b>Who is in it</b></label>
          <input id="vr-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search neighbors here" autoComplete="off"
            style={{ minHeight: 48, fontSize: '1rem', padding: '0 12px', borderRadius: 12, border: '2px solid var(--vs-line)', background: 'var(--vs-card2)', color: 'var(--vs-ink)' }} />
          <div style={{ display: 'grid', gap: 4, maxHeight: '40vh', overflow: 'auto' }}>
            {people.map((p) => (
              <label key={p.user_id} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
                <input type="checkbox" checked={picked.includes(p.user_id)} style={{ width: 22, height: 22 }}
                  onChange={(e) => setPicked((x) => (e.target.checked ? [...x, p.user_id] : x.filter((y) => y !== p.user_id)))} />
                <span>{p.display_name || 'A neighbor'}</span>
              </label>
            ))}
            {people.length === 0 && <p className="vs-note">No neighbors match that.</p>}
          </div>
          <p className="vs-note">{picked.length} picked. You can add more later.</p>
        </>}
        <button type="submit" className="btn btn-primary btn-full" disabled={busy === 'start'}>{busy === 'start' ? 'Starting...' : 'Start it'}</button>
        <button type="button" className="btn btn-outline btn-full" onClick={() => setStarting(false)}>Cancel</button>
      </form>
    )}
  </>
}
