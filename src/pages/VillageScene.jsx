import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import SpotIcon from '../components/SpotIcon'
import { useAuth } from '../context/AuthContext'
import { useUnreadCount } from '../context/UnreadCountContext'
import { loadMyTaskOverview } from '../utils/myTasks'
import { VILLAGE_SPOTS, COTTAGE_SPOTS, LIFE_ART, FIRE_SIZE, FIRE_WORDS, backgroundSrc, DEFAULT_WORLDS } from '../data/worldElements'
import { useMapBuilder, MapLayers, MapToolbar, NamesToggle, ToolIcon, sceneProps, zoomLayer, askGoTo, fromSaved, isPlainWorld, mapBody } from '../components/MapBuilder'
import { askConfirm } from '../components/AdminDialog'
import SisterCampfireButton from '../components/SisterCampfireButton'
import VillageRooms from '../components/VillageRooms'
import '../village-scene.css'
import Icon from '../components/Icon'
import YourCorner from './YourCorner'
import Dashboard from './Dashboard'

// The Village page: one village as a little world. Every element on the
// hills is a button that goes to its own page. A plain list sits below for
// anyone who would rather tap a list. Names follow the VWB Vocabulary sheet.
// Route: /village/:id

// Village places only members can open. Visitors see a closed gate on them (Oct 22).
const GATED = ['chat', 'campfires', 'keeper', 'neighbors']


// Garden gifts on your cottage map (Oct 22). They can be moved, sized, flipped and hidden
// like any place, once you have grown them. Saved in your layout as 'gift-<name>'.
const GIFT_SPOTS = [
  { k: 'gift-home', label: 'Well (garden gift)', src: '/art/village-build/deco-well.webp', x: 12, y: 80 },
  { k: 'gift-task', label: 'Flowers (garden gift)', src: '/art/village-build/deco-flowers.webp', x: 40, y: 93 },
  { k: 'gift-vouch', label: 'Garden lamp (garden gift)', src: '/art/village-build/deco-lamp.webp', x: 10, y: 95 },
  { k: 'gift-org', label: 'Vegetable garden (garden gift)', src: '/art/village-build/deco-garden.webp', x: 58, y: 70 },
]
const COTTAGE_BUILD_SPOTS = [...COTTAGE_SPOTS, ...GIFT_SPOTS]

