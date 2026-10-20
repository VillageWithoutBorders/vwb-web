import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { UserName } from './AvatarDisplay'

// Reports made inside one village or organization, for its leaders.
// The database never sends who made a report, and never a report about the
// person looking or another leader of this place (those go to Hope
// Ambassadors and VWB admins). VWB admins see every report too.

const SOURCE = { campfire: 'village chat', group: 'a chat', conversation: 'a private message', profile: 'their profile', event: 'an event' }
const STATUS = { open: 'VWB admins are reviewing', reviewed: 'VWB admins reviewed it', dismissed: 'VWB admins closed it' }

export default function PlaceReports({ kind, placeId, onCount }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    supabase.rpc('place_reports_list', { p_kind: kind, p_place: placeId }).then(({ data, error }) => {
      if (error) { console.error('Failed to load reports for this place:', error); if (alive) setRows([]); return }
      if (!alive) return
      setRows(data || [])
      if (onCount) onCount((data || []).filter((r) => r.status === 'open').length)
    })
    return () => { alive = false }
  }, [kind, placeId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows || rows.length === 0) return null

  return (
    <section className="hub-section" id="pr-sec" aria-labelledby="pr-head">
      <div className="hub-section-head"><h2 id="pr-head">Reports here ({rows.length})</h2></div>
      <p className="hub-org-desc">
        Reports from the last 30 days. Who made each report is never shown. VWB admins have every report too.
        {kind === 'village'
          ? ' You can check in with the person, or ask to remove them from the people list. Two members have to agree.'
          : ' You can check in with the person, or remove them in the member list above.'}
      </p>
      {rows.map((r) => (
        <div key={r.id} className="dash-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="dash-row-main">
            <strong><UserName userId={r.reported_user_id} name={r.reported_name} /></strong>
            <small>
              {new Date(r.created_at).toLocaleDateString()}
              {r.reason ? ' · ' + r.reason : ''}
              {SOURCE[r.source] ? ' · from ' + SOURCE[r.source] : ''}
              {' · '}{STATUS[r.status] || r.status}
            </small>
          </div>
          {r.details && (
            <details style={{ marginTop: '0.25rem' }}>
              <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>What the report says</summary>
              <p className="hub-org-desc" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.details}</p>
            </details>
          )}
        </div>
      ))}
    </section>
  )
}

// How many open reports a leader has waiting in this place, for "Needs you".
export function usePlaceReportCount(kind, placeId) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!placeId) return
    let alive = true
    supabase.rpc('place_reports_list', { p_kind: kind, p_place: placeId }).then(({ data, error }) => {
      if (error) { console.error('Failed to count reports for this place:', error); return }
      if (alive) setCount((data || []).filter((r) => r.status === 'open').length)
    })
    return () => { alive = false }
  }, [kind, placeId])
  return count
}
