import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { fetchCalendarEvents } from '../utils/calendar'

// The organizer's home base for one group: shortcuts, members, upcoming
// events with sign-up counts, and the needs and offers posted under the
// group's name. Only the head and organizers see this. The database checks
// that too, so a hidden button is never the only protection.

const ROLE_LABEL = { admin: 'Head', organizer: 'Organizer', member: 'Member' }

function when(iso) {
  return new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function OrgDashboard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { organizations, isAdmin } = useAuth()
  const managed = organizations.filter((o) => o.role === 'admin' || o.role === 'organizer')
  const mine = managed.find((o) => o.id === id)
  const allowed = !!mine || isAdmin
  const isHead = isAdmin || mine?.role === 'admin'

  const [orgName, setOrgName] = useState(mine?.name || '')
  const [members, setMembers] = useState([])
  const [events, setEvents] = useState([])
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('')
  const [found, setFound] = useState([])
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id || !allowed) return
    const [m, p, ev, o] = await Promise.all([
      supabase.rpc('list_org_members', { p_org: id }),
      supabase.rpc('org_needs_and_offers', { p_org: id }),
      fetchCalendarEvents(),
      supabase.from('organizations').select('name').eq('id', id).maybeSingle(),
    ])
    if (m.error) console.error('Failed to load members:', m.error)
    if (p.error) console.error('Failed to load needs and offers:', p.error)
    setMembers(m.data || [])
    setPosts(p.data || [])
    setEvents((ev.events || []).filter((e) => e.organization_id === id && e.can_manage))
    if (o.data?.name) setOrgName(o.data.name)
    setLoading(false)
  }, [id, allowed])

  useEffect(() => { load() }, [load])

  async function search(e) {
    e.preventDefault()
    setNote('')
    const { data, error } = await supabase.rpc('search_people_for_org', { p_org: id, p_query: query })
    if (error) { console.error('Search failed:', error); setNote("Couldn't search right now. Try again."); return }
    setFound(data || [])
    setSearched(true)
  }

  async function run(fn, okMsg) {
    setBusy(true); setNote('')
    const { error } = await fn()
    setBusy(false)
    if (error) {
      console.error('Member change failed:', error)
      setNote(error.message && error.message.length < 140 ? error.message : "We couldn't save that. Try again.")
      return
    }
    setNote(okMsg)
    await load()
  }

  const addMember = (u) => run(async () => {
    const r = await supabase.rpc('add_org_member', { p_org: id, p_user: u.user_id })
    if (!r.error) { setFound((f) => f.filter((x) => x.user_id !== u.user_id)) }
    return r
  }, u.display_name + ' was added.')

  const setRole = (u, role) => run(
    () => supabase.rpc('set_org_member_role', { p_org: id, p_user: u.user_id, p_role: role }),
    u.display_name + (role === 'organizer' ? ' is now an organizer.' : ' is now a member.'),
  )

  const removeMember = (u) => {
    if (!confirm('Remove ' + u.display_name + ' from ' + orgName + '?')) return
    run(() => supabase.rpc('remove_org_member', { p_org: id, p_user: u.user_id }), u.display_name + ' was removed.')
  }

  // /org-dashboard with no group picked: go straight in if there is only one.
  if (!id) {
    if (managed.length === 1) return <Navigate to={'/orgs/' + managed[0].id + '/dashboard'} replace />
    return (
      <div className="cal-page hub-page">
        <Link to="/" className="hub-back">&#8592; Home</Link>
        <h1 className="hub-org-name">Organization dashboard</h1>
        {managed.length === 0 && (
          <p className="cal-empty">You don't run a group on VWB yet. You can ask to add yours from the Community page.</p>
        )}
        {managed.map((o) => (
          <Link key={o.id} to={'/orgs/' + o.id + '/dashboard'} className="btn btn-outline btn-full" style={{ marginBottom: '0.5rem', minHeight: '44px' }}>{o.name}</Link>
        ))}
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="cal-page hub-page">
        <Link to="/" className="hub-back">&#8592; Home</Link>
        <p className="cal-empty">This dashboard is only for this group's organizers.</p>
      </div>
    )
  }

  const openPosts = posts.filter((p) => p.status !== 'closed' && p.status !== 'completed' && p.status !== 'cancelled')
  const tile = { padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #333', background: '#1e1e1e' }

  return (
    <div className="cal-page hub-page">
      <Link to="/" className="hub-back">&#8592; Home</Link>
      <h1 className="hub-org-name">{orgName || 'Your group'}</h1>
      <p className="cal-sub">Organization dashboard</p>

      {loading && <p className="cal-empty">Loading...</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', margin: '0.75rem 0 1rem' }}>
        <div style={tile}><div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4ecca3' }}>{members.length}</div><div style={{ fontSize: '0.75rem', color: '#999' }}>Members</div></div>
        <div style={tile}><div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4ecca3' }}>{events.length}</div><div style={{ fontSize: '0.75rem', color: '#999' }}>Upcoming events</div></div>
        <div style={tile}><div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4ecca3' }}>{openPosts.length}</div><div style={{ fontSize: '0.75rem', color: '#999' }}>Open needs and offers</div></div>
      </div>

      <section className="hub-section" aria-labelledby="od-shortcuts">
        <div className="hub-section-head"><h2 id="od-shortcuts">Shortcuts</h2></div>
        <div className="quick-actions">
          <button type="button" className="action-card" onClick={() => navigate('/calendar/new')}>
            <span className="action-icon" aria-hidden="true">&#128197;</span>
            <span className="action-label">Post an event</span>
            <span className="action-desc">With volunteer sign-ups if you want them</span>
          </button>
          <button type="button" className="action-card" onClick={() => navigate('/ask?org=' + id)}>
            <span className="action-icon" aria-hidden="true">&#127384;</span>
            <span className="action-label">Post a need</span>
            <span className="action-desc">Ask neighbors for help as your group</span>
          </button>
          <button type="button" className="action-card" onClick={() => navigate('/post-offer?org=' + id)}>
            <span className="action-icon" aria-hidden="true">&#127873;</span>
            <span className="action-label">Post an offer</span>
            <span className="action-desc">Share what your group can give</span>
          </button>
          <button type="button" className="action-card" onClick={() => navigate('/orgs/' + id)}>
            <span className="action-icon" aria-hidden="true">&#127968;</span>
            <span className="action-label">Our public page</span>
            <span className="action-desc">Home area, privacy, and contact email</span>
          </button>
          <button type="button" className="action-card" onClick={() => navigate('/community/resources')}>
            <span className="action-icon" aria-hidden="true">&#128214;</span>
            <span className="action-label">Resources</span>
            <span className="action-desc">Browse or add to the resource list</span>
          </button>
        </div>
      </section>

      <section className="hub-section" aria-labelledby="od-events">
        <div className="hub-section-head">
          <h2 id="od-events">Events and sign-ups</h2>
          <Link to="/calendar/new" className="hub-more">+ Post an event</Link>
        </div>
        {!loading && events.length === 0 && <p className="hub-empty">No upcoming events yet.</p>}
        {events.map((e) => (
          <Link key={e.id} to={'/events/' + e.id} className="cal-card" style={{ display: 'block', textDecoration: 'none' }}>
            <span className="cal-card-title">{e.title}{e.status === 'cancelled' ? ' (cancelled)' : ''}</span>
            <span className="cal-card-meta">{when(e.starts_at)}</span>
            <span className="cal-card-meta">
              {e.signup_enabled
                ? e.signup_count + (e.signup_limit ? ' of ' + e.signup_limit : '') + ' signed up'
                : 'No sign-up'}
            </span>
          </Link>
        ))}
      </section>

      <section className="hub-section" aria-labelledby="od-posts">
        <div className="hub-section-head"><h2 id="od-posts">Needs and offers</h2></div>
        {!loading && posts.length === 0 && <p className="hub-empty">Nothing posted under your group's name yet. Use the shortcuts above.</p>}
        {posts.map((p) => (
          <div key={p.kind + p.id} className="cal-card">
            <span className="cal-card-title">{p.kind === 'need' ? 'Need' : 'Offer'}: {p.title}</span>
            {p.description && <span className="hub-org-desc">{p.description}</span>}
            <span className="cal-card-meta">{p.status} &middot; {new Date(p.created_at).toLocaleDateString()}</span>
          </div>
        ))}
      </section>

      <section className="hub-section" aria-labelledby="od-members">
        <div className="hub-section-head"><h2 id="od-members">Members</h2></div>
        {members.map((u) => (
          <div key={u.user_id} className="ban-row">
            <div className="ban-row-main">
              <strong>{u.display_name}</strong>
              <span className="group-member-sub">{ROLE_LABEL[u.role] || u.role}</span>
            </div>
            {u.role !== 'admin' && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {isHead && u.role === 'member' && <button type="button" className="btn btn-outline group-small-btn" disabled={busy} onClick={() => setRole(u, 'organizer')}>Make organizer</button>}
                {isHead && u.role === 'organizer' && <button type="button" className="btn btn-outline group-small-btn" disabled={busy} onClick={() => setRole(u, 'member')}>Make member</button>}
                {(isHead || u.role === 'member') && <button type="button" className="btn btn-outline group-small-btn" disabled={busy} onClick={() => removeMember(u)}>Remove</button>}
              </div>
            )}
          </div>
        ))}

        <form className="hub-search" onSubmit={search} noValidate style={{ marginTop: '0.75rem' }}>
          <label htmlFor="od-find" className="sr-only">Find a VWB member by name</label>
          <input id="od-find" type="text" autoComplete="off" placeholder="Find a VWB member by name" value={query} onChange={(e) => { setQuery(e.target.value); setSearched(false) }} />
          <button type="submit" className="btn btn-primary" disabled={query.trim().length < 2}>Search</button>
        </form>
        {searched && found.length === 0 && <p className="hub-empty">No one found. They need a VWB account first.</p>}
        {found.map((u) => (
          <div key={u.user_id} className="ban-row">
            <div className="ban-row-main"><strong>{u.display_name}</strong></div>
            <button type="button" className="btn btn-primary group-small-btn" disabled={busy} onClick={() => addMember(u)}>Add</button>
          </div>
        ))}
        {note && <p className="hub-note" role="status">{note}</p>}
      </section>
    </div>
  )
}
