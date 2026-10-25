import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import Icon from './Icon'

// "Invite to..." from Connections. Lists only the places you can invite this
// person to. Nobody is added until they say yes.

const SECTIONS = [
  { kind: 'chat', title: 'Cottage Chats', icon: 'cottage' },
  { kind: 'village', title: 'Villages', icon: 'houses' },
  { kind: 'organization', title: 'Groups', icon: 'people' },
  { kind: 'group', title: 'Groups', icon: 'tent' },
]

function doneText(kind, result, name) {
  if (result === 'nudged') return 'Sent. ' + name + ' lives in this area, so they can join any time.'
  if (result === 'sent' || result === 'invited') return kind === 'village' ? 'Invited as a guest. They can say yes or no.' : 'Invited. They can say yes or no.'
  if (result === 'already') return 'They are already here.'
  if (result === 'declined') return 'They said no not long ago. Try again in a few weeks.'
  if (result === 'removed') return 'They were removed from this village before.'
  if (result === 'notallowed') return 'Only Heads and organizers can invite here.'
  return "We couldn't send that. Try again."
}

export default function InviteSheet({ person, onClose }) {
  const [places, setPlaces] = useState(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState('')
  const [notes, setNotes] = useState({})
  const headRef = useRef(null)
  const name = person.display_name || 'this neighbor'

  async function load() {
    const { data, error } = await supabase.rpc('invite_places', { p_user: person.user_id })
    if (error) { console.error('Failed to load invite places:', error); setFailed(true); setPlaces([]); return }
    setPlaces(data || [])
  }
  useEffect(() => { load() }, [person.user_id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (headRef.current) headRef.current.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function invite(p) {
    const key = p.kind + p.place_id
    setBusy(key)
    let result = 'error'
    if (p.kind === 'chat') {
      const { error } = await supabase.rpc('invite_to_community_group', { p_group: p.place_id, p_invitee: person.user_id })
      if (error) {
        console.error('Cottage Chat invite failed:', error)
        result = error.code === '42501' && error.message ? 'msg:' + error.message : 'error'
      } else result = 'invited'
    } else if (p.kind === 'village') {
      const { data, error } = await supabase.rpc('invite_to_village', { p_village: p.place_id, p_user: person.user_id })
      if (error) console.error('Village invite failed:', error)
      else result = data
    } else {
      const { data, error } = await supabase.rpc('invite_to_org', { p_org: p.place_id, p_user: person.user_id })
      if (error) console.error('Organization invite failed:', error)
      else result = data
    }
    setBusy('')
    const text = result.startsWith('msg:') ? result.slice(4) : doneText(p.kind, result, name)
    setNotes((n) => ({ ...n, [key]: text }))
    if (['invited', 'sent', 'nudged', 'already'].includes(result)) {
      setPlaces((list) => list.map((x) => (x.kind === p.kind && x.place_id === p.place_id ? { ...x, state: result === 'already' ? 'in' : 'invited' } : x)))
    }
  }

  const any = places && places.length > 0

  return (
    <div className="tools-shade" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tools-sheet inv-sheet" role="dialog" aria-modal="true" aria-labelledby="inv-h">
        <h2 id="inv-h" tabIndex={-1} ref={headRef}>Invite {name}</h2>
        <p className="inv-lead">They get an alert and choose yes or no. No one is added without saying yes.</p>

        {places === null && <p className="inv-note" role="status">Loading...</p>}
        {failed && <p className="inv-note" role="alert">We couldn't load your places. Try again.</p>}
        {places && !failed && !any && (
          <p className="inv-note">There's nowhere you can invite them yet. You can invite people to your Cottage Chats, your villages, and groups or crews you run.</p>
        )}

        {any && SECTIONS.map((s) => {
          const list = places.filter((p) => p.kind === s.kind)
          if (list.length === 0) return null
          return (
            <section key={s.kind} className="inv-sec" aria-labelledby={'inv-' + s.kind}>
              <h3 id={'inv-' + s.kind}>{s.title}</h3>
              <ul className="inv-list">
                {list.map((p) => {
                  const key = p.kind + p.place_id
                  return (
                    <li key={key} className="inv-row">
                      <span className="inv-ic" aria-hidden="true"><Icon name={s.icon} size={28} /></span>
                      <span className="inv-main">
                        <b>{p.name}</b>
                        {notes[key] && <small role="status">{notes[key]}</small>}
                        {!notes[key] && p.state === 'wait' && p.wait_until && (
                          <small>You can invite by name here starting {new Date(p.wait_until).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.</small>
                        )}
                      </span>
                      {p.state === 'ok' && (
                        <button type="button" className="btn btn-primary inv-btn" disabled={!!busy} onClick={() => invite(p)} aria-label={'Invite ' + name + ' to ' + p.name}>
                          {busy === key ? 'Sending...' : 'Invite'}
                        </button>
                      )}
                      {p.state === 'in' && <span className="inv-state">Already in</span>}
                      {p.state === 'invited' && <span className="inv-state">Invited</span>}
                      {p.state === 'wait' && <span className="inv-state">Not yet</span>}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}

        <button type="button" className="btn btn-outline btn-full inv-close" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
