import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import NearbyNeedTiles from '../components/NearbyNeedTiles'
import Icon from '../components/Icon'
import FindAKeeper from '../components/FindAKeeper'
import { ADMIN_REQUESTS_OPEN } from '../data/adminTeam'

// Ambassador tools: what is waiting on a Hope Ambassador (or VWB admin) in one place.
//   Emergencies waiting to be checked, groups asking to respond to emergencies,
//   need near you, and the Ambassadors board.

function ago(ts) {
  const hrs = Math.floor((Date.now() - new Date(ts).getTime()) / 3600000)
  if (hrs < 1) return 'just now'
  if (hrs < 24) return hrs + ' hours ago'
  return Math.floor(hrs / 24) + ' days ago'
}

export default function Ambassador() {
  const { profile, isAdmin } = useAuth()
  const allowed = !!profile?.is_hope_ambassador || isAdmin
  const [events, setEvents] = useState(null)
  const [groups, setGroups] = useState(null)
  const [board, setBoard] = useState(null)
  const [error, setError] = useState('')
  // Villages you belong to with no admin yet (vwb-roles-step5.sql).
  const [needAdmin, setNeedAdmin] = useState([])

  useEffect(() => {
    if (!allowed || isAdmin || !ADMIN_REQUESTS_OPEN) return
    supabase.rpc('villages_needing_admin').then(({ data, error: err }) => {
      if (err) { console.error('Failed to load villages needing an admin:', err); return }
      setNeedAdmin(data || [])
    })
  }, [allowed, isAdmin])

  useEffect(() => {
    if (!allowed) return
    // Only the ones you can check: your villages, or no village (vwb-admin-round3.sql). Admins see all.
    supabase.rpc('emergencies_i_can_check')
      .then(({ data, error: err }) => {
        if (err) { console.error('Failed to load emergencies to check:', err); setError("Some of this didn't load. Try again."); setEvents([]); return }
        setEvents(data || [])
      })
    supabase.rpc('groups_waiting_response_approval').then(({ data, error: err }) => {
      if (err) { console.error('Failed to load groups waiting:', err); setError("Some of this didn't load. Try again."); setGroups([]); return }
      setGroups(data || [])
    })
    supabase.from('campfire_boards').select('id, name').is('village_id', null).is('sister_a', null).is('event_id', null).eq('is_general', false).eq('archived', false).ilike('name', '%ambassador%').limit(1)
      .then(({ data, error: err }) => {
        if (err) { console.error('Failed to find the Ambassadors board:', err); return }
        setBoard(((data || [])[0]) || null)
      })
  }, [allowed])

  if (profile && !allowed) return <Navigate to="/" replace />

  return (
    <div className="amb-page">
      <h1 className="amb-title"><Icon name="star" size={30} /> Ambassador tools</h1>
      <p className="amb-sub">What is waiting on you. Ambassadors and VWB admins see this page.</p>
      {error && <p className="amb-error" role="alert">{error}</p>}

      <section className="amb-box" aria-labelledby="amb-em">
        <h2 id="amb-em"><Icon name="siren" /> Emergencies to check</h2>
        {events === null ? <p role="status">Loading...</p>
          : events.length === 0 ? <p className="amb-note">Nothing waiting in your villages. Reports show here until two neighbors confirm them or you check them.</p>
          : (
            <ul className="amb-list">
              {events.map((e) => (
                <li key={e.id}>
                  <Link className="amb-row" to={'/emergency/' + e.id}>
                    <span><b>{e.title}</b><small>{(e.location_name ? e.location_name + ', ' : '') + 'reported ' + ago(e.created_at) + ', ' + (e.upvote_count || 0) + ' confirmed'}</small></span>
                    <span aria-hidden="true">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        <Link className="btn btn-outline btn-full amb-btn" to="/emergency">All emergencies</Link>
      </section>

      <section className="amb-box" aria-labelledby="amb-groups">
        <h2 id="amb-groups"><Icon name="tent" /> Groups asking to respond</h2>
        {groups === null ? <p role="status">Loading...</p>
          : groups.length === 0 ? <p className="amb-note">No group is waiting. When a group asks to be called to emergencies, it shows here. You can't decide for a group you are in.</p>
          : (
            <ul className="amb-list">
              {groups.map((g) => (
                <li key={g.org_id}>
                  <Link className="amb-row" to={'/orgs/' + g.org_id}>
                    <span><b>{g.name}</b><small>{g.member_count + (g.member_count === 1 ? ' member' : ' members') + ', asked ' + ago(g.asked_at)}</small></span>
                    <span aria-hidden="true">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>

      <FindAKeeper />

      {needAdmin.length > 0 && (
        <section className="amb-box" aria-labelledby="amb-need-admin">
          {needAdmin.map((v) => (
            <h2 key={v.village_id} id={v.village_id === needAdmin[0].village_id ? 'amb-need-admin' : undefined}>
              <Icon name="shield" /> {v.village_name} has no local admin yet
            </h2>
          ))}
          <p className="amb-note">Villages are run by their Keepers and Helpers. A local admin steps in when someone breaks the app rules or is unsafe. If you know your neighbors and want to help keep things safe, see if you're ready.</p>
          <Link className="btn btn-primary btn-full amb-btn" to="/become-admin">Want to help?</Link>
        </section>
      )}

      <NearbyNeedTiles />

      <section className="amb-box" aria-labelledby="amb-talk">
        <h2 id="amb-talk"><Icon name="megaphone" /> Talk with other Ambassadors</h2>
        <Link className="btn btn-primary btn-full amb-btn" to={'/campfire' + (board ? '?board=' + board.id : '')}>{board ? 'Open ' + board.name : 'Open Village Square'}</Link>
        {isAdmin && <Link className="btn btn-outline btn-full amb-btn" to="/admin">Admin page</Link>}
      </section>
    </div>
  )
}
