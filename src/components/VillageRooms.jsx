import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import Icon from './Icon'
import { useT } from '../utils/lang'

// A village's Campfires, for the Village page sheet and keeper tools.
// Every small group chat in a village is a Campfire. Three ways to start one:
// Shown (neighbors can ask to join), Hidden (only people in it see it),
// and Picked (keepers only: the keeper chooses who is in).
// Picked ones are stored as kind 'sidechat' in the database. People only see the word Campfire.
// The database decides who sees and does what.
export default function VillageRooms({ villageId, isMember, isKeeper, onChanged }) {
  const navigate = useNavigate()
  const t = useT()
  const [rooms, setRooms] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [starting, setStarting] = useState(false)
  const [name, setName] = useState('')
  const [mode, setMode] = useState('shown')
  const [people, setPeople] = useState([])
  const [picked, setPicked] = useState([])
  const [search, setSearch] = useState('')

  async function load() {
    const { data, error: err } = await supabase.rpc('village_rooms', { p_village: villageId })
    if (err) { console.error('Failed to load village rooms:', err); setError(t("We couldn't load these. Check your connection and try again.")); setRooms([]); return }
    setError('')
    setRooms(data || [])
  }
  useEffect(() => { if (isMember) load(); else setRooms([]) }, [villageId, isMember]) // eslint-disable-line react-hooks/exhaustive-deps

  // Picked: the keeper chooses neighbors from this village.
  useEffect(() => {
    if (!starting || mode !== 'picked') return
    let alive = true
    const timer = setTimeout(() => {
      supabase.rpc('village_people', { p_village: villageId, p_search: search.trim() || null, p_limit: 50 }).then(({ data, error: err }) => {
        if (!alive) return
        if (err) { console.error('Failed to load neighbors:', err); return }
        setPeople(data || [])
      })
    }, 250)
    return () => { alive = false; clearTimeout(timer) }
  }, [starting, mode, villageId, search])

  async function ask(r) {
    setBusy(r.id); setNote('')
    const { data, error: err } = await supabase.rpc('ask_to_join_village_campfire', { p_group: r.id })
    setBusy('')
    if (err) { console.error('Failed to ask to join:', err); setNote(t("We couldn't send that. Try again.")); return }
    setNote(data === 'asked' ? t('Asked. The person who started it will say yes or no.') : data === 'already' ? t('You are already in.') : t("We couldn't send that right now."))
    load()
  }

  async function start(e) {
    e.preventDefault()
    const n = name.trim()
    if (!n) { setNote(t('Give the Campfire a name.')); return }
    setBusy('start'); setNote('')
    const { data: newId, error: err } = mode === 'picked'
      ? await supabase.rpc('start_village_sidechat', { p_village: villageId, p_name: n, p_members: picked })
      : await supabase.rpc('start_village_campfire', { p_village: villageId, p_name: n, p_shown: mode === 'shown' })
    setBusy('')
    if (err || !newId) {
      console.error('Failed to start:', err)
      setNote(err?.message && err.message.length < 140 && err.code !== 'PGRST202' ? t(err.message) : t('Could not start it. Try again.'))
      return
    }
    onChanged?.()
    navigate('/groups/' + newId, { state: { justStarted: true } })
  }

  if (!isMember) return <p>{t('Join this village to see its Campfires.')}</p>

  const icon = '\u{1F525}'
  const whoCanFind = (r) => ' · ' + (r.kind === 'sidechat' ? t('Picked by the keeper') : r.shown ? t('Shown') : t('Hidden'))

  return <>
    <p className="vs-note">
      {t('Campfires are small scrambled chats anyone here can start. Shown ones can be found and asked to join. Hidden ones only show to the people in them.')}
      {isKeeper ? ' ' + t('As a keeper, you can also start one and pick who is in.') : ''}
    </p>
    {rooms === null && <p role="status">{t('Loading...')}</p>}
    {error && <p className="vs-note" role="alert">{error}</p>}
    {rooms && rooms.length === 0 && !error && <p>{t('No Campfires here yet. Start the first one.')}</p>}
    {rooms && rooms.map((r) => (
      r.i_am_in
        ? <button key={r.id} type="button" className="vs-row" onClick={() => navigate('/groups/' + r.id)}>
            <span aria-hidden="true"><Icon name={icon} /></span> {r.name}
            <small>
              {r.member_count === 1 ? t('1 person') : t('{n} people', { n: r.member_count })}
              {whoCanFind(r)}
              {r.i_started ? ' · ' + t('You started it') : ''}
              {r.asks_waiting > 0 ? ' · ' + t('{n} asking to join', { n: r.asks_waiting }) : ''}
              {r.check_in_waiting ? ' · ' + t('Still taking part?') : ''}
            </small>
          </button>
        : <div key={r.id} className="vs-sister">
            <div className="vs-item"><b><span aria-hidden="true"><Icon name={icon} /></span> {r.name}</b><small>{r.member_count === 1 ? t('1 person') : t('{n} people', { n: r.member_count })}</small></div>
            <button type="button" className="btn btn-outline btn-full" disabled={busy === r.id || r.i_asked} onClick={() => ask(r)}>
              {r.i_asked ? t('You asked to join') : busy === r.id ? t('Sending...') : t('Ask to join')}
            </button>
          </div>
    ))}
    {note && <p className="vs-note" role="status">{note}</p>}

    {!starting && (
      <button type="button" className="btn btn-primary btn-full" onClick={() => { setStarting(true); setNote('') }}>
        {t('Start a Campfire')}
      </button>
    )}
    {starting && (
      <form onSubmit={start} noValidate style={{ display: 'grid', gap: 10 }}>
        <label htmlFor="vr-name"><b>{t('Name')}</b></label>
        <input id="vr-name" type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off"
          placeholder={mode === 'picked' ? t('Garden crew') : t('Porch talk')}
          style={{ minHeight: 48, fontSize: '1rem', padding: '0 12px', borderRadius: 12, border: '2px solid var(--vs-line)', background: 'var(--vs-card2)', color: 'var(--vs-ink)' }} />
        {(
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            <legend className="vs-note">{t('Who can find it')}</legend>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44 }}>
              <input type="radio" name="vr-shown" checked={mode === 'shown'} onChange={() => setMode('shown')} style={{ width: 22, height: 22 }} />
              <span><b>{t('Shown')}</b><br /><small>{t('Neighbors here can see it and ask to join. You say yes or no.')}</small></span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44 }}>
              <input type="radio" name="vr-shown" checked={mode === 'hidden'} onChange={() => setMode('hidden')} style={{ width: 22, height: 22 }} />
              <span><b>{t('Hidden')}</b><br /><small>{t('Only people in it can see it. You add people from inside.')}</small></span>
            </label>
            {isKeeper && (
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44 }}>
                <input type="radio" name="vr-shown" checked={mode === 'picked'} onChange={() => setMode('picked')} style={{ width: 22, height: 22 }} />
                <span><b>{t('Picked')}</b><br /><small>{t('Keepers only. You choose who is in. Only they can see it.')}</small></span>
              </label>
            )}
          </fieldset>
        )}
        {mode === 'picked' && <>
          <label htmlFor="vr-search"><b>{t('Who is in it')}</b></label>
          <input id="vr-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search neighbors here')} autoComplete="off"
            style={{ minHeight: 48, fontSize: '1rem', padding: '0 12px', borderRadius: 12, border: '2px solid var(--vs-line)', background: 'var(--vs-card2)', color: 'var(--vs-ink)' }} />
          <div style={{ display: 'grid', gap: 4, maxHeight: '40vh', overflow: 'auto' }}>
            {people.map((p) => (
              <label key={p.user_id} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
                <input type="checkbox" checked={picked.includes(p.user_id)} style={{ width: 22, height: 22 }}
                  onChange={(e) => setPicked((x) => (e.target.checked ? [...x, p.user_id] : x.filter((y) => y !== p.user_id)))} />
                <span>{p.display_name || t('A neighbor')}</span>
              </label>
            ))}
            {people.length === 0 && <p className="vs-note">{t('No neighbors match that.')}</p>}
          </div>
          <p className="vs-note">{t('{n} picked. You can add more later.', { n: picked.length })}</p>
        </>}
        <button type="submit" className="btn btn-primary btn-full" disabled={busy === 'start'}>{busy === 'start' ? t('Starting...') : t('Start it')}</button>
        <button type="button" className="btn btn-outline btn-full" onClick={() => setStarting(false)}>{t('Cancel')}</button>
      </form>
    )}
  </>
}
