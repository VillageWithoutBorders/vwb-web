import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { askConfirm } from './AdminDialog'
import { useT, getLang } from '../utils/lang'

// Inside a village Campfire (GroupBoard). Picked Campfires are 'sidechat' in the database. Shows:
// - "Still taking part?" when you have been asked.
// - For the person who started it: who is asking to join, Shown or Hidden,
//   and quiet members (removable 7 days after they were asked).
// - Add a neighbor from this village (Campfire: active members; Picked: its starter).
// Renders nothing for chats that are not tied to a village.
export default function VillageRoomPanel({ groupId, onInfo, onLeave, onChanged }) {
  const t = useT()
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
    const timer = setTimeout(() => {
      supabase.rpc('village_people', { p_village: room.village_id, p_search: search.trim() || null, p_limit: 30 }).then(({ data, error }) => {
        if (!alive) return
        if (error) { console.error('Failed to load neighbors:', error); return }
        setPeople(data || [])
      })
    }, 250)
    return () => { alive = false; clearTimeout(timer) }
  }, [adding, search, room])

  async function run(key, fn, ok) {
    setBusy(key); setNote('')
    const { data, error } = await fn()
    setBusy('')
    if (error) { console.error('Village room action failed:', error); setNote(t("We couldn't do that. Try again.")); return null }
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
          <p style={{ margin: 0 }}>{t('Still taking part? It has been two weeks since you posted or sparked here.')}</p>
          <div style={row}>
            <button type="button" className="btn btn-primary" style={small} disabled={busy === 'stay'} onClick={() => run('stay', () => supabase.rpc('still_in_village_campfire', { p_group: groupId }), t('Thanks. You are still in.'))}>{t("Yes, I'm still here")}</button>
            <button type="button" className="btn btn-outline" style={small} onClick={onLeave}>{t('Leave')}</button>
          </div>
        </div>
      )}

      {room.i_started && room.kind === 'campfire' && (
        <div style={bar}>
          <div style={row}>
            <span style={{ flex: 1, minWidth: '10rem' }}>{room.shown ? t('Shown: neighbors in {village} can find it and ask to join.', { village: room.village_name }) : t('Hidden: only people in it can see it.')}</span>
            <button type="button" className="btn btn-outline" style={small} disabled={busy === 'shown'}
              onClick={() => run('shown', () => supabase.rpc('set_village_campfire_shown', { p_group: groupId, p_shown: !room.shown }), room.shown ? t('Now hidden.') : t('Now shown.'))}>
              {room.shown ? t('Make it hidden') : t('Make it shown')}
            </button>
          </div>
          {asks.map((a) => (
            <div key={a.user_id} style={row}>
              <span style={{ flex: 1, minWidth: '8rem' }}>{t('{name} asked to join', { name: a.display_name })}</span>
              <button type="button" className="btn btn-primary" style={small} disabled={busy === 'y' + a.user_id} onClick={() => run('y' + a.user_id, () => supabase.rpc('answer_village_campfire_ask', { p_group: groupId, p_user: a.user_id, p_accept: true }), t('{name} is in.', { name: a.display_name }))}>{t('Say yes')}</button>
              <button type="button" className="btn btn-outline" style={small} disabled={busy === 'n' + a.user_id} onClick={() => run('n' + a.user_id, () => supabase.rpc('answer_village_campfire_ask', { p_group: groupId, p_user: a.user_id, p_accept: false }), t('Okay. They were not added.'))}>{t('Not now')}</button>
            </div>
          ))}
          {quiet.map((q) => (
            <div key={q.user_id} style={row}>
              <span style={{ flex: 1, minWidth: '8rem' }}>{q.can_remove
                ? t('{name} was asked "Still taking part?" on {date} and has not answered.', { name: q.display_name, date: new Date(q.asked_at).toLocaleDateString(getLang() === 'es' ? 'es-US' : undefined, { month: 'short', day: 'numeric' }) })
                : t('{name} was asked "Still taking part?" on {date}. You can remove them after 7 days with no answer.', { name: q.display_name, date: new Date(q.asked_at).toLocaleDateString(getLang() === 'es' ? 'es-US' : undefined, { month: 'short', day: 'numeric' }) })}</span>
              {q.can_remove && (
                <button type="button" className="btn btn-outline" style={small} disabled={busy === 'r' + q.user_id}
                  onClick={async () => { if (await askConfirm(t('Take {name} out of this Campfire? They can ask to join again.', { name: q.display_name }), { yes: t('Take out'), danger: true })) run('r' + q.user_id, () => supabase.rpc('remove_quiet_campfire_member', { p_group: groupId, p_user: q.user_id }), (d) => (d === 'removed' ? t('{name} was taken out.', { name: q.display_name }) : t('Not yet.'))) }}>{t('Remove')}</button>
              )}
            </div>
          ))}
        </div>
      )}

      {room.i_can_add && (
        <div style={bar}>
          {!adding
            ? <button type="button" className="btn btn-outline btn-full" style={{ minHeight: 44 }} onClick={() => setAdding(true)}>{t('Add a neighbor from {village}', { village: room.village_name })}</button>
            : <>
                <label htmlFor="vrp-search" className="sr-only">{t('Search neighbors')}</label>
                <input id="vrp-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search neighbors in {village}', { village: room.village_name })} autoComplete="off"
                  style={{ minHeight: 48, fontSize: '1rem', padding: '0 12px', borderRadius: 12, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)' }} />
                {people.map((p) => (
                  <div key={p.user_id} style={row}>
                    <span style={{ flex: 1 }}>{p.display_name || t('A neighbor')}</span>
                    <button type="button" className="btn btn-primary" style={small} disabled={busy === 'a' + p.user_id}
                      onClick={() => run('a' + p.user_id, () => supabase.rpc('add_to_village_room', { p_group: groupId, p_user: p.user_id }),
                        (d) => (d === 'added' ? (p.display_name ? t('{name} was added.', { name: p.display_name }) : t('They were added.')) : d === 'already' ? t('Already in.') : d === 'notactive' ? t('Only active members can add people.') : t("You can't add this person.")))}>{t('Add')}</button>
                  </div>
                ))}
                <button type="button" className="btn btn-outline" style={small} onClick={() => { setAdding(false); setSearch('') }}>{t('Done')}</button>
              </>}
        </div>
      )}
      {note && <p role="status" style={{ margin: 0, padding: '0.4rem 1rem', color: 'var(--accent)', fontSize: '0.9rem' }}>{note}</p>}
    </div>
  )
}
