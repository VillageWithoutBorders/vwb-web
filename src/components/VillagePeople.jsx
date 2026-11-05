import Icon from './Icon'
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import AvatarDisplay, { UserName } from './AvatarDisplay'
import VouchButton from './VouchButton'
import { askConfirm } from './AdminDialog'
import RoleLog from './RoleLog'
import { useT, getLang } from '../utils/lang'

// Must match the list inside request_village_member_removal (vwb-village-chats-v2.sql).
const REMOVE_REASONS = [
  'Unsafe or threatening behavior',
  'Harassing or bullying members',
  'Scam, spam, or asking for money',
  'Fake or pretend account',
  'Not part of this village',
  'Something else',
]

const btn = { minHeight: '44px', padding: '0 0.9rem', borderRadius: '999px', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', fontSize: '0.85rem' }

// Notice at the top of a village chat when neighbors have just joined.
// It is a quiet banner, not a push notification. Dismissing it is remembered on this device.
export function VillageNewMembers({ villageId, myId }) {
  const t = useT()
  const key = 'vwb_village_joiners_seen_' + myId + '_' + villageId
  const [rows, setRows] = useState([])
  const [guests, setGuests] = useState([])
  // When I joined: only people who joined after me are new to me (Oct 22).
  const [mine, setMine] = useState(undefined)
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
    setMine(undefined)
    supabase.from('village_members').select('joined_at').eq('village_id', villageId).eq('user_id', myId).maybeSingle().then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load when you joined:', error); setMine(null); return }
      setMine(data ? data.joined_at : null)
    })
    supabase.rpc('village_guest_ids', { p_village: villageId }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load village guests:', error); return }
      setGuests(data || [])
    })
    try { setSeen(JSON.parse(localStorage.getItem(key) || '[]')) } catch { setSeen([]) }
    return () => { alive = false }
  }, [villageId])

  // Wait until we know when I joined, so the notice never flashes the wrong names.
  if (mine === undefined) return null
  const fresh = rows.filter(r => !seen.includes(r.user_id) && (!mine || new Date(r.joined_at) > new Date(mine)))
  if (fresh.length === 0) return null

  function dismiss() {
    const next = [...new Set([...seen, ...fresh.map(r => r.user_id)])].slice(-200)
    setSeen(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
  }

  // Guests are named as guests, so everyone knows who came in from outside the village.
  const names = fresh.slice(0, 3).map((r) => {
    const g = guests.find((x) => x.user_id === r.user_id)
    return (r.display_name || t('A neighbor')) + (g ? ' ' + (g.via === 'sister' ? t('(guest from Sister Village {name})', { name: g.from_village_name || '' }) : t('(guest)')) : '')
  })
  const more = fresh.length - names.length
  const text = (more > 0 ? t('{names} and {n} more', { names: names.join(', '), n: more }) : names.length > 1 ? t('{names} and {last}', { names: names.slice(0, -1).join(', '), last: names[names.length - 1] }) : names[0]) + ' ' + t('just joined.')

  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--success-bg)', borderBottom: '1px solid #234', color: 'var(--accent)', fontSize: '0.9rem' }}>
      <span aria-hidden="true"><Icon name="sprout" /></span>
      <span style={{ flex: 1 }}>{text} {t('Say hello.')}</span>
      <button type="button" onClick={dismiss} aria-label={t('Dismiss new member notice')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', minWidth: '44px', minHeight: '44px', fontSize: '1.1rem' }}>&#10005;</button>
    </div>
  )
}

