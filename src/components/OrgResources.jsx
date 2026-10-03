import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { CATEGORIES } from '../utils/resourceCategories'

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
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_org_resources', { p_org: orgId })
    if (error) { console.error('list_org_resources', error); setNote("Couldn't load resources right now."); setRows([]); return }
    setRows(data || [])
  }, [orgId])

  useEffect(() => { load() }, [load])

  function open(r) {
    setNote('')
    setDraft({ name: r.name || '', description: r.description || '', phone: r.phone || '', url: r.url || '', address: r.address || '', requirements: r.requirements || '', categories: r.categories || [], links: Array.isArray(r.links) ? r.links.map((l) => ({ label: l.label || '', url: l.url || '' })) : [] })
    setAdding(false)
    setRemoving(null)
    setEditing(r.id)
  }

  function openAdd() {
    setNote('')
    setEditing(null)
    setRemoving(null)
    setDraft({ name: '', description: '', phone: '', url: '', address: '', requirements: '', categories: [], links: [] })
    setAdding(true)
  }

  function setLink(i, key, value) {
    setDraft({ ...draft, links: draft.links.map((l, j) => (j === i ? { ...l, [key]: value } : l)) })
  }

  function toggleCat(c) {
    const has = draft.categories.includes(c)
    setDraft({ ...draft, categories: has ? draft.categories.filter((x) => x !== c) : [...draft.categories, c] })
  }

  async function save(e) {
    e.preventDefault()
    if (!draft.name.trim()) { setNote('Add a name.'); return }
    if (!draft.categories.length) { setNote('Pick at least one category.'); return }
    if (draft.links.some((l) => l.url.trim() && !/^https?:\/\/\S+$/i.test(l.url.trim()))) { setNote('Each link needs to start with http:// or https://'); return }
    setBusy(true); setNote('')
    const fields = {
      p_name: draft.name, p_description: draft.description, p_phone: draft.phone,
      p_url: draft.url, p_address: draft.address, p_requirements: draft.requirements,
      p_categories: draft.categories,
      p_links: draft.links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
    }
    const { error } = adding
      ? await supabase.rpc('add_org_resource', { p_org: orgId, ...fields })
      : await supabase.rpc('update_org_resource', { p_resource: editing, ...fields })
    setBusy(false)
    if (error) { console.error('save org resource', error); setNote("Couldn't save. Try again."); return }
    const wasAdding = adding
    setEditing(null)
    setAdding(false)
    setNote(wasAdding ? 'Added. It is live in the Resource Library now.' : 'Saved.')
    load()
  }

  async function remove(r) {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('delete_org_resource', { p_resource: r.id })
    setBusy(false)
    setRemoving(null)
    if (error) { console.error('delete_org_resource', error); setNote("Couldn't remove it. Try again."); return }
    setNote('Removed.')
    load()
  }

  function renderForm(idPrefix) {
    return (
      <form onSubmit={save}>
        {FIELDS.map(([key, label, kind]) => (
          <div key={key}>
            <label htmlFor={idPrefix + '-' + key} style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>{label}</label>
            {kind === 'area'
              ? <textarea id={idPrefix + '-' + key} rows={3} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} style={inputStyle} />
              : <input id={idPrefix + '-' + key} type={kind} inputMode={kind === 'tel' ? 'tel' : kind === 'url' ? 'url' : undefined} autoComplete="off" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} style={inputStyle} />}
          </div>
        ))}
        <span id={idPrefix + '-links'} style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Other links (Facebook page, sign-up form, map)</span>
        {draft.links.map((l, i) => (
          <div key={i} role="group" aria-label={'Link ' + (i + 1)} style={{ marginBottom: '0.6rem', padding: '0.5rem', border: '1px solid #333', borderRadius: '8px' }}>
            <label htmlFor={idPrefix + '-ll-' + i} style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>What to call it</label>
            <input id={idPrefix + '-ll-' + i} type="text" maxLength={40} autoComplete="off" value={l.label} onChange={(e) => setLink(i, 'label', e.target.value)} placeholder="Facebook page" style={inputStyle} />
            <label htmlFor={idPrefix + '-lu-' + i} style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Link</label>
            <input id={idPrefix + '-lu-' + i} type="url" inputMode="url" autoComplete="off" value={l.url} onChange={(e) => setLink(i, 'url', e.target.value)} placeholder="https://" style={inputStyle} />
            <button type="button" onClick={() => setDraft({ ...draft, links: draft.links.filter((_, j) => j !== i) })} style={{ minHeight: '44px', padding: '0 1rem', borderRadius: '8px', border: '1px solid #c0392b', background: 'none', color: '#ff7b6b', fontSize: '0.95rem', cursor: 'pointer' }}>Remove this link</button>
          </div>
        ))}
        {draft.links.length < 8 && (
          <button type="button" onClick={() => setDraft({ ...draft, links: [...draft.links, { label: '', url: '' }] })} style={{ minHeight: '44px', padding: '0 1rem', marginBottom: '0.75rem', borderRadius: '8px', border: '1px solid #4ecca3', background: 'none', color: '#4ecca3', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer' }}>+ Add a link</button>
        )}
        <span id={idPrefix + '-cats'} style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Categories (pick one or more)</span>
        <div role="group" aria-labelledby={idPrefix + '-cats'} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={draft.categories.includes(c)} onClick={() => toggleCat(c)} style={{ minHeight: '44px', padding: '0 0.85rem', borderRadius: '22px', border: '1px solid ' + (draft.categories.includes(c) ? '#4ecca3' : '#444'), background: draft.categories.includes(c) ? '#4ecca3' : 'none', color: draft.categories.includes(c) ? '#1a1a1a' : '#ddd', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>{c}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" disabled={busy} style={{ flex: 1, minHeight: '48px', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>{busy ? 'Saving...' : adding ? 'Add resource' : 'Save'}</button>
          <button type="button" onClick={() => { setEditing(null); setAdding(false) }} style={{ flex: 1, minHeight: '48px', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#ccc', fontSize: '1rem', cursor: 'pointer' }}>Cancel</button>
        </div>
      </form>
    )
  }

  return (
    <section className="hub-section" aria-labelledby="od-resources">
      <div className="hub-section-head">
        <h2 id="od-resources">Resources</h2>
        {!adding && <button type="button" onClick={openAdd} style={{ background: 'none', border: 'none', color: '#4ecca3', minHeight: '44px', padding: '0 0.25rem', fontSize: '1rem', cursor: 'pointer' }}>+ Add resource</button>}
      </div>
      {adding && <div style={{ padding: '0.75rem', background: '#1e1e1e', border: '1px solid #4ecca3', borderRadius: '10px', marginBottom: '0.5rem' }}>{renderForm('or-new')}</div>}
      {rows === null && <p>Loading...</p>}
      {rows && rows.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No resources are listed under this group yet. Tap Add resource to list one.</p>}
      {rows && rows.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {rows.map((r) => (
            <li key={r.id} style={{ padding: '0.75rem', background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px' }}>
              {editing === r.id ? (
                renderForm('or-' + r.id)
              ) : (
                <>
                  <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{r.name}</div>
                  {!r.verified && <div style={{ fontSize: '0.85rem', color: '#e0b84c', marginTop: '0.2rem' }}>Waiting for review. Only organizers see it.</div>}
                  {r.description && <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem', color: '#ccc', overflowWrap: 'anywhere' }}>{r.description}</p>}
                  {Array.isArray(r.links) && r.links.length > 0 && <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: '#aaa' }}>{r.links.length} extra {r.links.length === 1 ? 'link' : 'links'}</p>}
                  {(r.phone || r.address) && <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: '#aaa', overflowWrap: 'anywhere' }}>{[r.phone, r.address].filter(Boolean).join(' · ')}</p>}
                  <button type="button" onClick={() => open(r)} style={{ marginTop: '0.5rem', minHeight: '44px', padding: '0 1rem', borderRadius: '8px', border: '1px solid #4ecca3', background: 'none', color: '#4ecca3', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }}>Edit</button>
                  {removing === r.id ? (
                    <div style={{ marginTop: '0.5rem' }}>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Remove this for everyone? This can't be undone.</p>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" disabled={busy} onClick={() => remove(r)} style={{ flex: 1, minHeight: '48px', borderRadius: '8px', border: 'none', background: '#c0392b', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>Yes, remove</button>
                        <button type="button" onClick={() => setRemoving(null)} style={{ flex: 1, minHeight: '48px', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#ccc', fontSize: '1rem', cursor: 'pointer' }}>Keep it</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setNote(''); setEditing(null); setAdding(false); setRemoving(r.id) }} style={{ marginTop: '0.5rem', marginLeft: '0.5rem', minHeight: '44px', padding: '0 1rem', borderRadius: '8px', border: '1px solid #c0392b', background: 'none', color: '#ff7b6b', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }}>Remove</button>
                  )}
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
