import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { UserName } from './AvatarDisplay'
import { timeAgo } from '../utils/notificationDisplay'
import { refreshAdminInbox } from '../hooks/useAdminInbox'
import { useT } from '../utils/lang'

// Keeping admin access safe (vwb-admin-roles.sql):
//   - Removing an admin takes the founder, or two admins agreeing.
//   - Every change to admin or founder access is logged for every admin.

// Puts names (or other bits of page) into a translated sentence: '{asker} asked to remove admin access from {target}.'
function fill(s, bits) {
  return s.split(/(\{\w+\})/).map((x, i) => {
    const m = /^\{(\w+)\}$/.exec(x)
    return <Fragment key={i}>{m && bits[m[1]] !== undefined ? bits[m[1]] : x}</Fragment>
  })
}

// Requests waiting for a second admin. Shown at the top of Approvals.
export function AdminRemovalRequests({ me, refreshKey, onChanged }) {
  const t = useT()
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
    if (error) { console.error('[AdminRemovalRequests] ' + kind + ' failed:', error); setNote(error.message ? t(error.message) : t("That didn't save. Try again.")); return }
    setNote(kind === 'agree' ? (r.target_name ? t('{name} is no longer an admin.', { name: r.target_name }) : t('They are no longer an admin.')) : kind === 'decline' ? t('Declined. They stay an admin.') : t('Request cancelled.'))
    await load()
    refreshAdminInbox()
    onChanged?.()
  }

  if (rows.length === 0 && !note) return null
  return (
    <section className="admin-role-box" aria-labelledby="adminRemovalTitle">
      <h3 id="adminRemovalTitle" className="admin-role-title">{t('Admin removals waiting for a second admin')}</h3>
      <p className="admin-section-note">{t("One admin asked. A different admin has to agree before it happens. The admin being removed can't answer.")}</p>
      {note && <p className="admin-role-note" role="status">{note}</p>}
      {rows.map((r) => {
        const mine = r.asked_by === me
        const aboutMe = r.target === me
        return (
          <div key={r.id} className="admin-role-card">
            <p className="admin-role-line">
              {fill(t('{asker} asked to remove admin access from {target}.'), { asker: <UserName userId={r.asked_by} name={r.asked_name} />, target: <UserName userId={r.target} name={r.target_name} /> })}
            </p>
            {r.reason && <p className="admin-role-reason">{t('Reason:')} {r.reason}</p>}
            <p className="admin-role-time">{timeAgo(r.created_at)}</p>
            <div className="admin-role-actions admin-decide">
              {!mine && !aboutMe && (
                <>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(r, 'agree')}>{t('Agree, remove')}</button>
                  <button type="button" className="btn btn-outline" disabled={busy} onClick={() => act(r, 'decline')}>{t('Decline')}</button>
                </>
              )}
              {mine && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => act(r, 'cancel')}>{t('Cancel my request')}</button>}
              {aboutMe && <p className="admin-section-note">{t('This is about you, so another admin answers it.')}</p>}
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
  const t = useT()
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
        <span id="adminRoleLogTitle">{t('Role changes')}</span>
        <span aria-hidden="true">{open ? t('Hide') : t('Show')}</span>
      </button>
      {open && (
        <>
          <p className="admin-section-note">{t('Every time someone gains or loses admin or founder access. Every admin can see this, and no one can edit it.')}</p>
          {failed && <p className="admin-role-note">{t("This couldn't load. The database step (vwb-admin-roles.sql) may not be run yet.")}</p>}
          {!failed && rows.length === 0 && <p className="admin-section-note">{t('No changes yet.')}</p>}
          <ul className="admin-role-log">
            {rows.map((r) => (
              <li key={r.id}>
                <strong>{r.person || t('Someone')}</strong>: {t('{old} to {new}', { old: t(ROLE[r.old_role] || 'Neighbor'), new: ROLE[r.new_role] ? t(ROLE[r.new_role]) : r.new_role })}
                <span className="admin-role-how">
                  {' '}({HOW[r.how] ? t(HOW[r.how]) : r.how}
                  {r.changed_by_name && r.how !== 'stepped down' ? ', ' + t('asked by {name}', { name: r.changed_by_name }) : ''}
                  {r.agreed_by_name ? ', ' + t('agreed by {name}', { name: r.agreed_by_name }) : ''})
                </span>
                {r.reason && <span className="admin-role-reason"> {t('Reason:')} {r.reason}</span>}
                <span className="admin-role-time"> {timeAgo(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
