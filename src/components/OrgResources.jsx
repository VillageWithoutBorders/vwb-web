import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Resources that belong to one organization, for its organizers. See them all
// (even ones still waiting for review) and fix them directly. The database
// checks that you organize this group, so a hidden button is never the only
// protection.
const FIELDS = [
  ['name', 'Name', 'text'],
  ['description', 'Description', 'area'],
  ['phone', 'Phone', 'tel'],
  ['url', 'Website', 'url'],
  ['address', 'Address', 'text'],
  ['requirements', 'What to bring, or things to know', 'area'],
]

const inputStyle = { display: 'block', width: '100%', boxSizing: 'border-box', minHeight: '48px', padding: '0.5rem 0.75rem', marginBottom: '0.6rem', borderRadius: '8px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '1rem', fontFamily: 'inherit' }

export default function OrgResources({ orgId }) {
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_org_resources', { p_org: orgId })
    if (error) { console.error('list_org_resources', error); setNote("Couldn't load resources right now."); setRows([]); return }
    setRows(data || [])
  }, [orgId])

  useEffect(() => { load() }, [load])

  function open(r) {
    setNote('')
    setDraft({ name: r.name || '', description: r.description || '', phone: r.phone || '', url: r.url || '', address: r.address || '', requirements: r.requirements || '' })
    setEditing(r.id)
  }

  async function save(e) {
    e.preventDefault()
    if (!draft.name.trim()) { setNote('Add a name.'); return }
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('update_org_resource', {
      p_resource: editing,
      p_name: draft.name, p_description: draft.description, p_phone: draft.phone,
      p_url: draft.url, p_address: draft.address, p_requirements: draft.requirements,
    })
    setBusy(false)
    if (error) { console.error('update_org_resource', error); setNote("Couldn't save. Try again."); return }
    setEditing(null)
    setNote('Saved.')
    load()
  }

  return (
    <section className="hub-section" aria-labelledby="od-resources">
      <div className="hub-section-head">
        <h2 id="od-resources">Resources</h2>
        <Link to="/community/resources" style={{ color: '#4ecca3', minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}>+ Add resource</Link>
      </div>
      {rows === null && <p>Loading...</p>}
      {rows && rows.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No resources are listed under this group yet. Tap Add resource and choose this group.</p>}
      {rows && rows.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {rows.map((r) => (
            <li key={r.id} style={{ padding: '0.75rem', background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px' }}>
              {editing === r.id ? (
                <form onSubmit={save}>
                  {FIELDS.map(([key, label, kind]) => (
                    <div key={key}>
                      <label htmlFor={'or-' + r.id + '-' + key} style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>{label}</label>
                      {kind === 'area'
                        ? <textarea id={'or-' + r.id + '-' + key} rows={3} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} style={inputStyle} />
                        : <input id={'or-' + r.id + '-' + key} type={kind} inputMode={kind === 'tel' ? 'tel' : kind === 'url' ? 'url' : undefined} autoComplete="off" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} style={inputStyle} />}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" disabled={busy} style={{ flex: 1, minHeight: '48px', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>{busy ? 'Saving...' : 'Save'}</button>
                    <button type="button" onClick={() => setEditing(null)} style={{ flex: 1, minHeight: '48px', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#ccc', fontSize: '1rem', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{r.name}</div>
                  {!r.verified && <div style={{ fontSize: '0.85rem', color: '#e0b84c', marginTop: '0.2rem' }}>Waiting for review. Only organizers see it.</div>}
                  {r.description && <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem', color: '#ccc', overflowWrap: 'anywhere' }}>{r.description}</p>}
                  {(r.phone || r.address) && <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: '#aaa', overflowWrap: 'anywhere' }}>{[r.phone, r.address].filter(Boolean).join(' · ')}</p>}
                  <button type="button" onClick={() => open(r)} style={{ marginTop: '0.5rem', minHeight: '44px', padding: '0 1rem', borderRadius: '8px', border: '1px solid #4ecca3', background: 'none', color: '#4ecca3', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }}>Edit</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {note && <p role="status" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>{note}</p>}
    </section>
  )
}
