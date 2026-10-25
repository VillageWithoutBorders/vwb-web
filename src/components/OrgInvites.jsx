import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import Icon from './Icon'

// Invites to organizations and groups that are waiting for you.
// Nothing happens until you say yes.

export default function OrgInvites() {
  const navigate = useNavigate()
  const [invites, setInvites] = useState([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function load() {
    const { data, error } = await supabase.rpc('my_org_invites')
    if (error) { console.error('Failed to load organization invites:', error); return }
    setInvites(data || [])
  }
  useEffect(() => { load() }, [])

  async function answer(inv, yes) {
    setBusy(true); setNote('')
    const { data, error } = await supabase.rpc('answer_org_invite', { p_org: inv.org_id, p_accept: yes })
    setBusy(false)
    if (error) { console.error('Failed to answer invite:', error); setNote("We couldn't save that. Try again."); return }
    if (data === 'joined') { navigate('/orgs/' + inv.org_id); return }
    if (data === 'declined') setNote('No problem. ' + inv.org_name + ' will not be told why.')
    else setNote('This invite is no longer open.')
    load()
  }

  if (invites.length === 0 && !note) return null

  return (
    <section className="cal-box" aria-labelledby="org-invites">
      <h2 id="org-invites">You're invited</h2>
      {invites.map((inv) => (
        <div key={inv.org_id} className="cal-card" style={{ width: '100%', boxSizing: 'border-box' }}>
          <span className="cal-card-title"><Icon name={inv.kind === 'group' ? 'tent' : 'people'} /> {inv.org_name}</span>
          <span className="cal-card-meta" style={{ display: 'block', margin: '0.2rem 0 0.5rem' }}>
            {inv.invited_by_name} invited you to join this {inv.kind === 'group' ? 'emergency crew' : 'group'}.
          </span>
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px', marginBottom: '0.5rem' }} disabled={busy} onClick={() => answer(inv, true)}>Join</button>
          <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={() => answer(inv, false)}>No thanks</button>
        </div>
      ))}
      {note && <p className="hub-note" role="status">{note}</p>}
    </section>
  )
}
