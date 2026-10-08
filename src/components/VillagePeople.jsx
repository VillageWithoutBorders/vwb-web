import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import AvatarDisplay, { UserName } from './AvatarDisplay'
import VouchButton from './VouchButton'

// Must match the list inside request_village_member_removal (vwb-village-chats-v2.sql).
const REMOVE_REASONS = [
  'Unsafe or threatening behavior',
  'Harassing or bullying members',
  'Scam, spam, or asking for money',
  'Fake or pretend account',
  'Not part of this village',
  'Something else',
]

const btn = { minHeight: '44px', padding: '0 0.9rem', borderRadius: '999px', border: '1px solid #444', background: '#222', color: '#ddd', cursor: 'pointer', fontSize: '0.85rem' }

// Notice at the top of a village chat when neighbors have just joined.
// It is a quiet banner, not a push notification. Dismissing it is remembered on this device.
export function VillageNewMembers({ villageId, myId }) {
  const key = 'vwb_village_joiners_seen_' + myId + '_' + villageId
  const [rows, setRows] = useState([])
  const [seen, setSeen] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
  })

  useEffect(() => {
    let alive = true
    setRows([])
    supabase.rpc('village_new_members', { p_village: villageId }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load new members:', error); return }
      setRows(data || [])
    })
    try { setSeen(JSON.parse(localStorage.getItem(key) || '[]')) } catch { setSeen([]) }
    return () => { alive = false }
  }, [villageId])

  const fresh = rows.filter(r => !seen.includes(r.user_id))
  if (fresh.length === 0) return null

  function dismiss() {
    const next = [...new Set([...seen, ...fresh.map(r => r.user_id)])].slice(-200)
    setSeen(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
  }

  const names = fresh.slice(0, 3).map(r => r.display_name || 'A neighbor')
  const more = fresh.length - names.length
  const text = (more > 0 ? names.join(', ') + ' and ' + more + ' more' : names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0]) + (fresh.length === 1 ? ' just joined.' : ' just joined.')

  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#16302a', borderBottom: '1px solid #234', color: '#bfe8d9', fontSize: '0.9rem' }}>
      <span aria-hidden="true">&#127793;</span>
      <span style={{ flex: 1 }}>{text} Say hello.</span>
      <button type="button" onClick={dismiss} aria-label="Dismiss new member notice" style={{ background: 'none', border: 'none', color: '#bfe8d9', cursor: 'pointer', minWidth: '44px', minHeight: '44px', fontSize: '1.1rem' }}>&#10005;</button>
    </div>
  )
}

