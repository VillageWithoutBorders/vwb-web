import { useEffect, useState } from 'react'
import { useBlockedBy } from '../utils/blockedBy'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import AvatarDisplay from './AvatarDisplay'
import { HOW_LABELS } from '../utils/vouchEligibility'

// Names and avatars for a list of user ids, in one lookup.
async function peopleById(ids) {
  if (ids.length === 0) return {}
  const { data, error } = await supabase.from('helper_profiles_public').select('user_id, display_name, avatar_url').in('user_id', ids)
  if (error) console.error('[PersonalVouches] names', error)
  return Object.fromEntries((data || []).map(p => [p.user_id, p]))
}

// On your own profile: people who say they know you, waiting for you to
// confirm. Nothing shows if there are none.
export function VouchRequestsForMe({ myId }) {
  const navigate = useNavigate()
  const blockedBy = useBlockedBy()
  const [requests, setRequests] = useState([])
  const [busy, setBusy] = useState(null)

  useEffect(() => { if (myId) load() }, [myId])

  async function load() {
    const { data, error } = await supabase.from('vouch_requests').select('voucher_id, how, created_at').eq('vouchee_id', myId).order('created_at', { ascending: true })
    if (error) { console.error('[VouchRequestsForMe] load', error); return }
    const names = await peopleById((data || []).map(r => r.voucher_id))
    setRequests((data || []).map(r => ({ ...r, name: names[r.voucher_id]?.display_name || 'A neighbor', avatar: names[r.voucher_id]?.avatar_url || null })))
  }

  async function confirmIt(r) {
    setBusy(r.voucher_id)
    const { error } = await supabase.rpc('confirm_personal_vouch', { p_voucher: r.voucher_id })
    setBusy(null)
    if (error) { console.error('[VouchRequestsForMe] confirm', error); alert('Could not confirm. It may have been taken back.') }
    load()
  }

  async function notReally(r) {
    setBusy(r.voucher_id)
    const { error } = await supabase.from('vouch_requests').delete().eq('voucher_id', r.voucher_id).eq('vouchee_id', myId)
    setBusy(null)
    if (error) { console.error('[VouchRequestsForMe] decline', error); alert('Could not do that. Try again.') }
    load()
  }

  if (requests.length === 0) return null

  return (
    <section className="groups-card vouch-requests" aria-labelledby="vouch-req-title">
      <h2 id="vouch-req-title" className="groups-card-title">People who say they know you</h2>
      <p className="groups-note">Say yes only if you really know them. Their vouch will show on your profile.</p>
      {requests.map(r => (
        <div key={r.voucher_id} className="group-member">
          <AvatarDisplay url={r.avatar} userId={r.voucher_id} size={32} />
          <span className="group-member-name">
            <button disabled={blockedBy.has(r.voucher_id)} type="button" className="link-button" onClick={() => !blockedBy.has(r.voucher_id) && navigate('/u/' + r.voucher_id)}>{r.name}</button>
            <span className="group-member-sub">{HOW_LABELS[r.how] || 'Knows you'}</span>
          </span>
          <span className="group-member-actions">
            <button type="button" className="btn btn-primary group-small-btn" disabled={busy === r.voucher_id} onClick={() => confirmIt(r)}>Yes, we know each other</button>
            <button type="button" className="btn btn-outline group-small-btn" disabled={busy === r.voucher_id} onClick={() => notReally(r)}>Not really</button>
          </span>
        </div>
      ))}
    </section>
  )
}

// On a public profile: who knows this person, and how. Shows only
// confirmed vouches.
export function KnowsVouchList({ userId }) {
  const navigate = useNavigate()
  const blockedBy = useBlockedBy()
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!userId) return
    ;(async () => {
      const { data, error } = await supabase.from('vouches').select('voucher_id, how').eq('vouchee_id', userId).eq('kind', 'knows').limit(20)
      if (error) { if (error.code !== '42703') console.error('[KnowsVouchList] load', error); return }
      const names = await peopleById((data || []).map(r => r.voucher_id))
      setRows((data || []).map(r => ({ ...r, name: names[r.voucher_id]?.display_name || 'A neighbor' })))
    })()
  }, [userId])

  if (rows.length === 0) return null

  return (
    <ul className="vouch-knows-list" aria-label="People who know them personally">
      {rows.map(r => (
        <li key={r.voucher_id}>
          <button disabled={blockedBy.has(r.voucher_id)} type="button" className="link-button" onClick={() => !blockedBy.has(r.voucher_id) && navigate('/u/' + r.voucher_id)}>{r.name}</button>
          <span className="group-member-sub">{HOW_LABELS[r.how] || 'Knows them'}</span>
        </li>
      ))}
    </ul>
  )
}
