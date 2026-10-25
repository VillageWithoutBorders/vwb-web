import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { UserName } from './AvatarDisplay'
import { timeAgo } from '../utils/notificationDisplay'
import { refreshAdminInbox } from '../hooks/useAdminInbox'

// Admin safety, round 1 (vwb-admin-safety.sql):
//   - Two-step login is required to open admin tools.
//   - Bans of Hope Ambassadors and anyone who leads a place need a second admin.
//   - Every admin action is logged where every admin can read it.

// Is two-step login on for this account? null while checking.
export function useTwoStepOn() {
  const [on, setOn] = useState(null)
  useEffect(() => {
    let alive = true
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('[useTwoStepOn] listFactors failed:', error); setOn(false); return }
      setOn((data?.totp || []).some((f) => f.status === 'verified'))
    })
    return () => { alive = false }
  }, [])
  return on
}

export function TwoStepGate({ onSettings }) {
  return (
    <div className="admin-tool-wait" role="alert">
      <p><strong>Turn on two-step login to use admin tools.</strong></p>
      <p>Admin tools can change other people's accounts. A code from an app on your phone keeps them safe if someone learns your password.</p>
      <button type="button" className="btn btn-primary" onClick={onSettings}>Turn it on in Settings</button>
    </div>
  )
}

// Bans waiting for a second admin. Top of Reports.
export function BanRequests({ me, refreshKey, onChanged }) {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function load() {
    const { data, error } = await supabase.rpc('ban_request_list')
    if (error) { console.error('[BanRequests] list failed:', error); return }
    setRows(data || [])
  }
  useEffect(() => { load() }, [refreshKey])

  async function act(r, kind) {
    setBusy(true); setNote('')
    const { error } = kind === 'cancel'
      ? await supabase.rpc('ban_request_cancel', { p_request: r.id })
      : await supabase.rpc('ban_request_decide', { p_request: r.id, p_agree: kind === 'agree' })
    setBusy(false)
    if (error) { console.error('[BanRequests] ' + kind + ' failed:', error); setNote(error.message || "That didn't save. Try again."); return }
    setNote(kind === 'agree' ? (r.target_name || 'They') + ' is banned.' : kind === 'decline' ? 'Declined. They are not banned.' : 'Request cancelled.')
    await load()
    refreshAdminInbox()
    onChanged?.()
  }

  if (rows.length === 0 && !note) return null
  return (
    <section className="admin-role-box" aria-labelledby="banReqTitle">
      <h3 id="banReqTitle" className="admin-role-title">Bans waiting for a second admin</h3>
      <p className="admin-section-note">Banning a Hope Ambassador, or anyone who leads a village, group or crew, takes two admins. The person being banned can't answer.</p>
      {note && <p className="admin-role-note" role="status">{note}</p>}
      {rows.map((r) => {
        const mine = r.asked_by === me
        const aboutMe = r.target === me
        return (
          <div key={r.id} className="admin-role-card">
            <p className="admin-role-line"><UserName userId={r.asked_by} name={r.asked_name} /> asked to ban <UserName userId={r.target} name={r.target_name} />.</p>
            <p className="admin-role-reason">Reason: {r.reason}</p>
            <p className="admin-role-time">{timeAgo(r.created_at)}</p>
            <div className="admin-role-actions">
              {!mine && !aboutMe && (
                <>
                  <button type="button" className="btn ban-btn-danger" disabled={busy} onClick={() => act(r, 'agree')}>Agree, ban</button>
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

const FILTERS = [
  ['', 'Everything'],
  ['ban', 'Bans'],
  ['ambassador', 'Ambassadors'],
  ['emergency', 'Emergencies'],
  ['org', 'Groups'],
  ['deleted', 'Deleted posts'],
  ['report', 'Reports'],
  ['village', 'Villages'],
  ['two_step', 'Two-step resets'],
]

// Admin log: its own section.
export function AdminActionLog() {
  const [kind, setKind] = useState('')
  const [rows, setRows] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setLoaded(false)
    supabase.rpc('admin_action_log_list', { p_kind: kind || null, p_limit: 100 }).then(({ data, error }) => {
      setLoaded(true)
      if (error) { console.error('[AdminActionLog] failed:', error); setFailed(true); return }
      setFailed(false)
      setRows(data || [])
    })
  }, [kind])

  return (
    <section aria-labelledby="adminLogTitle">
      <h2 id="adminLogTitle" className="admin-section-title">Admin log</h2>
      <p className="admin-section-note">What admins did, newest first. Every admin can see this, and no one can edit it.</p>
      <div className="admin-log-filters" role="group" aria-label="Show">
        {FILTERS.map(([k, label]) => (
          <button key={k || 'all'} type="button" className={'admin-log-chip' + (kind === k ? ' on' : '')} aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
        ))}
      </div>
      {failed && <p className="admin-role-note">The log couldn't load. The database step (vwb-admin-safety.sql) may not be run yet.</p>}
      {!failed && loaded && rows.length === 0 && <p className="admin-section-note">Nothing here yet.</p>}
      <ul className="admin-role-log">
        {rows.map((r) => (
          <li key={r.id}>
            <strong>{r.actor_name}</strong>: {r.summary}
            <span className="admin-role-time"> {timeAgo(r.created_at)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
