import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { dayLabel } from '../utils/calendar'

// Who's organizing near the place the Calendar is set to (Oct 22: moved here
// from the old Around you page). Organizers also see a nudge to add a home area.

const ORG_COUNT = 6

function OrgCard({ org }) {
  const where = [org.home_place, org.miles != null ? (org.miles < 1 ? 'nearby' : Math.round(org.miles) + ' mi away') : null].filter(Boolean).join(' · ')
  return (
    <Link className="cal-card hub-org" to={'/orgs/' + org.id}>
      <span className="cal-card-title">{org.name}</span>
      {org.description && <span className="hub-org-desc">{org.description}</span>}
      {org.next_event_title ? (
        <span className="hub-org-next">Next: {org.next_event_title}, {dayLabel(org.next_event_starts_at)}</span>
      ) : (
        <span className="cal-card-meta">No events posted yet</span>
      )}
      {where && <span className="cal-card-meta">{where}</span>}
    </Link>
  )
}

export default function NearbyOrganizers({ origin, miles }) {
  const { organizations } = useAuth()
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    supabase
      .rpc('nearby_organizations', { p_lat: origin?.lat ?? null, p_lng: origin?.lng ?? null, p_miles: miles })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('Failed to load nearby organizations:', error)
        setOrgs(data || [])
        setFailed(!!error)
        setLoading(false)
      })
    return () => { alive = false }
  }, [origin?.lat, origin?.lng, miles])

  const managed = organizations.filter((o) => o.role === 'admin' || o.role === 'organizer')
  const withoutHome = managed.filter((m) => {
    const o = orgs.find((x) => x.id === m.id)
    return o && !o.home_zip
  })
  const shown = showAll ? orgs : orgs.slice(0, ORG_COUNT)

  return (
    <section className="hub-section" aria-labelledby="cal-orgs">
      <div className="hub-section-head">
        <h2 id="cal-orgs">Who's organizing nearby</h2>
      </div>
      {withoutHome.map((o) => (
        <Link key={o.id} className="cal-card hub-nudge" to={'/orgs/' + o.id}>
          <span className="cal-card-title">Add a home area for {o.name}</span>
          <span className="cal-card-meta">So neighbors can find your group even before you post.</span>
        </Link>
      ))}
      {loading && <p className="cal-empty">Loading groups...</p>}
      {!loading && failed && <p className="cal-error">We couldn't load local groups right now. Try again in a bit.</p>}
      {!loading && !failed && orgs.length === 0 && (
        <p className="hub-empty">No groups have posted near here yet. Know one that should be here? Invite them to bring their group.</p>
      )}
      {!loading && !failed && shown.map((org) => <OrgCard key={org.id} org={org} />)}
      {!loading && orgs.length > ORG_COUNT && (
        <button type="button" className="btn btn-outline btn-full" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : 'Show all ' + orgs.length + ' groups'}
        </button>
      )}
    </section>
  )
}
