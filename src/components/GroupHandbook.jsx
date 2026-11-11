import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { decryptMany, getDeviceId } from '../lib/e2ee'
import { askConfirm } from './AdminDialog'
import Icon from './Icon'
import { useT } from '../utils/lang'

// Round E part 3 (Nov 10): the group handbook. Rules, How we work, Links, and
// Pinned posts, for members only (vwb-handbook-and-today.sql). Searchable.
// Leaders and the members they choose can edit it and pin chat posts.
// Pinned posts stay scrambled: this phone opens each one the same way the chat does.

async function openPins(pins, userId) {
  const out = new Map()
  if (!pins.length) return out
  const ids = pins.map((p) => p.post_id)
  const { data: rows, error } = await supabase.from('community_group_posts').select('id, sender_id, deleted_at').in('id', ids)
  if (error) { console.error('Failed to load pinned posts:', error); return out }
  const live = (rows || []).filter((r) => !r.deleted_at)
  const deviceId = await getDeviceId()
  if (!deviceId || !live.length) { live.forEach((r) => out.set(r.id, null)); return out }
  const { data: c, error: cErr } = await supabase.from('community_group_post_copies').select('post_id, ciphertext, nonce, version')
    .in('post_id', live.map((r) => r.id)).eq('user_id', userId).eq('device_id', deviceId)
  if (cErr) console.error('Failed to load pinned copies:', cErr)
  const newest = new Map()
  for (const row of c || []) { const have = newest.get(row.post_id); if (!have || (row.version || 1) > (have.version || 1)) newest.set(row.post_id, row) }
  const senderOf = Object.fromEntries(live.map((r) => [r.id, r.sender_id]))
  const opened = await decryptMany([...newest.values()].map((x) => ({ key: x.post_id, ciphertext: x.ciphertext, nonce: x.nonce, senderId: senderOf[x.post_id] })))
  live.forEach((r) => out.set(r.id, opened.get(r.id) ?? null))
  return out
}

