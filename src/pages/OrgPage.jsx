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
import GroupDecisions from '../components/GroupDecisions'
import CareCircle from '../components/CareCircle'
import OrgMemberNames from '../components/OrgMemberNames'
import { ORG_SPOTS, GROUP_SPOTS, backgroundSrc, DEFAULT_WORLDS } from '../data/worldElements'
import { usePageMap, MapLayers, MapToolbar, ToolIcon, sceneProps, zoomLayer, askGoTo, ScrollCue, placeLayer } from '../components/MapBuilder'
import OrgSceneEditor from '../components/OrgSceneEditor'
import GroupGear from '../components/GroupGear'
import GroupResponse from '../components/GroupResponse'
import GroupHome from '../components/GroupHome'
import '../village-scene.css'
import Icon from '../components/Icon'
import { orgWords } from '../utils/roleWords'
import { askConfirm } from '../components/AdminDialog'
import { useSimpleView } from '../utils/simpleView'
import { calmMotion } from '../utils/motion'
import { useT } from '../utils/lang'

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
  return !!(calmMotion())
}

export default function OrgPage() {
  const t = useT()
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const isNew = params.get('new') === '1'
  const { user, profile, refreshProfile, organizations } = useAuth()
  const simple = useSimpleView()

  const [org, setOrg] = useState(null)
  // Oct 28: the Edit button's menu on the map.
  const [editMenu, setEditMenu] = useState(false)
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
  const [needNote, setNeedNote] = useState('')
  const [asked, setAsked] = useState(false)
  const [askNote, setAskNote] = useState('')
  const [asking, setAsking] = useState(false)
  const [memberCount, setMemberCount] = useState(null)

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
  const [savingInvisible, setSavingInvisible] = useState(false)
  const [invisibleNote, setInvisibleNote] = useState('')
  const [savingJoin, setSavingJoin] = useState(false)
  const [joinNote, setJoinNote] = useState('')

  const mine = (organizations || []).find((o) => o.id === id)
  const isMember = !!mine
  const canManage = !!mine && (mine.role === 'admin' || mine.role === 'organizer')
  const isHead = !!mine && mine.role === 'admin'

  async function loadOrg() {
    const cols = 'id, name, description, website_url, social_links, home_zip, approved, hide_from_public, show_contact_email, is_umbrella, affiliate_label, kind, response_status, head_title, organizer_title, invisible, join_open, is_vwb_home'
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

  // Round E (Nov 10): members see What's needed on the group home, so needs load right away.
  useEffect(() => {
    if (isMember && org && posts === null) loadPosts()
  }, [isMember, org?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Round E: how many people are in it. A number only, never names (vwb-group-kinds.sql).
  useEffect(() => {
    let alive = true
    setMemberCount(null)
    supabase.rpc('org_member_count', { p_org: id }).then(({ data, error }) => {
      if (!alive) return
      if (error) { if (error.code !== 'PGRST202') console.error('Failed to load member count:', error); return }
      setMemberCount(typeof data === 'number' ? data : null)
    })
    return () => { alive = false }
  }, [id])

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
      if (error) { console.error('Failed to load needs and offers:', error); setPostsError(t("We couldn't load needs and offers. Try again.")); setPosts([]); return }
      setPosts((data || []).filter((p) => p.status === 'open'))
      return
    }
    // Nov 7 (Jade): everyone signed in sees what the group needs. Only the kind
    // of help, unless the group chose to show the details. Never who or where.
    const pub = await supabase.rpc('group_open_needs', { p_org: id })
    if (pub.error) console.error('Failed to load open needs:', pub.error)
    const pubRows = (pub.data || []).map((x) => ({ kind: x.kind, id: x.id, title: x.title, description: x.description, created_at: x.created_at, full: x.full_up, open: true }))
    if (!isMember) {
      if (pub.error) setPostsError(t("We couldn't load needs and offers. Try again."))
      setPosts(pubRows)
      return
    }
    const [r, o] = await Promise.all([
      supabase.from('help_requests').select('id, skill_needed, description, status, created_at').eq('organization_id', id).eq('status', 'open').order('created_at', { ascending: false }).limit(30),
      supabase.from('offers').select('id, title, description, is_available, created_at').eq('organization_id', id).eq('is_available', true).order('created_at', { ascending: false }).limit(30),
    ])
    if (r.error) console.error('Failed to load needs:', r.error)
    if (o.error) console.error('Failed to load offers:', o.error)
    if (r.error && o.error) setPostsError(t("We couldn't load needs and offers. Try again."))
    const seen = new Set()
    setPosts([
      ...(r.data || []).map((x) => ({ kind: 'need', id: x.id, title: x.skill_needed, description: x.description, created_at: x.created_at })),
      ...(o.data || []).map((x) => ({ kind: 'offer', id: x.id, title: x.title, description: x.description, created_at: x.created_at })),
      ...pubRows,
    ].filter((p) => { const k = p.kind + p.id; if (seen.has(k)) return false; seen.add(k); return true })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
  }

  // Offer to help on a need from the group page (works for people who aren't members).
  async function offerOnNeed(p) {
    if (!(await askConfirm(t('Offer to help with {skill}?', { skill: t(p.title) }) + '\n\n' + t('The person is told right away. You can take your offer back until they say yes.')))) return
    setNeedNote('')
    const { data, error } = await supabase.rpc('offer_help_on_group_need', { p_request: p.id })
    if (error) { console.error('Failed to offer help:', error); setNeedNote(t('Something went wrong. Try again.')); return }
    const msg = {
      sent: 'Your offer has been sent! You can see it, or take it back, in Your tasks.',
      already: 'You already offered to help with this request.',
      full: 'This request has enough helpers. Thank you for wanting to help!',
      mine: 'This is your own request.',
      gone: 'This need is not open anymore.',
    }[data] || 'Something went wrong. Try again.'
    setNeedNote(t(msg))
    if (data === 'sent' || data === 'full' || data === 'gone') loadPosts()
  }

  async function askToJoin() {
    if (asking) return
    setAsking(true); setAskNote('')
    const { data, error } = await supabase.rpc('ask_to_join_org', { p_org: id })
    setAsking(false)
    if (error) { console.error('Failed to ask to join:', error); setAskNote(t("We couldn't send that. Check your connection and try again.")); return }
    const who = t(orgWords(org).leadsLower)
    if (data === 'asked' || data === 'wait') { setAsked(true); setAskNote(data === 'asked' ? t('Sent. The {who} will see your name and can add you.', { who }) : t('You already asked this week. The {who} have your name.', { who })); return }
    if (data === 'closed') { setAskNote(t('{name} is not taking asks to join right now. You can still reach them with the contact info on this page.', { name: org.name })); return }
    if (data === 'member') { setAskNote(org?.kind === 'group' ? t('You are already part of this crew.') : t('You are already part of this group.')); return }
    setAskNote(t("We couldn't send that right now. Try again later."))
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
  // Nov 7: alerts link to /orgs/:id?open=rules (a decision to talk over), so open that place.
  const openParam = params.get('open')
  const openedFromLink = useRef(false)
  useEffect(() => {
    if (openedFromLink.current || loading || !org || !isMember) return
    if (openParam === 'rules') { openedFromLink.current = true; setSheet({ k: 'rules' }) }
  }, [openParam, loading, org, isMember])
  function closeSheet() {
    setSheet(null)
    if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus()
  }

  // From Organizer tools: "Change how our page looks" opens the page at the editor.
  const [lookParams] = useSearchParams()
  const wantsLook = lookParams.get('look') === '1'
  useEffect(() => {
    if (!wantsLook || !org || !canManage) return
    const timer = setTimeout(() => { const el = document.getElementById('ose-h'); if (el) el.scrollIntoView({ block: 'start' }) }, 150)
    return () => clearTimeout(timer)
  }, [wantsLook, org, canManage])

  const isGroup = org?.kind === 'group'
  const SPOTS = isGroup ? GROUP_SPOTS : ORG_SPOTS
  const W = orgWords(org)
  const roleName = (r) => t(W.roleLabel[r] || 'Member')
  const LEADS = t(W.leads)
  const TOOLS = t(W.tools)
  const KIND = isGroup ? 'crew' : 'group'
  // Spanish: grupo and equipo are both masculine, so one sentence fits both.
  const kindT = t(KIND)

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
  // Round E: members already belong, so Get involved leaves their map (it stays in the list as Share this page).
  const mapSpots = isMember ? spots.filter((s) => s.k !== 'involved') : spots

  // Arrange and build (Oct 22, vwb-map-layouts.sql): the Heads and organizers (a
  // group's Keeper and Helpers) set the shared look; anyone signed in can arrange
  // their own view on top. Only they see it.
  // Oct 28 (Jade): no long press to start editing. The Edit button on the map does it.
  const { b, arrangeFor, startArrange, resetLayout, saveLabels, hasOwn } = usePageMap({
    kind: 'org', id, spots, user, accountLayout: profile?.village_layout, refreshProfile, name: org?.name,
    base: isGroup ? DEFAULT_WORLDS.group : DEFAULT_WORLDS.org,
    ownAllowed: isMember,
  })
  const { arrange, picked, placed, isHidden, dragStart, pickByKey } = b

  function info(k) {
    const n = (one, many, count) => t(count === 1 ? one : many, { n: count })
    switch (k) {
      case 'rules': return { sub: isMember ? t('How this {kind} runs and decides together', { kind: kindT }) : t('Members only') }
      case 'where': return { sub: villageCount ? (isGroup ? n('Covers 1 village', 'Covers {n} villages', villageCount) : n('Works in 1 village', 'Works in {n} villages', villageCount)) : t('No villages picked yet') }
      case 'ready': return { sub: org.response_status === 'approved' ? t('Approved to respond to emergencies') : org.response_status === 'asked' ? t('Waiting for approval') : t('Not called to emergencies yet') }
      case 'links': return { sub: links.length ? n('1 connected group', '{n} connected groups', links.length) : t('No connections yet') }
      case 'news': return { sub: !isMember ? t('Members only') : news ? t('News from {name}', { name: org.name }) : canManage ? t('Start Announcements for your members') : t('No announcements yet') }
      case 'fires': return { sub: !isMember ? t('Members only') : chats.length ? n('1 Campfire you are in', '{n} Campfires you are in', chats.length) : t('No Campfires yet') }
      case 'events': return { sub: events.length ? t('{n} coming up', { n: events.length }) : t('Nothing on the calendar yet') }
      case 'needs': return { sub: t('What we need and what we offer') }
      case 'share': return { sub: resources.length ? n('1 shared resource', '{n} shared resources', resources.length) : t('Nothing shared yet') }
      case 'members': return { sub: !isMember ? t('Members only') : isGroup ? t('Who is in, and what we bring') : t('Who is part of this group') }
      case 'involved': return { sub: isMember ? t('Share this page with a friend') : asked ? t('You asked to join') : t('Ask to join or reach the {who}', { who: t(W.leadsLower) }) }
      case 'tools': return { sub: t('Members, connections, events') }
      default: return { sub: '' }
    }
  }

  // fromMap: tapped on the map picture, so leaving the page asks first (Oct 22).
  async function tap(s, fromMap) {
    if (!stillMotion()) { setBump(s.k); setTimeout(() => setBump(null), 450) }
    const go = async (to) => { if (fromMap && !(await askGoTo(s))) return; navigate(to) }
    if (s.k === 'tools') { go('/orgs/' + id + '/dashboard'); return }
    if (s.k === 'news' && isMember && news) { go('/groups/' + news.id); return }
    if (s.k === 'fires' && isMember && chats.length === 1) { go('/groups/' + chats[0].id); return }
    if (s.k === 'needs' && posts === null) loadPosts()
    openSheet({ k: s.k })
  }

  async function startNews() {
    setNewsBusy(true); setNewsNote('')
    const { data: gid, error } = await supabase.rpc('start_org_announcements', { p_org: id })
    setNewsBusy(false)
    if (error || !gid) { console.error('Failed to start Announcements:', error); setNewsNote(t("We couldn't start Announcements. Try again.")); return }
    setSheet(null)
    navigate('/groups/' + gid, { state: { justStarted: true } })
  }

  const joinOpen = org?.join_open !== false
  function askButton() {
    if (!joinOpen) return <p className="vs-note">{t('{name} is not taking asks to join right now.', { name: org.name })}{contactEmail && org.show_contact_email ? ' ' + t('You can email them instead.') : ''}</p>
    return <>
      <button type="button" className="btn btn-primary btn-full" onClick={askToJoin} disabled={asking || asked}>
        {asking ? t('Sending...') : asked ? t('You asked to join') : t('Ask to join {name}', { name: org.name })}
      </button>
      {askNote && <p className="vs-note" role="status">{askNote}</p>}
    </>
  }

  function sheetBody(k) {
    if (k === 'decide') {
      return <><h2 id="op-sheet-title"><span aria-hidden="true" className="vs-sheet-ic"><Icon name="scroll" size={36} /></span> {t('Decide something')}</h2>
        <GroupDecisions orgId={id} startOpen /></>
    }
    const spot = SPOTS.find((s) => s.k === k)
    const title = <h2 id="op-sheet-title"><span aria-hidden="true" className="vs-sheet-ic"><SpotIcon spot={spot} size={36} /></span> {t(spot.label)}</h2>
    if (locked(spot)) {
      return <>{title}
        <p><span aria-hidden="true"><Icon name="lock" /> </span>{t('Only members of {name} can open this.', { name: org.name })}</p>
        {askButton()}
      </>
    }
    if (spot.soon) return <>{title}<p>{t('This part of the {kind} is coming soon.', { kind: kindT })}</p></>
    switch (k) {
      case 'rules':
        return <>{title}<OrgRules orgId={id} isHead={isHead} org={org} onTitles={loadOrg} />{isMember && <GroupDecisions orgId={id} />}{isMember && <CareCircle orgId={id} />}</>
      case 'where':
        return <>{title}<OrgVillages orgId={id} orgName={org.name} canManage={canManage} /></>
      case 'links':
        return <>{title}
          {links.length === 0 && <p>{t('{name} is not connected with a group or crew yet.', { name: org.name })}</p>}
          {links.map((o) => (
            <button key={o.id} type="button" className="vs-row" onClick={() => { setSheet(null); navigate('/orgs/' + o.id) }}>
              <span aria-hidden="true"><Icon name="people" /></span> {o.name}<small>{t('Connected group')}</small>
            </button>
          ))}
          <p className="vs-note">{t('The leaders of connected groups and crews share a Campfire.')} <Icon name="campfire" /></p>
          {canManage && <Link className="btn btn-outline btn-full" to={'/orgs/' + id + '/dashboard'}>{t('Connect with a group or crew')}</Link>}
        </>
      case 'news':
        return <>{title}
          {canManage
            ? <>
                <p>{t('Announcements is a board for news to everyone in {name}. {leads} post. Members read it and get an alert.', { name: org.name, leads: LEADS })}</p>
                <button type="button" className="btn btn-primary btn-full" disabled={newsBusy} onClick={startNews}>{newsBusy ? t('Starting...') : t('Start Announcements')}</button>
                {newsNote && <p className="vs-note" role="alert">{newsNote}</p>}
              </>
            : <p>{t('No announcements yet. {leads} can start them.', { leads: LEADS })}</p>}
        </>
      case 'fires':
        return <>{title}
          {chats.length === 0 && <p>{canManage ? t('No Campfires yet. Start the general chat from {tools}.', { tools: TOOLS }) : t('No Campfires yet. {leads} start the general chat.', { leads: LEADS })}</p>}
          {/* Smaller Campfires (sidechats in the database) live inside the general Campfire: listed under it, not as chats of their own. */}
          {chats.filter((c) => c.is_general || c.shared).map((c) => (
            <div key={c.id}>
              <button type="button" className="vs-row" onClick={() => { setSheet(null); navigate('/groups/' + c.id) }}>
                <span aria-hidden="true"><Icon name="campfire" /></span> {c.name}
                <small>{c.is_general ? t('General chat, every member') : isGroup ? t('Shared Campfire with a connected group or crew') : t('Shared Campfire with a connected group')}</small>
              </button>
              {c.is_general && chats.filter((x) => !x.is_general && !x.shared).map((x) => (
                <button key={x.id} type="button" className="vs-row vs-row-sub" onClick={() => { setSheet(null); navigate('/groups/' + x.id) }}>
                  <span aria-hidden="true">{'\u21B3'}</span> {x.name}
                  <small>{t('Smaller Campfire inside {name}', { name: c.name })}</small>
                </button>
              ))}
            </div>
          ))}
          {!general && chats.filter((x) => !x.is_general && !x.shared).map((x) => (
            <button key={x.id} type="button" className="vs-row vs-row-sub" onClick={() => { setSheet(null); navigate('/groups/' + x.id) }}>
              <span aria-hidden="true">{'\u21B3'}</span> {x.name}
              <small>{t('Smaller Campfire')}</small>
            </button>
          ))}
          {canManage && <Link className="btn btn-outline btn-full" to={'/orgs/' + id + '/dashboard'}>{t('Start a smaller Campfire')}</Link>}
        </>
      case 'events':
        return <>{title}
          <CalendarEventList events={events} emptyText={t('No upcoming events from this {kind} yet.', { kind: kindT })} />
          {canManage && <Link className="btn btn-outline btn-full" to="/calendar/new">{t('Post an event')}</Link>}
          {!org.hide_from_public && !org.invisible && <CalendarSubscribe orgId={id} orgName={org.name} />}
        </>
      case 'needs':
        return <>{title}
          {posts === null && <p role="status">{t('Loading...')}</p>}
          {postsError && <p className="vs-note" role="alert">{postsError}</p>}
          {posts && posts.length === 0 && !postsError && <p>{t('No open needs or offers right now.')}</p>}
          {needNote && <p className="vs-note" role="status">{needNote}</p>}
          {posts && posts.map((p) => (
            <button key={p.kind + p.id} type="button" className="vs-row" disabled={p.full}
              onClick={() => { if (p.kind === 'need' && p.open && !canManage) { offerOnNeed(p); return } setSheet(null); navigate(p.kind === 'offer' ? '/skillshare?tab=offers' : '/skillshare') }}>
              <span aria-hidden="true"><Icon name={p.kind === 'need' ? 'heart-hands' : 'gift'} /></span> {p.title ? t(p.title) : (p.kind === 'need' ? t('A need') : t('An offer'))}
              <small>{p.kind === 'need' ? t('Need') : t('Offer')}{p.description ? ': ' + p.description.slice(0, 90) : ''}{p.full ? ' (' + t('has enough helpers') + ')' : (p.kind === 'need' && p.open && !canManage ? ' \u00b7 ' + t('Tap to offer help') : '')}</small>
            </button>
          ))}
          <div className="vs-help">
            <button type="button" className="vs-big vs-find" onClick={() => navigate('/ask')}>{t('Ask for Help')}</button>
            <button type="button" className="vs-big vs-offer" onClick={() => navigate('/post-offer')}>{t('Offer Help')}</button>
          </div>
        </>
      case 'ready':
        return <>{title}<GroupResponse orgId={id} orgName={org.name} isKeeper={canManage} villageCount={villageCount} onChanged={loadOrg} /></>
      case 'share':
        return <>{title}
          {resources.length === 0 && <p>{isGroup ? t('No supplies listed yet. Keepers and Helpers can add the supplies your crew keeps ready, like tarps or water, as resources.') : t('Nothing shared yet.')}</p>}
          {resources.map((r) => (
            <div key={r.id} className="vs-item">
              <b>{r.name}</b>
              {r.description && <small>{r.description}</small>}
              <small>{resourceCats(r).map((c) => t(c)).join(' · ')}</small>
              {(r.phone || r.url) && (
                <span className="hub-resource-links">
                  {r.phone && <a href={'tel:' + r.phone.replace(/[^0-9+]/g, '')}>{t('Call {phone}', { phone: r.phone })}</a>}
                  {r.url && <a href={safeLink(r.url)} target="_blank" rel="noopener noreferrer">{t('Website')}</a>}
                </span>
              )}
            </div>
          ))}
        </>
      case 'members':
        return <>{title}
          <OrgMemberNames orgId={id} words={W} />
          <p className="vs-note">{canManage ? t('You can see and add members in {tools}.', { tools: TOOLS }) : t('If no names show, the {head} keeps the list private.', { head: t(W.head) })}</p>
          {canManage && <Link className="btn btn-outline btn-full" to={'/orgs/' + id + '/dashboard'}>{t('Open {tools}', { tools: TOOLS })}</Link>}
          {isGroup && isMember && <GroupGear orgId={id} orgName={org.name} isKeeper={canManage} />}
        </>
      case 'involved': {
        const website = safeLink(org.website_url)
        const social = safeLink(org.social_links?.primary)
        return <>{title}
          {isMember ? <p>{t('You are part of {name} as {role}.', { name: org.name, role: roleName(mine.role).toLowerCase() })}</p> : askButton()}
          {contactEmail && org.show_contact_email && <a className="btn btn-outline btn-full" href={'mailto:' + contactEmail}>{t('Email {name}', { name: org.name })}</a>}
          {website && <a className="btn btn-outline btn-full" href={website} target="_blank" rel="noopener noreferrer">{t('Visit their website')}</a>}
          {social && <a className="btn btn-outline btn-full" href={social} target="_blank" rel="noopener noreferrer">{t('Follow them online')}</a>}
          {isMember && <QrShare url={window.location.origin + '/orgs/' + id} title={org.name} hint={t("Your friend scans this to open this {kind}'s page, see what's coming up, and get in touch.", { kind: kindT })} />}
        </>
      }
      default: return title
    }
  }

  // ----- Organizer settings (same as before) -----
  async function saveZip(e, raw = zip) {
    e.preventDefault()
    const clean = String(raw || '').replace(/[^0-9]/g, '')
    if (clean && clean.length !== 5) { setZipNote(t('Enter a 5-digit zip code.')); return }
    setSavingZip(true); setZipNote('')
    const { data, error } = await supabase.rpc('set_org_home_zip', { p_org: id, p_zip: clean || null })
    setSavingZip(false)
    if (error) { console.error('Failed to set home zip:', error); setZipNote(t("We couldn't save that. Try again.")); return }
    if (data === 'not_found') { setZipNote(t("We couldn't find that zip code. Check it and try again.")); return }
    setZip('')
    setZipNote(data === 'cleared' ? t('Home area removed.') : t('Saved. Neighbors nearby will see your {kind}.', { kind: kindT }))
    await loadOrg()
  }

  async function togglePrivacy() {
    const next = !org.hide_from_public
    setSavingPrivacy(true); setPrivacyNote('')
    const { error } = await supabase.rpc('set_org_hide_from_public', { p_org: id, p_hide: next })
    setSavingPrivacy(false)
    if (error) { console.error('Failed to change group privacy:', error); setPrivacyNote(t("We couldn't save that. Try again.")); return }
    setPrivacyNote(next ? t('Saved. Your {kind} is now hidden from the public.', { kind: kindT }) : t('Saved. Your {kind} can now be seen by anyone.', { kind: kindT }))
    await loadOrg()
  }

  async function toggleContactEmail() {
    const next = !org.show_contact_email
    setSavingEmail(true); setEmailNote('')
    const { error } = await supabase.rpc('set_org_show_contact_email', { p_org: id, p_show: next })
    setSavingEmail(false)
    if (error) { console.error('Failed to change contact email setting:', error); setEmailNote(t("We couldn't save that. Try again.")); return }
    setEmailNote(next ? t('Saved. Your contact email now shows on this page.') : t('Saved. Your contact email is hidden.'))
    await loadOrg()
  }

  async function toggleInvisible() {
    const next = !org.invisible
    if (next && !(await askConfirm(t('Make {name} invisible? Only your members will see it, its events and its resources. It leaves every list, search, map and Find Help. New people can only join by an invite link.', { name: org.name }), { yes: t('Make it invisible'), no: t('Not now') }))) return
    setSavingInvisible(true); setInvisibleNote('')
    const { error } = await supabase.rpc('set_org_invisible', { p_org: id, p_on: next })
    setSavingInvisible(false)
    if (error) { console.error('Failed to change invisible setting:', error); setInvisibleNote(t("We couldn't save that. Try again.")); return }
    setInvisibleNote(next ? t('Saved. Only your members can see your {kind} now.', { kind: kindT }) : t('Saved. People can find your {kind} again.', { kind: kindT }))
    await loadOrg()
  }

  async function toggleJoinOpen() {
    const next = !joinOpen
    setSavingJoin(true); setJoinNote('')
    const { error } = await supabase.rpc('set_org_join_open', { p_org: id, p_on: next })
    setSavingJoin(false)
    if (error) { console.error('Failed to change ask to join setting:', error); setJoinNote(t("We couldn't save that. Try again.")); return }
    setJoinNote(next ? t('Saved. People can ask to join again.') : t('Saved. The Ask to join button is off. Invite links still work.'))
    await loadOrg()
  }

  // Simple view, people who are not members: the few places they need first.
  // Members get the group home (Round E) and one More fold instead.
  const simpleMain = isGroup ? ['involved'] : ['needs', 'involved']
  function roomRow(s) {
    const i = info(s.k)
    const lock = locked(s)
    return (
      <button key={s.k} type="button" className={'vs-room' + (s.soon || lock ? ' vs-soon' : '')} onClick={() => tap(s)}>
        <span className="vs-room-ic" aria-hidden="true"><SpotIcon spot={s} size={40} /></span>
        <span className="vs-room-text"><b>{t(s.label)}{lock && <span aria-hidden="true"> <Icon name="lock" /></span>}</b><small>{i.sub}</small></span>
        <span className="vs-go" aria-hidden="true">&#8250;</span>
      </button>
    )
  }

  if (loading) return <div className="vs-page"><p className="vs-loading" role="status">{t('Loading...')}</p></div>
  if (missing || !org) {
    return <div className="vs-page">
      <div className="vs-top"><Link className="vs-crumb" to="/world?tab=orgs">{t('World')}</Link></div>
      <p className="vs-error" role="alert">{t("We couldn't find this group. It may not be on VWB anymore.")}</p>
    </div>
  }


  return (
    <div className={'vs-page vs-page-path' + (isMember ? ' vs-page-member' : '')}>

      <div className="vs-title">
        <h1 className="org-title"><span className="org-sign" aria-hidden="true"><Icon name={sign} size={40} /></span>{org.name}</h1>
        <div className="vs-chips">
          {isMember ? <span className="vs-chip vs-chip-in">{roleName(mine.role)}</span> : <span className="vs-chip">{t('Public view')}</span>}
          {isGroup ? <span className="vs-chip"><Icon name="tent" /> {t('Emergency crew')}</span> : <span className="vs-chip"><Icon name="people" /> {t('Group')}</span>}
          {isGroup && org.response_status === 'approved' && <span className="vs-chip vs-chip-in"><Icon name="check" /> {t('Approved to respond')}</span>}
          {place && <span className="vs-chip">{t('Near {place}', { place })}</span>}
          {memberCount > 0 && <span className="vs-chip">{memberCount === 1 ? t('1 member') : t('{n} members', { n: memberCount })}</span>}
          {org.invisible
            ? <span className="vs-chip"><Icon name="lock" /> {t('Invisible: members only')}</span>
            : org.hide_from_public && <span className="vs-chip">{t('Seen only by VWB members')}</span>}
        </div>
        {org.description && <p className="vs-note" style={{ marginTop: 10 }}>{org.description}</p>}
      </div>

      {/* Round E (Nov 10): members land on four parts first: on a phone above the map,
          on a computer at the top of the right side. Everything else is under More about this group. */}
      {isMember && <div className="gh-wrap">
        {params.get('welcome') === '1' && <p className="gh-welcome" role="status">{t('Welcome to {name}! Here is what is going on.', { name: org.name })}</p>}
        <GroupHome org={org} events={events} posts={posts} chats={chats} news={news} canManage={canManage}
          hasNeedsSpot={spots.some((s) => s.k === 'needs')} onOpen={(k) => { if (k === 'needs' && posts === null) loadPosts(); openSheet({ k }) }} />
      </div>}

      {/* Public profile (Oct 25): people who are not members see how to reach the
          organization, what's coming up and what it shares first. Ask to join sits
          near the bottom of the page. */}
      {!isMember && <OrgPublicTop org={org} place={place} contactEmail={contactEmail} events={events} resources={resources} kind={KIND} onMore={(k) => openSheet({ k })} />}

      {/* Oct 28 (Jade): Customize folded into the Edit button on the map, like cottage and village maps. */}

      {!simple && <div {...sceneProps(b, 'vs-scene vs-scene-path')}>
       {/* Oct 28: the same picture, soft and blurred, fills any space around the map. */}
       <img className="vs-ground-blur" src={backgroundSrc(b.world.bg)} alt="" aria-hidden="true" draggable="false" />
       <div {...zoomLayer(b)}>
        <img className="vs-ground" src={backgroundSrc(b.world.bg)} alt="" width="720" height="1080" fetchpriority="high" />
        <MapLayers b={b} />
        {mapSpots.filter((s0) => arrange || !isHidden(s0.k)).map((s0) => {
          const s = placed(s0)
          const i = info(s.k)
          const lock = locked(s)
          return (
            <button key={s.k} type="button" data-spot={s.k}
              className={'vs-el' + (s.soon || lock ? ' vs-soon' : '') + (s.k === 'fires' && !lock ? ' vs-flame' : '') + (bump === s.k ? ' vs-bump' : '') + (arrange && picked === s.k ? ' vs-picked' : '') + (arrange && isHidden(s.k) ? ' vs-hidden' : '')}
              style={{ left: s.x + '%', top: s.y + '%', '--s': s.s || 1, zIndex: placeLayer(s.z) }}
              aria-label={t(s.label) + '. ' + i.sub}
              onPointerDown={(e) => dragStart(e, s.k)}
              onClick={(e) => { if (!arrange) tap(s, true); else if (e.detail === 0) pickByKey(s.k) }}>
              <span className={'vs-em' + (s.flip ? ' vs-flip' : '')} aria-hidden="true"><SpotIcon spot={s} painted />{lock && <span className="vs-lock"><Icon name="lock" /></span>}</span>
              <span className="vs-lab">{t(s.short)}</span>
            </button>
          )
        })}
       </div>
        {!arrange && user && (
          <div className="vs-edit-fab-wrap" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" className="vs-edit-fab" aria-haspopup="menu" aria-expanded={editMenu} onClick={() => setEditMenu((v) => !v)}>
              <ToolIcon name="move" /><span>{t('Edit map')}</span>
            </button>
            {editMenu && (
              <div className="vs-edit-menu" role="menu">
                {isMember && (
                  <button type="button" role="menuitem" onClick={() => { setEditMenu(false); startArrange('me') }}>
                    <b>{canManage ? t('My own view') : t('Arrange my view')}</b><small>{t('Only you see it. Move places, add trees, draw roads.')}</small>
                  </button>
                )}
                {canManage && (
                  <button type="button" role="menuitem" onClick={() => { setEditMenu(false); startArrange('everyone') }}>
                    <b>{t('Default for everyone')}</b><small>{t('Everyone starts with this.')}{hasOwn ? ' ' + t('You see your own view, so you will not see the new default.') : ''}</small>
                  </button>
                )}
                <button type="button" role="menuitem" onClick={() => { setEditMenu(false); saveLabels(b.namesShowing ? 'hide' : 'show') }}>
                  <b>{b.namesShowing ? t('Hide name tags') : t('Show name tags')}</b><small>{t('On every map, for you.')}</small>
                </button>
              </div>
            )}
          </div>
        )}
        <div className="vs-zoom-fab-wrap" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="vs-zoom-btn vs-zoom-one" aria-pressed={b.zoom.z > 1} onClick={() => (b.zoom.z > 1 ? b.zoomReset() : b.zoomBy(2))}>
            <ToolIcon name={b.zoom.z > 1 ? 'unmagnify' : 'magnify'} /><span>{b.zoom.z > 1 ? t('Whole map') : t('Zoom in')}</span>
          </button>
        </div>
        <div className="vs-fade" />
      </div>}
      {!simple && <ScrollCue b={b} />}

      <p className="vs-hint">{arrange ? (arrangeFor === 'everyone' ? t('You are setting the default look for {name}. Personal views stay as they are. Changes are saved as you go.', { name: org.name }) : t('You are arranging your own view. Only you see it. Changes are saved as you go.')) : t('Tap anything to go there.')}</p>

      <MapToolbar b={b} more={<>
        <button type="button" className="btn btn-outline btn-full" onClick={resetLayout}>{arrangeFor === 'everyone' ? t('Default back to the starting map') : t('Back to the default look')}</button>
        <p className="vs-note">{arrangeFor === 'everyone' ? t('This is the default look. Anyone who arranged their own view keeps theirs.') : t('Your view is saved on your account and only you see it.')} {t('Hidden places are still in the list under the map.')}</p>
      </>} />

      {isNew && isGroup && canManage && (
        <section className="vs-body gs-new" aria-labelledby="gs-new-h">
          <h2 id="gs-new-h">{t('Your crew is started')}</h2>
          <p className="vs-note">{t('Four steps to get ready. You can do them in any order.')}</p>
          <ol className="gs-steps">
            <li><button type="button" className="vs-row" onClick={() => openSheet({ k: 'where' })}><span aria-hidden="true"><Icon name="houses" /></span> {t('Pick the villages you cover')}<small>{villageCount ? t('Covers {n} so far', { n: villageCount }) : t('None yet')}</small></button></li>
            <li><Link className="vs-row" to={'/orgs/' + id + '/dashboard'}><span aria-hidden="true"><Icon name="toolbox" /></span> {t('Add your crew')}<small>{t('Search for people you know in Keeper tools')}</small></Link></li>
            <li><button type="button" className="vs-row" onClick={() => openSheet({ k: 'members' })}><span aria-hidden="true"><Icon name="card" /></span> {t('List what you bring')}<small>{t('Skills and gear, like a chainsaw or first aid')}</small></button></li>
            <li><button type="button" className="vs-row" onClick={() => openSheet({ k: 'ready' })}><span aria-hidden="true"><Icon name="siren" /></span> {t('Ask to be approved to respond')}<small>{t('So your crew is called when an emergency is verified nearby')}</small></button></li>
          </ol>
        </section>
      )}

      <div className="vs-body">
        {isMember && (
          <details className="op-more">
            <summary>{t('More about {name}', { name: org.name })}</summary>
            <div className="vs-list">{spots.map(roomRow)}</div>
          </details>
        )}
        {!isMember && <h2 className="vs-pick-h">{t('Or pick from the list')}</h2>}
        {/* Simple view (Oct 27): the main things first, the rest folded under More. */}
        {!isMember && simple && <div className="vs-list">{spots.filter((s) => simpleMain.includes(s.k)).sort((a, b) => simpleMain.indexOf(a.k) - simpleMain.indexOf(b.k)).map(roomRow)}</div>}
        {!isMember && simple && spots.some((s) => !simpleMain.includes(s.k)) && (
          <details className="op-simple-more">
            <summary>{t('More about {name}', { name: org.name })}</summary>
            <div className="vs-list">{spots.filter((s) => !simpleMain.includes(s.k)).map(roomRow)}</div>
          </details>
        )}
        {!isMember && !simple && <div className="vs-list">{spots.map(roomRow)}</div>}

        {!isMember && (
          <section className="op-join" aria-labelledby="op-join-h">
            <h2 id="op-join-h">{t('Want to be part of {name}?', { name: org.name })}</h2>
            {joinOpen && <p className="vs-note">{t('Ask to join, and the {who} will see your name. They decide who to add.', { who: t(W.leadsLower) })}</p>}
            <div className="vs-help-one">{askButton()}</div>
          </section>
        )}

        {canManage && <SimpleFold on={simple} label={t(W.settings)}>
          {!simple && <OrgSceneEditor org={org} spots={SPOTS.filter((s) => !s.organizers)} isGroup={isGroup} onSaved={loadOrg} />}
          {!simple && <h2>{t(W.settings)}</h2>}
          <section className="cal-box" aria-labelledby="org-home">
            <h3 id="org-home">{t('Home area')}</h3>
            <p className="cal-sub" style={{ marginBottom: '0.75rem' }}>
              {org.home_zip
                ? t('Your {kind} shows up for neighbors near {place}. Only the zip code is saved, never an address.', { kind: kindT, place: place || org.home_zip })
                : t('Add the zip code where your {kind} serves, so neighbors can find you even before you post. Only the zip code is saved, never an address.', { kind: kindT })}
            </p>
            <form className="hub-search" onSubmit={(e) => saveZip(e)} noValidate>
              <label htmlFor="org-zip" className="sr-only">{t('Home zip code')}</label>
              <input id="org-zip" type="text" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]*" maxLength={5} placeholder={org.home_zip || '12345'} value={zip} onChange={(e) => { setZip(e.target.value.replace(/[^0-9]/g, '')); setZipNote('') }} aria-describedby={zipNote ? 'org-zip-note' : undefined} />
              <button type="submit" className="btn btn-primary" disabled={savingZip || !zip}>{savingZip ? t('Saving...') : t('Save')}</button>
            </form>
            {org.home_zip && (
              <button type="button" className="hub-link-btn" onClick={() => { setZip(''); saveZip({ preventDefault() {} }, '') }} disabled={savingZip}>{t('Remove home area')}</button>
            )}
            {zipNote && <p id="org-zip-note" className="hub-note" role="status">{zipNote}</p>}
          </section>

          <section className="cal-box" aria-labelledby="org-privacy">
            <h3 id="org-privacy">{t('Who can see your {kind}', { kind: kindT })}</h3>
            <p className="cal-sub" style={{ marginBottom: '0.75rem' }}>
              {org.invisible ? t('Your {kind} is invisible right now, so only members see it. This choice comes back into play if you turn Invisible off.', { kind: kindT }) + ' ' : ''}
              {org.hide_from_public
                ? t('Only people with a VWB account can see your {kind}, its resources and its events. Nothing shows to the public or on the website.', { kind: kindT })
                : t('Your {kind}, its resources and its public events can be seen by anyone, including on the website.', { kind: kindT })}
            </p>
            <button type="button" className="btn btn-outline btn-full" onClick={togglePrivacy} disabled={savingPrivacy} style={{ minHeight: '44px' }}>
              {savingPrivacy ? t('Saving...') : org.hide_from_public ? t('Show my {kind} to the public', { kind: kindT }) : t('Only show my {kind} to people with an account', { kind: kindT })}
            </button>
            {privacyNote && <p className="hub-note" role="status">{privacyNote}</p>}
          </section>

          <section className="cal-box" aria-labelledby="org-invisible">
            <h3 id="org-invisible">{t('Invisible')}</h3>
            <p className="cal-sub" style={{ marginBottom: '0.75rem' }}>
              {org.invisible
                ? t('Your {kind} is invisible. Only your members can see it, its events and its resources. New people join by an invite link from {tools}.', { kind: kindT, tools: TOOLS })
                : t('Turn this on if your {kind} needs to stay out of sight. Only members would see it. It would leave every list, search, map and Find Help.', { kind: kindT })}
            </p>
            <button type="button" className="btn btn-outline btn-full" onClick={toggleInvisible} disabled={savingInvisible} style={{ minHeight: '44px' }}>
              {savingInvisible ? t('Saving...') : org.invisible ? t('Let people find my {kind} again', { kind: kindT }) : t('Make my {kind} invisible', { kind: kindT })}
            </button>
            {invisibleNote && <p className="hub-note" role="status">{invisibleNote}</p>}
          </section>

          {!org.invisible && (
            <section className="cal-box" aria-labelledby="org-join-open">
              <h3 id="org-join-open">{t('Ask to join')}</h3>
              <p className="cal-sub" style={{ marginBottom: '0.75rem' }}>
                {joinOpen
                  ? t('People who are not members see an Ask to join button. You get an alert and decide who to add.')
                  : t('The Ask to join button is off. People can still reach you with your contact info, and invite links still work.')}
              </p>
              <button type="button" className="btn btn-outline btn-full" onClick={toggleJoinOpen} disabled={savingJoin} style={{ minHeight: '44px' }}>
                {savingJoin ? t('Saving...') : joinOpen ? t('Turn off Ask to join') : t('Turn on Ask to join')}
              </button>
              {joinNote && <p className="hub-note" role="status">{joinNote}</p>}
            </section>
          )}

          {contactEmail && (
            <section className="cal-box" aria-labelledby="org-email">
              <h3 id="org-email">{t('Your contact email')}</h3>
              <p className="cal-sub" style={{ marginBottom: '0.75rem' }}>
                {org.show_contact_email
                  ? t('Your email button shows on this page for anyone who can see your {kind}.', { kind: kindT })
                  : t('Your email is private. Nobody can see it, not even VWB admins. You can choose to show an Email button.')}
              </p>
              <button type="button" className="btn btn-outline btn-full" onClick={toggleContactEmail} disabled={savingEmail} style={{ minHeight: '44px' }}>
                {savingEmail ? t('Saving...') : org.show_contact_email ? t('Hide my email') : t('Show an Email button')}
              </button>
              {emailNote && <p className="hub-note" role="status">{emailNote}</p>}
            </section>
          )}
        </SimpleFold>}
      </div>

      {sheet && (
        <div className="vs-shade" onClick={(e) => { if (e.target === e.currentTarget) closeSheet() }}>
          <div className="vs-sheet" role="dialog" aria-modal="true" aria-labelledby="op-sheet-title" ref={sheetRef}>
            {sheetBody(sheet.k)}
            <button type="button" className="btn btn-outline btn-full" onClick={closeSheet}>{t('Back to {name}', { name: org.name })}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// The top of an organization's public profile, for people who are not members:
// how to reach them, what's coming up, and what they share.
function OrgPublicTop({ org, place, contactEmail, events, resources, kind, onMore }) {
  const t = useT()
  const kindT = t(kind)
  const website = safeLink(org.website_url)
  const social = safeLink(org.social_links?.primary)
  const email = contactEmail && org.show_contact_email ? contactEmail : null
  const soon = events.slice(0, 3)
  const shared = resources.slice(0, 3)
  return (
    <div className="op-public">
      <section className="op-card" aria-labelledby="op-contact-h">
        <h2 id="op-contact-h">{t('Get in touch')}</h2>
        {place && <p className="vs-note">{t('Serves the area near {place}', { place })}</p>}
        {(email || website || social)
          ? <div className="op-contact">
              {email && <a className="btn btn-outline btn-full" href={'mailto:' + email}>{t('Email {name}', { name: org.name })}</a>}
              {website && <a className="btn btn-outline btn-full" href={website} target="_blank" rel="noopener noreferrer">{t('Visit their website')}</a>}
              {social && <a className="btn btn-outline btn-full" href={social} target="_blank" rel="noopener noreferrer">{t('Follow them online')}</a>}
            </div>
          : <p className="vs-note">{t('This {kind} has not shared contact info yet.', { kind: kindT })}</p>}
      </section>

      <section className="op-card" aria-labelledby="op-events-h">
        <h2 id="op-events-h">{t('Coming up')}</h2>
        <CalendarEventList events={soon} emptyText={t('No upcoming events from this {kind} yet.', { kind: kindT })} />
        {events.length > soon.length && <button type="button" className="btn btn-outline btn-full" onClick={() => onMore('events')}>{t('See all {n} events', { n: events.length })}</button>}
      </section>

      <section className="op-card" aria-labelledby="op-res-h">
        <h2 id="op-res-h">{t('What they share')}</h2>
        {shared.length === 0 && <p className="vs-note">{t('Nothing shared yet.')}</p>}
        {shared.map((r) => (
          <div key={r.id} className="vs-item">
            <b>{r.name}</b>
            {r.description && <small>{r.description}</small>}
            <small>{resourceCats(r).map((c) => t(c)).join(' \u00b7 ')}</small>
            {(r.phone || r.url) && (
              <span className="hub-resource-links">
                {r.phone && <a href={'tel:' + r.phone.replace(/[^0-9+]/g, '')}>{t('Call {phone}', { phone: r.phone })}</a>}
                {r.url && <a href={safeLink(r.url)} target="_blank" rel="noopener noreferrer">{t('Website')}</a>}
              </span>
            )}
          </div>
        ))}
        {resources.length > shared.length && <button type="button" className="btn btn-outline btn-full" onClick={() => onMore('share')}>{t('See all {n} resources', { n: resources.length })}</button>}
      </section>
    </div>
  )
}

// Simple view folds the leader settings away under one plain button (Oct 27).
function SimpleFold({ on, label, children }) {
  if (!on) return <>{children}</>
  return (
    <details className="op-simple-more">
      <summary>{label}</summary>
      {children}
    </details>
  )
}
