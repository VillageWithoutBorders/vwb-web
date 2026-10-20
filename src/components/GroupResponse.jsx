import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// "Ready to respond" on an emergency response Group's page.
// A group can exist without approval, but it is only called to emergencies
// after a Hope Ambassador or VWB admin outside the group says yes.

function day(iso) {
  return iso ? new Date(iso).toLocaleDateString([], { month: 'long', day: 'numeric' }) : ''
}

export default function GroupResponse({ orgId, orgName, isKeeper, villageCount, onChanged }) {
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [decideNote, setDecideNote] = useState('')

  async function load() {
    const { data, error } = await supabase.rpc('group_response_info', { p_org: orgId })
    if (error) console.error('Failed to load response status:', error)
    setInfo((data && data[0]) || { status: 'none' })
  }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function ask() {
    setBusy(true); setMsg('')
    const { data, error } = await supabase.rpc('ask_group_response_approval', { p_org: orgId })
    setBusy(false)
    if (error) { console.error('Failed to ask for approval:', error); setMsg("We couldn't send that. Try again."); return }
    if (data === 'asked' || data === 'already') setMsg('Sent. Hope Ambassadors and VWB admins will look at your group.')
    else if (data === 'approved') setMsg('Your group is already approved.')
    else setMsg("We couldn't send that right now.")
    load(); onChanged?.()
  }

  async function decide(yes) {
    setBusy(true); setMsg('')
    const { data, error } = await supabase.rpc('decide_group_response', { p_org: orgId, p_approve: yes, p_note: decideNote.trim() || null })
    setBusy(false)
    if (error || !['approved', 'declined'].includes(data)) { console.error('Failed to decide:', error || data); setMsg(data === 'inside' ? 'You are in this group, so someone else has to decide.' : data === 'notlocal' ? "This group doesn't cover your villages. A Hope Ambassador there or a VWB admin can decide." : "We couldn't save that. Try again."); return }
    setMsg(yes ? orgName + ' can now be called to emergencies. Its keepers were told.' : 'Saved. The keepers were told it is not approved yet.')
    setDecideNote('')
    load(); onChanged?.()
  }

  if (!info) return <p role="status">Loading...</p>
  const s = info.status

  return (
    <div>
      {s === 'approved' && <div className="vs-item gr-ok"><b>Approved to respond</b><small>Since {day(info.decided_at)}. When an emergency is verified in the villages this group covers, its keepers are asked to help.</small></div>}
      {s === 'asked' && <div className="vs-item"><b>Waiting for approval</b><small>Asked {day(info.asked_at)}. A Hope Ambassador or VWB admin outside the group will decide. You get an alert either way. Meanwhile, keep adding members and what you bring.</small></div>}
      {(s === 'none' || s === 'declined') && <div className="vs-item"><b>Not called to emergencies yet</b><small>{orgName} can meet, chat, and plan now. To be called when an emergency is verified nearby, a keeper asks for approval.</small></div>}
      {s === 'declined' && isKeeper && info.note && <p className="vs-note">Note from the reviewer: {info.note}</p>}

      {isKeeper && (s === 'none' || s === 'declined') && <>
        <p className="vs-note">Before you ask: pick the villages you cover{villageCount ? ' (done)' : ''}, and have members list what they bring.</p>
        <button type="button" className="btn btn-primary btn-full" onClick={ask} disabled={busy}>{busy ? 'Sending...' : s === 'declined' ? 'Ask again' : 'Ask to be approved'}</button>
      </>}

      {info.i_can_decide && (s === 'asked' || s === 'approved') && (
        <section className="cal-box" aria-labelledby="gr-decide">
          <h3 id="gr-decide">{s === 'asked' ? 'You can decide' : 'Take back approval'}</h3>
          <p className="cal-sub">You are a Hope Ambassador or VWB admin and not in this group. Check that it is real and local before saying yes.</p>
          <label htmlFor="gr-note" className="gg-label">Note to the keepers (optional)</label>
          <textarea id="gr-note" rows={2} maxLength={300} value={decideNote} onChange={(e) => setDecideNote(e.target.value)} />
          {s === 'asked' && <button type="button" className="btn btn-primary btn-full" onClick={() => decide(true)} disabled={busy}>Approve to respond</button>}
          <button type="button" className="btn btn-outline btn-full" onClick={() => decide(false)} disabled={busy}>{s === 'asked' ? 'Not yet' : 'Take back approval'}</button>
        </section>
      )}

      {msg && <p className="vs-note" role="status">{msg}</p>}

      <h3>Past responses</h3>
      <p className="vs-note">Emergencies this group helped with will show here.</p>
    </div>
  )
}
