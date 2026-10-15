import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { fetchCalendarEvents } from '../utils/calendar'
import OrgResources from '../components/OrgResources'
import OrgConnections from '../components/OrgConnections'
import OrgRules from '../components/OrgRules'
import { useCampfireIds } from '../hooks/useCampfireIds'
import { useSidechatParents } from '../hooks/useSidechatParents'
import { NEW_ACCOUNT_NOTE } from '../utils/newAccount'
import { UserName } from '../components/AvatarDisplay'
import BackLink from '../components/BackLink'
import { useDashTab, NeedsYou, DashTabs, DashPanel } from '../components/DashShell'
import Icon from '../components/Icon'

// The organizer's home base for one organization. Needs-you card on top,
// then four tabs: People, Chats, Events and posts, Settings.
// Only Heads and organizers see this. The database checks that too,
// so a hidden button is never the only protection.

const TABS = [
  { k: 'people', em: '\u{1F4C7}', label: 'People' },
  { k: 'chats', em: '\u{1F525}', label: 'Chats' },
  { k: 'events', em: '\u{1F4C5}', label: 'Events' },
  { k: 'settings', em: '\u2699\uFE0F', label: 'Settings' },
]

const ROLE_LABEL = { admin: 'Head', organizer: 'Organizer', member: 'Member' }
// Emergency response Groups use keeper words for the same two roles.
const GROUP_ROLE_LABEL = { admin: 'Lead keeper', organizer: 'Keeper', member: 'Member' }

