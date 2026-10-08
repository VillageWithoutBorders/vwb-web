import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Shows the member list to people inside an organization, but only when the
// organization's Head allows it. The database sends nothing when it is off.

const ROLE_LABEL = { admin: 'Head', organizer: 'Organizer', member: 'Member' }

export default function OrgMemberNames({ orgId }) {
  const [people, setPeople] = useState([])

  useEffect(() => {
    let alive = true
    supabase.rpc('org_member_names', { p_org: orgId }).then(({ data, error }) => {
      if (error) console.error('Failed to load member names:', error)
      if (alive) setPeople(data || [])
    })
    return () => { alive = false }
  }, [orgId])

  if (people.length === 0) return null

  return (
    <section className="cal-box" aria-labelledby="org-people">
      <h2 id="org-people">Members</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {people.map((p, i) => (
          <li key={i} style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span>{p.display_name}</span>
            <span className="group-member-sub">{ROLE_LABEL[p.role] || p.role}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
