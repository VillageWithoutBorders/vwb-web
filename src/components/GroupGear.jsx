import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../utils/lang'

// "What we bring" for an emergency response Group.
// Each member picks the skills and gear they can bring. Keepers and Helpers see everyone's
// list. Members see their own list and the group's totals (no names).
// The database checks all of this too (vwb-groups-emergency.sql).

const SKILLS = ['First aid', 'CPR', 'Chainsaw work', 'Mold cleanup', 'Mucking out', 'Tarps and roofing', 'Carpentry', 'Electrical', 'Plumbing', 'Cooking', 'Childcare', 'Driving', 'Spanish', 'Listening ear']
const GEAR = ['Truck', 'Trailer', 'Chainsaw', 'Generator', 'Water pump', 'Shop vac', 'Dehumidifier', 'Ladder', 'Tarps', 'Boat or kayak', 'Coolers', 'Water jugs']

function Picker({ label, options, picked, setPicked, idBase }) {
  const [extra, setExtra] = useState('')
  const t = useT()
  const all = [...options, ...picked.filter((p) => !options.includes(p))]
  function toggle(x) { setPicked(picked.includes(x) ? picked.filter((p) => p !== x) : [...picked, x]) }
  function add(e) {
    e.preventDefault()
    const v = extra.trim().slice(0, 40)
    if (v && !picked.includes(v) && picked.length < 20) setPicked([...picked, v])
    setExtra('')
  }
  return (
    <fieldset className="gg-set">
      <legend>{t(label)}</legend>
      <div className="gg-chips">
        {all.map((x) => (
          <button key={x} type="button" className={'gg-chip' + (picked.includes(x) ? ' gg-on' : '')} aria-pressed={picked.includes(x)} onClick={() => toggle(x)}>{t(x)}</button>
        ))}
      </div>
      <div className="gg-add">
        <label htmlFor={idBase + '-add'} className="sr-only">{t(label === 'Skills' ? 'Add your own skills' : 'Add your own gear')}</label>
        <input id={idBase + '-add'} type="text" maxLength={40} placeholder={t('Add your own')} value={extra} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(e) }} />
        <button type="button" className="btn btn-outline" onClick={add} disabled={!extra.trim()}>{t('Add')}</button>
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
  const t = useT()

  async function load() {
    const [g, s] = await Promise.all([
      supabase.rpc('group_gear', { p_org: orgId }),
      supabase.rpc('group_gear_summary', { p_org: orgId }),
    ])
    if (g.error) console.error('Failed to load what members bring:', g.error)
    if (s.error) console.error('Failed to load group totals:', s.error)
    const list = g.data || []
    setRows(list)
    setTotals(s.data || [])
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
    if (error || data !== 'saved') { console.error('Failed to save what you bring:', error || data); setMsg(t("We couldn't save that. Try again.")); return }
    setMsg(t("Saved. Your crew's Keepers and Helpers can see what you bring."))
    setEditing(false)
    load()
  }

  if (rows === null) return <p role="status">{t('Loading...')}</p>
  const me = rows.find((r) => r.is_me)
  const others = rows.filter((r) => !r.is_me)
  const skillTotals = totals.filter((x) => x.kind === 'skill')
  const gearTotals = totals.filter((x) => x.kind === 'gear')

  return (
    <div className="gg">
      <h3>{t('What you bring')}</h3>
      {editing ? <>
        <p className="vs-note">{t('Pick what you could bring when {name} is called to help. Only its Keepers and Helpers see your name with it.', { name: orgName })}</p>
        <Picker label="Skills" options={SKILLS} picked={skills} setPicked={setSkills} idBase="gg-skill" />
        <Picker label="Gear" options={GEAR} picked={gear} setPicked={setGear} idBase="gg-gear" />
        <label htmlFor="gg-note" className="gg-label">{t('Anything else (optional)')}</label>
        <textarea id="gg-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Like: free on weekends, can't lift heavy things")} />
        <button type="button" className="btn btn-primary btn-full" onClick={save} disabled={saving}>{saving ? t('Saving...') : t('Save what I bring')}</button>
      </> : <>
        <div className="vs-item">
          <b>{[...(me?.skills || []), ...(me?.gear || [])].map((x) => t(x)).join(', ') || t('Nothing picked yet')}</b>
          {me?.note && <small>{me.note}</small>}
        </div>
        <button type="button" className="btn btn-outline btn-full" onClick={() => { setEditing(true); setMsg('') }}>{t('Change what I bring')}</button>
      </>}
      {msg && <p className="vs-note" role="status">{msg}</p>}

      <h3>{t('The whole crew')}</h3>
      {totals.length === 0
        ? <p className="vs-note">{t('Nobody has listed anything yet.')}</p>
        : <>
            {skillTotals.length > 0 && <p className="gg-totals"><b>{t('Skills:')}</b> {skillTotals.map((x) => t(x.item) + (x.people > 1 ? ' (' + x.people + ')' : '')).join(', ')}</p>}
            {gearTotals.length > 0 && <p className="gg-totals"><b>{t('Gear:')}</b> {gearTotals.map((x) => t(x.item) + (x.people > 1 ? ' (' + x.people + ')' : '')).join(', ')}</p>}
          </>}

      {isKeeper && others.length > 0 && <>
        <h3>{t('Each member (Keepers and Helpers only)')}</h3>
        {others.map((r) => (
          <div key={r.user_id} className="vs-item">
            <b>{r.display_name}</b>
            <small>{[...(r.skills || []), ...(r.gear || [])].map((x) => t(x)).join(', ') || t('Nothing listed')}</small>
            {r.note && <small>{r.note}</small>}
          </div>
        ))}
      </>}
    </div>
  )
}