export default function GroupHandbook({ orgId, orgName }) {
  const t = useT()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [hb, setHb] = useState(null)
  const [texts, setTexts] = useState(new Map())
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [members, setMembers] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('org_handbook_get', { p_org: orgId })
    if (error) { console.error('Failed to load the handbook:', error); setHb({ ok: false, failed: error.code !== 'PGRST202' }); return }
    setHb(data || { ok: false })
    if (data?.ok && user) setTexts(await openPins(data.pins || [], user.id))
  }, [orgId, user])
  useEffect(() => { load() }, [load])

  if (!hb) return <p role="status">{t('Loading...')}</p>
  if (!hb.ok) return hb.failed ? <p className="vs-note" role="alert">{t("We couldn't load the handbook. Try again.")}</p> : null

  function startEdit() {
    setDraft({ rules: hb.rules || '', how: hb.how_we_work || '', links: (hb.links || []).map((l) => ({ label: l.label || '', url: l.url || '' })) })
    setEditing(true); setNote('')
    if (hb.is_leader && members === null) {
      supabase.rpc('list_org_members', { p_org: orgId }).then(({ data, error }) => {
        if (error) { console.error('Failed to load members:', error); setMembers([]); return }
        setMembers((data || []).filter((m) => m.role === 'member'))
      })
    }
  }
  async function save(e) {
    e.preventDefault()
    const links = draft.links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim(), url: /^https?:\/\//i.test(l.url.trim()) ? l.url.trim() : 'https://' + l.url.trim() }))
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('org_handbook_save', { p_org: orgId, p_rules: draft.rules, p_how: draft.how, p_links: links })
    setBusy(false)
    if (error) { console.error('Failed to save the handbook:', error); setNote(['22001', '22023'].includes(error.code) ? error.message : t("We couldn't save that. Try again.")); return }
    setEditing(false)
    await load()
  }
  async function unpin(p) {
    if (!(await askConfirm(t('Take this post out of the handbook? It stays in the chat.'), { yes: t('Unpin'), no: t('Keep it') }))) return
    const { error } = await supabase.rpc('org_handbook_unpin', { p_pin: p.id })
    if (error) { console.error('Failed to unpin:', error); setNote(t("We couldn't save that. Try again.")); return }
    await load()
  }
  async function setHelper(m, on) {
    setBusy(true)
    const { error } = await supabase.rpc('org_handbook_set_helper', { p_org: orgId, p_user: m.user_id, p_on: on })
    setBusy(false)
    if (error) { console.error('Failed to change who can edit:', error); setNote(t("We couldn't save that. Try again.")); return }
    await load()
  }

  // Search: whole sections, links and pins that contain the words.
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const hit = (s) => !words.length || words.every((w) => (s || '').toLowerCase().includes(w))
  const pins = (hb.pins || []).map((p) => ({ ...p, text: texts.get(p.post_id) }))
  const shownPins = pins.filter((p) => hit((p.label || '') + ' ' + (p.text || '') + ' ' + (p.group_name || '')))
  const shownLinks = (hb.links || []).filter((l) => hit((l.label || '') + ' ' + l.url))
  const showRules = hb.rules && hit(hb.rules)
  const showHow = hb.how_we_work && hit(hb.how_we_work)
  const empty = !hb.rules && !hb.how_we_work && !(hb.links || []).length && !pins.length
  const nothingFound = words.length && !showRules && !showHow && !shownLinks.length && !shownPins.length
  const helperIds = new Set((hb.helpers || []).map((h) => h.user_id))

  if (editing && draft) {
    return (
      <form className="hb-edit" onSubmit={save} noValidate>
        <label htmlFor="hb-rules">{t('Rules')}</label>
        <textarea id="hb-rules" rows={5} maxLength={4000} value={draft.rules} onChange={(e) => setDraft({ ...draft, rules: e.target.value })}
          placeholder={t('For example: Be kind. No photos of people without asking. What is said here stays here.')} />
        <label htmlFor="hb-how">{t('How we work')}</label>
        <textarea id="hb-how" rows={5} maxLength={4000} value={draft.how} onChange={(e) => setDraft({ ...draft, how: e.target.value })}
          placeholder={t('For example: We meet the first Tuesday. Anyone can suggest a decision. Shifts are posted on events.')} />
        <fieldset className="hb-links-edit">
          <legend>{t('Links')}</legend>
          {draft.links.map((l, i) => (
            <div key={i} className="hb-link-row">
              <input type="text" aria-label={t('Name of link {n}', { n: i + 1 })} placeholder={t('Name, like Our Signal group')} maxLength={80} value={l.label}
                onChange={(e) => setDraft({ ...draft, links: draft.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <input type="url" inputMode="url" aria-label={t('Web address of link {n}', { n: i + 1 })} placeholder="https://" maxLength={300} value={l.url}
                onChange={(e) => setDraft({ ...draft, links: draft.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
              <button type="button" className="btn btn-outline" onClick={() => setDraft({ ...draft, links: draft.links.filter((_, j) => j !== i) })}>{t('Remove')}</button>
            </div>
          ))}
          {draft.links.length < 20 && <button type="button" className="btn btn-outline btn-full" onClick={() => setDraft({ ...draft, links: [...draft.links, { label: '', url: '' }] })}>{t('Add a link')}</button>}
        </fieldset>
        {hb.is_leader && (
          <fieldset className="hb-helpers">
            <legend>{t('Who else can edit and pin')}</legend>
            <p className="vs-note">{t('Leaders always can. Pick members to help keep the handbook up to date.')}</p>
            {members === null && <p role="status">{t('Loading...')}</p>}
            {members && members.length === 0 && <p className="vs-note">{t('No other members yet.')}</p>}
            {members && members.map((m) => (
              <label key={m.user_id} className="org-default">
                <input type="checkbox" checked={helperIds.has(m.user_id)} disabled={busy} onChange={(e) => setHelper(m, e.target.checked)} />
                <span>{m.display_name}</span>
              </label>
            ))}
          </fieldset>
        )}
        {note && <p className="form-error" role="alert">{note}</p>}
        <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{busy ? t('Saving...') : t('Save the handbook')}</button>
        <button type="button" className="btn btn-outline btn-full" onClick={() => setEditing(false)}>{t('Cancel')}</button>
      </form>
    )
  }

  return (
    <div className="hb">
      {!empty && (
        <div className="hb-search">
          <label htmlFor="hb-q" className="sr-only">{t('Search the handbook')}</label>
          <input id="hb-q" type="search" inputMode="search" autoComplete="off" placeholder={t('Search the handbook')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {empty && <p className="vs-note">{hb.can_edit ? t('The handbook is empty. Add your rules, how you work, and links people need.') : t('Nothing in the handbook yet.')}</p>}
      {nothingFound ? <p className="vs-note" role="status">{t('Nothing in the handbook matches that.')}</p> : null}
      {showRules && <section className="hb-part"><h3>{t('Rules')}</h3><p className="hb-text">{hb.rules}</p></section>}
      {showHow && <section className="hb-part"><h3>{t('How we work')}</h3><p className="hb-text">{hb.how_we_work}</p></section>}
      {shownLinks.length > 0 && (
        <section className="hb-part"><h3>{t('Links')}</h3>
          <ul className="hb-links">
            {shownLinks.map((l, i) => <li key={i}><a href={l.url} target="_blank" rel="noopener noreferrer">{l.label || l.url}</a></li>)}
          </ul>
        </section>
      )}
      {shownPins.length > 0 && (
        <section className="hb-part"><h3><Icon name="pin" /> {t('Pinned posts')}</h3>
          {shownPins.map((p) => (
            <div key={p.id} className="hb-pin">
              {p.label && <b>{p.label}</b>}
              {p.text ? <p className="hb-text">{p.text}</p> : <p className="vs-note">{t('This post opens in {chat}. Open the chat to read it.', { chat: p.group_name })}</p>}
              <div className="hb-pin-btns">
                <button type="button" className="gh-link" onClick={() => navigate('/groups/' + p.group_id)}>{t('From {chat}', { chat: p.group_name })}</button>
                {hb.can_edit && <button type="button" className="gh-link" onClick={() => unpin(p)}>{t('Unpin')}</button>}
              </div>
            </div>
          ))}
        </section>
      )}
      {hb.can_edit && <>
        <button type="button" className="btn btn-outline btn-full" onClick={startEdit}>{t('Edit the handbook')}</button>
        <p className="vs-note">{t('To pin a post, open a chat of {name} and tap Pin under the post.', { name: orgName })}</p>
      </>}
      {note && <p className="form-error" role="alert">{note}</p>}
    </div>
  )
}
