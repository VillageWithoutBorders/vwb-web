import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { UserName } from './AvatarDisplay'
import { timeAgo } from '../utils/notificationDisplay'
import { refreshAdminInbox } from '../hooks/useAdminInbox'

// New admins (vwb-admin-recruiting.sql):
//   - A ready Hope Ambassador asks for a village with no admin.
//   - The founder says yes, or two different admins say yes.
//   - First 30 days: their village only, no bans or account resets,
//     a mentor admin, then "Ready" or "Not yet".

// Requests to become an admin. Top of Approvals, for every admin.
export function AdminApplications({ me, isFounder, refreshKey, onChanged }) {
  const [rows, setRows] = useState([])
  const [ready, setReady] = useState({})
  const [admins, setAdmins] = useState([])
  const [mentor, setMentor] = useState({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function load() {
    const { data, error } = await supabase.rpc('admin_application_list')
    if (error) { console.error('[AdminApplications] list failed:', error); return }
    setRows(data || [])
    const checks = {}
    for (const r of data || []) {
      const { data: c, error: cErr } = await supabase.rpc('admin_ready_check', { p_user: r.user_id })
      if (cErr) console.error('[AdminApplications] ready check failed:', cErr)
      checks[r.user_id] = c || []
    }
    setReady(checks)
    if (isFounder) {
      const { data: a, error: aErr } = await supabase.from('helper_profiles_public').select('user_id, display_name, role').in('role', ['admin', 'founder'])
      if (aErr) console.error('[AdminApplications] admins failed:', aErr)
      setAdmins(a || [])
    }
  }
  useEffect(() => { load() }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(r, yes) {
    let reason = null
    if (!yes) reason = (prompt('Anything to tell them? (optional, they will see it)') || '').trim()
    setBusy(true); setNote('')
    const { data, error } = await supabase.rpc('admin_application_decide', {
      p_app: r.id, p_yes: yes, p_mentor: mentor[r.id] || null, p_note: reason,
    })
    setBusy(false)
    if (error) { console.error('[AdminApplications] decide failed:', error); setNote(error.message || "That didn't save. Try again."); return }
    setNote(data === 'first_yes' ? 'Your yes is saved. A second admin needs to say yes too.'
      : data === 'approved' ? r.name + ' is now an admin, starting their first 30 days.'
      : 'Said no. They were told kindly.')
    await load()
    refreshAdminInbox()
    onChanged?.()
  }

  if (rows.length === 0 && !note) return null
  return (
    <section className="admin-role-box" aria-labelledby="adminAppsTitle">
      <h3 id="adminAppsTitle" className="admin-role-title">People asking to become admins</h3>
      <p className="admin-section-note">{isFounder ? 'You can decide alone. Pick their mentor, then say yes or no.' : 'Two different admins need to say yes. The founder can decide alone.'}</p>
      {note && <p className="admin-role-note" role="status">{note}</p>}
      {rows.map((r) => {
        const checks = ready[r.user_id] || []
        const notReady = checks.filter((c) => !c.ok)
        const iSaidYes = r.first_yes_by === me
        return (
          <div key={r.id} className="admin-role-card">
            <p className="admin-role-line"><UserName userId={r.user_id} name={r.name} /> {r.village_name ? <>wants to cover <strong>{r.village_name}</strong>.</> : 'asked for admin access.'}</p>
            {r.invited_by_name && <p className="admin-role-reason">Accepted an invitation from {r.invited_by_name}.</p>}
            {r.reason && <p className="admin-role-reason">Why: {r.reason}</p>}
            {r.time_available && <p className="admin-role-reason">Time they can give: {r.time_available}</p>}
            <ul className="admin-ready-list">
              {checks.map((c) => (
                <li key={c.item} className={c.ok ? 'ok' : 'no'}>{c.ok ? 'Yes' : 'Not yet'}: {c.label} ({c.detail})</li>
              ))}
            </ul>
            {notReady.length > 0 && <p className="admin-role-note">Not every step is met. Say yes only if you know them well.</p>}
            {r.first_yes_name && <p className="admin-role-reason">{r.first_yes_name} said yes. One more yes approves it.</p>}
            <p className="admin-role-time">{timeAgo(r.created_at)}</p>
            {isFounder && (
              <label className="admin-mentor-pick">
                <span>Mentor</span>
                <select value={mentor[r.id] || ''} onChange={(e) => setMentor((m) => ({ ...m, [r.id]: e.target.value }))}>
                  <option value="">{r.first_yes_name ? r.first_yes_name + ' (said yes first)' : 'Me'}</option>
                  {admins.filter((a) => a.user_id !== r.user_id && a.user_id !== me).map((a) => (
                    <option key={a.user_id} value={a.user_id}>{a.display_name}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="admin-role-actions admin-decide">
              {iSaidYes ? <p className="admin-section-note">You said yes. Waiting for a second admin.</p> : (
                <>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => decide(r, true)}>{isFounder || r.first_yes_by ? 'Yes, make them an admin' : 'Yes (1 of 2)'}</button>
                  <button type="button" className="btn btn-outline" disabled={busy} onClick={() => decide(r, false)}>No</button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}

// New admins in their first 30 days. Top of People.
export function AdminTrials({ me, isFounder, refreshKey }) {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function load() {
    const { data, error } = await supabase.rpc('admin_trial_list')
    if (error) { console.error('[AdminTrials] list failed:', error); return }
    setRows(data || [])
  }
  useEffect(() => { load() }, [refreshKey])

  async function decide(r, ready) {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('admin_trial_decide', { p_admin: r.admin_id, p_ready: ready })
    setBusy(false)
    if (error) { console.error('[AdminTrials] decide failed:', error); setNote(error.message || "That didn't save. Try again."); return }
    setNote(ready ? r.admin_name + ' now has every admin tool.' : r.admin_name + ' has 30 more days.')
    await load()
    refreshAdminInbox()
  }

  if (rows.length === 0 && !note) return null
  return (
    <section className="admin-role-box" aria-labelledby="adminTrialsTitle">
      <h3 id="adminTrialsTitle" className="admin-role-title">New admins in their first 30 days</h3>
      <p className="admin-section-note">They cover their village only, and can't ban anyone or reset accounts yet. Their mentor says when they are ready.</p>
      {note && <p className="admin-role-note" role="status">{note}</p>}
      {rows.map((r) => {
        const done = new Date(r.ends_at) <= new Date()
        const canDecide = isFounder || (r.mentor_id === me && done)
        return (
          <div key={r.admin_id} className="admin-role-card">
            <p className="admin-role-line"><UserName userId={r.admin_id} name={r.admin_name} />{r.village_name ? ' (' + r.village_name + ')' : ''}. Mentor: {r.mentor_name || 'none'}.</p>
            <p className="admin-role-time">{done ? '30 days are done.' : 'Ready to decide ' + new Date(r.ends_at).toLocaleDateString()}</p>
            {canDecide && (
              <div className="admin-role-actions">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => decide(r, true)}>Ready</button>
                <button type="button" className="btn btn-outline" disabled={busy} onClick={() => decide(r, false)}>Not yet (30 more days)</button>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
