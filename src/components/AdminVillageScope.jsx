import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Admins see the people in the villages the founder gives them
// (vwb-admin-local-people.sql). The database enforces it; this file only
// explains it and lets the founder set it.

// Loads every admin's villages (founder) or your own (admin).
export function useAdminVillages(refreshKey) {
  const [rows, setRows] = useState([])
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    supabase.rpc('admin_village_list').then(({ data, error }) => {
      if (error) { console.error('[useAdminVillages] failed:', error); setFailed(true); return }
      setFailed(false)
      setRows(data || [])
    })
  }, [refreshKey])
  return { rows, failed }
}

// Top of People, for admins who are not the founder.
export function AdminScopeNote({ me, rows, failed }) {
  if (failed) return null
  const mine = rows.filter((r) => r.admin_id === me).map((r) => r.village_name)
  return (
    <p className="admin-scope-note" role="note">
      {mine.length > 0
        ? <>You see people in <strong>{mine.join(', ')}</strong>, every admin, people who haven't joined a village yet, and anyone waiting on a role review.</>
        : <>The founder hasn't given you any villages yet. For now you see every admin, people who haven't joined a village yet, and anyone waiting on a role review.</>}
    </p>
  )
}

// On an admin's row, for the founder: pick the villages they cover.
export function AdminVillagePicker({ admin, villages, rows, onSaved }) {
  const current = rows.filter((r) => r.admin_id === admin.user_id).map((r) => r.village_id)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(current)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => { if (!open) setPicked(current) }, [open, rows]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  async function save() {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('set_admin_villages', { p_admin: admin.user_id, p_villages: picked })
    setBusy(false)
    if (error) { console.error('[AdminVillagePicker] save failed:', error); setNote(error.message || "That didn't save. Try again."); return }
    setOpen(false)
    onSaved?.()
  }

  const names = rows.filter((r) => r.admin_id === admin.user_id).map((r) => r.village_name)
  return (
    <div className="admin-village-picker">
      <button type="button" className="admin-village-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Villages they cover: {names.length ? names.join(', ') : 'none yet'}
      </button>
      {open && (
        <fieldset className="admin-village-set">
          <legend>Which villages can {admin.display_name || 'this admin'} see?</legend>
          {villages.length === 0 && <p className="admin-section-note">No villages yet.</p>}
          {villages.map((v) => (
            <label key={v.id} className="admin-village-option">
              <input type="checkbox" checked={picked.includes(v.id)} onChange={() => toggle(v.id)} />
              <span>{v.name}</span>
            </label>
          ))}
          {note && <p className="admin-role-note" role="alert">{note}</p>}
          <div className="admin-role-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save'}</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </fieldset>
      )}
    </div>
  )
}
