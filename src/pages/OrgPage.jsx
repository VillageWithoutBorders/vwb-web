import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import SpotIcon from '../components/SpotIcon'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { fetchCalendarEvents } from '../utils/calendar'
import { CalendarEventList } from '../components/CalendarParts'
import { resourceCats } from '../utils/resourceCategories'
import QrShare from '../components/QrShare'
import CalendarSubscribe from '../components/CalendarSubscribe'
import OrgVillages from '../components/OrgVillages'
import OrgRules from '../components/OrgRules'
import OrgMemberNames from '../components/OrgMemberNames'
import { ORG_SPOTS, GROUP_SPOTS, backgroundSrc, DEFAULT_WORLDS } from '../data/worldElements'
import { usePageMap, MapLayers, MapToolbar, NamesToggle, ToolIcon, sceneProps } from '../components/MapBuilder'
import OrgSceneEditor from '../components/OrgSceneEditor'
import GroupGear from '../components/GroupGear'
import GroupResponse from '../components/GroupResponse'
import '../village-scene.css'
import Icon from '../components/Icon'
import { orgWords } from '../utils/roleWords'

// The Organization page: one organization as a little world, the same way a
// village page works. Every element on the hills opens its part. Members-only
// parts show faded with a lock to everyone else. A plain list sits below.
// Heads and organizers also get their settings at the bottom.
// Names follow the VWB Vocabulary sheet. Route: /orgs/:id

// Role words come from utils/roleWords: groups say Helper and Keeper,
// organizations say Organizer and Head.

function safeLink(url) {
  if (!url) return null
  return /^https?:\/\//i.test(url) ? url : 'https://' + url
}

function stillMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