function when(iso) {
  return new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function OrgDashboard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, organizations } = useAuth()
  const managed = organizations.filter((o) => o.role === 'admin' || o.role === 'organizer')
  const mine = managed.find((o) => o.id === id)
  const allowed = !!mine
  const isHead = mine?.role === 'admin'

  const campfires = useCampfireIds()
  const sidechatParents = useSidechatParents()
  const [sidePicked, setSidePicked] = useState([])
  const [sideFilter, setSideFilter] = useState('')
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
  const [orgInfo, setOrgInfo] = useState(null)
  // Group chats started for this organization (the ones you are in)
  const [chats, setChats] = useState([])
  const [chatsReady, setChatsReady] = useState(false)
  const [chatName, setChatName] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [chatNote, setChatNote] = useState('')
  const [asks, setAsks] = useState([])
  const [linkAsks, setLinkAsks] = useState(0)
  const [tab, setTab] = useDashTab(TABS)
  const isGroup = (orgInfo?.kind || mine?.kind) === 'group'
  const W = isGroup
    ? { head: 'Lead keeper', aHead: 'a Lead keeper', organizer: 'keeper', anOrganizer: 'a keeper', leads: 'Keepers', tools: 'Keeper tools' }
    : { head: 'Head', aHead: 'a Head', organizer: 'organizer', anOrganizer: 'an organizer', leads: 'Heads and organizers', tools: 'Organizer tools' }

  const load = useCallback(async () => {
    if (!id || !allowed) return
    const [m, p, ev, o, a, c] = await Promise.all([
      supabase.rpc('list_org_members', { p_org: id }),
      supabase.rpc('org_needs_and_offers', { p_org: id }),
      fetchCalendarEvents(),
      supabase.from('organizations').select('id, name, is_umbrella, affiliate_label, kind').eq('id', id).maybeSingle(),
      supabase.rpc('org_join_asks_list', { p_org: id }),
      supabase.rpc('my_org_connections', { p_org: id }),
    ])
    if (a.error) console.error('Failed to load join asks:', a.error)
    if (c.error) console.error('Failed to load connection requests:', c.error)
    setAsks(a.data || [])
    setLinkAsks((c.data || []).filter((l) => l.status === 'pending' && !l.asked_by_me).length)
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
      .select('group_id, status, community_groups!inner (id, name, organization_id, is_general, is_org_news)')
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
    const general = chats.find((c) => c.is_general)
    const name = (chatName || (!general ? orgName + ' general chat' : '')).trim()
    if (!name) { setChatNote('Give the sidechat a name.'); return }
    setChatBusy(true); setChatNote('')
    const { data: newId, error } = !general
      ? await supabase.rpc('start_org_general_chat', { p_org: id, p_name: name.slice(0, 80) })
      : await supabase.rpc('start_sidechat', { p_parent: general.id, p_name: name.slice(0, 80), p_members: sidePicked })
    setChatBusy(false)
    if (error || !newId) {
      console.error('Failed to start chat:', error)
      setChatNote(/New accounts can/i.test(error?.message || '') ? NEW_ACCOUNT_NOTE : (error?.message && error.message.length < 140 && error.code && error.code !== 'PGRST202' ? error.message : 'Could not start the chat. Try again.'))
      return
    }
    navigate('/groups/' + newId, { state: { justStarted: true } })
  }

  async function startNews() {
    setChatBusy(true); setChatNote('')
    const { data: gid, error } = await supabase.rpc('start_org_announcements', { p_org: id })
    setChatBusy(false)
    if (error || !gid) { console.error('Failed to start Announcements:', error); setChatNote("We couldn't start Announcements. Try again."); return }
    navigate('/groups/' + gid, { state: { justStarted: true } })
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
    if (!r.error) { setFound((f) => f.filter((x) => x.user_id !== u.user_id)); setAsks((l) => l.filter((x) => x.user_id !== u.user_id)) }
    return r
  }, u.display_name + ' was added.')

  const setRole = (u, role) => run(
    () => supabase.rpc('set_org_member_role', { p_org: id, p_user: u.user_id, p_role: role }),
    u.display_name + (role === 'organizer' ? ' is now ' + W.anOrganizer + '.' : ' is now a member.'),
  )

  const makeHead = (u) => {
    if (!confirm('Make ' + u.display_name + ' ' + W.aHead + ' of ' + orgName + '? ' + W.head + 's can change anyone\'s role and remove members.')) return
    run(() => supabase.rpc('make_org_head', { p_org: id, p_user: u.user_id }), u.display_name + ' is now ' + W.aHead + '.')
  }

  const stepDown = () => {
    if (!confirm('Step down as ' + W.head + ' of ' + orgName + '? You will stay on as ' + W.anOrganizer + '.')) return
    run(() => supabase.rpc('step_down_org_head', { p_org: id }), 'You are now ' + W.anOrganizer + '.')
  }

  const notNow = (u) => run(
    () => supabase.rpc('dismiss_org_join_ask', { p_org: id, p_user: u.user_id }),
    'Cleared. ' + u.display_name + ' is not told.',
  )

  const headCount = members.filter((x) => x.role === 'admin').length

  const removeMember = (u) => {
    if (!confirm('Remove ' + u.display_name + ' from ' + orgName + '?')) return
    run(() => supabase.rpc('remove_org_member', { p_org: id, p_user: u.user_id }), u.display_name + ' was removed.')
  }

  // /org-dashboard with no group picked: go straight in if there is only one.
  if (!id) {
    const choices = managed
    if (managed.length === 1) return <Navigate to={'/orgs/' + managed[0].id + '/dashboard'} replace />
    return (
      <div className="cal-page hub-page dash-page">
        <BackLink fallback="/" fallbackLabel="Home" />
        <h1 className="hub-org-name">Organization dashboard</h1>
        {choices.length === 0 && (
          <p className="cal-empty">You don't run a group on VWB yet. You can ask to add yours from the Community page.</p>
        )}
        {choices.map((o) => (
          <Link key={o.id} to={'/orgs/' + o.id + '/dashboard'} className="btn btn-outline btn-full" style={{ marginBottom: '0.5rem', minHeight: '44px' }}>{o.name}</Link>
        ))}
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="cal-page hub-page dash-page">
        <BackLink fallback="/" fallbackLabel="Home" />
        <p className="cal-empty">This dashboard is only for this group's organizers.</p>
      </div>
    )
  }

  const general = chats.find((c) => c.is_general)
  const newsBoard = chats.find((c) => c.is_org_news)
  const sidechats = general ? chats.filter((c) => sidechatParents.get(c.id) === general.id) : []
  const sideIds = new Set(sidechats.map((c) => c.id))
  const otherChats = chats.filter((c) => c !== general && c !== newsBoard && !sideIds.has(c.id))
  const people = members.filter((u) => u.user_id !== user.id)
  const shownPeople = people.filter((u) => !sideFilter.trim() || (u.display_name || '').toLowerCase().includes(sideFilter.trim().toLowerCase()))
  const chatRow = (c, nested) => (
    <button key={c.id} type="button" className="groups-row" style={nested ? { marginLeft: '1.25rem', width: 'calc(100% - 1.25rem)' } : undefined} onClick={() => navigate('/groups/' + c.id)}>
      <span className="groups-row-name">{nested ? '↳ ' : ''}{campfires.has(c.id) ? <><Icon name="campfire" />{' '}</> : ''}{c.name}</span>
      <span className="groups-row-meta">Open chat &#8250;</span>
    </button>
  )
  const openPosts = posts.filter((p) => p.status !== 'closed' && p.status !== 'completed' && p.status !== 'cancelled')
  const weekOut = Date.now() + 7 * 864e5
  const soon = events.filter((e) => e.status !== 'cancelled' && new Date(e.starts_at).getTime() < weekOut)

  const needs = loading ? null : [
    asks.length && { k: 'asks', tab: 'people', em: '\u{1F64B}', text: asks.length === 1 ? asks[0].display_name + ' asked to join' : asks.length + ' people asked to join' },
    linkAsks && { k: 'links', tab: 'chats', em: '\u{1F517}', text: linkAsks === 1 ? 'An organization asked to connect' : linkAsks + ' organizations asked to connect' },
    !general && chatsReady && { k: 'general', tab: 'chats', em: '\u{1F525}', text: 'Start your general chat so members have a place to talk' },
    soon.length && { k: 'soon', tab: 'events', em: '\u{1F4C5}', text: soon.length === 1 ? soon[0].title + ' is this week' : soon.length + ' events this week' },
  ].filter(Boolean)

  const shortcut = (em, label, to) => (
    <button type="button" className="dash-shortcut" onClick={() => navigate(to)}><span aria-hidden="true"><Icon name={em} /></span>{label}</button>
  )

  return (
    <div className="cal-page hub-page dash-page">
      <BackLink fallback={'/orgs/' + id} fallbackLabel={orgName || 'Organization'} />
      <div className="dash-head">
        <span className="dash-head-icon" aria-hidden="true"><Icon name="toolbox" /></span>
        <h1>{orgName || 'Your organization'}</h1>
      </div>
      <p className="dash-sub">{W.tools}{isHead ? ' · You are ' + W.aHead : ' · You are ' + W.anOrganizer}</p>

      {loading && <p className="cal-empty" role="status">Loading...</p>}
      <NeedsYou items={needs} onGo={setTab} />

      <div className="dash-stats">
        <button type="button" className="dash-stat" onClick={() => setTab('people')}><b>{members.length}</b><small>Members</small></button>
        <button type="button" className="dash-stat" onClick={() => setTab('events')}><b>{events.length}</b><small>Upcoming events</small></button>
        <button type="button" className="dash-stat" onClick={() => setTab('events')}><b>{openPosts.length}</b><small>Open needs and offers</small></button>
      </div>

      <DashTabs tabs={TABS} tab={tab} setTab={setTab} dots={{ people: asks.length > 0, chats: linkAsks > 0 }} />

      {tab === 'people' && (
        <DashPanel k="people">
          {asks.length > 0 && (
            <section className="hub-section" aria-labelledby="od-asks">
              <div className="hub-section-head"><h2 id="od-asks">Asking to join</h2></div>
              {asks.map((u) => (
                <div key={u.user_id} className="dash-row">
                  <div className="dash-row-main"><strong><UserName userId={u.user_id} name={u.display_name} /></strong><small>Asked {new Date(u.asked_at).toLocaleDateString()}</small></div>
                  <div className="dash-btns">
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => addMember(u)}>Add</button>
                    <button type="button" className="btn btn-outline" disabled={busy} onClick={() => notNow(u)}>Not now</button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className="hub-section" aria-labelledby="od-members">
            <div className="hub-section-head"><h2 id="od-members">Members ({members.length})</h2></div>
            {members.map((u) => (
              <div key={u.user_id} className="dash-row">
                <div className="dash-row-main">
                  <strong><UserName userId={u.user_id} name={u.display_name} /></strong>
                  <small>{(isGroup ? GROUP_ROLE_LABEL : ROLE_LABEL)[u.role] || u.role}{u.user_id === user.id ? ' (you)' : ''}</small>
                </div>
                {u.role === 'admin' && u.user_id === user.id && headCount > 1 && (
                  <div className="dash-btns">
                    <button type="button" className="btn btn-outline group-small-btn" disabled={busy} onClick={stepDown}>Step down as {W.head}</button>
                  </div>
                )}
                {u.role !== 'admin' && (
                  <div className="dash-btns">
                    {isHead && u.role === 'organizer' && <button type="button" className="btn btn-outline group-small-btn" disabled={busy} onClick={() => makeHead(u)}>Make {W.head}</button>}
                    {isHead && u.role === 'member' && <button type="button" className="btn btn-outline group-small-btn" disabled={busy} onClick={() => setRole(u, 'organizer')}>Make {W.organizer}</button>}
                    {isHead && u.role === 'organizer' && <button type="button" className="btn btn-outline group-small-btn" disabled={busy} onClick={() => setRole(u, 'member')}>Make member</button>}
                    {(isHead || u.role === 'member') && <button type="button" className="btn btn-outline group-small-btn" disabled={busy} onClick={() => removeMember(u)}>Remove</button>}
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="hub-section" aria-labelledby="od-add">
            <div className="hub-section-head"><h2 id="od-add">Add someone</h2></div>
            <form className="hub-search" onSubmit={search} noValidate>
              <label htmlFor="od-find" className="sr-only">Find a VWB member by name</label>
              <input id="od-find" type="text" autoComplete="off" placeholder="Find a VWB member by name" value={query} onChange={(e) => { setQuery(e.target.value); setSearched(false) }} />
              <button type="submit" className="btn btn-primary" disabled={query.trim().length < 2}>Search</button>
            </form>
            {searched && found.length === 0 && <p className="hub-empty">No one found. They need a VWB account first.</p>}
            {found.map((u) => (
              <div key={u.user_id} className="dash-row">
                <div className="dash-row-main"><strong><UserName userId={u.user_id} name={u.display_name} /></strong></div>
                <button type="button" className="btn btn-primary group-small-btn" disabled={busy} onClick={() => addMember(u)}>Add</button>
              </div>
            ))}
          </section>
          {note && <p className="dash-note" role="status">{note}</p>}
        </DashPanel>
      )}

      {tab === 'chats' && (
        <DashPanel k="chats">
          <section className="hub-section" aria-labelledby="od-news">
            <div className="hub-section-head"><h2 id="od-news"><Icon name="megaphone" /> Announcements</h2></div>
            {newsBoard
              ? <button type="button" className="groups-row" onClick={() => navigate('/groups/' + newsBoard.id)}>
                  <span className="groups-row-name">{newsBoard.name}</span>
                  <span className="groups-row-meta">Post news &#8250;</span>
                </button>
              : <>
                  <p className="hub-org-desc">A board for news to everyone in {orgName || 'your organization'}. {W.leads} post. Members read it and get an alert.</p>
                  <button type="button" className="btn btn-primary btn-full" style={{ minHeight: 48 }} disabled={chatBusy} onClick={startNews}>Start Announcements</button>
                </>}
          </section>

          <section className="hub-section" aria-labelledby="od-chats">
            <div className="hub-section-head"><h2 id="od-chats">Campfires</h2></div>
            <p className="hub-org-desc">{general ? 'The general chat has everyone in ' + (orgName || 'your organization') + '. Start a sidechat under it for one task or topic, and pick who joins. Only the people you pick see it.' : 'Private chats for ' + (orgName || 'your organization') + '. The general chat adds everyone in your organization automatically.'}</p>
            {chatsReady && chats.length === 0 && <p className="hub-empty">No chats yet. Start your general chat below.</p>}
            {general && chatRow(general, false)}
            {sidechats.map((c) => chatRow(c, true))}
            {otherChats.map((c) => chatRow(c, false))}
            <form onSubmit={startChat} noValidate style={{ marginTop: '0.75rem' }}>
              <label htmlFor="od-chat-name" className="cal-sub" style={{ display: 'block' }}>{!general ? 'Name for your general chat' : 'Start a sidechat under ' + general.name}</label>
              <input id="od-chat-name" type="text" maxLength={80} autoComplete="off" value={chatName} placeholder={!general ? (orgName || 'Organization') + ' general chat' : 'For example, Volunteers or Food drive'} onChange={(e) => { setChatName(e.target.value); setChatNote('') }} style={{ width: '100%', boxSizing: 'border-box', minHeight: 48, fontSize: 16, margin: '0.25rem 0 0.5rem' }} />
              {general && (
                <fieldset style={{ border: 'none', padding: 0, margin: '0 0 0.75rem' }}>
                  <legend className="cal-sub">Who is in it (you are added automatically)</legend>
                  {people.length > 8 && (
                    <input type="search" aria-label="Search the group by name" placeholder="Type a name" value={sideFilter} onChange={(e) => setSideFilter(e.target.value)} autoComplete="off" style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, fontSize: 16, margin: '0.25rem 0 0.5rem' }} />
                  )}
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {shownPeople.map((u) => (
                      <label key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minHeight: 44 }}>
                        <input type="checkbox" checked={sidePicked.includes(u.user_id)} onChange={() => setSidePicked((s) => (s.includes(u.user_id) ? s.filter((x) => x !== u.user_id) : [...s, u.user_id]))} style={{ width: 22, height: 22 }} />
                        <span>{u.display_name}</span>
                      </label>
                    ))}
                    {people.length === 0 && <p className="hub-empty">No one else is in the group yet.</p>}
                  </div>
                  {people.length > 1 && (
                    <button type="button" className="btn btn-outline group-small-btn" style={{ marginTop: '0.4rem' }} onClick={() => setSidePicked(sidePicked.length === people.length ? [] : people.map((u) => u.user_id))}>{sidePicked.length === people.length ? 'Clear everyone' : 'Pick everyone'}</button>
                  )}
                </fieldset>
              )}
              {chatNote && <p role="alert" className="groups-error">{chatNote}</p>}
              <button type="submit" className="btn btn-primary btn-full" style={{ minHeight: '48px' }} disabled={chatBusy}>{chatBusy ? 'Starting...' : !general ? 'Start the general chat' : 'Start sidechat'}</button>
            </form>
          </section>

          <OrgConnections orgId={id} orgName={orgName} />
        </DashPanel>
      )}

      {tab === 'events' && (
        <DashPanel k="events">
          <div className="dash-shortcuts">
            {shortcut('\u{1F4C5}', 'Post an event', '/calendar/new?org=' + id)}
            {shortcut('\u{1F4E5}', 'Import events', '/calendar/import?org=' + id)}
            {shortcut('\u{1F198}', 'Post a need', '/ask?org=' + id)}
            {shortcut('\u{1F381}', 'Post an offer', '/post-offer?org=' + id)}
          </div>

          <section className="hub-section" aria-labelledby="od-events">
            <div className="hub-section-head"><h2 id="od-events">Events and sign-ups</h2></div>
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
            {!loading && posts.length === 0 && <p className="hub-empty">Nothing posted under your group's name yet.</p>}
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
        </DashPanel>
      )}

      {tab === 'settings' && (
        <DashPanel k="settings">
          <section className="hub-section" aria-labelledby="od-public">
            <div className="hub-section-head"><h2 id="od-public">Your public page</h2></div>
            <p className="hub-org-desc">Home area, who can see your organization, and your contact email are set at the bottom of your organization page.</p>
            <div className="dash-shortcuts">
              {shortcut('\u{1F3E1}', 'Open our page', '/orgs/' + id)}
              {shortcut('\u{1F4D6}', 'Resource list', '/community/resources')}
            </div>
          </section>
          <OrgRules orgId={id} isHead={isHead} />
          {isHead && headCount > 1 && (
            <section className="hub-section" aria-labelledby="od-step">
              <div className="hub-section-head"><h2 id="od-step">Your role</h2></div>
              <p className="hub-org-desc">You are one of {headCount} {W.head}s. You can step down and stay on as {W.anOrganizer}.</p>
              <button type="button" className="btn btn-outline btn-full" style={{ minHeight: 48 }} disabled={busy} onClick={stepDown}>Step down as {W.head}</button>
              {note && <p className="dash-note" role="status">{note}</p>}
            </section>
          )}
        </DashPanel>
      )}
    </div>
  )
}
