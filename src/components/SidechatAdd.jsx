import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { UserName } from './AvatarDisplay'

// Inside a sidechat's settings: the person who started it adds more members
// of the organization. Only members of the organization can be added.

export default function SidechatAdd({ groupId, orgId, memberIds, isSteward, onAdded }) {
  const [people, setPeople] = useState([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!isSteward || !orgId) return
    let alive = true
    supabase.rpc('list_org_members', { p_org: orgId }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load group members:', error); setNote("Couldn't load the group's members. Try again."); return }
      setPeople(data || [])
    })
    return () => { alive = false }
  }, [isSteward, orgId])

  if (!isSteward) {
    return (
      <>
        <h3 className="groups-section">Add people</h3>
        <p className="groups-note">Only the person who started this sidechat adds people to it. Everyone added is a member of the group.</p>
      </>
    )
  }

  const term = q.trim().toLowerCase()
  const options = people
    .filter((p) => !memberIds.has(p.user_id))
    .filter((p) => !term || (p.display_name || '').toLowerCase().includes(term))

  async function add(p) {
    setBusy(p.user_id); setNote('')
    const { error } = await supabase.rpc('add_to_sidechat', { p_group: groupId, p_user: p.user_id })
    setBusy('')
    if (error) {
      console.error('Failed to add to sidechat:', error)
      setNote(error.message && error.message.length < 140 && error.code ? error.message : "We couldn't add them. Try again.")
      return
    }
    setNote((p.display_name || 'They') + ' was added.')
    if (onAdded) await onAdded()
  }

  return (
    <>
      <h3 className="groups-section">Add people</h3>
      <p className="groups-note">You started this sidechat, so you can add anyone in the group. They are added right away.</p>
      <label htmlFor="sidechat-add-search" className="sr-only">Search the group by name</label>
      <input id="sidechat-add-search" type="search" className="group-search" placeholder="Type a name" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {options.slice(0, 12).map((p) => (
        <div key={p.user_id} className="group-member">
          <span className="group-member-name"><UserName userId={p.user_id} name={p.display_name || 'Neighbor'} /></span>
          <button type="button" className="btn btn-primary group-small-btn" disabled={!!busy} onClick={() => add(p)}>{busy === p.user_id ? 'Adding...' : 'Add'}</button>
        </div>
      ))}
      {people.length > 0 && options.length === 0 && <p className="groups-note">{term ? 'No one in the group by that name who is not already here.' : 'Everyone in the group is already here.'}</p>}
      {note && <p className="groups-note" role="status">{note}</p>}
    </>
  )
}
