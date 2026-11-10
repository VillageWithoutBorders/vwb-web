import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../utils/lang'

// Start a smaller Campfire (a thread) inside this chat (Nov 10, Jade: "allow, and make sure
// it works in other types of groups as well like organizations"). Anyone in the chat can.
// Pick a name and who to bring from this chat. You can add more people later.
export default function ThreadStart({ parentId, onStarted, onClose }) {
  const t = useT()
  const [name, setName] = useState('')
  const [people, setPeople] = useState(null)
  const [picked, setPicked] = useState(() => new Set())
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const nameRef = useRef(null)

  useEffect(() => { if (nameRef.current) nameRef.current.focus() }, [])
  useEffect(() => {
    let alive = true
    supabase.rpc('thread_people', { p_parent: parentId }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('[ThreadStart] people', error); setPeople([]); return }
      setPeople(data || [])
    })
    return () => { alive = false }
  }, [parentId])

  function toggle(uid) {
    setPicked((s) => { const n = new Set(s); if (n.has(uid)) n.delete(uid); else n.add(uid); return n })
  }

  async function start(e) {
    e.preventDefault()
    const n = name.trim()
    if (n.length < 2) { setNote(t('Give it a name.')); return }
    setBusy(true); setNote('')
    const { data, error } = await supabase.rpc('start_thread', { p_parent: parentId, p_name: n, p_members: [...picked] })
    setBusy(false)
    if (error || !data) {
      console.error('[ThreadStart] start', error)
      setNote(error && error.code === 'P0001' ? t(error.message) : t("We couldn't start it. Try again."))
      return
    }
    onStarted(data)
  }

  const term = q.trim().toLowerCase()
  const list = (people || []).filter((p) => !term || (p.display_name || '').toLowerCase().includes(term))

  return (
    <form className="thread-start" onSubmit={start} aria-labelledby="thread-start-h">
      <h2 id="thread-start-h" className="thread-start-h">{t('Start a smaller Campfire')}</h2>
      <p className="groups-note">{t('A side chat for a few people from this chat. Only the people in it can read it.')}</p>
      <label htmlFor="thread-name" className="gg-label">{t('Name')}</label>
      <input id="thread-name" ref={nameRef} type="text" className="group-search" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Like: Setup crew')} autoComplete="off" />
      <p className="gg-label" id="thread-who">{t('Who to bring (you can add more later)')}</p>
      {people === null && <p className="groups-note" role="status">{t('Loading...')}</p>}
      {people && people.length > 8 && (
        <>
          <label htmlFor="thread-search" className="sr-only">{t('Search by name')}</label>
          <input id="thread-search" type="search" className="group-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Type a name')} autoComplete="off" />
        </>
      )}
      <div role="group" aria-labelledby="thread-who" className="thread-people">
        {list.slice(0, 40).map((p) => (
          <label key={p.user_id} className="thread-person">
            <input type="checkbox" checked={picked.has(p.user_id)} onChange={() => toggle(p.user_id)} />
            <span>{p.display_name || t('Neighbor')}</span>
          </label>
        ))}
        {people && people.length === 0 && <p className="groups-note">{t('No one else is in this chat yet. You can start it now and add people later.')}</p>}
      </div>
      {note && <p className="groups-note" role="alert">{note}</p>}
      <div className="groups-actions">
        <button type="button" className="btn btn-outline" onClick={onClose}>{t('Cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('Starting...') : t('Start it')}</button>
      </div>
    </form>
  )
}
