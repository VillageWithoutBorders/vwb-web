import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import Icon from './Icon'
import { useT } from '../utils/lang'

// Invites to organizations and groups that are waiting for you.
// Nothing happens until you say yes.

export default function OrgInvites() {
  const navigate = useNavigate()
  const t = useT()
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
    if (error) { console.error('Failed to answer invite:', error); setNote(t("We couldn't save that. Try again.")); return }
    if (data === 'joined') { navigate('/orgs/' + inv.org_id); return }
    if (data === 'declined') setNote(t('No problem. {name} will not be told why.', { name: inv.org_name }))
    else setNote(t('This invite is no longer open.'))
    load()
  }

  if (invites.length === 0 && !note) return null

  return (
    <section className="cal-box" aria-labelledby="org-invites">
      <h2 id="org-invites">{t("You're invited")}</h2>
      {invites.map((inv) => (
        <div key={inv.org_id} className="cal-card" style={{ width: '100%', boxSizing: 'border-box' }}>
          <span className="cal-card-title"><Icon name={inv.kind === 'group' ? 'tent' : 'people'} /> {inv.org_name}</span>
          <span className="cal-card-meta" style={{ display: 'block', margin: '0.2rem 0 0.5rem' }}>
            {inv.kind === 'group' ? t('{name} invited you to join this emergency crew.', { name: inv.invited_by_name }) : t('{name} invited you to join this group.', { name: inv.invited_by_name })}
          </span>
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px', marginBottom: '0.5rem' }} disabled={busy} onClick={() => answer(inv, true)}>{t('Join')}</button>
          <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={() => answer(inv, false)}>{t('No thanks')}</button>
        </div>
      ))}
      {note && <p className="hub-note" role="status">{note}</p>}
    </section>
  )
}
