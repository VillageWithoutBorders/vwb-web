import { useState } from 'react'
import { supabase } from '../supabaseClient'
import Icon from './Icon'
import { GROUNDS } from '../data/worldElements'

// "How our page looks" (Oct 22). Leaders of an organization or emergency group
// choose the ground, a sign (a picture that stands for them), which places show,
// and their own names for places. Everyone else sees the result.
// Saved in organizations.scene by set_org_scene (vwb-org-scene.sql).
const SIGNS = ['people', 'tent', 'heart-hands', 'handshake', 'houses', 'cottage', 'tree', 'leaf', 'sprout', 'basket', 'bread', 'toolbox', 'medical', 'books', 'star', 'sun', 'water', 'flag', 'gift', 'campfire']

export default function OrgSceneEditor({ org, spots, isGroup, onSaved }) {
  const start = org.scene || {}
  const [ground, setGround] = useState(start.ground || '')
  const [sign, setSign] = useState(start.sign || '')
  const [hide, setHide] = useState(Array.isArray(start.hide) ? start.hide : [])
  const [names, setNames] = useState(start.names && typeof start.names === 'object' ? start.names : {})
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')

  const defaultGround = isGroup ? 'clearings' : 'roads'
  const kind = isGroup ? 'group' : 'organization'

  async function save(reset) {
    setSaving(true); setNote('')
    const scene = reset ? null : { ground: ground || null, sign: sign || null, hide, names }
    const { data, error } = await supabase.rpc('set_org_scene', { p_org: org.id, p_scene: scene })
    setSaving(false)
    if (error || data !== 'ok') { console.error('Failed to save the page look:', error || data); setNote("We couldn't save that. Try again."); return }
    if (reset) { setGround(''); setSign(''); setHide([]); setNames({}) }
    setNote(reset ? 'Back to the usual look.' : 'Saved. Everyone sees the new look now.')
    if (onSaved) onSaved()
  }

  return (
    <section className="cal-box ose" aria-labelledby="ose-h">
      <h3 id="ose-h">How our page looks</h3>
      <p className="cal-sub">Make this {kind} page feel like yours. Everyone who opens it sees your choices.</p>

      <h4 className="ose-h">Ground</h4>
      <div className="vs-grounds ose-grounds" role="group" aria-label="Ground">
        {GROUNDS.map((g) => {
          const on = (ground || defaultGround) === g.k
          return (
            <button key={g.k} type="button" className={'vs-ground-card' + (on ? ' on' : '')} aria-pressed={on} onClick={() => setGround(g.k)}>
              <img src={g.src} alt="" width="72" height="108" loading="lazy" />
              <span>{g.label}</span>
            </button>
          )
        })}
      </div>

      <h4 className="ose-h">Our sign</h4>
      <p className="cal-sub">A picture that stands for you. It shows by your name.</p>
      <div className="ose-signs" role="group" aria-label="Our sign">
        {SIGNS.map((s) => {
          const on = (sign || (isGroup ? 'tent' : 'people')) === s
          return (
            <button key={s} type="button" className={'ose-sign' + (on ? ' on' : '')} aria-pressed={on} aria-label={s.replace('-', ' ')} onClick={() => setSign(s)}>
              <Icon name={s} size={36} />
            </button>
          )
        })}
      </div>

      <h4 className="ose-h">Places on our map</h4>
      <p className="cal-sub">Untick a place to hide it. Tap a name to change it (30 letters at most). Leave it empty to keep the usual name.</p>
      <ul className="ose-places">
        {spots.filter((s) => s.k !== 'tools').map((s) => {
          const shown = !hide.includes(s.k)
          return (
            <li key={s.k} className="ose-place">
              <label className="ose-show">
                <input type="checkbox" checked={shown} onChange={() => setHide((h) => (shown ? [...h, s.k] : h.filter((x) => x !== s.k)))} />
                <span className="ose-ic" aria-hidden="true"><Icon name={s.icon} size={28} /></span>
                <span className="sr-only">Show {s.label} on our map</span>
              </label>
              <label className="ose-name">
                <span className="sr-only">Name for {s.label}</span>
                <input type="text" maxLength={30} value={names[s.k] || ''} placeholder={s.label} disabled={!shown}
                  onChange={(e) => setNames((n) => { const next = { ...n }; if (e.target.value.trim()) next[s.k] = e.target.value; else delete next[s.k]; return next })} />
              </label>
            </li>
          )
        })}
      </ul>

      {note && <p className="hub-note" role="status">{note}</p>}
      <div className="ose-buttons">
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => save(false)}>{saving ? 'Saving...' : 'Save our look'}</button>
        <button type="button" className="btn btn-outline" disabled={saving} onClick={() => save(true)}>Back to the usual look</button>
      </div>
    </section>
  )
}