export default function VillageScene() {
  const { id } = useParams()
  // No village id: this is your cottage (/cottage). Your own map, arranged by you,
  // with everything you are part of. A village page (/village/:id) shows one shared
  // look for everyone, with no builder (Oct 22). The Village tab opens your home village.
  const cottage = !id
  const navigate = useNavigate()
  const { user, profile, isFounder, refreshProfile, organizations } = useAuth()
  // In your home village, your house (the 'me' spot) is your cottage.
  const isHome = !cottage && !!id && profile?.home_village_id === id
  // Your cottage shows only in your home village (Oct 22).
  const SPOTS = cottage ? COTTAGE_SPOTS
    : isHome ? VILLAGE_SPOTS.map((v) => (v.k === 'me' ? { ...v, label: 'Your cottage', short: 'Your cottage' } : v))
    : VILLAGE_SPOTS.filter((v) => v.k !== 'me')
  const { unreadCount } = useUnreadCount()
  // The You button and old /me links open the cottage at Your corner (Oct 22).
  useEffect(() => {
    const spot = window.location.hash.slice(1)
    if (!cottage || (spot !== 'corner' && spot !== 'today')) return
    const t = setTimeout(() => document.getElementById(spot)?.scrollIntoView({ block: 'start' }), 400)
    return () => clearTimeout(t)
  }, [cottage])

  const [village, setVillage] = useState(null)
  const [allVillages, setAllVillages] = useState([])
  const [loadError, setLoadError] = useState('')
  const [board, setBoard] = useState(null)
  const [chatUnread, setChatUnread] = useState(0)
  const [keepers, setKeepers] = useState(null)
  const [keeperNames, setKeeperNames] = useState([])
  const [isGuest, setIsGuest] = useState(false)
  const [sisters, setSisters] = useState([])
  const [sisterFires, setSisterFires] = useState([])
  const [rooms, setRooms] = useState([])
  const [orgs, setOrgs] = useState([])
  const [sheet, setSheet] = useState(null)
  const [bump, setBump] = useState(null)
  // A waiting ask from the founder to keep this village (vwb-founder-keeper.sql).
  const [keeperAsk, setKeeperAsk] = useState(null)
  const sheetRef = useRef(null)
  const lastFocus = useRef(null)

  // Arrange and build (Oct 22). Every map can be arranged (components/MapBuilder.jsx).
  // Your cottage: your own map, saved on your account (helper_profiles.village_layout)
  // and on this device too in case saving fails. Only you see it.
  // A village page: the Keeper and Helpers set a shared look for everyone, and anyone
  // can arrange their own view on top (vwb-map-layouts.sql).
  // Hidden places stay in the list under the map.
  // v2 (Oct 22): every map was reset to the new art, so older copies on a device are skipped.
  const LAYOUT_KEY = 'vwb_village_layout_v2'
  const saveTimer = useRef(null)
  const [showTowns, setShowTowns] = useState(false)
  // The usual look: roads, streams and a few trees for this kind of map.
  const BASE = cottage ? DEFAULT_WORLDS.cottage : DEFAULT_WORLDS.village
  const CBASE = DEFAULT_WORLDS.cottage
  const b = useMapBuilder({
    spots: cottage ? COTTAGE_BUILD_SPOTS : SPOTS,
    base: BASE,
    initial: (() => { if (!cottage) return null; try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null') } catch { return null } })(),
    onSave: (next) => (cottage ? saveCottage(next) : saveMapLayout(next)),
  })
  const { world, worldRef, setWorld, commit, remember, arrange, picked, setPicked, setTrayOpen, setLayoutNote, placed, isHidden, dragStart, pickByKey } = b
  // The account's saved layout (your cottage, and the name tags choice).
  const accountLayout = profile?.village_layout
  // Village pages (Oct 22, vwb-map-layouts.sql): the Keeper and Helpers set a shared
  // look for everyone, and anyone can arrange their own view on top. You see your own
  // view if you made one, else the shared look, else the usual village.
  const [arrangeFor, setArrangeFor] = useState('me') // me | everyone
  const mapLayouts = useRef({ own: null, shared: null })
  const [mapLoaded, setMapLoaded] = useState(0)
  useEffect(() => {
    if (cottage || !id || !user) return
    let alive = true
    mapLayouts.current = { own: null, shared: null }
    Promise.all([
      supabase.from('map_layouts').select('layout').eq('map_kind', 'village').eq('map_id', id).maybeSingle(),
      supabase.from('map_shared_layouts').select('layout').eq('map_kind', 'village').eq('map_id', id).maybeSingle(),
    ]).then(([own, shared]) => {
      if (!alive) return
      // Before vwb-map-layouts.sql is run the tables are missing: show the usual village.
      ;[own, shared].forEach((r) => { if (r.error && !['42P01', 'PGRST205'].includes(r.error.code)) console.error('Failed to load the village map layout:', r.error) })
      mapLayouts.current = { own: (own.data && own.data.layout) || null, shared: (shared.data && shared.data.layout) || null }
      setMapLoaded((n) => n + 1)
    })
    return () => { alive = false }
  }, [cottage, id, user?.id])
  // Your cottage: the account's saved layout wins once the profile has loaded.
  useEffect(() => {
    if (!cottage || arrange || !accountLayout || typeof accountLayout !== 'object') return
    setWorld(fromSaved(accountLayout, CBASE))
  }, [accountLayout, cottage]) // eslint-disable-line react-hooks/exhaustive-deps
  // A village page: your view, else the shared look (and back to it after Done).
  useEffect(() => {
    if (cottage || arrange) return
    const { own, shared } = mapLayouts.current
    setWorld({ ...fromSaved(own || shared, BASE), labels: fromSaved(accountLayout).labels })
  }, [accountLayout, cottage, mapLoaded, arrange]) // eslint-disable-line react-hooks/exhaustive-deps

  // Name tags are one choice for every map, saved with your account.
  function saveLabels(labels) {
    if (cottage) { b.saveWorld({ ...worldRef.current, labels }); return }
    setWorld({ ...worldRef.current, labels })
    const acct = { ...fromSaved(accountLayout, CBASE), labels }
    const empty = isPlainWorld(acct, CBASE) && acct.labels === 'auto'
    supabase.rpc('set_my_village_layout', { p_layout: empty ? null : acct }).then(({ error }) => {
      if (error) { console.error('Failed to save name tags choice:', error); return }
      if (refreshProfile) refreshProfile()
    })
  }

  // A village page's own view or shared look.
  function saveMapLayout(next) {
    const forWho = arrangeFor
    const body = mapBody(next)
    const empty = isPlainWorld(next, BASE)
    const shared = forWho === 'everyone'
    // Keep it here right away, so tapping Done before it saves still shows it.
    mapLayouts.current = { ...mapLayouts.current, [shared ? 'shared' : 'own']: empty ? null : body }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase.rpc(shared ? 'set_map_shared_layout' : 'set_my_map_layout', { p_kind: 'village', p_id: id, p_layout: empty ? null : body })
      if (error) {
        console.error('Failed to save the village map:', error)
        setLayoutNote(error.code === '42501' ? error.message : error.code === 'PGRST202' ? 'This needs a database update first, so your changes are not saved yet.' : 'Could not save. Try again in a moment.')
        return
      }
    }, 800)
  }

  function startArrange(forWho) {
    let start = null
    if (!cottage) {
      const { own, shared } = mapLayouts.current
      start = { ...fromSaved(forWho === 'everyone' ? shared : (own || shared), BASE), labels: worldRef.current.labels }
    }
    setArrangeFor(forWho)
    b.openArrange(start)
  }

  // Long press on the map: ask, then open arranging with that place picked.
  async function holdToArrange(key) {
    const msg = cottage ? 'Move things in your cottage?' : 'Move things on your view of this map? Only you see your view.'
    if (!(await askConfirm(msg, { yes: 'Yes, move things', no: 'Not now' }))) return
    startArrange('me')
    if (key) { b.setPicked(key); b.setPickTools(true) }
  }

  // Your cottage: kept on this device right away, then saved on your account.
  function saveCottage(next) {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)) } catch { /* private mode */ }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const empty = isPlainWorld(next, CBASE) && next.labels === 'auto'
      const { error } = await supabase.rpc('set_my_village_layout', { p_layout: empty ? null : next })
      if (error) {
        // Before the database step is run, the layout simply stays on this device.
        if (error.code !== 'PGRST202') { console.error('Failed to save village layout:', error); setLayoutNote('Saved on this device only. It will try again next time you change something.') }
        return
      }
      if (refreshProfile) refreshProfile()
    }, 800)
  }
  async function copyLayout() {
    const text = 'Village layout:\n' + SPOTS.map((v) => { const p = placed(v); return v.k + ': x ' + p.x + ', y ' + p.y + ', size ' + (p.s || 1) + (p.flip ? ', flipped' : '') + (isHidden(v.k) ? ', hidden' : '') }).join('\n')
      + (world.decor.length || world.roads.length || world.streams.length ? '\nVillage build: ' + JSON.stringify({ decor: world.decor, roads: world.roads, streams: world.streams }) : '')
    try { await navigator.clipboard.writeText(text); setLayoutNote('Copied. Paste it to Claude to make it everyone’s starting layout.') }
    catch { setLayoutNote('Could not copy. Here it is to copy by hand:\n' + text) }
  }
  async function resetLayout() {
    if (!cottage && arrangeFor === 'me') {
      if (!(await askConfirm('Go back to how ' + (village ? village.name : 'this village') + ' looks by default? Your own view will be taken away.'))) return
      remember()
      const back = { ...fromSaved(mapLayouts.current.shared, BASE), labels: worldRef.current.labels }
      setWorld(back); setPicked(null); setTrayOpen(false)
      clearTimeout(saveTimer.current)
      const { error } = await supabase.rpc('set_my_map_layout', { p_kind: 'village', p_id: id, p_layout: null })
      if (error) { console.error('Failed to remove your view:', error); setLayoutNote('Could not do that. Try again in a moment.'); return }
      mapLayouts.current = { ...mapLayouts.current, own: null }
      setLayoutNote('Back to the default look.')
      return
    }
    const msg = !cottage ? 'Set the default back to the starting village? Personal views stay as they are. You can tap Undo right after.' : 'Go back to the usual village? Your pieces, roads and streams will be taken away. You can tap Undo right after if you change your mind.'
    if (!(await askConfirm(msg))) return
    commit(fromSaved(null, BASE)); setPicked(null); setTrayOpen(false); setLayoutNote('Back to the usual village.')
  }

  useEffect(() => {
    if (!user || cottage) return
    let alive = true
    supabase.rpc('my_keeper_offers').then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('[VillageScene] keeper asks failed:', error); return }
      setKeeperAsk((data || []).find((o) => o.village_id === id) || null)
    })
    return () => { alive = false }
  }, [user, id])

  // The village itself, and the others (for sister names).
  useEffect(() => {
    let alive = true
    setVillage(null); setLoadError('')
    supabase.rpc('village_network').then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load villages:', error); setLoadError("We couldn't load this village. Check your connection and try again."); return }
      const rows = data || []
      setAllVillages(rows)
      if (cottage) return
      const v = rows.find((r) => r.id === id)
      if (!v) { setLoadError("We couldn't find this village. It may have closed."); return }
      setVillage(v)
    })
    return () => { alive = false }
  }, [id])

  // The village chat and its unread count.
  useEffect(() => {
    if (cottage) return
    let alive = true
    supabase.from('campfire_boards').select('id, name').eq('village_id', id).eq('archived', false).order('sort_order').limit(1).then(({ data: rows, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load the village chat:', error); return }
      const data = (rows || [])[0] || null
      setBoard(data)
      if (!data) return
      supabase.rpc('campfire_unread').then(({ data: u, error: uErr }) => {
        if (!alive) return
        if (uErr) { console.error('Failed to load unread village chats:', uErr); return }
        const row = (u || []).find((r) => r.board_id === data.id)
        setChatUnread(row ? Number(row.unread) : 0)
      })
    })
    return () => { alive = false }
  }, [id])

  // Members only: this village's Campfires I can see.
  function loadRooms() {
    supabase.rpc('village_rooms', { p_village: id }).then(({ data, error }) => {
      if (error) { console.error('Failed to load Campfires:', error); return }
      setRooms(data || [])
    })
  }
  useEffect(() => {
    if (!village || !village.is_mine) { setRooms([]); return }
    loadRooms()
  }, [village, id]) // eslint-disable-line react-hooks/exhaustive-deps

  // The living scene: lit cottages, fire size, Keeper lantern (counts in steps only).
  const [life, setLife] = useState(null)
  useEffect(() => {
    if (cottage) return
    let alive = true
    supabase.rpc('village_scene_life', { p_village: id }).then(({ data, error }) => {
      if (!alive) return
      // Before the SQL file is run, the scene simply looks the way it always has.
      if (error) { if (error.code !== 'PGRST202') console.error('Failed to load village life:', error); return }
      setLife((Array.isArray(data) ? data[0] : data) || null)
    })
    return () => { alive = false }
  }, [id])

  // Members only: keepers and whether I came in as a guest.
  useEffect(() => {
    if (!village || !village.is_mine) { setKeepers(null); setIsGuest(false); return }
    let alive = true
    supabase.rpc('village_keepers_info', { p_village: id }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load keepers:', error); return }
      const row = (data || [])[0] || null
      setKeepers(row)
      const ids = row ? [row.starter_id, ...(row.helper_ids || [])].filter(Boolean) : []
      if (!ids.length) { setKeeperNames([]); return }
      supabase.from('helper_profiles_public').select('user_id, display_name').in('user_id', ids).then(({ data: p, error: pErr }) => {
        if (!alive) return
        if (pErr) { console.error('Failed to load keeper names:', pErr); return }
        const byId = Object.fromEntries((p || []).map((r) => [r.user_id, r.display_name]))
        setKeeperNames(ids.map((k) => byId[k]).filter(Boolean))
      })
    })
    supabase.rpc('village_guest_ids', { p_village: id }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load guests:', error); return }
      setIsGuest((data || []).some((g) => g.user_id === user.id))
    })
    return () => { alive = false }
  }, [village, id, user.id])

  // Sister villages and organizations working here.
  useEffect(() => {
    if (cottage) return
    let alive = true
    supabase.rpc('village_sister_list').then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load sister villages:', error); return }
      setSisters((data || []).filter((s) => s.village_a === id || s.village_b === id).map((s) => (s.village_a === id ? s.village_b : s.village_a)))
    })
    supabase.rpc('sister_campfires', { p_village: id }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load Sister Campfires:', error); return }
      setSisterFires((data || []).filter((c) => !c.closed_at))
    })
    supabase.rpc('org_village_links').then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load organizations working here:', error); return }
      const here = (data || []).filter((r) => r.village_id === id).map((r) => ({ id: r.org_id, name: r.org_name, kind: 'organization' }))
      setOrgs(here)
      if (!here.length) return
      // Which of these are emergency response Groups (tent) and which are organizations.
      supabase.from('organizations').select('id, kind').in('id', here.map((o) => o.id)).then(({ data: kinds, error: kErr }) => {
        if (!alive) return
        if (kErr) { console.error('Failed to load group kinds:', kErr); return }
        const k = Object.fromEntries((kinds || []).map((x) => [x.id, x.kind]))
        setOrgs(here.map((o) => ({ ...o, kind: k[o.id] || 'organization' })))
      })
    })
    return () => { alive = false }
  }, [id])

  // Sheet: Escape closes, focus goes in and comes back.
  useEffect(() => {
    if (!sheet) return
    const first = sheetRef.current && sheetRef.current.querySelector('button, a')
    if (first) first.focus()
    function onKey(e) { if (e.key === 'Escape') closeSheet() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])

  // Your cottage: your home village and how many village and Campfire messages are new.
  const [home, setHome] = useState(null)
  const [chatsNew, setChatsNew] = useState(0)
  useEffect(() => {
    if (!cottage || !user) return
    let alive = true
    supabase.rpc('my_home_village').then(({ data, error }) => {
      if (error) { console.error('Failed to load your home village:', error); return }
      if (alive) setHome((data || [])[0] || { village_id: null })
    })
    supabase.rpc('campfire_unread').then(({ data, error }) => {
      if (error) { console.error('Failed to count new village messages:', error); return }
      if (alive) setChatsNew((data || []).reduce((n, r) => n + Number(r.unread || 0), 0))
    })
    return () => { alive = false }
  }, [cottage, user?.id, profile?.home_village_id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Lanterns and garden gifts (Oct 22, gamify starters): what is waiting on you, and
  // small gifts for first steps. Private to you; nothing is ever taken away.
  const [tasks, setTasks] = useState(null)
  const [vouched, setVouched] = useState(false)
  useEffect(() => {
    if (!cottage || !user) return
    let alive = true
    loadMyTaskOverview(user.id).then((d) => { if (alive) setTasks(d) }).catch((err) => console.error('Failed to load your tasks:', err))
    supabase.from('vouches').select('id').or('voucher_id.eq.' + user.id + ',vouchee_id.eq.' + user.id).limit(1).then(({ data, error }) => {
      if (error) { console.error('Failed to check vouches:', error); return }
      if (alive) setVouched((data || []).length > 0)
    })
    return () => { alive = false }
  }, [cottage, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const offersWaiting = tasks ? tasks.requests.filter((r) => r.needsYou).length : 0
  const yourTurn = tasks ? tasks.active.filter((t) => t.needsYou).length : 0
  const GIFTS = [
    { k: 'home', got: !!home?.village_id, src: '/art/village-build/deco-well.webp', label: 'A well', why: 'for finding your home village', next: 'Find your home village', x: 12, y: 80 },
    { k: 'task', got: !!(tasks && tasks.archived.length), src: '/art/village-build/deco-flowers.webp', label: 'Flowers', why: 'for finishing your first task with a neighbor', next: 'Finish a task with a neighbor', x: 40, y: 93 },
    { k: 'vouch', got: vouched, src: '/art/village-build/deco-lamp.webp', label: 'A garden lamp', why: 'for your first vouch', next: 'Vouch for someone you know, or be vouched for', x: 10, y: 95 },
    { k: 'org', got: (organizations || []).length > 0, src: '/art/village-build/deco-garden.webp', label: 'A vegetable garden', why: 'for joining an organization or group', next: 'Join an organization or a group', x: 58, y: 70 },
  ]
  const myOrgs = (organizations || []).filter((o) => o.kind !== 'group')
  const myGroups = (organizations || []).filter((o) => o.kind === 'group')
  const visits = allVillages.filter((v) => v.is_mine && v.id !== home?.village_id)
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many)

  function cottageInfo(k) {
    switch (k) {
      case 'home': return { sub: home?.village_id ? 'Step into ' + home.name : home ? 'Find or start your home village' : 'Loading...' }
      case 'visits': return { sub: visits.length ? plural(visits.length, 'village', 'villages') + ' where you are a guest' : 'Villages you visit show up here' }
      case 'calendar': return { sub: 'Events and sign-ups near you' }
      case 'orgs': return { sub: myOrgs.length ? plural(myOrgs.length, 'organization', 'organizations') : 'Find an organization near you' }
      case 'connections': return { sub: 'People you know on VWB' }
      case 'groups': return { sub: myGroups.length ? plural(myGroups.length, 'emergency group', 'emergency groups') : 'Crews that help when disaster hits' }
      case 'cottage': return { sub: 'Private chats with people you chose' }
      case 'campfires': return { sub: 'Team chats in your organizations and villages' }
      case 'chat': return { sub: chatsNew ? chatsNew + ' new in your villages and Campfires' : 'Your village chats', badge: chatsNew, lantern: chatsNew ? chatsNew + ' new' : '' }
      case 'help': return offersWaiting || yourTurn
        ? { sub: (offersWaiting ? plural(offersWaiting, 'neighbor offered', 'neighbors offered') + ' to help. ' : '') + (yourTurn ? plural(yourTurn, 'task is', 'tasks are') + ' waiting on you.' : ''), badge: offersWaiting + yourTurn, lantern: offersWaiting ? 'Say yes?' : 'Your turn' }
        : { sub: 'Find resources, ask for help, or help a neighbor' }
      case 'me': return { sub: 'Your profile, vouches, and settings' }
      case 'messages': return { sub: unreadCount ? unreadCount + ' unread' : 'Requests and private messages', badge: unreadCount, lantern: unreadCount ? unreadCount + ' new' : '' }
      default: return { sub: '' }
    }
  }
  function cottageTap(k) {
    switch (k) {
      case 'home': goTo(home?.village_id ? '/village/' + home.village_id : '/find-village'); return
      case 'calendar': goTo('/calendar'); return
      case 'connections': goTo('/connections'); return
      // Each picture opens its own page (Oct 22), not the same Messages page.
      case 'cottage': goTo('/groups?show=cottage'); return
      case 'campfires': goTo('/groups?show=campfires'); return
      case 'chat': goTo('/village-square'); return
      // One place every time (Oct 22). Waiting tasks show as a badge on the spot and on Your tasks.
      case 'help': goTo('/help-doors'); return
      // Your corner sits under the cottage map (Oct 22).
      case 'me': goTo('#corner'); return
      case 'messages': goTo('/messages'); return
      default: openSheet({ k })
    }
  }
  function cottageSheet(k, title) {
    const row = (to, icon, name, small) => (
      <button key={to} type="button" className="vs-row" onClick={() => { setSheet(null); navigate(to) }}>
        <span aria-hidden="true"><Icon name={icon} /></span> {name}<small>{small}</small>
      </button>
    )
    switch (k) {
      case 'visits': return <>{title}
        {visits.length === 0 && <p>You are not a guest in any other village yet. A neighbor can invite you, or you can visit a sister village.</p>}
        {visits.map((v) => row('/village/' + v.id, 'houses', v.name, 'Guest'))}
        <Link className="btn btn-outline btn-full" to="/world">See every village</Link>
      </>
      case 'orgs': return <>{title}
        {myOrgs.length === 0 && <p>You are not in an organization yet.</p>}
        {myOrgs.map((o) => row('/orgs/' + o.id, 'people', o.name, 'Organization'))}
        <Link className="btn btn-outline btn-full" to="/world?tab=orgs">See every organization</Link>
      </>
      case 'groups': return <>{title}
        {myGroups.length === 0 && <p>You are not in an emergency group yet. Groups are crews that help when disaster hits.</p>}
        {myGroups.map((o) => row('/orgs/' + o.id, 'tent', o.name, 'Emergency group'))}
        <Link className="btn btn-outline btn-full" to="/start-group">Start a group</Link>
      </>
      default: return title
    }
  }

  function giftsSheet() {
    const got = GIFTS.filter((g) => g.got)
    return <>
      <h2 id="vs-sheet-title"><span aria-hidden="true" className="vs-sheet-ic"><Icon name="sprout" size={36} /></span> Your garden</h2>
      <p>Small gifts grow in your garden as you take first steps with your neighbors. Only you see them, and they never go away.</p>
      {got.map((g) => <div key={g.k} className="vs-item vs-gift-row"><img src={g.src} alt="" width="48" height="48" /><span><b>{g.label}</b><small>{g.why}</small></span></div>)}
      {got.length < GIFTS.length && <h3 className="vs-arrange-h">Still to grow</h3>}
      {GIFTS.filter((g) => !g.got).map((g) => <div key={g.k} className="vs-item vs-gift-row vs-gift-next"><img src={g.src} alt="" width="48" height="48" /><span><b>{g.next}</b><small>A gift will grow when you do</small></span></div>)}
    </>
  }

  function openSheet(s) { lastFocus.current = document.activeElement; setSheet(s) }
  function closeSheet() {
    setSheet(null)
    if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus()
  }

  const mine = !!(village && village.is_mine)
  const nameOf = (vid) => (allVillages.find((v) => v.id === vid) || {}).name || 'A village'

  function info(k) {
    if (cottage) return cottageInfo(k)
    switch (k) {
      case 'charter': return { sub: 'Our story, what we care about, and house rules' }
      case 'sisters': return { sub: sisters.length ? sisters.length + ' sister village' + (sisters.length === 1 ? '' : 's') : 'No sister villages yet' }
      case 'keeper': return { sub: keeperNames.length ? 'Looked after by ' + keeperNames.join(', ') : life && !life.has_keeper ? 'Keeper wanted: this village needs someone to look after it' : 'The neighbor who looks after this village' }
      case 'chat': return { sub: mine ? (chatUnread ? chatUnread + ' new since you last looked' : 'Say hello and share news') : 'Join this village to read its chat', badge: mine ? chatUnread : 0 }
      case 'campfires': {
        if (!mine) return { sub: life ? FIRE_WORDS[life.fire_level] || 'Join this village to sit at its Campfires' : 'Join this village to sit at its Campfires' }
        const f = rooms, inF = f.filter((r) => r.i_am_in).length
        const asks = f.reduce((n, r) => n + (r.asks_waiting || 0), 0)
        return { sub: f.length ? f.length + ' here' + (inF ? ', you are in ' + inF : '') + (asks ? ', ' + asks + ' asking to join' : '') : 'Start the first one', badge: asks }
      }
      case 'skillshare': return { sub: 'Help nearby: requests and offers' }
      case 'neighbors': return { sub: village && village.member_count ? village.member_count + ' neighbors live here' : 'A few neighbors so far' }
      case 'cottage': return { sub: 'Private chats with people you chose' }
      case 'me': return { sub: isHome ? 'Your house: your own map of everything you are part of' : 'Your profile, vouches, and settings' }
      case 'messages': return { sub: unreadCount ? unreadCount + ' unread' : 'Requests and private messages', badge: unreadCount }
      case 'orgs': { const n = orgs.filter((o) => o.kind !== 'group').length; return { sub: n ? n + ' working here' : 'None working here yet' } }
      case 'groups': { const n = orgs.filter((o) => o.kind === 'group').length; return { sub: n ? n + ' emergency response group' + (n === 1 ? '' : 's') : 'Start a crew for when disaster hits' } }
      default: return { sub: '' }
    }
  }

  // Leaving the page from a map tap asks first (askGoTo). '#corner' scrolls to Your corner.
  const askRef = useRef(null)
  async function goTo(to, opts) {
    const spot = askRef.current
    askRef.current = null
    if (spot && !(await askGoTo(spot, info(spot.k).sub))) return
    if (to === '#corner') { document.getElementById('corner')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); return }
    navigate(to, opts)
  }
  // fromMap: tapped on the map picture (asks first). The list under the map goes straight there.
  function tap(spot, fromMap) {
    askRef.current = fromMap ? spot : null
    if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setBump(spot.k); setTimeout(() => setBump(null), 450)
    }
    if (cottage) { cottageTap(spot.k); return }
    if (spot.soon) { openSheet({ k: spot.k }); return }
    switch (spot.k) {
      case 'chat':
        if (mine && board) goTo('/village-square?board=' + board.id)
        else if (!mine) goTo('/find-village?join=' + id)
        else openSheet({ k: 'chat' })
        return
      case 'charter': goTo('/village/' + id + '/charter'); return
      case 'skillshare': goTo('/skillshare'); return
      case 'cottage': goTo('/messages'); return
      case 'messages': goTo('/messages'); return
      // In your home village, your house is your cottage: your own private map.
      case 'me': goTo(isHome ? '/cottage' : '/me'); return
      default: openSheet({ k: spot.k })
    }
  }

  function sheetBody(k) {
    if (cottage && k === 'gifts') return giftsSheet()
    const spot = SPOTS.find((s) => s.k === k)
    const title = <h2 id="vs-sheet-title"><span aria-hidden="true" className="vs-sheet-ic"><SpotIcon spot={spot} size={36} /></span> {spot.label}</h2>
    if (cottage) return cottageSheet(k, title)
    if (spot.soon) {
      return <>{title}<p>This part of the village is coming soon.</p></>
    }
    switch (k) {
      case 'sisters':
        return <>{title}
          {sisters.length === 0 && <p>This village has no sister villages yet. The keeper can ask another village from the World map.</p>}
          {sisters.map((sid) => (
            <div key={sid} className="vs-sister">
              <button type="button" className="vs-row" onClick={() => { setSheet(null); navigate('/village/' + sid) }}>
                <span aria-hidden="true"><Icon name="houses" /></span> {nameOf(sid)}<small>Sister village</small>
              </button>
              <SisterCampfireButton campfire={sisterFires.find((c) => c.village_a === sid || c.village_b === sid)} />
            </div>
          ))}
          <p className="vs-note">Members of a sister village can join this one as a guest.</p>
        </>
      case 'campfires':
        return <>{title}<VillageRooms villageId={id} isMember={mine} isKeeper={!!(keepers && keepers.i_am_keeper)} onChanged={loadRooms} /></>
      case 'keeper':
        return <>{title}
          {!mine && <p>Join this village to see who looks after it.</p>}
          {mine && keeperNames.length === 0 && (life && !life.has_keeper
            ? <p>This village has no Keeper right now. If you would like to look after it, tell a Hope Ambassador or a VWB admin. They can ask you to be Keeper.</p>
            : <p>Loading the keeper...</p>)}
          {mine && keeperNames.map((n) => <div key={n} className="vs-item"><b>{n}</b><small>Keeper</small></div>)}
          {mine && keepers && keepers.i_am_keeper && <>
            <p className="vs-note">You are a keeper here. You post announcements in the village chat and can hand the role to another member.</p>
            <button type="button" className="btn btn-primary btn-full" onClick={() => { setSheet(null); navigate('/village/' + id + '/keeper') }}><Icon name="toolbox" /> Open keeper tools</button>
          </>}
        </>
      case 'chat':
        return <>{title}<p>We couldn't find this village's chat. Try again in a moment.</p></>
      case 'neighbors':
        return <>{title}
          <p>{info('neighbors').sub}.</p>
          {mine && board
            ? <><p className="vs-note">See who is here, vouch, or send a message request from the People button in the village chat.</p>
                <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/village-square?board=' + board.id)}>Open the village chat</button></>
            : <p className="vs-note">Join this village to see who lives here.</p>}
        </>
      case 'orgs':
        return <>{title}
          {orgs.filter((o) => o.kind !== 'group').length === 0 && <p>No organizations work in this village yet.</p>}
          {orgs.filter((o) => o.kind !== 'group').map((o) => (
            <button key={o.id} type="button" className="vs-row" onClick={() => { setSheet(null); navigate('/orgs/' + o.id) }}>
              <span aria-hidden="true"><Icon name="people" /></span> {o.name}<small>Organization</small>
            </button>
          ))}
        </>
      case 'groups': {
        const groups = orgs.filter((o) => o.kind === 'group')
        return <>{title}
          <p>Groups are crews that show up when disaster hits here: flooding, storms, mold, fires. They plan together ahead of time.</p>
          {groups.length === 0 && <p className="vs-note">No groups cover this village yet.</p>}
          {groups.map((o) => (
            <button key={o.id} type="button" className="vs-row" onClick={() => { setSheet(null); navigate('/orgs/' + o.id) }}>
              <span aria-hidden="true"><Icon name="tent" /></span> {o.name}<small>Emergency response group</small>
            </button>
          ))}
          <Link className="btn btn-outline btn-full" to={'/start-group?village=' + id}>Start a group for {village ? village.name : 'this village'}</Link>
        </>
      }
      default: return title
    }
  }

  if (loadError) {
    return <div className="vs-page vs-page-path"><div className="vs-top"><Link className="vs-crumb" to="/world">World</Link></div><p className="vs-error" role="alert">{loadError}</p></div>
  }
  if (!cottage && !village) {
    return <div className="vs-page vs-page-path"><p className="vs-loading" role="status">Loading the village...</p></div>
  }


  return (
    <div className="vs-page vs-page-path">
      {cottage ? (
        <div className="vs-title">
          <h1>Your cottage</h1>
          <p className="vs-cottage-sub">Everything you are part of, in one place. Only you see your map.</p>
          <div className="vs-chips">
            {home?.village_id
              ? <Link className="vs-chip vs-chip-in vs-chip-link" to={'/village/' + home.village_id}>Home: {home.name}</Link>
              : home && <Link className="vs-chip vs-chip-link" to="/find-village">Find your home village</Link>}
          </div>
        </div>
      ) : (<>
      <nav className="vs-top" aria-label="Where you are">
        <Link className="vs-crumb" to="/world">World</Link>
        <span className="vs-sep" aria-hidden="true">&#8250;</span>
        <span className="vs-here" aria-current="page">{village.name}</span>
      </nav>

      <div className="vs-title">
        <h1>{village.name}</h1>
        <div className="vs-chips">
          {mine && !isGuest && (profile?.home_village_id === village.id ? <span className="vs-chip vs-chip-in">Your home village</span> : <span className="vs-chip vs-chip-in">You are in</span>)}
          {mine && isGuest && <span className="vs-chip vs-chip-guest">Guest</span>}
          {mine && keepers && keepers.i_am_keeper && <span className="vs-chip vs-chip-in">Keeper</span>}
          {!mine && <span className="vs-chip">Not joined yet</span>}
          <span className="vs-chip">{village.member_count ? village.member_count + ' neighbors' : 'Just starting'}</span>
          {village.towns && (() => {
            // Oct 22: the town list folds into one chip so the map starts sooner. Tap to see them all.
            const n = village.towns.split(',').filter((t) => t.trim()).length
            return n > 1
              ? <button type="button" className="vs-chip vs-chip-btn-towns" aria-expanded={showTowns} onClick={() => setShowTowns((v) => !v)}>{n} towns {showTowns ? '\u25B4' : '\u25BE'}</button>
              : <span className="vs-chip">{village.towns}</span>
          })()}
        </div>
        {village.towns && showTowns && <p className="vs-towns-list">{village.towns}</p>}
      </div>

      </>)}

      {keeperAsk && (
        <Link className="vs-ask" to={'/keeper-offer/' + keeperAsk.offer_id}>
          <b>{keeperAsk.asked_by_name} asked you to be Keeper of {village.name}</b>
          <small>Tap to say yes or no. Nothing changes until you answer.</small>
        </Link>
      )}

      {!arrange && (
        <button type="button" data-tour="village-arrange" className="vs-build-start" onClick={() => startArrange('me')}>
          <span className="vs-build-start-ic" aria-hidden="true"><ToolIcon name="move" /></span>
          <span className="vs-build-start-text">
            <b>{cottage ? 'Arrange and build my cottage' : 'Arrange my view of ' + village.name}</b>
            <small>{cottage ? 'Move places, add trees and bridges, draw roads and streams' : 'Only you see your view. Move places, add trees, draw roads.'}</small>
          </span>
        </button>
      )}
      {!arrange && !cottage && keepers && keepers.i_am_keeper && (
        <button type="button" className="vs-build-start vs-build-shared" onClick={() => startArrange('everyone')}>
          <span className="vs-build-start-ic" aria-hidden="true"><ToolIcon name="move" /></span>
          <span className="vs-build-start-text">
            <b>Set the default look for {village.name}</b>
            <small>New neighbors start with this. Anyone who arranged their own view keeps it.</small>
          </span>
        </button>
      )}
      {!arrange && !cottage && keepers && keepers.i_am_keeper && mapLoaded > 0 && mapLayouts.current.own && (
        <p className="vs-note">You are seeing your own view, so a new default will not show for you. To see the default, open Arrange my view and tap Back to the default look.</p>
      )}

      <div {...sceneProps(b, 'vs-scene vs-scene-path', holdToArrange)}>
       <div {...zoomLayer(b)}>
        <img className="vs-ground" src={backgroundSrc(world.bg)} alt="" width="720" height="1080" fetchpriority="high" />
        <MapLayers b={b} />
        {cottage && GIFTS.filter((g) => g.got).map((g) => {
          const gs = placed(GIFT_SPOTS.find((x) => x.k === 'gift-' + g.k))
          if (!arrange && isHidden(gs.k)) return null
          const img = <img className={'vs-gift-img' + (gs.flip ? ' vs-flip' : '')} src={g.src} alt="" width="64" height="64" draggable="false" />
          const style = { left: gs.x + '%', top: gs.y + '%', '--s': gs.s || 1 }
          return arrange
            ? <button key={gs.k} type="button" data-spot={gs.k} className={'vs-gift vs-gift-edit' + (picked === gs.k ? ' vs-picked' : '') + (isHidden(gs.k) ? ' vs-hidden' : '')} style={style}
                aria-label={gs.label} onPointerDown={(e) => dragStart(e, gs.k)} onClick={(e) => { if (e.detail === 0) pickByKey(gs.k) }}>{img}</button>
            : <span key={gs.k} className="vs-gift" style={style}>{img}</span>
        })}
        {SPOTS.filter((s0) => arrange || !isHidden(s0.k)).map((s0) => {
          const s = placed(s0)
          const i = info(s.k)
          return (
            <button key={s.k} type="button" data-spot={s.k}
              className={'vs-el' + (s.soon || (!cottage && !mine && GATED.includes(s.k)) ? ' vs-soon' : '') + (s.k === 'campfires' ? ' vs-flame' + (life ? ' vs-fire-' + life.fire_level : '') : '') + (bump === s.k ? ' vs-bump' : '') + (arrange && picked === s.k ? ' vs-picked' : '') + (arrange && isHidden(s.k) ? ' vs-hidden' : '')}
              style={{ left: s.x + '%', top: s.y + '%', '--s': (s.s || 1) * (s.k === 'campfires' && life ? FIRE_SIZE[life.fire_level] || 1 : 1) }}
              aria-label={s.label + '. ' + i.sub}
              onPointerDown={(e) => dragStart(e, s.k)}
              onClick={(e) => { if (!arrange) tap(s, true); else if (e.detail === 0) pickByKey(s.k) }}>
              <span className={'vs-em' + (s.flip ? ' vs-flip' : '')} aria-hidden="true">
                {s.k === 'campfires' && life
                  ? <img className="vs-icon vs-life-fire" src={LIFE_ART.fire[life.fire_level] || LIFE_ART.fire[1]} alt="" width="96" height="96" draggable="false" />
                  : s.k === 'neighbors' && life
                    // Lit cottages fill the front row first.
                    ? <span className="vs-hamlet">
                        {[0, 1, 2, 3, 4, 5].map((n) => (
                          <img key={n} className={'vs-cot' + (5 - n < life.lit_cottages ? ' vs-cot-lit' : '')} src={5 - n < life.lit_cottages ? LIFE_ART.cottageLit : LIFE_ART.cottageDark} alt="" width="48" height="48" draggable="false" />
                        ))}
                      </span>
                    : <SpotIcon spot={s} painted />}
                {cottage && i.lantern && <img className="vs-lantern vs-lantern-lit" src={LIFE_ART.lantern} alt="" width="48" height="48" draggable="false" />}
                {!cottage && !mine && GATED.includes(s.k) && <span className="vs-gate"><Icon name="lock" size={22} /></span>}
                {s.k === 'keeper' && life && !life.has_keeper && <img className="vs-wanted" src={LIFE_ART.sign} alt="" width="48" height="48" draggable="false" />}
              </span>
              <span className="vs-lab">{s.k === 'keeper' && life && !life.has_keeper ? 'Keeper wanted' : s.short}</span>
              {cottage && i.lantern
                ? <span className="vs-lantern-tag" aria-hidden="true">{i.lantern}</span>
                : i.badge > 0 && <span className="vs-badge" aria-hidden="true">{i.badge > 9 ? '9+' : i.badge}</span>}
            </button>
          )
        })}
       </div>
        <div className="vs-fade" />
      </div>
      {/* Name tags: on phones they show; with a mouse they show when you point at
          a place. This button turns them on or off for you, on every map.
          It sits under the map so it never covers a place. */}
      <NamesToggle b={b} onChange={saveLabels} />

      {cottage && !arrange && (
        <button type="button" className="vs-gifts-btn" onClick={() => openSheet({ k: 'gifts' })}>
          <Icon name="sprout" size={28} /> Your garden: {GIFTS.filter((g) => g.got).length} of {GIFTS.length} gifts grown
        </button>
      )}
      <p className="vs-hint">{arrange ? (cottage ? 'Arrange and build your cottage map. Your changes are saved as you go.' : arrangeFor === 'everyone' ? 'You are setting the default look for ' + village.name + '. Personal views stay as they are. Changes are saved as you go.' : 'You are arranging your own view. Only you see it. Changes are saved as you go.') : cottage ? 'Tap anything on your map to go there.' : 'Tap anything in the village to go there.'}</p>

      <MapToolbar b={b} more={<>
        <button type="button" className="btn btn-outline btn-full" onClick={resetLayout}>{cottage ? 'Back to the usual cottage' : arrangeFor === 'everyone' ? 'Default back to the starting village' : 'Back to the default look'}</button>
        {cottage && isFounder && <button type="button" className="btn btn-outline btn-full" onClick={copyLayout}>Copy layout for everyone (founder)</button>}
        <p className="vs-note">{cottage ? 'Your cottage is saved on your account and only you see it.' : arrangeFor === 'everyone' ? 'This is the default look. Anyone who arranged their own view keeps theirs.' : 'Your view is saved on your account and only you see it.'} Hidden places are still in the list under the map.</p>
      </>} />

      <div className="vs-body">
        {!cottage && !mine && <button type="button" className="btn btn-primary btn-full vs-big" onClick={() => navigate('/find-village?join=' + id)}>Join {village.name}</button>}
        {!cottage && mine && keepers && keepers.i_am_keeper && <button type="button" data-tour="keeper-tools" className="btn btn-outline btn-full vs-big" onClick={() => navigate('/village/' + id + '/keeper')}><span aria-hidden="true"><Icon name="toolbox" /></span> Keeper tools</button>}
        {/* Your cottage: Today (what needs you, shortcuts, coming up) sits right under the map (Oct 22). */}
        {cottage && <section id="today" className="vs-panel vs-today" aria-label="Today"><Dashboard embedded /></section>}
        {!cottage && <div className="vs-help">
          <button type="button" className="vs-big vs-ask" onClick={() => navigate('/ask')}>Ask for help</button>
          <button type="button" className="vs-big vs-offer" onClick={() => navigate('/post-offer')}>I can help</button>
        </div>}
        <h2 className="vs-pick-h">Or pick from the list</h2>
        <div className="vs-list">
          {SPOTS.map((s) => {
            const i = info(s.k)
            return (
              <button key={s.k} type="button" className={'vs-room' + (s.soon ? ' vs-soon' : '')} onClick={() => tap(s)}>
                <span className="vs-room-ic" aria-hidden="true"><SpotIcon spot={s} size={40} /></span>
                <span className="vs-room-text"><b>{s.label}{i.badge > 0 && <span className="vs-dot" aria-label="New" />}</b><small>{i.sub}</small></span>
                <span className="vs-go" aria-hidden="true">&#8250;</span>
              </button>
            )
          })}
        </div>
        <Link className="btn btn-outline btn-full vs-big" to="/calendar">Events near you</Link>
        {cottage && <section id="corner" className="vs-corner" aria-label="Your corner"><YourCorner embedded /></section>}
      </div>

      {sheet && (
        <div className="vs-shade" onClick={(e) => { if (e.target === e.currentTarget) closeSheet() }}>
          <div className="vs-sheet" role="dialog" aria-modal="true" aria-labelledby="vs-sheet-title" ref={sheetRef}>
            <button type="button" className="vs-sheet-close" onClick={closeSheet}><ToolIcon name="down" /><span>Close</span></button>
            {sheetBody(sheet.k)}
            <button type="button" className="btn btn-outline btn-full" onClick={closeSheet}>{cottage ? 'Back to my cottage' : 'Back to the village'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
