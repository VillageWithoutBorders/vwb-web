import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { orgWords } from '../utils/roleWords'
import { useT, getLang } from '../utils/lang'

// The role log for one village, group or organization: who became a leader,
// who stepped back, and when. The database decides who may read it
// (village members; organization leaders, and members when the member
// list is open). Folded shut until someone opens it.

const VILLAGE_ROLE = { keeper: 'Keeper', helper: 'Helper' }

function day(iso) {
  return new Date(iso).toLocaleDateString(getLang() === 'es' ? 'es-US' : [], { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function RoleLog({ kind, placeId, org }) {
  const t = useT()
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
  const word = (r) => t((kind === 'village' ? VILLAGE_ROLE[r] : W.roleLabel[r]) || (r === 'member' ? 'member' : r))

  function line(r) {
    const name = r.user_name || t('A neighbor')
    if (r.action === 'charter') return r.note ? name + ' ' + t(r.note) : t('{name} changed the charter', { name })
    if (r.new_role && !r.old_role) return t('{name} became {role}', { name, role: word(r.new_role) })
    if (r.old_role && r.new_role) return t('{name} went from {from} to {to}', { name, from: word(r.old_role), to: word(r.new_role) })
    if (r.action === 'left') return t('{name} left (was {role})', { name, role: word(r.old_role) })
    return t('{name} is no longer {role}', { name, role: word(r.old_role) })
  }

  return (
    <section className="hub-section" aria-labelledby={'rl-' + placeId}>
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <h2 id={'rl-' + placeId} style={{ margin: 0, fontSize: '1rem' }}>{t('Role changes')}</h2>
        </summary>
        <p className="hub-org-desc">{t('Every change to who leads here is written down. If someone who leads is quiet for 60 days, VWB checks in. With no answer in 14 days, the role passes on.')}</p>
        {rows === null && open && <p className="hub-empty">{t('Loading...')}</p>}
        {rows && rows.length === 0 && <p className="hub-empty">{t('No role changes written down yet.')}</p>}
        {rows && rows.map((r, i) => (
          <div key={i} className="dash-row">
            <div className="dash-row-main">
              <strong style={{ fontWeight: 600 }}>{line(r)}</strong>
              <small>
                {day(r.created_at)}
                {r.by_name && r.by_name !== r.user_name ? ' · ' + t('by {name}', { name: r.by_name }) : ''}
                {r.note ? ' · ' + t(r.note) : ''}
              </small>
            </div>
          </div>
        ))}
      </details>
    </section>
  )
}
