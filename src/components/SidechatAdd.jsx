import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { UserName } from './AvatarDisplay'
import { useT } from '../utils/lang'

// Inside a smaller Campfire's settings: add people from the chat above it.
// Nov 10 (Jade): anyone in it can add people now, in Cottage Chats and groups alike
// (vwb-threads-and-read.sql). Before that database step, only the person who started
// a group's sidechat could, from the group's members.

export default function SidechatAdd({ groupId, parentId, orgId, memberIds, onAdded }) {
  const [people, setPeople] = useState([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const t = useT()

  useEffect(() => {
    if (!parentId) return
    let alive = true
    ;(async () => {
      let { data, error } = await supabase.rpc('thread_people', { p_parent: parentId })
      // Before the database step: a group's members, as before.
      if (error && orgId) ({ data, error } = await supabase.rpc('list_org_members', { p_org: orgId }))
      if (!alive) return
      if (error) { console.error('Failed to load people for this Campfire:', error); setNote(t("Couldn't load who can be added. Try again.")); return }
      setPeople(data || [])
    })()
    return () => { alive = false }
  }, [parentId, orgId, t])

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
      setNote(error.message && error.message.length < 140 && error.code ? error.message : t("We couldn't add them. Try again."))
      return
    }
    setNote(p.display_name ? t('{name} was added.', { name: p.display_name }) : t('They were added.'))
    if (onAdded) await onAdded()
  }

  return (
    <>
      <h3 className="groups-section">{t('Add people')}</h3>
      <p className="groups-note">{t('Add anyone from the main chat. They are added right away.')}</p>
      <label htmlFor="sidechat-add-search" className="sr-only">{t('Search the group by name')}</label>
      <input id="sidechat-add-search" type="search" className="group-search" placeholder={t('Type a name')} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {options.slice(0, 12).map((p) => (
        <div key={p.user_id} className="group-member">
          <span className="group-member-name"><UserName userId={p.user_id} name={p.display_name || t('Neighbor')} /></span>
          <button type="button" className="btn btn-primary group-small-btn" disabled={!!busy} onClick={() => add(p)}>{busy === p.user_id ? t('Adding...') : t('Add')}</button>
        </div>
      ))}
      {people.length > 0 && options.length === 0 && <p className="groups-note">{term ? t('No one in the main chat by that name who is not already here.') : t('Everyone in the main chat is already here.')}</p>}
      {note && <p className="groups-note" role="status">{note}</p>}
    </>
  )
}