export default function OrgPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const isNew = params.get('new') === '1'
  const { user, profile, refreshProfile, organizations } = useAuth()

  const [org, setOrg] = useState(null)
  const [place, setPlace] = useState('')
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [events, setEvents] = useState([])
  const [resources, setResources] = useState([])
  const [contactEmail, setContactEmail] = useState(null)
  const [links, setLinks] = useState([])
  const [villageCount, setVillageCount] = useState(0)
  const [chats, setChats] = useState([])
  const [news, setNews] = useState(null)
  const [newsBusy, setNewsBusy] = useState(false)
  const [newsNote, setNewsNote] = useState('')
  const [posts, setPosts] = useState(null)
  const [postsError, setPostsError] = useState('')
  const [asked, setAsked] = useState(false)
  const [askNote, setAskNote] = useState('')
  const [asking, setAsking] = useState(false)

  const [sheet, setSheet] = useState(null)
  const [bump, setBump] = useState(null)
  const sheetRef = useRef(null)
  const lastFocus = useRef(null)

  // Organizer settings (moved here unchanged from the old page)
  const [zip, setZip] = useState('')
  const [savingZip, setSavingZip] = useState(false)
  const [zipNote, setZipNote] = useState('')
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [privacyNote, setPrivacyNote] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailNote, setEmailNote] = useState('')

  const mine = (organizations || []).find((o) => o.id === id)
  const isMember = !!mine
  const canManage = !!mine && (mine.role === 'admin' || mine.role === 'organizer')
  const isHead = !!mine && mine.role === 'admin'

  async function loadOrg() {
    const cols = 'id, name, description, website_url, social_links, home_zip, approved, hide_from_public, show_contact_email, is_umbrella, affiliate_label, kind, response_status, head_title, organizer_title'
    let { data, error } = await supabase.from('organizations').select(cols + ', scene').eq('id', id).eq('approved', true).maybeSingle()
    // Before vwb-org-scene.sql is run, the page look column isn't there yet: load without it.
    if (error && (error.code === '42703' || /scene/.test(error.message || ''))) {
      ({ data, error } = await supabase.from('organizations').select(cols).eq('id', id).eq('approved', true).maybeSingle())
    }
    if (error) console.error('Failed to load organization:', error)
    if (!data) { setMissing(true); return null }
    setOrg(data)
    const { data: em, error: emErr } = await supabase.rpc('get_org_contact_email', { p_org: id })
    if (emErr) console.error('Failed to load contact email:', emErr)
    setContactEmail(typeof em === 'string' && em ? em : null)
    if (data.home_zip) {
      const { data: z, error: zErr } = await supabase.from('zip_codes').select('city, state').eq('zip', data.home_zip).maybeSingle()
      if (zErr) console.error('Failed to load home area:', zErr)
      setPlace(z ? z.city + ', ' + z.state : data.home_zip)
    } else {
      setPlace('')
    }
    return data
  }

  // The organization, its events, and what it shares.
  useEffect(() => {
    let alive = true
    setLoading(true); setMissing(false); setSheet(null); setPosts(null)
    Promise.all([
      loadOrg(),
      fetchCalendarEvents(),
      supabase.from('community_resources').select('id, name, description, categories, category, phone, url').eq('organization_id', id).eq('verified', true).order('name'),
    ]).then(([, ev, res]) => {
      if (!alive) return
      const now = Date.now()
      setEvents((ev.events || [])
        .filter((e) => e.organization_id === id && e.status !== 'cancelled' && new Date(e.ends_at || e.starts_at).getTime() >= now)
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)))
      if (res.error) console.error('Failed to load organization resources:', res.error)
      setResources(res.data || [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Connections and the villages it works in. Names only.
  useEffect(() => {
    let alive = true
    supabase.rpc('org_connection_lines').then(async ({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load connections:', error); return }
      const others = (data || []).filter((r) => r.org_a === id || r.org_b === id).map((r) => (r.org_a === id ? r.org_b : r.org_a))
      if (!others.length) { setLinks([]); return }
      const { data: names, error: nErr } = await supabase.from('organizations').select('id, name').in('id', others).order('name')
      if (!alive) return
      if (nErr) { console.error('Failed to load connected organizations:', nErr); return }
      setLinks(names || [])
    })
    supabase.rpc('org_village_links').then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load villages for this organization:', error); return }
      setVillageCount((data || []).filter((r) => r.org_id === id).length)
    })
    return () => { alive = false }
  }, [id])

  // Members: the Campfires I am in (general chat, sidechats, shared Campfires).
  useEffect(() => {
    if (!isMember || !user) { setChats([]); return }
    let alive = true
    Promise.all([
      supabase.from('community_group_members')
        .select('group_id, status, community_groups!inner (id, name, organization_id, is_general, is_org_news, parent_group_id)')
        .eq('user_id', user.id)
        .eq('community_groups.organization_id', id),
      canManage ? supabase.rpc('my_org_chats', { p_org: id }) : Promise.resolve({ data: [] }),
    ]).then(([own, shared]) => {
      if (!alive) return
      if (own.error) console.error('Failed to load Campfires:', own.error)
      if (shared.error) console.error('Failed to load shared Campfires:', shared.error)
      const byId = new Map()
      ;(own.data || []).filter((r) => r.status !== 'waiting' && r.community_groups).forEach((r) => byId.set(r.community_groups.id, r.community_groups))
      ;(shared.data || []).forEach((c) => { if (!byId.has(c.id)) byId.set(c.id, { ...c, shared: true }) })
      const rank = (c) => (c.is_general ? 0 : c.shared ? 2 : 1)
      const all = [...byId.values()]
      setNews(all.find((c) => c.is_org_news) || null)
      setChats(all.filter((c) => !c.is_org_news).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)))
    })
    return () => { alive = false }
  }, [id, isMember, canManage, user])

  // Not a member: did I already ask to join this week?
  useEffect(() => {
    if (isMember) { setAsked(false); return }
    let alive = true
    supabase.rpc('my_org_join_ask', { p_org: id }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to check your ask to join:', error); return }
      setAsked(!!data)
    })
    return () => { alive = false }
  }, [id, isMember])

  // Needs and offers load when someone opens them.
  async function loadPosts() {
    setPostsError('')
    if (canManage) {
      const { data, error } = await supabase.rpc('org_needs_and_offers', { p_org: id })
      if (error) { console.error('Failed to load needs and offers:', error); setPostsError("We couldn't load needs and offers. Try again."); setPosts([]); return }
      setPosts((data || []).filter((p) => p.status === 'open'))
      return
    }
    const [r, o] = await Promise.all([
      supabase.from('help_requests').select('id, skill_needed, description, status, created_at').eq('organization_id', id).eq('status', 'open').order('created_at', { ascending: false }).limit(30),
      supabase.from('offers').select('id, title, description, is_available, created_at').eq('organization_id', id).eq('is_available', true).order('created_at', { ascending: false }).limit(30),
    ])
    if (r.error) console.error('Failed to load needs:', r.error)
    if (o.error) console.error('Failed to load offers:', o.error)
    if (r.error && o.error) setPostsError("We couldn't load needs and offers. Try again.")
    setPosts([
      ...(r.data || []).map((x) => ({ kind: 'need', id: x.id, title: x.skill_needed, description: x.description, created_at: x.created_at })),
      ...(o.data || []).map((x) => ({ kind: 'offer', id: x.id, title: x.title, description: x.description, created_at: x.created_at })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
  }

  async function askToJoin() {
    if (asking) return
    setAsking(true); setAskNote('')
    const { data, error } = await supabase.rpc('ask_to_join_org', { p_org: id })
    setAsking(false)
    if (error) { console.error('Failed to ask to join:', error); setAskNote("We couldn't send that. Check your connection and try again."); return }
    const who = orgWords(org).leadsLower
    if (data === 'asked' || data === 'wait') { setAsked(true); setAskNote(data === 'asked' ? 'Sent. The ' + who + ' will see your name and can add you.' : 'You already asked this week. The ' + who + ' have your name.'); return }
    if (data === 'member') { setAskNote('You are already part of this ' + (org?.kind === 'group' ? 'group' : 'organization') + '.'); return }
    setAskNote("We couldn't send that right now. Try again later.")
  }

  // Sheet: Escape closes, focus goes in and comes back.
  useEffect(() => {
    if (!sheet) return
    const first = sheetRef.current && sheetRef.current.querySelector('button, a, input')
    if (first) first.focus()
    function onKey(e) { if (e.key === 'Escape') closeSheet() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])

  function openSheet(s) { lastFocus.current = document.activeElement; setSheet(s) }
  function closeSheet() {
    setSheet(null)
    if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus()
  }

  // From Organizer tools: "Change how our page looks" opens the page at the editor.
  const [lookParams] = useSearchParams()
  const wantsLook = lookParams.get('look') === '1'
  useEffect(() => {
    if (!wantsLook || !org || !canManage) return
    const t = setTimeout(() => { const el = document.getElementById('ose-h'); if (el) el.scrollIntoView({ block: 'start' }) }, 150)
    return () => clearTimeout(t)
  }, [wantsLook, org, canManage])

  const isGroup = org?.kind === 'group'
  const SPOTS = isGroup ? GROUP_SPOTS : ORG_SPOTS
  const W = orgWords(org)
  const roleName = (r) => W.roleLabel[r] || 'Member'
  const LEADS = W.leads
  const TOOLS = W.tools
  const KIND = isGroup ? 'group' : 'organization'

  const locked = (s) => !!s.members && !isMember
  // The look its leaders chose (vwb-org-scene.sql): sign, hidden places, own names.
  // Every map sits on a simple field (Oct 22).
  const scene = (org && org.scene) || {}
  const hiddenKeys = Array.isArray(scene.hide) ? scene.hide : []
  const ownNames = scene.names && typeof scene.names === 'object' ? scene.names : {}
  const sign = scene.sign || (isGroup ? 'tent' : 'people')
  const named = (s) => (ownNames[s.k] ? { ...s, label: ownNames[s.k], short: ownNames[s.k] } : s)
  const spots = SPOTS.filter((s) => !s.organizers || canManage).filter((s) => s.k === 'tools' || !hiddenKeys.includes(s.k))
    .map(named)
  const general = chats.find((c) => c.is_general)

  // Arrange and build (Oct 22, vwb-map-layouts.sql): the Heads and organizers (a
  // group's Keeper and Helpers) set the shared look; anyone signed in can arrange
  // their own view on top. Only they see it.
  const { b, arrangeFor, startArrange, resetLayout, saveLabels } = usePageMap({
    kind: 'org', id, spots, user, accountLayout: profile?.village_layout, refreshProfile, name: org?.name,
    base: isGroup ? DEFAULT_WORLDS.group : DEFAULT_WORLDS.org,
  })
  const { arrange, picked, placed, isHidden, dragStart, pickByKey } = b

  function info(k) {
    switch (k) {
      case 'rules': return { sub: isMember ? 'How this ' + KIND + ' runs' : 'Members only' }
      case 'where': return { sub: villageCount ? (isGroup ? 'Covers ' : 'Works in ') + villageCount + ' village' + (villageCount === 1 ? '' : 's') : 'No villages picked yet' }
      case 'ready': return { sub: org.response_status === 'approved' ? 'Approved to respond to emergencies' : org.response_status === 'asked' ? 'Waiting for approval' : 'Not called to emergencies yet' }
      case 'links': return { sub: links.length ? links.length + ' connected organization' + (links.length === 1 ? '' : 's') : 'No connections yet' }
      case 'news': return { sub: !isMember ? 'Members only' : news ? 'News from ' + org.name : canManage ? 'Start Announcements for your members' : 'No announcements yet' }
      case 'fires': return { sub: !isMember ? 'Members only' : chats.length ? chats.length + ' Campfire' + (chats.length === 1 ? '' : 's') + ' you are in' : 'No Campfires yet' }
      case 'events': return { sub: events.length ? events.length + ' coming up' : 'Nothing on the calendar yet' }
      case 'needs': return { sub: isMember ? 'What we need and what we offer' : 'Members only' }
      case 'share': return { sub: resources.length ? resources.length + ' shared resource' + (resources.length === 1 ? '' : 's') : 'Nothing shared yet' }
      case 'members': return { sub: !isMember ? 'Members only' : isGroup ? 'Who is in, and what we bring' : 'Who is part of this organization' }
      case 'involved': return { sub: isMember ? 'Share this page with a friend' : asked ? 'You asked to join' : 'Ask to join or reach the ' + W.leadsLower }
      case 'tools': return { sub: 'Members, chats, events, connections' }
      default: return { sub: '' }
    }
  }

  function tap(s) {
    if (!stillMotion()) { setBump(s.k); setTimeout(() => setBump(null), 450) }
    if (s.k === 'tools') { navigate('/orgs/' + id + '/dashboard'); return }
    if (s.k === 'news' && isMember && news) { navigate('/groups/' + news.id); return }
    if (s.k === 'fires' && isMember && chats.length === 1) { navigate('/groups/' + chats[0].id); return }
    if (s.k === 'needs' && isMember && posts === null) loadPosts()
    openSheet({ k: s.k })
  }

  async function startNews() {
    setNewsBusy(true); setNewsNote('')
    const { data: gid, error } = await supabase.rpc('start_org_announcements', { p_org: id })
    setNewsBusy(false)
    if (error || !gid) { console.error('Failed to start Announcements:', error); setNewsNote("We couldn't start Announcements. Try again."); return }
    setSheet(null)
    navigate('/groups/' + gid, { state: { justStarted: true } })
  }

  function askButton() {
    return <>
      <button type="button" className="btn btn-primary btn-full" onClick={askToJoin} disabled={asking || asked}>
        {asking ? 'Sending...' : asked ? 'You asked to join' : 'Ask to join ' + org.name}
      </button>
      {askNote && <p className="vs-note" role="status">{askNote}</p>}
    </>
  }

  function sheetBody(k) {
    const spot = SPOTS.find((s) => s.k === k)
    const title = <h2 id="op-sheet-title"><span aria-hidden="true" className="vs-sheet-ic"><SpotIcon spot={spot} size={36} /></span> {spot.label}</h2>
    if (locked(spot)) {
      return <>{title}
        <p><span aria-hidden="true"><Icon name="lock" /> </span>Only members of {org.name} can open this.</p>
        {askButton()}
      </>
    }
    if (spot.soon) return <>{title}<p>This part of the {KIND} is coming soon.</p></>
    switch (k) {
      case 'rules':
        return <>{title}<OrgRules orgId={id} isHead={isHead} org={org} onTitles={loadOrg} /></>
      case 'where':
        return <>{title}<OrgVillages orgId={id} orgName={org.name} canManage={canManage} /></>
      case 'links':
        return <>{title}
          {links.length === 0 && <p>{org.name} is not connected with an organization or group yet.</p>}
          {links.map((o) => (
            <button key={o.id} type="button" className="vs-row" onClick={() => { setSheet(null); navigate('/orgs/' + o.id) }}>
              <span aria-hidden="true"><Icon name="people" /></span> {o.name}<small>Connected organization</small>
            </button>
          ))}
          <p className="vs-note">The leaders of connected organizations and groups share a Campfire <Icon name="campfire" />.</p>
          {canManage && <Link className="btn btn-outline btn-full" to={'/orgs/' + id + '/dashboard'}>Connect with an organization or group</Link>}
        </>
      case 'news':
        return <>{title}
          {canManage
            ? <>
                <p>Announcements is a board for news to everyone in {org.name}. {LEADS} post. Members read it and get an alert.</p>
                <button type="button" className="btn btn-primary btn-full" disabled={newsBusy} onClick={startNews}>{newsBusy ? 'Starting...' : 'Start Announcements'}</button>
                {newsNote && <p className="vs-note" role="alert">{newsNote}</p>}
              </>
            : <p>No announcements yet. {LEADS} can start them.</p>}
        </>
      case 'fires':
        return <>{title}
          {chats.length === 0 && <p>{canManage ? 'No Campfires yet. Start the general chat from ' + TOOLS + '.' : 'No Campfires yet. ' + LEADS + ' start the general chat.'}</p>}
          {/* Sidechats live inside the general Campfire: listed under it, not as chats of their own. */}
          {chats.filter((c) => c.is_general || c.shared).map((c) => (
            <div key={c.id}>
              <button type="button" className="vs-row" onClick={() => { setSheet(null); navigate('/groups/' + c.id) }}>
                <span aria-hidden="true"><Icon name="campfire" /></span> {c.name}
                <small>{c.is_general ? 'General chat, every member' : 'Shared Campfire with a connected ' + (isGroup ? 'organization or group' : 'organization')}</small>
              </button>
              {c.is_general && chats.filter((x) => !x.is_general && !x.shared).map((x) => (
                <button key={x.id} type="button" className="vs-row vs-row-sub" onClick={() => { setSheet(null); navigate('/groups/' + x.id) }}>
                  <span aria-hidden="true">{'\u21B3'}</span> {x.name}
                  <small>Sidechat inside {c.name}</small>
                </button>
              ))}
            </div>
          ))}
          {!general && chats.filter((x) => !x.is_general && !x.shared).map((x) => (
            <button key={x.id} type="button" className="vs-row vs-row-sub" onClick={() => { setSheet(null); navigate('/groups/' + x.id) }}>
              <span aria-hidden="true">{'\u21B3'}</span> {x.name}
              <small>Sidechat</small>
            </button>
          ))}
          {canManage && <Link className="btn btn-outline btn-full" to={'/orgs/' + id + '/dashboard'}>Start a sidechat in the general Campfire</Link>}
        </>
      case 'events':
        return <>{title}
          <CalendarEventList events={events} emptyText={'No upcoming events from this ' + KIND + ' yet.'} />
          {canManage && <Link className="btn btn-outline btn-full" to="/calendar/new">Post an event</Link>}
          {!org.hide_from_public && <CalendarSubscribe orgId={id} orgName={org.name} />}
        </>
      case 'needs':
        return <>{title}
          {posts === null && <p role="status">Loading...</p>}
          {postsError && <p className="vs-note" role="alert">{postsError}</p>}
          {posts && posts.length === 0 && !postsError && <p>No open needs or offers right now.</p>}
          {posts && posts.map((p) => (
            <button key={p.kind + p.id} type="button" className="vs-row" onClick={() => { setSheet(null); navigate('/skillshare') }}>
              <span aria-hidden="true"><Icon name={p.kind === 'need' ? 'heart-hands' : 'gift'} /></span> {p.title || (p.kind === 'need' ? 'A need' : 'An offer')}
              <small>{p.kind === 'need' ? 'Need' : 'Offer'}{p.description ? ': ' + p.description.slice(0, 90) : ''}</small>
            </button>
          ))}
          <div className="vs-help">
            <button type="button" className="vs-big vs-ask" onClick={() => navigate('/ask')}>Ask for help</button>
            <button type="button" className="vs-big vs-offer" onClick={() => navigate('/post-offer')}>I can help</button>
          </div>
        </>
      case 'ready':
        return <>{title}<GroupResponse orgId={id} orgName={org.name} isKeeper={canManage} villageCount={villageCount} onChanged={loadOrg} /></>
      case 'share':
        return <>{title}
          {resources.length === 0 && <p>{isGroup ? 'No supplies listed yet. Keepers and Helpers can add the supplies your group keeps ready, like tarps or water, as resources.' : 'Nothing shared yet.'}</p>}
          {resources.map((r) => (
            <div key={r.id} className="vs-item">
              <b>{r.name}</b>
              {r.description && <small>{r.description}</small>}
              <small>{resourceCats(r).join(' · ')}</small>
              {(r.phone || r.url) && (
                <span className="hub-resource-links">
                  {r.phone && <a href={'tel:' + r.phone.replace(/[^0-9+]/g, '')}>Call {r.phone}</a>}
                  {r.url && <a href={safeLink(r.url)} target="_blank" rel="noopener noreferrer">Website</a>}
                </span>
              )}
            </div>
          ))}
        </>
      case 'members':
        return <>{title}
          <OrgMemberNames orgId={id} words={W} />
          <p className="vs-note">{canManage ? 'You can see and add members in ' + TOOLS + '.' : 'If no names show, the ' + W.head + ' keeps the list private.'}</p>
          {canManage && <Link className="btn btn-outline btn-full" to={'/orgs/' + id + '/dashboard'}>Open {TOOLS}</Link>}
          {isGroup && isMember && <GroupGear orgId={id} orgName={org.name} isKeeper={canManage} />}
        </>
      case 'involved': {
        const website = safeLink(org.website_url)
        const social = safeLink(org.social_links?.primary)
        return <>{title}
          {isMember ? <p>You are part of {org.name} as {roleName(mine.role).toLowerCase()}.</p> : askButton()}
          {contactEmail && org.show_contact_email && <a className="btn btn-outline btn-full" href={'mailto:' + contactEmail}>Email {org.name}</a>}
          {website && <a className="btn btn-outline btn-full" href={website} target="_blank" rel="noopener noreferrer">Visit their website</a>}
          {social && <a className="btn btn-outline btn-full" href={social} target="_blank" rel="noopener noreferrer">Follow them online</a>}
          {isMember && <QrShare url={window.location.origin + '/orgs/' + id} title={org.name} hint={'Your friend scans this to open this ' + KIND + "'s page, see what's coming up, and get in touch."} />}
        </>
      }
      default: return title
    }
  }

  // ----- Organizer settings (same as before) -----
  async function saveZip(e, raw = zip) {
    e.preventDefault()
    const clean = String(raw || '').replace(/[^0-9]/g, '')
    if (clean && clean.length !== 5) { setZipNote('Enter a 5-digit zip code.'); return }
    setSavingZip(true); setZipNote('')
    const { data, error } = await supabase.rpc('set_org_home_zip', { p_org: id, p_zip: clean || null })
    setSavingZip(false)
    if (error) { console.error('Failed to set home zip:', error); setZipNote("We couldn't save that. Try again."); return }
    if (data === 'not_found') { setZipNote("We couldn't find that zip code. Check it and try again."); return }
    setZip('')
    setZipNote(data === 'cleared' ? 'Home area removed.' : 'Saved. Neighbors nearby will see your ' + KIND + '.')
    await loadOrg()
  }

  async function togglePrivacy() {
    const next = !org.hide_from_public
    setSavingPrivacy(true); setPrivacyNote('')
    const { error } = await supabase.rpc('set_org_hide_from_public', { p_org: id, p_hide: next })
    setSavingPrivacy(false)
    if (error) { console.error('Failed to change group privacy:', error); setPrivacyNote("We couldn't save that. Try again."); return }
    setPrivacyNote(next ? 'Saved. Your ' + KIND + ' is now hidden from the public.' : 'Saved. Your ' + KIND + ' can now be seen by anyone.')
    await loadOrg()
  }

  async function toggleContactEmail() {
    const next = !org.show_contact_email
    setSavingEmail(true); setEmailNote('')
    const { error } = await supabase.rpc('set_org_show_contact_email', { p_org: id, p_show: next })
    setSavingEmail(false)
    if (error) { console.error('Failed to change contact email setting:', error); setEmailNote("We couldn't save that. Try again."); return }
    setEmailNote(next ? 'Saved. Your contact email now shows on this page.' : 'Saved. Your contact email is hidden.')
    await loadOrg()
  }

  if (loading) return <div className="vs-page"><p className="vs-loading" role="status">Loading...</p></div>
  if (missing || !org) {
    return <div className="vs-page">
      <div className="vs-top"><Link className="vs-crumb" to="/villages?tab=orgs">Village Network</Link></div>
      <p className="vs-error" role="alert">We couldn't find this organization. It may not be on VWB anymore.</p>
    </div>
  }


  return (
    <div className="vs-page vs-page-path">
      <nav className="vs-top" aria-label="Where you are">
        <Link className="vs-crumb" to="/villages?tab=orgs">Village Network</Link>
        <span className="vs-sep" aria-hidden="true">&#8250;</span>
        <span className="vs-here" aria-current="page">{org.name}</span>
      </nav>

      <div className="vs-title">
        <h1 className="org-title"><span className="org-sign" aria-hidden="true"><Icon name={sign} size={40} /></span>{org.name}</h1>
        <div className="vs-chips">
          {isMember ? <span className="vs-chip vs-chip-in">{roleName(mine.role)}</span> : <span className="vs-chip">Public view</span>}
          {isGroup ? <span className="vs-chip"><Icon name="tent" /> Emergency response group</span> : <span className="vs-chip"><Icon name="people" /> Organization</span>}
          {isGroup && org.response_status === 'approved' && <span className="vs-chip vs-chip-in"><Icon name="check" /> Approved to respond</span>}
          {place && <span className="vs-chip">Near {place}</span>}
          {org.hide_from_public && <span className="vs-chip">Seen only by VWB members</span>}
        </div>
        {org.description && <p className="vs-note" style={{ marginTop: 10 }}>{org.description}</p>}
      </div>

      {user && !arrange && (
        <button type="button" className="vs-build-start" onClick={() => startArrange('me')}>
          <span className="vs-build-start-ic" aria-hidden="true"><ToolIcon name="move" /></span>
          <span className="vs-build-start-text">
            <b>Arrange my view of {org.name}</b>
            <small>Only you see your view. Move places, add trees, draw roads.</small>
          </span>
        </button>
      )}
      {user && !arrange && canManage && (
        <button type="button" className="vs-build-start vs-build-shared" onClick={() => startArrange('everyone')}>
          <span className="vs-build-start-ic" aria-hidden="true"><ToolIcon name="move" /></span>
          <span className="vs-build-start-text">
            <b>Arrange {org.name} for everyone</b>
            <small>As one of its {W.leadsLower}, you set the look everyone starts with.</small>
          </span>
        </button>
      )}

      <div {...sceneProps(b, 'vs-scene vs-scene-path')}>
        <img className="vs-ground" src={backgroundSrc(b.world.bg)} alt="" width="720" height="1080" fetchpriority="high" />
        <MapLayers b={b} />
        {spots.filter((s0) => arrange || !isHidden(s0.k)).map((s0) => {
          const s = placed(s0)
          const i = info(s.k)
          const lock = locked(s)
          return (
            <button key={s.k} type="button" data-spot={s.k}
              className={'vs-el' + (s.soon || lock ? ' vs-soon' : '') + (s.k === 'fires' && !lock ? ' vs-flame' : '') + (bump === s.k ? ' vs-bump' : '') + (arrange && picked === s.k ? ' vs-picked' : '') + (arrange && isHidden(s.k) ? ' vs-hidden' : '')}
              style={{ left: s.x + '%', top: s.y + '%', '--s': s.s || 1 }}
              aria-label={s.label + '. ' + i.sub}
              onPointerDown={(e) => dragStart(e, s.k)}
              onClick={(e) => { if (!arrange) tap(s); else if (e.detail === 0) pickByKey(s.k) }}>
              <span className={'vs-em' + (s.flip ? ' vs-flip' : '')} aria-hidden="true"><SpotIcon spot={s} painted />{lock && <span className="vs-lock"><Icon name="lock" /></span>}</span>
              <span className="vs-lab">{s.short}</span>
            </button>
          )
        })}
        {user && <NamesToggle b={b} onChange={saveLabels} />}
        <div className="vs-fade" />
      </div>

      <p className="vs-hint">{arrange ? (arrangeFor === 'everyone' ? 'You are arranging ' + org.name + ' for everyone. Changes are saved as you go.' : 'You are arranging your own view. Only you see it. Changes are saved as you go.') : 'Tap anything to go there.'}</p>

      <MapToolbar b={b} more={<>
        <button type="button" className="btn btn-outline btn-full" onClick={resetLayout}>{arrangeFor === 'everyone' ? 'Back to the usual map for everyone' : 'Back to the shared look'}</button>
        <p className="vs-note">{arrangeFor === 'everyone' ? 'Everyone sees this look, unless they arranged their own view.' : 'Your view is saved on your account and only you see it.'} Hidden places are still in the list under the map.</p>
      </>} />

      {isNew && isGroup && canManage && (
        <section className="vs-body gs-new" aria-labelledby="gs-new-h">
          <h2 id="gs-new-h">Your group is started</h2>
          <p className="vs-note">Four steps to get ready. You can do them in any order.</p>
          <ol className="gs-steps">
            <li><button type="button" className="vs-row" onClick={() => openSheet({ k: 'where' })}><span aria-hidden="true"><Icon name="houses" /></span> Pick the villages you cover<small>{villageCount ? 'Covers ' + villageCount + ' so far' : 'None yet'}</small></button></li>
            <li><Link className="vs-row" to={'/orgs/' + id + '/dashboard'}><span aria-hidden="true"><Icon name="toolbox" /></span> Add your crew<small>Search for people you know in Keeper tools</small></Link></li>
            <li><button type="button" className="vs-row" onClick={() => openSheet({ k: 'members' })}><span aria-hidden="true"><Icon name="card" /></span> List what you bring<small>Skills and gear, like a chainsaw or first aid</small></button></li>
            <li><button type="button" className="vs-row" onClick={() => openSheet({ k: 'ready' })}><span aria-hidden="true"><Icon name="siren" /></span> Ask to be approved to respond<small>So your group is called when an emergency is verified nearby</small></button></li>
          </ol>
        </section>
      )}

      <div className="vs-body">
        {!isMember && <div className="vs-help-one">{askButton()}</div>}
        {isMember && general && <button type="button" className="btn btn-primary btn-full vs-big" onClick={() => navigate('/groups/' + general.id)}><Icon name="campfire" /> Open the general chat</button>}
        <h2 className="vs-pick-h">Or pick from the list</h2>
        <div className="vs-list">
          {spots.map((s) => {
            const i = info(s.k)
            const lock = locked(s)
            return (
              <button key={s.k} type="button" className={'vs-room' + (s.soon || lock ? ' vs-soon' : '')} onClick={() => tap(s)}>
                <span className="vs-room-ic" aria-hidden="true"><SpotIcon spot={s} size={40} /></span>
                <span className="vs-room-text"><b>{s.label}{lock && <span aria-hidden="true"> <Icon name="lock" /></span>}</b><small>{i.sub}</small></span>
                <span className="vs-go" aria-hidden="true">&#8250;</span>
              </button>
            )
          })}
        </div>

        {canManage && <>
          <OrgSceneEditor org={org} spots={SPOTS.filter((s) => !s.organizers)} isGroup={isGroup} onSaved={loadOrg} />
          <h2>{W.settings}</h2>
          <section className="cal-box" aria-labelledby="org-home">
            <h3 id="org-home">Home area</h3>
            <p className="cal-sub" style={{ marginBottom: '0.75rem' }}>
              {org.home_zip
                ? 'Your ' + KIND + ' shows up for neighbors near ' + (place || org.home_zip) + '. Only the zip code is saved, never an address.'
                : 'Add the zip code where your ' + KIND + ' serves, so neighbors can find you even before you post. Only the zip code is saved, never an address.'}
            </p>
            <form className="hub-search" onSubmit={(e) => saveZip(e)} noValidate>
              <label htmlFor="org-zip" className="sr-only">Home zip code</label>
              <input id="org-zip" type="text" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]*" maxLength={5} placeholder={org.home_zip || '12345'} value={zip} onChange={(e) => { setZip(e.target.value.replace(/[^0-9]/g, '')); setZipNote('') }} aria-describedby={zipNote ? 'org-zip-note' : undefined} />
              <button type="submit" className="btn btn-primary" disabled={savingZip || !zip}>{savingZip ? 'Saving...' : 'Save'}</button>
            </form>
            {org.home_zip && (
              <button type="button" className="hub-link-btn" onClick={() => { setZip(''); saveZip({ preventDefault() {} }, '') }} disabled={savingZip}>Remove home area</button>
            )}
            {zipNote && <p id="org-zip-note" className="hub-note" role="status">{zipNote}</p>}
          </section>

          <section className="cal-box" aria-labelledby="org-privacy">
            <h3 id="org-privacy">Who can see your {KIND}</h3>
            <p className="cal-sub" style={{ marginBottom: '0.75rem' }}>
              {org.hide_from_public
                ? 'Only people with a VWB account can see your ' + KIND + ', its resources and its events. Nothing shows to the public or on the website.'
                : 'Your ' + KIND + ', its resources and its public events can be seen by anyone, including on the website.'}
            </p>
            <button type="button" className="btn btn-outline btn-full" onClick={togglePrivacy} disabled={savingPrivacy} style={{ minHeight: '44px' }}>
              {savingPrivacy ? 'Saving...' : org.hide_from_public ? 'Show my ' + KIND + ' to the public' : 'Only show my ' + KIND + ' to people with an account'}
            </button>
            {privacyNote && <p className="hub-note" role="status">{privacyNote}</p>}
          </section>

          {contactEmail && (
            <section className="cal-box" aria-labelledby="org-email">
              <h3 id="org-email">Your contact email</h3>
              <p className="cal-sub" style={{ marginBottom: '0.75rem' }}>
                {org.show_contact_email
                  ? 'Your email button shows on this page for anyone who can see your ' + KIND + '.'
                  : 'Your email is private. Nobody can see it, not even VWB admins. You can choose to show an Email button.'}
              </p>
              <button type="button" className="btn btn-outline btn-full" onClick={toggleContactEmail} disabled={savingEmail} style={{ minHeight: '44px' }}>
                {savingEmail ? 'Saving...' : org.show_contact_email ? 'Hide my email' : 'Show an Email button'}
              </button>
              {emailNote && <p className="hub-note" role="status">{emailNote}</p>}
            </section>
          )}
        </>}
      </div>

      {sheet && (
        <div className="vs-shade" onClick={(e) => { if (e.target === e.currentTarget) closeSheet() }}>
          <div className="vs-sheet" role="dialog" aria-modal="true" aria-labelledby="op-sheet-title" ref={sheetRef}>
            {sheetBody(sheet.k)}
            <button type="button" className="btn btn-outline btn-full" onClick={closeSheet}>Back to {org.name}</button>
          </div>
        </div>
      )}
    </div>
  )
}
