import { useCallback, useState } from 'react'
import { supabase } from '../supabaseClient'
import { askConfirm, tell } from './AdminDialog'
import { UserName } from './AvatarDisplay'

// VWB admins and the founder (Oct 28; was founder only), on each village in Admin > Villages: who is in the village
// chat (names and roles, never messages), ask a member to be Keeper, and put
// people in the chat. Invite = they read the warning and join themselves.
// Add now = they already said yes in person. The database checks every rule
// (vwb-founder-village-people.sql, vwb-roles-step5.sql).

const btn = { minHeight: 44, padding: '0 0.8rem', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text)', fontSize: '0.9rem', cursor: 'pointer' }
const badge = (bg, fg) => ({ fontSize: '0.8125rem', background: bg, color: fg, padding: '1px 6px', borderRadius: 4, fontWeight: 600, marginLeft: 6 })

const PLACED = {
  added: 'is in the village chat now. They got an alert.',
  invited: 'was invited. They join after reading the warning.',
  guest_invited: 'lives outside these zip codes, so they were invited as a guest. They say yes or no.',
  already: 'is already in this village chat.',
  removed: "was removed from this village chat before, so they can't be put back from here.",
  declined: 'said no to joining not long ago. Try again later.',
  missing: "can't be added.",
}

export default function FounderVillagePeople({ village, offers, onChanged }) {
  const [open, setOpen] = useState(false)
  const [people, setPeople] = useState(null)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('founder_village_people', { p_village: village.id })
    if (error) { console.error('Failed to load village people:', error); tell("The people list didn't load. Try again.", { tone: 'error' }); setPeople([]); return }
    setPeople(data || [])
  }, [village.id])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && people === null) load()
  }

  async function search(e) {
    e.preventDefault()
    if (query.trim().length < 2) return
    const { data, error } = await supabase.rpc('founder_find_people', { p_village: village.id, p_search: query.trim() })
    if (error) { console.error('Founder people search failed:', error); tell("Search didn't work. Try again.", { tone: 'error' }); return }
    setFound(data || [])
  }

  async function place(p, now) {
    if (now && !(await askConfirm(
      'Add ' + p.display_name + ' to ' + village.name + ' now? Only do this if they already told you yes. They skip the in-app warning, get an alert that you added them, and can leave any time.',
      { yes: 'Add now' }))) return
    setBusy(true)
    const { data, error } = await supabase.rpc('founder_place_in_village', { p_village: village.id, p_user: p.user_id, p_now: now })
    setBusy(false)
    if (error) { console.error('Could not place person in village:', error); tell(error.message || "That didn't work. Try again.", { tone: 'error' }); return }
    const good = data === 'added' || data === 'invited' || data === 'guest_invited'
    tell(p.display_name + ' ' + (PLACED[data] || 'was updated.'), good ? {} : { tone: 'error' })
    if (data === 'added') { setFound((f) => (f || []).map((x) => (x.user_id === p.user_id ? { ...x, is_member: true } : x))); load() }
  }

  async function askKeeper(p) {
    if (!(await askConfirm('Ask ' + p.display_name + ' to be Keeper of ' + village.name + '? They get an alert and say yes or no. If they say yes, the current Keeper becomes a Helper.', { yes: 'Ask them' }))) return
    setBusy(true)
    const { error } = await supabase.rpc('offer_keeper', { p_village: village.id, p_person: p.user_id })
    setBusy(false)
    if (error) { console.error('Keeper ask failed:', error); tell(error.message || "That didn't send. Try again.", { tone: 'error' }); return }
    tell('Asked. Nothing changes until ' + p.display_name + ' says yes.')
    onChanged?.()
  }

  async function takeBack(o) {
    setBusy(true)
    const { error } = await supabase.rpc('founder_cancel_keeper_offer', { p_offer: o.offer_id })
    setBusy(false)
    if (error) { console.error('Take back failed:', error); tell(error.message || "That didn't save. Try again.", { tone: 'error' }); return }
    tell('Ask taken back.')
    onChanged?.()
  }

  const waiting = (offers || []).filter((o) => o.status === 'waiting' && o.village_id === village.id)
  const keeper = (people || []).find((p) => p.is_keeper)
  const helpers = (people || []).filter((p) => p.is_helper)
  const hasAmbassador = (people || []).some((p) => p.is_ambassador)
  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', padding: '0.35rem 0', borderTop: '1px solid var(--border)' }

  return (
    <div style={{ marginTop: '0.6rem' }}>
      {waiting.map((o) => (
        <p key={o.offer_id} className="admin-section-note">
          Waiting on {o.admin_name} to answer your Keeper ask.{' '}
          <button type="button" className="admin-village-btn" disabled={busy} onClick={() => takeBack(o)}>Take back</button>
        </p>
      ))}
      <button type="button" style={btn} aria-expanded={open} onClick={toggle}>{open ? 'Hide people' : 'People and leaders'}</button>
      {open && (
        <div style={{ marginTop: '0.6rem' }}>
          {people === null ? <p className="admin-section-note">Loading...</p> : (
            <>
              <p className="admin-section-note">
                {keeper ? 'Keeper: ' + keeper.display_name : 'No Keeper yet.'}
                {' · '}{helpers.length ? 'Helpers: ' + helpers.map((h) => h.display_name).join(', ') : 'No Helpers yet'}
                {' · '}{hasAmbassador ? 'Has a Hope Ambassador' : 'No Hope Ambassador'}
              </p>
              <p className="admin-section-note">You see who is in this chat, never what they say.</p>
              {people.length === 0 && <p className="admin-section-note">No one has joined yet.</p>}
              {people.map((p) => (
                <div key={p.user_id} style={row}>
                  <span>
                    <UserName userId={p.user_id} name={p.display_name} />
                    {p.is_keeper && <span style={badge('var(--warn-bg)', 'var(--gold)')}>Keeper</span>}
                    {p.is_helper && <span style={badge('var(--warn-bg)', 'var(--gold)')}>Helper</span>}
                    {p.is_ambassador && <span style={badge('var(--info-bg)', 'var(--info)')}>Hope Ambassador</span>}
                    {p.is_guest && <span style={badge('var(--surface)', 'var(--text-muted)')}>Guest</span>}
                  </span>
                  {!p.is_keeper && !p.is_guest && village.active !== false && (
                    <button type="button" style={btn} disabled={busy} onClick={() => askKeeper(p)}>Ask to be Keeper</button>
                  )}
                </div>
              ))}
            </>
          )}

          {village.active !== false && (
            <form onSubmit={search} noValidate style={{ marginTop: '0.75rem' }}>
              <label htmlFor={'fvp-' + village.id} style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Put someone in this village chat</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input id={'fvp-' + village.id} type="search" autoComplete="off" value={query} onChange={(e) => { setQuery(e.target.value); setFound(null) }}
                  placeholder="Search by name" style={{ flex: 1, minWidth: 0, minHeight: 44, fontSize: '1rem', padding: '0 0.6rem', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-sunk, var(--surface))', color: 'var(--text)' }} />
                <button type="submit" style={btn} disabled={query.trim().length < 2}>Search</button>
              </div>
              {found && found.length === 0 && <p className="admin-section-note">No one found by that name.</p>}
              {found && found.map((p) => (
                <div key={p.user_id} style={row}>
                  <span>
                    {p.display_name}
                    <small style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{p.is_member ? 'Already in' : p.lives_in_area ? 'Lives in this area' : 'Outside these zip codes (guest)'}</small>
                  </span>
                  {!p.is_member && (
                    <span style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" style={btn} disabled={busy} onClick={() => place(p, false)}>Invite</button>
                      <button type="button" style={btn} disabled={busy} onClick={() => place(p, true)}>Add now</button>
                    </span>
                  )}
                </div>
              ))}
            </form>
          )}
        </div>
      )}
    </div>
  )
}
