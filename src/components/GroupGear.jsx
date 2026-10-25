import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// "What we bring" for an emergency response Group.
// Each member picks the skills and gear they can bring. Keepers and Helpers see everyone's
// list. Members see their own list and the group's totals (no names).
// The database checks all of this too (vwb-groups-emergency.sql).

const SKILLS = ['First aid', 'CPR', 'Chainsaw work', 'Mold cleanup', 'Mucking out', 'Tarps and roofing', 'Carpentry', 'Electrical', 'Plumbing', 'Cooking', 'Childcare', 'Driving', 'Spanish', 'Listening ear']
const GEAR = ['Truck', 'Trailer', 'Chainsaw', 'Generator', 'Water pump', 'Shop vac', 'Dehumidifier', 'Ladder', 'Tarps', 'Boat or kayak', 'Coolers', 'Water jugs']

function Picker({ label, options, picked, setPicked, idBase }) {
  const [extra, setExtra] = useState('')
  const all = [...options, ...picked.filter((p) => !options.includes(p))]
  function toggle(x) { setPicked(picked.includes(x) ? picked.filter((p) => p !== x) : [...picked, x]) }
  function add(e) {
    e.preventDefault()
    const t = extra.trim().slice(0, 40)
    if (t && !picked.includes(t) && picked.length < 20) setPicked([...picked, t])
    setExtra('')
  }
  return (
    <fieldset className="gg-set">
      <legend>{label}</legend>
      <div className="gg-chips">
        {all.map((x) => (
          <button key={x} type="button" className={'gg-chip' + (picked.includes(x) ? ' gg-on' : '')} aria-pressed={picked.includes(x)} onClick={() => toggle(x)}>{x}</button>
        ))}
      </div>
      <div className="gg-add">
        <label htmlFor={idBase + '-add'} className="sr-only">Add your own {label.toLowerCase()}</label>
        <input id={idBase + '-add'} type="text" maxLength={40} placeholder="Add your own" value={extra} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(e) }} />
        <button type="button" className="btn btn-outline" onClick={add} disabled={!extra.trim()}>Add</button>
      </div>
    </fieldset>
  )
}

export default function GroupGear({ orgId, orgName, isKeeper }) {
  const [rows, setRows] = useState(null)
  const [totals, setTotals] = useState([])
  const [skills, setSkills] = useState([])
  const [gear, setGear] = useState([])
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const [g, t] = await Promise.all([
      supabase.rpc('group_gear', { p_org: orgId }),
      supabase.rpc('group_gear_summary', { p_org: orgId }),
    ])
    if (g.error) console.error('Failed to load what members bring:', g.error)
    if (t.error) console.error('Failed to load group totals:', t.error)
    const list = g.data || []
    setRows(list)
    setTotals(t.data || [])
    const me = list.find((r) => r.is_me)
    setSkills(me ? me.skills || [] : [])
    setGear(me ? me.gear || [] : [])
    setNote(me?.note || '')
    if (!me) setEditing(true)
  }

  useEffect(() => { load() }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true); setMsg('')
    const { data, error } = await supabase.rpc('set_my_group_gear', { p_org: orgId, p_skills: skills, p_gear: gear, p_note: note.trim() || null })
    setSaving(false)
    if (error || data !== 'saved') { console.error('Failed to save what you bring:', error || data); setMsg("We couldn't save that. Try again."); return }
    setMsg("Saved. Your crew's Keepers and Helpers can see what you bring.")
    setEditing(false)
    load()
  }

  if (rows === null) return <p role="status">Loading...</p>
  const me = rows.find((r) => r.is_me)
  const others = rows.filter((r) => !r.is_me)
  const skillTotals = totals.filter((t) => t.kind === 'skill')
  const gearTotals = totals.filter((t) => t.kind === 'gear')

  return (
    <div className="gg">
      <h3>What you bring</h3>
      {editing ? <>
        <p className="vs-note">Pick what you could bring when {orgName} is called to help. Only its Keepers and Helpers see your name with it.</p>
        <Picker label="Skills" options={SKILLS} picked={skills} setPicked={setSkills} idBase="gg-skill" />
        <Picker label="Gear" options={GEAR} picked={gear} setPicked={setGear} idBase="gg-gear" />
        <label htmlFor="gg-note" className="gg-label">Anything else (optional)</label>
        <textarea id="gg-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Like: free on weekends, can't lift heavy things" />
        <button type="button" className="btn btn-primary btn-full" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save what I bring'}</button>
      </> : <>
        <div className="vs-item">
          <b>{[...(me?.skills || []), ...(me?.gear || [])].join(', ') || 'Nothing picked yet'}</b>
          {me?.note && <small>{me.note}</small>}
        </div>
        <button type="button" className="btn btn-outline btn-full" onClick={() => { setEditing(true); setMsg('') }}>Change what I bring</button>
      </>}
      {msg && <p className="vs-note" role="status">{msg}</p>}

      <h3>The whole crew</h3>
      {totals.length === 0
        ? <p className="vs-note">Nobody has listed anything yet.</p>
        : <>
            {skillTotals.length > 0 && <p className="gg-totals"><b>Skills:</b> {skillTotals.map((t) => t.item + (t.people > 1 ? ' (' + t.people + ')' : '')).join(', ')}</p>}
            {gearTotals.length > 0 && <p className="gg-totals"><b>Gear:</b> {gearTotals.map((t) => t.item + (t.people > 1 ? ' (' + t.people + ')' : '')).join(', ')}</p>}
          </>}

      {isKeeper && others.length > 0 && <>
        <h3>Each member (Keepers and Helpers only)</h3>
        {others.map((r) => (
          <div key={r.user_id} className="vs-item">
            <b>{r.display_name}</b>
            <small>{[...(r.skills || []), ...(r.gear || [])].join(', ') || 'Nothing listed'}</small>
            {r.note && <small>{r.note}</small>}
          </div>
        ))}
      </>}
    </div>
  )
}
