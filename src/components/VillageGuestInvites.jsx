import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import VillageRiskDialog from './VillageRiskDialog'

// Guest invites waiting for you. A member of another village invited you.
// Saying yes shows the same risk warning as any village join.

export default function VillageGuestInvites() {
  const navigate = useNavigate()
  const [invites, setInvites] = useState([])
  const [risk, setRisk] = useState(null)
  const [riskError, setRiskError] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function load() {
    const { data, error } = await supabase.rpc('my_village_guest_invites')
    if (error) { console.error('Failed to load guest invites:', error); return }
    setInvites(data || [])
  }
  useEffect(() => { load() }, [])

  async function decline(inv) {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('answer_village_guest_invite', { p_village: inv.village_id, p_accept: false, p_agreed: false })
    setBusy(false)
    if (error) { console.error('Failed to decline guest invite:', error); setNote("We couldn't save that. Try again."); return }
    setNote('No problem. ' + inv.village_name + ' will not be told why.')
    load()
  }

  async function agreeAndJoin() {
    if (!risk) return
    setBusy(true); setRiskError('')
    const { data, error } = await supabase.rpc('answer_village_guest_invite', { p_village: risk.village_id, p_accept: true, p_agreed: true })
    if (error || data !== 'ok') {
      setBusy(false)
      if (error) console.error('Failed to accept guest invite:', error)
      setRiskError(data === 'removed' ? 'You were removed from this village before, so you cannot join it.' : data === 'noinvite' ? 'This invite is no longer open.' : "We couldn't join you just now. Try again.")
      return
    }
    const { data: boards, error: bErr } = await supabase.from('campfire_boards').select('id').eq('village_id', risk.village_id).limit(1)
    setBusy(false)
    if (bErr) console.error('Failed to find the village chat:', bErr)
    const b = boards && boards[0]
    setRisk(null)
    navigate(b ? '/village-square?board=' + b.id + '&intro=1' : '/world')
  }

  if (invites.length === 0 && !note) return null

  return (
    <section className="cal-box" aria-labelledby="guest-invites">
      <h2 id="guest-invites">Village invites</h2>
      {invites.map((inv) => (
        <div key={inv.village_id} className="cal-card" style={{ width: '100%', boxSizing: 'border-box' }}>
          <span className="cal-card-title">{inv.village_name}</span>
          <span className="cal-card-meta" style={{ display: 'block', margin: '0.2rem 0 0.5rem' }}>{inv.invited_by_name} invited you as a guest. Guests can read and post, and everyone there will see a Guest badge by your name.</span>
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px', marginBottom: '0.5rem' }} disabled={busy} onClick={() => { setRiskError(''); setRisk(inv) }}>Join as a guest</button>
          <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={() => decline(inv)}>No thanks</button>
        </div>
      ))}
      {note && <p className="hub-note" role="status">{note}</p>}
      {risk && (
        <VillageRiskDialog
          villageName={risk.village_name}
          busy={busy}
          error={riskError}
          onAgree={agreeAndJoin}
          onCancel={() => { if (!busy) setRisk(null) }}
        />
      )}
    </section>
  )
}
