import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { fetchCalendarEvents } from '../utils/calendar'
import OrgResources from '../components/OrgResources'
import OrgLinks from '../components/OrgLinks'
import OrgConnections from '../components/OrgConnections'
import { NEW_ACCOUNT_NOTE } from '../utils/newAccount'
import { UserName } from '../components/AvatarDisplay'

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
  const { user, organizations, isAdmin } = useAuth()
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
  const [allOrgs, setAllOrgs] = useState([])
  const [orgInfo, setOrgInfo] = useState(null)
  // Group chats started for this organization (the ones you are in)
  const [chats, setChats] = useState([])
  const [chatsReady, setChatsReady] = useState(false)
  const hasGeneral = chats.some((c) => c.is_general)
  const [chatName, setChatName] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [chatNote, setChatNote] = useState('')

  // Founders and admins can open any approved group, member or not.
  useEffect(() => {
    if (!isAdmin || id) return
    supabase.from('organizations').select('id, name').eq('approved', true).order('name').then(({ data, error }) => {
      if (error) console.error('Failed to load groups:', error)
      setAllOrgs(data || [])
    })
  }, [isAdmin, id])

  const load = useCallback(async () => {
    if (!id || !allowed) return
    const [m, p, ev, o] = await Promise.all([
      supabase.rpc('list_org_members', { p_org: id }),
      supabase.rpc('org_needs_and_offers', { p_org: id }),
      fetchCalendarEvents(),
      supabase.from('organizations').select('id, name, is_umbrella, affiliate_label').eq('id', id).maybeSingle(),
    ])
    if (m.error) console.error('Failed to load members:', m.error)
    if (p.error) console.error('Failed to load needs and offers:', p.error)
    setMembers(m.data || [])
    setPosts(p.data || [])
    setEvents((ev.events || []).filter((e) => e.organization_id === id && e.can_manage))
    if (o.data?.name) setOrgName(o.data.name)
    if (o.data) setOrgInfo(o.data)
    setLoading(false)
  }, [id, allowed])

  useEffect(() => { load() }, [load])

  const loadChats = useCallback(async () => {
    if (!id || !user?.id) return
    const { data, error } = await supabase
      .from('community_group_members')
      .select('group_id, status, community_groups!inner (id, name, organization_id, is_general)')
      .eq('user_id', user.id)
      .eq('community_groups.organization_id', id)
    if (error) console.error('Failed to load group chats:', error)
    const own = (data || []).filter((r) => r.status !== 'waiting' && r.community_groups).map((r) => r.community_groups)
    // Organizing chats other groups started with this one
    const { data: shared, error: sharedErr } = await supabase.rpc('my_org_chats', { p_org: id })
    if (sharedErr) console.error('Failed to load organizing chats:', sharedErr)
    const byId = new Map(own.map((c) => [c.id, c]))
    for (const c of shared || []) if (!byId.has(c.id)) byId.set(c.id, c)
    setChats([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)))
    setChatsReady(true)
  }, [id, user?.id])

  useEffect(() => { loadChats() }, [loadChats])

  async function startChat(e) {
    e.preventDefault()
    const name = (chatName || (!hasGeneral ? orgName + ' general chat' : '')).trim()
    if (!name) { setChatNote('Give the chat a name.'); return }
    setChatBusy(true); setChatNote('')
    const first = !hasGeneral
    const { data: newId, error } = first
      ? await supabase.rpc('start_org_general_chat', { p_org: id, p_name: name.slice(0, 80) })
      : await supabase.rpc('create_community_group', { p_name: name.slice(0, 80), p_description: null, p_organization: id })
    setChatBusy(false)
    if (error || !newId) {
      console.error('Failed to start group chat:', error)
      setChatNote(/New accounts can/i.test(error?.message || '') ? NEW_ACCOUNT_NOTE : 'Could not start the chat. Try again.')
      return
    }
    navigate('/groups/' + newId, { state: { justStarted: true } })
  }

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

  const makeHead = (u) => {
    if (!confirm('Make ' + u.display_name + ' a Head of ' + orgName + '? Heads can change anyone\'s role and remove members.')) return
    run(() => supabase.rpc('make_org_head', { p_org: id, p_user: u.user_id }), u.display_name + ' is now a Head.')
  }

  const stepDown = () => {
    if (!confirm('Step down as Head of ' + orgName + '? You will stay on as an organizer.')) return
    run(() => supabase.rpc('step_down_org_head', { p_org: id }), 'You are now an organizer.')
  }

  const headCount = members.filter((x) => x.role === 'admin').length

  const removeMember = (u) => {
    if (!confirm('Remove ' + u.display_name + ' from ' + orgName + '?')) return
    run(() => supabase.rpc('remove_org_member', { p_org: id, p_user: u.user_id }), u.display_name + ' was removed.')
  }

  // /org-dashboard with no group picked: go straight in if there is only one.
  if (!id) {
    const choices = isAdmin ? allOrgs : managed
    if (!isAdmin && managed.length === 1) return <Navigate to={'/orgs/' + managed[0].id + '/dashboard'} replace />
    return (
      <div className="cal-page hub-page">
        <Link to="/" className="hub-back">&#8592; Home</Link>
        <h1 className="hub-org-name">Organization dashboard</h1>
        {choices.length === 0 && (
          <p className="cal-empty">{isAdmin ? 'No approved groups yet.' : "You don't run a group on VWB yet. You can ask to add yours from the Community page."}</p>
        )}
        {choices.map((o) => (
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
          <button type="button" className="action-card" onClick={() => navigate('/calendar/new?org=' + id)}>
            <span className="action-icon" aria-hidden="true">&#128197;</span>
            <span className="action-label">Post an event</span>
            <span className="action-desc">With volunteer sign-ups if you want them</span>
          </button>
          <button type="button" className="action-card" onClick={() => navigate('/calendar/import?org=' + id)}>
            <span className="action-icon" aria-hidden="true">&#128229;</span>
            <span className="action-label">Import events</span>
            <span className="action-desc">Bring in your calendar from Google, Apple, Outlook, or Facebook</span>
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

      <section className="hub-section" aria-labelledby="od-chats">
        <div className="hub-section-head"><h2 id="od-chats">Group chats</h2></div>
        <p className="hub-org-desc">Private chats for {orgName || 'your organization'}. The general chat adds everyone in your organization automatically. You are the steward of any chat you start here.</p>
        {chatsReady && chats.length === 0 && <p className="hub-empty">No chats yet. Start your general chat below.</p>}
        {chats.map((c) => (
          <button key={c.id} type="button" className="groups-row" onClick={() => navigate('/groups/' + c.id)}>
            <span className="groups-row-name">{c.name}</span>
            <span className="groups-row-meta">Open chat &#8250;</span>
          </button>
        ))}
        <form onSubmit={startChat} noValidate style={{ marginTop: '0.75rem' }}>
          <label htmlFor="od-chat-name" className="cal-sub" style={{ display: 'block' }}>{!hasGeneral ? 'Name for your general chat' : 'Start another chat (for example, Volunteers)'}</label>
          <input id="od-chat-name" type="text" maxLength={80} autoComplete="off" value={chatName} placeholder={!hasGeneral ? (orgName || 'Organization') + ' general chat' : 'Chat name'} onChange={(e) => { setChatName(e.target.value); setChatNote('') }} style={{ width: '100%', boxSizing: 'border-box', minHeight: 48, fontSize: 16, margin: '0.25rem 0 0.5rem' }} />
          {chatNote && <p role="alert" className="groups-error">{chatNote}</p>}
          <button type="submit" className="btn btn-primary btn-full" style={{ minHeight: '48px' }} disabled={chatBusy}>{chatBusy ? 'Starting...' : !hasGeneral ? 'Start the general chat' : 'Start chat'}</button>
        </form>
      </section>

      {mine && <OrgConnections orgId={id} orgName={orgName} />}

      {orgInfo && <OrgLinks org={orgInfo} canManage={allowed} part="manage" onChanged={load} />}

      <section className="hub-section" aria-labelledby="od-events">
        <div className="hub-section-head">
          <h2 id="od-events">Events and sign-ups</h2>
          <Link to={'/calendar/new?org=' + id} className="hub-more">+ Post an event</Link>
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
            {p.kind === 'need' && !['completed', 'cancelled', 'closed', 'archived'].includes(p.status) && (
              <Link to={'/ask?edit=' + p.id} className="hub-more">Edit</Link>
            )}
          </div>
        ))}
      </section>

      <OrgResources orgId={id} />

      <section className="hub-section" aria-labelledby="od-members">
        <div className="hub-section-head"><h2 id="od-members">Members</h2></div>
        {members.map((u) => (
          <div key={u.user_id} className="ban-row">
            <div className="ban-row-main">
              <strong><UserName userId={u.user_id} name={u.display_name} /></strong>
              <span className="group-member-sub">{ROLE_LABEL[u.role] || u.role}</span>
            </div>
            {u.role === 'admin' && u.user_id === user.id && headCount > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline group-small-btn" disabled={busy} onClick={stepDown}>Step down as Head</button>
              </div>
            )}
            {u.role !== 'admin' && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {isHead && u.role === 'organizer' && <button type="button" className="btn btn-outline group-small-btn" disabled={busy} onClick={() => makeHead(u)}>Make Head</button>}
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
            <div className="ban-row-main"><strong><UserName userId={u.user_id} name={u.display_name} /></strong></div>
            <button type="button" className="btn btn-primary group-small-btn" disabled={busy} onClick={() => addMember(u)}>Add</button>
          </div>
        ))}
        {note && <p className="hub-note" role="status">{note}</p>}
      </section>
    </div>
  )
}