// The list of people in a village chat, with vouching and the two-member removal.
export default function VillagePeople({ villageId, villageName, myId, isAdmin, requests, onRequestsChange, onClose, onLeave, onKeeperChange, showRoleLog = true }) {
  const t = useT()
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
  const [guestIds, setGuestIds] = useState([])
  const [sisterIds, setSisterIds] = useState([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteQ, setInviteQ] = useState('')
  const [inviteResults, setInviteResults] = useState([])
  const [inviteNote, setInviteNote] = useState('')

  async function loadGuests() {
    const { data, error } = await supabase.rpc('village_guest_ids', { p_village: villageId })
    if (error) { console.error('Failed to load village guests:', error); return }
    setGuestIds((data || []).map((r) => r.user_id))
    setSisterIds((data || []).filter((r) => r.via === 'sister').map((r) => r.user_id))
  }
  useEffect(() => { loadGuests() }, [villageId])
  const iAmGuest = guestIds.includes(myId)

  // Invite search: only people you already know on VWB, same as starting a message.
  useEffect(() => {
    if (!inviteOpen) return
    const q = inviteQ.trim()
    if (q.length < 2) { setInviteResults([]); return }
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_people_to_message', { p_query: q.replace(/[%_]/g, '') })
      if (error) { console.error('Guest invite search failed:', error); setInviteNote(t("We couldn't search just now. Try again.")); return }
      const here = new Set(people.map((p) => p.user_id))
      setInviteResults((data || []).filter((p) => !here.has(p.user_id) && p.user_id !== myId))
    }, 250)
    return () => clearTimeout(timer)
  }, [inviteQ, inviteOpen])

  async function inviteGuest(person) {
    setBusy(true); setInviteNote('')
    const { data, error } = await supabase.rpc('invite_village_guest', { p_village: villageId, p_user: person.user_id })
    setBusy(false)
    const name = person.display_name || t('They')
    if (error) { console.error('Guest invite failed:', error); setInviteNote(error.message ? t(error.message) : t("We couldn't send that invite. Try again.")); return }
    const msg = {
      invited: t('Invite sent. {name} will get a notice and can say yes or no.', { name }),
      already: t('{name} is already in this village.', { name }),
      removed: t('{name} was removed from this village before, so they cannot be invited.', { name }),
      declined: t('{name} said no to an invite here recently. You can try again in a few weeks.', { name }),
      missing: t('We could not find that person.'),
      canjoin: t('{name} lives in this village\u2019s area, so they can join on their own from Find a village.', { name }),
      guest: t('Only full members can invite guests.'),
    }[data] || t('Done.')
    setInviteNote(msg)
    if (data === 'invited') setInviteResults((r) => r.filter((p) => p.user_id !== person.user_id))
  }

  async function load(term) {
    const { data, error } = await supabase.rpc('village_people', { p_village: villageId, p_search: term || null, p_limit: 100 })
    if (error) { console.error('Failed to load the people in this chat:', error); setNote(t('Could not load the list. Try again.')); setLoading(false); return }
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
    if (error) { console.error('Helper change failed:', error); setNote(error.message ? t(error.message) : t('Could not do that. Try again.')); return }
    setNote(on ? t('They can now pin announcements.') : t('They are no longer a helper.'))
    loadKeepers(); onKeeperChange?.()
  }

  async function handOff(targetId, name) {
    if (!(await askConfirm(t('Hand this village to {name}? They will keep it from now on. You stay a member.', { name: name || t('this person') })))) return
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('hand_off_village', { p_village: villageId, p_user: targetId })
    setBusy(false)
    if (error) { console.error('Hand off failed:', error); setNote(error.message ? t(error.message) : t('Could not do that. Try again.')); return }
    setNote(t('Done. {name} now keeps this village.', { name: name || t('They') }))
    loadKeepers(); onKeeperChange?.()
  }

  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(() => load(search.trim()), search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [villageId, search])

  const pendingFor = (uid) => requests.find(r => r.target_id === uid)

  async function ask(targetId) {
    if (!reason) { setNote(t('Pick a reason first.')); return }
    setBusy(true); setNote('')
    const { data, error } = await supabase.rpc('request_village_member_removal', { p_village: villageId, p_target: targetId, p_reason: reason })
    setBusy(false)
    if (error) { console.error('Removal request failed:', error); setNote(error.message ? t(error.message) : t('Could not do that. Try again.')); return }
    setReasonFor(null); setReason('')
    setNote(data === 'removed' ? t('They were removed from this chat.') : t('Asked. It takes a second member to agree. They are not told.'))
    onRequestsChange?.()
    load(search.trim())
  }

  async function agree(targetId) {
    if (!(await askConfirm(t('Agree to remove this person from the village chat? Only agree if you have seen a real reason.')))) return
    setBusy(true); setNote('')
    const { data, error } = await supabase.rpc('request_village_member_removal', { p_village: villageId, p_target: targetId, p_reason: null })
    setBusy(false)
    if (error) { console.error('Removal agree failed:', error); setNote(error.message ? t(error.message) : t('Could not do that. Try again.')); return }
    setNote(data === 'removed' ? t('They were removed from this chat.') : t('Saved.'))
    onRequestsChange?.()
    load(search.trim())
  }

  async function takeBack(targetId) {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('cancel_village_removal', { p_village: villageId, p_target: targetId })
    setBusy(false)
    if (error) { console.error('Take back failed:', error); setNote(t('Could not take that back. Try again.')); return }
    onRequestsChange?.()
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} />
      <div role="dialog" aria-label={t('People in {name}', { name: villageName })} style={{ position: 'fixed', top: 0, right: 0, width: 'min(340px, 100%)', height: '100%', boxSizing: 'border-box', background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 1000, overflowY: 'auto', padding: '1.25rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{t('People in {name}', { name: villageName })}{total ? ' (' + total + ')' : ''}</h2>
          <button type="button" onClick={onClose} aria-label={t('Close the list of people')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}>&#10005;</button>
        </div>
        <p style={{ margin: '0 0 0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.4 }}>{t('Tap a name to open their profile. Tap the arrow to vouch for them or ask to remove them. A vouch means you trust them. It does not guarantee they are safe.')}</p>

        {keepers.i_am_starter && (
          <p style={{ margin: '0 0 0.75rem', padding: '0.6rem 0.75rem', border: '1px solid var(--border-strong)', borderRadius: '10px', background: 'var(--warn-bg)', color: 'var(--gold)', fontSize: '0.85rem', lineHeight: 1.4 }}>{t('You keep this village. You can pin announcements, name up to 2 helpers, or hand it to someone else. Open a name to do that.')}</p>
        )}

        {requests.length > 0 && (
          <div style={{ margin: '0 0 1rem', padding: '0.75rem', border: '1px solid var(--border-strong)', borderRadius: '10px', background: 'var(--warn-bg)' }}>
            <div style={{ fontWeight: 700, color: 'var(--gold)', fontSize: '0.9rem', marginBottom: '0.4rem' }}>{t('A second member is needed')}</div>
            {requests.map(r => (
              <div key={r.target_id} style={{ padding: '0.5rem 0', borderTop: '1px solid var(--warn-bg)' }}>
                <p style={{ margin: 0, color: 'var(--text)', fontSize: '0.9rem' }}>{t('A member asked to remove this person:')} <strong>{r.target_name || t('someone')}</strong></p>
                <p style={{ margin: '0.2rem 0 0.4rem', color: 'var(--text-soft)', fontSize: '0.85rem' }}>{t('Reason: {reason}', { reason: t(r.reason) })}</p>
                {r.requested_by === myId
                  ? <button type="button" style={btn} disabled={busy} onClick={() => takeBack(r.target_id)}>{t('Take back my request')}</button>
                  : <button type="button" style={{ ...btn, borderColor: 'var(--warn)', color: 'var(--warn)' }} disabled={busy} onClick={() => agree(r.target_id)}>{t('I agree. Remove them')}</button>}
              </div>
            ))}
          </div>
        )}

        {iAmGuest
          ? <p style={{ margin: '0 0 0.75rem', padding: '0.6rem 0.75rem', border: '1px solid var(--danger-bg)', borderRadius: '10px', background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: '0.85rem', lineHeight: 1.4 }}>{sisterIds.includes(myId) ? t('You are a guest here, from a Sister Village.') : t('You are a guest here.')} {t('You can read and post. Only full members can invite guests.')}</p>
          : (
          <div style={{ margin: '0 0 0.75rem' }}>
            {!inviteOpen
              ? <button type="button" style={{ ...btn, width: '100%' }} onClick={() => { setInviteOpen(true); setInviteNote('') }}>{t('Invite a guest')}</button>
              : (
              <div style={{ padding: '0.75rem', border: '1px solid var(--danger-bg)', borderRadius: '10px', background: 'var(--danger-bg)' }}>
                <p style={{ margin: '0 0 0.5rem', color: 'var(--danger)', fontSize: '0.85rem', lineHeight: 1.4 }}>{t('Invite someone you know who lives outside this village. They get a Guest badge, everyone here sees that they joined, and they cannot invite others.')}</p>
                <label htmlFor="vp-invite" className="sr-only">{t('Search people you know')}</label>
                <input id="vp-invite" type="search" value={inviteQ} onChange={(e) => setInviteQ(e.target.value)} placeholder={t('Search people you know')} autoComplete="off" style={{ width: '100%', boxSizing: 'border-box', minHeight: '44px', padding: '0 0.75rem', marginBottom: '0.5rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '1rem' }} />
                {inviteResults.map((p) => (
                  <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.3rem 0' }}>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--text-strong)', fontSize: '0.9rem' }}>{p.display_name || t('Neighbor')}</span>
                    <button type="button" style={btn} disabled={busy} onClick={() => inviteGuest(p)}>{t('Invite')}</button>
                  </div>
                ))}
                {inviteQ.trim().length >= 2 && inviteResults.length === 0 && <p style={{ margin: '0.25rem 0', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{t('No one you know matches. To reach someone new, send them a message request from their name first.')}</p>}
                {inviteNote && <p role="status" style={{ margin: '0.4rem 0 0', color: 'var(--gold)', fontSize: '0.85rem' }}>{inviteNote}</p>}
                <button type="button" style={{ ...btn, marginTop: '0.5rem' }} onClick={() => { setInviteOpen(false); setInviteQ(''); setInviteResults([]) }}>{t('Done')}</button>
              </div>
            )}
          </div>
        )}

        <label htmlFor="vp-search" className="sr-only">{t('Search people in this chat')}</label>
        <input id="vp-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search by name')} autoComplete="off" style={{ width: '100%', boxSizing: 'border-box', minHeight: '44px', padding: '0 0.75rem', marginBottom: '0.6rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '1rem' }} />
        {note && <p role="status" style={{ margin: '0 0 0.6rem', color: 'var(--gold)', fontSize: '0.85rem' }}>{note}</p>}
        {loading && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('Loading...')}</p>}
        {!loading && people.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '0.75rem 0' }}>{search ? t('No one matches "{q}".', { q: search }) : t('No one else is here yet.')}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {people.map(p => {
            const me = p.user_id === myId
            const open = openId === p.user_id
            const protectedRole = p.role === 'admin' || p.role === 'founder' || p.is_hope_ambassador
            const pending = pendingFor(p.user_id)
            return (
              <div key={p.user_id} style={{ borderRadius: '8px', background: 'var(--surface-2)', padding: '0.4rem 0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AvatarDisplay url={p.avatar_url} userId={p.user_id} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                      <UserName userId={p.user_id} name={p.display_name || t('Neighbor')} style={{ color: 'var(--text-strong)', fontSize: '0.9rem', fontWeight: 600 }} />
                      {me && <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{t('(you)')}</span>}
                      {p.role === 'founder' && <span style={{ fontSize: '0.8125rem', background: 'var(--purple-bg)', color: 'var(--purple)', padding: '0 4px', borderRadius: '3px' }}>{t('Founder')}</span>}
                      {p.role === 'admin' && <span style={{ fontSize: '0.8125rem', background: 'var(--info-bg)', color: 'var(--info)', padding: '0 4px', borderRadius: '3px' }}>{t('VWB admin')}</span>}
                      {p.is_hope_ambassador && <span style={{ fontSize: '0.8125rem', background: 'var(--success-bg)', color: 'var(--accent)', padding: '0 4px', borderRadius: '3px' }}>{t('Ambassador')}</span>}
                      {p.user_id === keepers.starter_id && <span style={{ fontSize: '0.8125rem', background: 'var(--warn-bg)', color: 'var(--gold)', padding: '0 4px', borderRadius: '3px' }}>{t('Keeper')}</span>}
                      {keepers.helper_ids.includes(p.user_id) && <span style={{ fontSize: '0.8125rem', background: 'var(--warn-bg)', color: 'var(--gold)', padding: '0 4px', borderRadius: '3px' }}>{t('Helper')}</span>}
                      {guestIds.includes(p.user_id) && <span style={{ fontSize: '0.8125rem', background: 'var(--danger-bg)', color: 'var(--danger)', padding: '0 4px', borderRadius: '3px' }}>{t('Guest')}</span>}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{t('Joined {date}', { date: new Date(p.joined_at).toLocaleDateString(getLang() === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) })}</div>
                  </div>
                  {!me && (
                    <button type="button" aria-expanded={open} aria-label={t('Options for {name}', { name: p.display_name || t('this neighbor') })} onClick={() => { setOpenId(open ? null : p.user_id); setReasonFor(null); setReason(''); setNote('') }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', minWidth: '44px', minHeight: '44px', fontSize: '1rem' }}>{open ? '\u25B2' : '\u25BC'}</button>
                  )}
                </div>
                {open && !me && (
                  <div style={{ padding: '0.25rem 0.25rem 0.5rem' }}>
                    <VouchButton userId={p.user_id} name={p.display_name} size="sm" allowPersonal />
                    {keepers.i_am_starter && (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        {keepers.helper_ids.includes(p.user_id)
                          ? <button type="button" style={btn} disabled={busy} onClick={() => setHelper(p.user_id, false)}>{t('Remove as helper')}</button>
                          : <button type="button" style={btn} disabled={busy} onClick={() => setHelper(p.user_id, true)}>{t('Make an announcement helper')}</button>}
                        <button type="button" style={btn} disabled={busy} onClick={() => handOff(p.user_id, p.display_name)}>{t('Hand the village to them')}</button>
                      </div>
                    )}
                    {!protectedRole && !pending && reasonFor !== p.user_id && (
                      <button type="button" onClick={() => { setReasonFor(p.user_id); setReason(''); setNote('') }} style={{ ...btn, marginTop: '0.5rem', borderColor: 'var(--warn)', color: 'var(--warn)' }}>{isAdmin ? t('Remove from this chat') : t('Ask to remove')}</button>
                    )}
                    {pending && <p style={{ margin: '0.5rem 0 0', color: 'var(--gold)', fontSize: '0.8125rem' }}>{t('A removal request is open. It needs a second member.')}</p>}
                    {reasonFor === p.user_id && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <label htmlFor={'vp-reason-' + p.user_id} style={{ display: 'block', color: 'var(--text)', fontSize: '0.85rem', marginBottom: '0.3rem' }}>{t('Why? Pick one.')}</label>
                        <select id={'vp-reason-' + p.user_id} value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', minHeight: '44px', boxSizing: 'border-box', background: 'var(--surface-sunk)', color: 'var(--text-strong)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '0 0.5rem', fontSize: '1rem' }}>
                          <option value="">{t('Choose a reason')}</option>
                          {REMOVE_REASONS.map(r => <option key={r} value={r}>{t(r)}</option>)}
                        </select>
                        <p style={{ margin: '0.4rem 0', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{isAdmin ? t('You can remove them right away.') : t('A second member must agree before they are removed. They are not shown this request.')}</p>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button type="button" style={btn} onClick={() => { setReasonFor(null); setReason('') }}>{t('Cancel')}</button>
                          <button type="button" style={{ ...btn, background: 'var(--danger-bg)', borderColor: 'var(--danger)' }} disabled={busy || !reason} onClick={() => ask(p.user_id)}>{isAdmin ? t('Remove') : t('Ask')}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {total > people.length && <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', textAlign: 'center', marginTop: '0.6rem' }}>{t('Showing {n} of {total}. Search by name to find someone.', { n: people.length, total })}</p>}

        {showRoleLog && <RoleLog kind="village" placeId={villageId} />}

        {onLeave && (
          <button type="button" onClick={onLeave} style={{ ...btn, width: '100%', marginTop: '1.25rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}>{t('Leave this village chat')}</button>
        )}
      </div>
    </>
  )
}
