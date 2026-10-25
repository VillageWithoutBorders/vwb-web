import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// The neighborhoods an organization works in.
// Everyone signed in sees the list. Organizers pick the neighborhoods.
// A neighborhood keeper can remove an organization; it then cannot add that neighborhood back.

export default function OrgVillages({ orgId, orgName, canManage }) {
  const [links, setLinks] = useState(null)
  const [villages, setVillages] = useState([])
  const [blocked, setBlocked] = useState([])
  const [picked, setPicked] = useState({})
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [filter, setFilter] = useState('')

  async function loadLinks() {
    const { data, error } = await supabase.rpc('org_village_links')
    if (error) { console.error('Failed to load organization neighborhoods:', error); setLinks([]); return [] }
    const mine = (data || []).filter((r) => String(r.org_id) === String(orgId))
    setLinks(mine)
    return mine
  }

  useEffect(() => { loadLinks() }, [orgId])

  async function startEditing() {
    setNote('')
    const [vn, bl] = await Promise.all([
      supabase.rpc('village_network'),
      supabase.rpc('my_org_village_blocks', { p_org: orgId }),
    ])
    if (vn.error) { console.error('Failed to load villages:', vn.error); setNote("We couldn't load the neighborhoods. Try again."); return }
    if (bl.error) console.error('Failed to load removed neighborhoods:', bl.error)
    setVillages((vn.data || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name))))
    setBlocked(bl.data || [])
    const p = {}
    ;(links || []).forEach((r) => { p[r.village_id] = true })
    setPicked(p)
    setEditing(true)
  }

  async function save() {
    setSaving(true); setNote('')
    const ids = Object.keys(picked).filter((k) => picked[k])
    const { data, error } = await supabase.rpc('set_org_villages', { p_org: orgId, p_villages: ids })
    setSaving(false)
    if (error) { console.error('Failed to save organization neighborhoods:', error); setNote("We couldn't save that. Try again."); return }
    await loadLinks()
    setEditing(false)
    const skipped = Array.isArray(data) ? data : []
    setNote(skipped.length
      ? 'Saved. ' + skipped.join(', ') + (skipped.length === 1 ? ' was' : ' were') + ' left off because a keeper there removed your group.'
      : 'Saved. Neighbors will see your group in these neighborhoods.')
  }

  const blockedIds = useMemo(() => new Set(blocked.map((b) => String(b.village_id))), [blocked])
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return f ? villages.filter((v) => String(v.name).toLowerCase().includes(f) || String(v.region_label || '').toLowerCase().includes(f)) : villages
  }, [villages, filter])

  if (links === null) return null
  if (!canManage && links.length === 0) return null

  return (
    <section className="cal-box" aria-labelledby="org-villages">
      <h2 id="org-villages">{canManage ? 'Neighborhoods you work in' : 'Works in'}</h2>

      {!editing && (
        <>
          {links.length > 0
            ? <p style={{ margin: '0 0 0.5rem' }}>{links.map((r) => r.village_name).join(', ')}</p>
            : <p className="cal-sub" style={{ margin: '0 0 0.5rem' }}>No neighborhoods picked yet. Pick the ones you serve so neighbors there can find you.</p>}
          {!canManage && <Link to="/world" className="hub-more">See them on the World map</Link>}
          {canManage && <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} onClick={startEditing}>{links.length ? 'Change neighborhoods' : 'Pick neighborhoods'}</button>}
        </>
      )}

      {editing && (
        <>
          <p className="cal-sub" style={{ margin: '0 0 0.5rem' }}>Pick every neighborhood {orgName} serves. A keeper of a neighborhood can remove you if it is not a fit.</p>
          {villages.length > 8 && (
            <>
              <label htmlFor="org-village-filter" className="sr-only">Filter neighborhoods</label>
              <input id="org-village-filter" type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name" autoComplete="off" style={{ width: '100%', minHeight: '44px', boxSizing: 'border-box', padding: '0 0.75rem', fontSize: '1rem', marginBottom: '0.5rem' }} />
            </>
          )}
          <div role="group" aria-label="Neighborhoods" style={{ display: 'grid', gap: '0.25rem', maxHeight: '320px', overflowY: 'auto', marginBottom: '0.5rem' }}>
            {shown.map((v) => {
              const isBlocked = blockedIds.has(String(v.id))
              return (
                <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minHeight: '44px', opacity: isBlocked ? 0.6 : 1, cursor: isBlocked ? 'not-allowed' : 'pointer' }}>
                  <input type="checkbox" checked={!!picked[v.id] && !isBlocked} disabled={isBlocked} onChange={(e) => setPicked((m) => ({ ...m, [v.id]: e.target.checked }))} style={{ width: '22px', height: '22px', flex: 'none' }} />
                  <span>
                    {v.name}
                    {v.region_label ? <span className="cal-sub" style={{ display: 'block', fontSize: '0.85rem' }}>{v.region_label}</span> : null}
                    {isBlocked ? <span className="cal-sub" style={{ display: 'block', fontSize: '0.85rem' }}>A keeper here removed your group.</span> : null}
                  </span>
                </label>
              )
            })}
            {shown.length === 0 && <p className="cal-sub">No neighborhoods match.</p>}
          </div>
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px', marginBottom: '0.5rem' }} onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save neighborhoods'}</button>
          <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} onClick={() => { setEditing(false); setNote('') }} disabled={saving}>Cancel</button>
        </>
      )}

      {note && <p className="hub-note" role="status">{note}</p>}
    </section>
  )
}
