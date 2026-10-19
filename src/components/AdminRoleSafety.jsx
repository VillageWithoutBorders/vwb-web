import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { UserName } from './AvatarDisplay'
import { timeAgo } from '../utils/notificationDisplay'
import { refreshAdminInbox } from '../hooks/useAdminInbox'

// Keeping admin access safe (vwb-admin-roles.sql):
//   - Removing an admin takes the founder, or two admins agreeing.
//   - Every change to admin or founder access is logged for every admin.

// Requests waiting for a second admin. Shown at the top of Approvals.
export function AdminRemovalRequests({ me, refreshKey, onChanged }) {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function load() {
    const { data, error } = await supabase.rpc('admin_removal_list')
    if (error) { console.error('[AdminRemovalRequests] list failed:', error); return }
    setRows(data || [])
  }
  useEffect(() => { load() }, [refreshKey])

  async function act(r, kind) {
    setBusy(true); setNote('')
    const { error } = kind === 'cancel'
      ? await supabase.rpc('admin_removal_cancel', { p_request: r.id })
      : await supabase.rpc('admin_removal_decide', { p_request: r.id, p_agree: kind === 'agree' })
    setBusy(false)
    if (error) { console.error('[AdminRemovalRequests] ' + kind + ' failed:', error); setNote(error.message || "That didn't save. Try again."); return }
    setNote(kind === 'agree' ? (r.target_name || 'They') + ' is no longer an admin.' : kind === 'decline' ? 'Declined. They stay an admin.' : 'Request cancelled.')
    await load()
    refreshAdminInbox()
    onChanged?.()
  }

  if (rows.length === 0 && !note) return null
  return (
    <section className="admin-role-box" aria-labelledby="adminRemovalTitle">
      <h3 id="adminRemovalTitle" className="admin-role-title">Admin removals waiting for a second admin</h3>
      <p className="admin-section-note">One admin asked. A different admin has to agree before it happens. The admin being removed can't answer.</p>
      {note && <p className="admin-role-note" role="status">{note}</p>}
      {rows.map((r) => {
        const mine = r.asked_by === me
        const aboutMe = r.target === me
        return (
          <div key={r.id} className="admin-role-card">
            <p className="admin-role-line">
              <UserName userId={r.asked_by} name={r.asked_name} /> asked to remove admin access from <UserName userId={r.target} name={r.target_name} />.
            </p>
            {r.reason && <p className="admin-role-reason">Reason: {r.reason}</p>}
            <p className="admin-role-time">{timeAgo(r.created_at)}</p>
            <div className="admin-role-actions">
              {!mine && !aboutMe && (
                <>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(r, 'agree')}>Agree, remove</button>
                  <button type="button" className="btn btn-outline" disabled={busy} onClick={() => act(r, 'decline')}>Decline</button>
                </>
              )}
              {mine && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => act(r, 'cancel')}>Cancel my request</button>}
              {aboutMe && <p className="admin-section-note">This is about you, so another admin answers it.</p>}
            </div>
          </div>
        )
      })}
    </section>
  )
}

const HOW = {
  founder: 'by the founder',
  'two admins': 'two admins agreed',
  'founder approved request': 'the founder agreed',
  'stepped down': 'stepped down',
  'sql editor': 'changed in the database',
}
const ROLE = { admin: 'Admin', founder: 'Founder', member: 'Neighbor', helper: 'Neighbor', organizer: 'Organizer' }

// Every change to admin or founder access. Shown at the bottom of People.
export function AdminRoleLog({ refreshKey }) {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase.rpc('admin_role_log_list', { p_limit: 50 }).then(({ data, error }) => {
      if (error) { console.error('[AdminRoleLog] failed:', error); setFailed(true); return }
      setFailed(false)
      setRows(data || [])
    })
  }, [open, refreshKey])

  return (
    <section className="admin-role-box" aria-labelledby="adminRoleLogTitle">
      <button type="button" className="admin-role-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span id="adminRoleLogTitle">Role changes</span>
        <span aria-hidden="true">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <>
          <p className="admin-section-note">Every time someone gains or loses admin or founder access. Every admin can see this, and no one can edit it.</p>
          {failed && <p className="admin-role-note">This couldn't load. The database step (vwb-admin-roles.sql) may not be run yet.</p>}
          {!failed && rows.length === 0 && <p className="admin-section-note">No changes yet.</p>}
          <ul className="admin-role-log">
            {rows.map((r) => (
              <li key={r.id}>
                <strong>{r.person || 'Someone'}</strong>: {ROLE[r.old_role] || 'Neighbor'} to {ROLE[r.new_role] || r.new_role}
                <span className="admin-role-how">
                  {' '}({HOW[r.how] || r.how}
                  {r.changed_by_name && r.how !== 'stepped down' ? ', asked by ' + r.changed_by_name : ''}
                  {r.agreed_by_name ? ', agreed by ' + r.agreed_by_name : ''})
                </span>
                {r.reason && <span className="admin-role-reason"> Reason: {r.reason}</span>}
                <span className="admin-role-time"> {timeAgo(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
