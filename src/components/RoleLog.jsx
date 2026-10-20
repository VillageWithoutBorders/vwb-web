import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { orgWords } from '../utils/roleWords'

// The role log for one village, group or organization: who became a leader,
// who stepped back, and when. The database decides who may read it
// (village members; organization leaders, and members when the member
// list is open). Folded shut until someone opens it.

const VILLAGE_ROLE = { keeper: 'Keeper', helper: 'Helper' }

function day(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function RoleLog({ kind, placeId, org }) {
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open || rows) return
    let alive = true
    supabase.rpc('place_role_log_list', { p_kind: kind, p_place: placeId }).then(({ data, error }) => {
      if (error) { console.error('Failed to load the role log:', error); if (alive) setRows([]); return }
      if (alive) setRows(data || [])
    })
    return () => { alive = false }
  }, [open, rows, kind, placeId])

  const W = orgWords(org)
  const word = (r) => (kind === 'village' ? VILLAGE_ROLE[r] : W.roleLabel[r]) || (r === 'member' ? 'member' : r)

  function line(r) {
    const name = r.user_name || 'A neighbor'
    if (r.new_role && !r.old_role) return name + ' became ' + word(r.new_role)
    if (r.old_role && r.new_role) return name + ' went from ' + word(r.old_role) + ' to ' + word(r.new_role)
    if (r.action === 'left') return name + ' left (was ' + word(r.old_role) + ')'
    return name + ' is no longer ' + word(r.old_role)
  }

  return (
    <section className="hub-section" aria-labelledby={'rl-' + placeId}>
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <h2 id={'rl-' + placeId} style={{ margin: 0, fontSize: '1rem' }}>Role changes</h2>
        </summary>
        <p className="hub-org-desc">Every change to who leads here is written down. If someone who leads is quiet for 60 days, VWB checks in. With no answer in 14 days, the role passes on.</p>
        {rows === null && open && <p className="hub-empty">Loading...</p>}
        {rows && rows.length === 0 && <p className="hub-empty">No role changes written down yet.</p>}
        {rows && rows.map((r, i) => (
          <div key={i} className="dash-row">
            <div className="dash-row-main">
              <strong style={{ fontWeight: 600 }}>{line(r)}</strong>
              <small>
                {day(r.created_at)}
                {r.by_name && r.by_name !== r.user_name ? ' · by ' + r.by_name : ''}
                {r.note ? ' · ' + r.note : ''}
              </small>
            </div>
          </div>
        ))}
      </details>
    </section>
  )
}
