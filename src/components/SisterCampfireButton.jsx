import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import VillageRiskDialog from './VillageRiskDialog'

// One Sister Campfire: open it if you are in, join it if you can.
// campfire is a row from the sister_campfires RPC. The database checks every rule again.
export default function SisterCampfireButton({ campfire, onJoined }) {
  const navigate = useNavigate()
  const [risk, setRisk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!campfire) return <p className="vs-note">Join either village to sit at their Sister Campfire.</p>
  const go = () => navigate('/village-square?board=' + campfire.board_id)
  const people = campfire.member_count === 1 ? '1 person' : (campfire.member_count || 0) + ' people'

  async function join() {
    setBusy(true); setError('')
    const { data, error: err } = await supabase.rpc('join_sister_campfire', { p_board: campfire.board_id, p_agreed: true })
    setBusy(false)
    if (err || data !== 'ok') {
      console.error('Failed to join the Sister Campfire:', err || data)
      setError(data === 'closed' ? 'This Sister Campfire has closed.' : data === 'notallowed' ? 'Only people in one of these two villages can join.' : "We couldn't add you. Check your connection and try again.")
      return
    }
    setRisk(false)
    onJoined?.()
    go()
  }

  if (campfire.i_am_in) {
    return <button type="button" className="btn btn-primary btn-full" onClick={go}>
      {campfire.closed_at ? 'Read the closed Sister Campfire' : 'Open the Sister Campfire'} <small>({people})</small>
    </button>
  }
  if (!campfire.can_join) return <p className="vs-note">Join either village to sit at their Sister Campfire.</p>
  return <>
    <button type="button" className="btn btn-primary btn-full" onClick={() => { setError(''); setRisk(true) }}>
      Join the Sister Campfire <small>({people})</small>
    </button>
    {risk && <VillageRiskDialog villageName={'the ' + campfire.name + ' Sister Campfire'} busy={busy} error={error} onAgree={join} onCancel={() => { if (!busy) setRisk(false) }} />}
  </>
}