// The list of people in a village chat, with vouching and the two-member removal.
export default function VillagePeople({ villageId, villageName, myId, isAdmin, requests, onRequestsChange, onClose, onLeave, onKeeperChange }) {
  const [keepers, setKeepers] = useState({ starter_id: null, i_am_starter: false, helper_ids: [] })
  const [search, setSearch] = useState('')
  const [people, setPeople] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [reasonFor, setReasonFor] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function load(term) {
    const { data, error } = await supabase.rpc('village_people', { p_village: villageId, p_search: term || null, p_limit: 100 })
    if (error) { console.error('Failed to load the people in this chat:', error); setNote('Could not load the list. Try again.'); setLoading(false); return }
    setPeople(data || [])
    setTotal(data?.[0] ? Number(data[0].total) : 0)
    setLoading(false)
  }

  async function loadKeepers() {
    const { data, error } = await supabase.rpc('village_keepers_info', { p_village: villageId })
    if (error) { console.error('Failed to load village keepers:', error); return }
    const row = Array.isArray(data) ? data[0] : data
    if (row) setKeepers({ starter_id: row.starter_id, i_am_starter: !!row.i_am_starter, helper_ids: row.helper_ids || [] })
  }
  useEffect(() => { loadKeepers() }, [villageId])

  async function setHelper(targetId, on) {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('set_village_helper', { p_village: villageId, p_user: targetId, p_on: on })
    setBusy(false)
    if (error) { console.error('Helper change failed:', error); setNote(error.message || 'Could not do that. Try again.'); return }
    setNote(on ? 'They can now pin announcements.' : 'They are no longer a helper.')
    loadKeepers(); onKeeperChange?.()
  }

  async function handOff(targetId, name) {
    if (!confirm('Hand this village to ' + (name || 'this person') + '? They will keep it from now on. You stay a member.')) return
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('hand_off_village', { p_village: villageId, p_user: targetId })
    setBusy(false)
    if (error) { console.error('Hand off failed:', error); setNote(error.message || 'Could not do that. Try again.'); return }
    setNote('Done. ' + (name || 'They') + ' now keeps this village.')
    loadKeepers(); onKeeperChange?.()
  }

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => load(search.trim()), search ? 250 : 0)
    return () => clearTimeout(t)
  }, [villageId, search])

  const pendingFor = (uid) => requests.find(r => r.target_id === uid)

  async function ask(targetId) {
    if (!reason) { setNote('Pick a reason first.'); return }
    setBusy(true); setNote('')
    const { data, error } = await supabase.rpc('request_village_member_removal', { p_village: villageId, p_target: targetId, p_reason: reason })
    setBusy(false)
    if (error) { console.error('Removal request failed:', error); setNote(error.message || 'Could not do that. Try again.'); return }
    setReasonFor(null); setReason('')
    setNote(data === 'removed' ? 'They were removed from this chat.' : 'Asked. It takes a second member to agree. They are not told.')
    onRequestsChange?.()
    load(search.trim())
  }

  async function agree(targetId) {
    if (!confirm('Agree to remove this person from the village chat? Only agree if you have seen a real reason.')) return
    setBusy(true); setNote('')
    const { data, error } = await supabase.rpc('request_village_member_removal', { p_village: villageId, p_target: targetId, p_reason: null })
    setBusy(false)
    if (error) { console.error('Removal agree failed:', error); setNote(error.message || 'Could not do that. Try again.'); return }
    setNote(data === 'removed' ? 'They were removed from this chat.' : 'Saved.')
    onRequestsChange?.()
    load(search.trim())
  }

  async function takeBack(targetId) {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('cancel_village_removal', { p_village: villageId, p_target: targetId })
    setBusy(false)
    if (error) { console.error('Take back failed:', error); setNote('Could not take that back. Try again.'); return }
    onRequestsChange?.()
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} />
      <div role="dialog" aria-label={'People in ' + villageName} style={{ position: 'fixed', top: 0, right: 0, width: 'min(340px, 100%)', height: '100%', boxSizing: 'border-box', background: '#1a1a1a', borderLeft: '1px solid #333', zIndex: 1000, overflowY: 'auto', padding: '1.25rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>People in {villageName}{total ? ' (' + total + ')' : ''}</h2>
          <button type="button" onClick={onClose} aria-label="Close the list of people" style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.5rem', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}>&#10005;</button>
        </div>
        <p style={{ margin: '0 0 0.75rem', color: '#aaa', fontSize: '0.85rem', lineHeight: 1.4 }}>Tap a name to open their profile. Tap the arrow to vouch for them or ask to remove them. A vouch means you trust them. It does not guarantee they are safe.</p>

        {keepers.i_am_starter && (
          <p style={{ margin: '0 0 0.75rem', padding: '0.6rem 0.75rem', border: '1px solid #665', borderRadius: '10px', background: '#241f14', color: '#ffcc66', fontSize: '0.85rem', lineHeight: 1.4 }}>You keep this village. You can pin announcements, name up to 2 helpers, or hand it to someone else. Open a name to do that.</p>
        )}

        {requests.length > 0 && (
          <div style={{ margin: '0 0 1rem', padding: '0.75rem', border: '1px solid #665', borderRadius: '10px', background: '#241f14' }}>
            <div style={{ fontWeight: 700, color: '#ffcc66', fontSize: '0.9rem', marginBottom: '0.4rem' }}>A second member is needed</div>
            {requests.map(r => (
              <div key={r.target_id} style={{ padding: '0.5rem 0', borderTop: '1px solid #3a3020' }}>
                <p style={{ margin: 0, color: '#eee', fontSize: '0.9rem' }}>A member asked to remove <strong>{r.target_name || 'someone'}</strong>.</p>
                <p style={{ margin: '0.2rem 0 0.4rem', color: '#bbb', fontSize: '0.85rem' }}>Reason: {r.reason}</p>
                {r.requested_by === myId
                  ? <button type="button" style={btn} disabled={busy} onClick={() => takeBack(r.target_id)}>Take back my request</button>
                  : <button type="button" style={{ ...btn, borderColor: '#ff8844', color: '#ffb088' }} disabled={busy} onClick={() => agree(r.target_id)}>I agree. Remove them</button>}
              </div>
            ))}
          </div>
        )}

        <label htmlFor="vp-search" className="sr-only">Search people in this chat</label>
        <input id="vp-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" autoComplete="off" style={{ width: '100%', boxSizing: 'border-box', minHeight: '44px', padding: '0 0.75rem', marginBottom: '0.6rem', background: '#222', border: '1px solid #333', borderRadius: '8px', color: '#eee', fontSize: '1rem' }} />
        {note && <p role="status" style={{ margin: '0 0 0.6rem', color: '#ffcc66', fontSize: '0.85rem' }}>{note}</p>}
        {loading && <p style={{ color: '#888', fontSize: '0.85rem' }}>Loading...</p>}
        {!loading && people.length === 0 && <p style={{ color: '#8a8a8a', fontSize: '0.85rem', textAlign: 'center', padding: '0.75rem 0' }}>{search ? 'No one matches "' + search + '".' : 'No one else is here yet.'}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {people.map(p => {
            const me = p.user_id === myId
            const open = openId === p.user_id
            const protectedRole = p.role === 'admin' || p.role === 'founder' || p.is_hope_ambassador
            const pending = pendingFor(p.user_id)
            return (
              <div key={p.user_id} style={{ borderRadius: '8px', background: '#222', padding: '0.4rem 0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AvatarDisplay url={p.avatar_url} userId={p.user_id} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                      <UserName userId={p.user_id} name={p.display_name || 'Neighbor'} style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600 }} />
                      {me && <span style={{ fontSize: '0.65rem', color: '#aaa' }}>(you)</span>}
                      {p.role === 'founder' && <span style={{ fontSize: '0.6rem', background: '#3a1a4a', color: '#c77dff', padding: '0 4px', borderRadius: '3px' }}>Founder</span>}
                      {p.role === 'admin' && <span style={{ fontSize: '0.6rem', background: '#1a3a5a', color: '#66aaff', padding: '0 4px', borderRadius: '3px' }}>Admin</span>}
                      {p.is_hope_ambassador && <span style={{ fontSize: '0.6rem', background: '#1a4a3a', color: '#4ecca3', padding: '0 4px', borderRadius: '3px' }}>Ambassador</span>}
                      {p.user_id === keepers.starter_id && <span style={{ fontSize: '0.6rem', background: '#4a3a1a', color: '#ffcc66', padding: '0 4px', borderRadius: '3px' }}>Keeper</span>}
                      {keepers.helper_ids.includes(p.user_id) && <span style={{ fontSize: '0.6rem', background: '#4a3a1a', color: '#ffcc66', padding: '0 4px', borderRadius: '3px' }}>Helper</span>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#999' }}>Joined {new Date(p.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  </div>
                  {!me && (
                    <button type="button" aria-expanded={open} aria-label={'Options for ' + (p.display_name || 'this neighbor')} onClick={() => { setOpenId(open ? null : p.user_id); setReasonFor(null); setReason(''); setNote('') }} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', minWidth: '44px', minHeight: '44px', fontSize: '1rem' }}>{open ? '▲' : '▼'}</button>
                  )}
                </div>
                {open && !me && (
                  <div style={{ padding: '0.25rem 0.25rem 0.5rem' }}>
                    <VouchButton userId={p.user_id} name={p.display_name} size="sm" allowPersonal />
                    {keepers.i_am_starter && (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        {keepers.helper_ids.includes(p.user_id)
                          ? <button type="button" style={btn} disabled={busy} onClick={() => setHelper(p.user_id, false)}>Remove as helper</button>
                          : <button type="button" style={btn} disabled={busy} onClick={() => setHelper(p.user_id, true)}>Make an announcement helper</button>}
                        <button type="button" style={btn} disabled={busy} onClick={() => handOff(p.user_id, p.display_name)}>Hand the village to them</button>
                      </div>
                    )}
                    {!protectedRole && !pending && reasonFor !== p.user_id && (
                      <button type="button" onClick={() => { setReasonFor(p.user_id); setReason(''); setNote('') }} style={{ ...btn, marginTop: '0.5rem', borderColor: '#663', color: '#ffb088' }}>{isAdmin ? 'Remove from this chat' : 'Ask to remove'}</button>
                    )}
                    {pending && <p style={{ margin: '0.5rem 0 0', color: '#ffcc66', fontSize: '0.8rem' }}>A removal request is open. It needs a second member.</p>}
                    {reasonFor === p.user_id && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <label htmlFor={'vp-reason-' + p.user_id} style={{ display: 'block', color: '#ddd', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Why? Pick one.</label>
                        <select id={'vp-reason-' + p.user_id} value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', minHeight: '44px', boxSizing: 'border-box', background: '#111', color: '#fff', border: '1px solid #444', borderRadius: '8px', padding: '0 0.5rem', fontSize: '1rem' }}>
                          <option value="">Choose a reason</option>
                          {REMOVE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <p style={{ margin: '0.4rem 0', color: '#999', fontSize: '0.8rem' }}>{isAdmin ? 'You can remove them right away.' : 'A second member must agree before they are removed. They are not shown this request.'}</p>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button type="button" style={btn} onClick={() => { setReasonFor(null); setReason('') }}>Cancel</button>
                          <button type="button" style={{ ...btn, background: '#4a2020', borderColor: '#a44' }} disabled={busy || !reason} onClick={() => ask(p.user_id)}>{isAdmin ? 'Remove' : 'Ask'}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {total > people.length && <p style={{ color: '#999', fontSize: '0.8rem', textAlign: 'center', marginTop: '0.6rem' }}>Showing {people.length} of {total}. Search by name to find someone.</p>}

        {onLeave && (
          <button type="button" onClick={onLeave} style={{ ...btn, width: '100%', marginTop: '1.25rem', color: '#ff6666', borderColor: '#533' }}>Leave this village chat</button>
        )}
      </div>
    </>
  )
}
