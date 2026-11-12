import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom'
import CottageSettings, { visitorsLine } from '../components/CottageSettings'
import { pauseFirstRun } from '../utils/firstVillage'
import { supabase } from '../supabaseClient'
import SpotIcon from '../components/SpotIcon'
import { useAuth } from '../context/AuthContext'
import { useUnreadCount } from '../context/UnreadCountContext'
import { loadMyTaskOverview } from '../utils/myTasks'
import { VILLAGE_SPOTS, COTTAGE_SPOTS, GIFT_SPOTS, LIFE_ART, FIRE_SIZE, FIRE_WORDS, backgroundSrc, DEFAULT_WORLDS } from '../data/worldElements'
import { useMapBuilder, MapLayers, MapToolbar, ToolIcon, sceneProps, zoomLayer, askGoTo, fromSaved, isPlainWorld, mapBody, ScrollCue, placeLayer } from '../components/MapBuilder'
import { askConfirm } from '../components/AdminDialog'
import SisterCampfireButton from '../components/SisterCampfireButton'
import VillageRooms from '../components/VillageRooms'
import '../village-scene.css'
import Icon from '../components/Icon'
import Dashboard from './Dashboard'
import { useSimpleView } from '../utils/simpleView'
import { calmMotion } from '../utils/motion'
import { useT, plainName } from '../utils/lang'

// The Village page: one village as a little world. Every element on the
// hills is a button that goes to its own page. A plain list sits below for
// anyone who would rather tap a list. Names follow the VWB Vocabulary sheet.
// Route: /village/:id

// Village places only members can open. Visitors see a closed gate on them (Oct 22).
const GATED = ['chat', 'campfires', 'keeper', 'neighbors']


const COTTAGE_BUILD_SPOTS = [...COTTAGE_SPOTS, ...GIFT_SPOTS]

export default function VillageScene() {
  const { id } = useParams()
  // No village id: this is your cottage (/cottage). Your own map, arranged by you,
  // with everything you are part of. A village page (/village/:id) shows one shared
  // look for everyone, with no builder (Oct 22). The Village tab opens your home village.
  const cottage = !id
  const navigate = useNavigate()
  const { user, profile, isFounder, refreshProfile, organizations } = useAuth()
  const simple = useSimpleView()
  const t = useT()
  // Your cottage shows only in your home village (Oct 22).
  const SPOTS = cottage ? COTTAGE_SPOTS
    // Nov 10 map review: no Me spot (My Cottage is on the top bar), one place for groups and crews,
    // and Help nearby only in the Simple view list.
    : VILLAGE_SPOTS.filter((v) => simple || !v.simpleOnly)
  const { unreadCount } = useUnreadCount()
  // The You button and old /me links open the cottage at Your corner (Oct 22).
  useEffect(() => {
    const spot = window.location.hash.slice(1)
    if (!cottage || spot !== 'today') return
    const timer = setTimeout(() => document.getElementById(spot)?.scrollIntoView({ block: 'start' }), 400)
    return () => clearTimeout(timer)
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
  // Oct 28: the Edit map button on the map; Keepers pick whose look to change.
  const [editMenu, setEditMenu] = useState(false)
  const keeperChoice = !cottage && !!(keepers && keepers.i_am_keeper)
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
  // Full setup ends with "Arrange my cottage now" (/cottage?arrange=1, Nov 1).
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (!cottage || params.get('arrange') !== '1') return
    setParams({}, { replace: true })
    b.openArrange(null)
  }, [cottage]) // eslint-disable-line react-hooks/exhaustive-deps
  // The tour and other first-run questions wait while you arrange your cottage.
  const arrangeSoon = cottage && (arrange || params.get('arrange') === '1')
  useEffect(() => { pauseFirstRun(arrangeSoon); return () => pauseFirstRun(false) }, [arrangeSoon])
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
        setLayoutNote(error.code === '42501' ? t(error.message) : error.code === 'PGRST202' ? t('This needs a database update first, so your changes are not saved yet.') : t('Could not save. Try again in a moment.'))
        return
      }
    }, 800)
  }

  function startArrange(forWho) {
    setEditMenu(false)
    let start = null
    if (!cottage) {
      const { own, shared } = mapLayouts.current
      start = { ...fromSaved(forWho === 'everyone' ? shared : (own || shared), BASE), labels: worldRef.current.labels }
    }
    setArrangeFor(forWho)
    b.openArrange(start)
  }

  // Oct 28 (Jade): no long press to start editing. The Edit button on the map does it.

  // Your cottage: kept on this device right away, then saved on your account.
  function saveCottage(next) {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)) } catch { /* private mode */ }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const empty = isPlainWorld(next, CBASE) && next.labels === 'auto'
      const { error } = await supabase.rpc('set_my_village_layout', { p_layout: empty ? null : next })
      if (error) {
        // Before the database step is run, the layout simply stays on this device.
        if (error.code !== 'PGRST202') { console.error('Failed to save village layout:', error); setLayoutNote(t('Saved on this device only. It will try again next time you change something.')) }
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
      if (!(await askConfirm(t('Go back to how {village} looks by default? Your own view will be taken away.', { village: village ? village.name : t('this village') })))) return
      remember()
      const back = { ...fromSaved(mapLayouts.current.shared, BASE), labels: worldRef.current.labels }
      setWorld(back); setPicked(null); setTrayOpen(false)
      clearTimeout(saveTimer.current)
      const { error } = await supabase.rpc('set_my_map_layout', { p_kind: 'village', p_id: id, p_layout: null })
      if (error) { console.error('Failed to remove your view:', error); setLayoutNote(t('Could not do that. Try again in a moment.')); return }
      mapLayouts.current = { ...mapLayouts.current, own: null }
      setLayoutNote(t('Back to the default look.'))
      return
    }
    const msg = !cottage ? t('Set the default back to the starting village? Personal views stay as they are. You can tap Undo right after.') : t('Go back to the usual village? Your pieces, roads and streams will be taken away. You can tap Undo right after if you change your mind.')
    if (!(await askConfirm(msg))) return
    commit(fromSaved(null, BASE)); setPicked(null); setTrayOpen(false); setLayoutNote(t('Back to the usual village.'))
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
      if (error) { console.error('Failed to load villages:', error); setLoadError(t("We couldn't load this village. Check your connection and try again.")); return }
      const rows = data || []
      setAllVillages(rows)
      if (cottage) return
      const v = rows.find((r) => r.id === id)
      if (!v) { setLoadError(t("We couldn't find this village. It may have closed.")); return }
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
  // small gifts for first steps. Nothing is ever taken away. Visitors see the gifts too,
  // under the cottage's own visit rule (Nov 3, Jade); lanterns stay private.
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
  const yourTurn = tasks ? tasks.active.filter((a) => a.needsYou).length : 0
  const GIFTS = [
    { k: 'home', got: !!home?.village_id, src: '/art/village-build/deco-well.webp', label: 'A well', why: 'for finding your home village', next: 'Find your home village', x: 12, y: 80 },
    { k: 'task', got: !!(tasks && tasks.archived.length), src: '/art/village-build/deco-flowers.webp', label: 'Flowers', why: 'for finishing your first task with a neighbor', next: 'Finish a task with a neighbor', x: 40, y: 93 },
    { k: 'vouch', got: vouched, src: '/art/village-build/deco-lamp.webp', label: 'A garden lamp', why: 'for your first vouch', next: 'Vouch for someone you know, or be vouched for', x: 10, y: 95 },
    { k: 'org', got: (organizations || []).length > 0, src: '/art/village-build/deco-garden.webp', label: 'A vegetable garden', why: 'for joining a group or crew', next: 'Join a group or an emergency crew', x: 58, y: 70 },
  ]
  const myOrgs = (organizations || []).filter((o) => o.kind !== 'group')
  const myGroups = (organizations || []).filter((o) => o.kind === 'group')
  const visits = allVillages.filter((v) => v.is_mine && v.id !== home?.village_id)

  function cottageInfo(k) {
    switch (k) {
      case 'home': return { sub: home?.village_id ? t('Step into {village}', { village: home.name }) : home ? t('Find or start your home village') : t('Loading...') }
      // Nov 10 (map review): one place each for villages, groups and crews, and chats.
      case 'villages': return { sub: home?.village_id ? (visits.length ? t('{home} and {n} more', { home: home.name, n: visits.length }) : home.name) : home ? t('Find or start your home village') : t('Loading...') }
      case 'chats': {
        const n = unreadCount + chatsNew
        return { sub: n ? t('{n} new', { n }) : t('Messages, village chats, and Campfires'), badge: n, lantern: n ? t('{n} new', { n }) : '' }
      }
      case 'visits': return { sub: visits.length ? (visits.length === 1 ? t('1 village where you are a guest') : t('{n} villages where you are a guest', { n: visits.length })) : t('Villages you visit show up here') }
      case 'calendar': return { sub: t('Events and sign-ups near you') }
      case 'orgs': return { sub: myOrgs.length + myGroups.length ? t('{g} groups, {c} crews', { g: myOrgs.length, c: myGroups.length }) : t('Find a group or crew near you') }
      case 'connections': return { sub: t('People you know on VWB') }
      case 'groups': return { sub: myGroups.length ? (myGroups.length === 1 ? t('1 emergency crew') : t('{n} emergency crews', { n: myGroups.length })) : t('Crews that help when disaster hits') }
      case 'cottage': return { sub: t('Private chats with people you chose') }
      case 'campfires': return { sub: t('Team chats in your groups and villages') }
      case 'chat': return { sub: chatsNew ? t('{n} new in your villages and Campfires', { n: chatsNew }) : t('Your village chats'), badge: chatsNew, lantern: chatsNew ? t('{n} new', { n: chatsNew }) : '' }
      case 'help': return offersWaiting || yourTurn
        ? { sub: [offersWaiting ? (offersWaiting === 1 ? t('1 neighbor offered to help.') : t('{n} neighbors offered to help.', { n: offersWaiting })) : '', yourTurn ? (yourTurn === 1 ? t('1 task is waiting on you.') : t('{n} tasks are waiting on you.', { n: yourTurn })) : ''].filter(Boolean).join(' '), badge: offersWaiting + yourTurn, lantern: offersWaiting ? t('Say yes?') : t('Your turn') }
        : { sub: t('Find resources, ask for help, or help a neighbor') }
      case 'me': return { sub: t('Your profile, vouches, and settings') }
      case 'messages': return { sub: unreadCount ? t('{n} unread', { n: unreadCount }) : t('Requests and private messages'), badge: unreadCount, lantern: unreadCount ? t('{n} new', { n: unreadCount }) : '' }
      default: return { sub: '' }
    }
  }
  function cottageTap(k) {
    switch (k) {
      case 'home': goTo(home?.village_id ? '/village/' + home.village_id : '/find-village'); return
      case 'calendar': goTo('/calendar'); return
      case 'connections': goTo('/messages?tab=connections'); return
      // Each picture opens its own page (Oct 22), not the same Messages page.
      // Oct 28: one home for each list, the tabs in Messages.
      case 'cottage': goTo('/messages?tab=cottage'); return
      case 'campfires': goTo('/messages?tab=campfires'); return
      case 'chat': goTo('/village-square'); return
      // One place every time (Oct 22). Waiting tasks show as a badge on the spot and on Your tasks.
      case 'help': goTo('/help-doors'); return
      // Oct 28 (Jade): My Corner on the map opens My Corner, the same as the top bar button.
      case 'me': goTo('/me'); return
      case 'messages': goTo('/messages'); return
      case 'chats': goTo('/messages'); return
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
        {visits.length === 0 && <p>{t('You are not a guest in any other village yet. A neighbor can invite you, or you can visit a sister village.')}</p>}
        {visits.map((v) => row('/village/' + v.id, 'houses', v.name, t('Guest')))}
        <Link className="btn btn-outline btn-full" to="/world">{t('See every village')}</Link>
      </>
      case 'villages': return <>{title}
        {home?.village_id
          ? row('/village/' + home.village_id, 'houses', home.name, t('Your home village'))
          : <Link className="btn btn-primary btn-full" to="/find-village">{t('Find or start your home village')}</Link>}
        {visits.map((v) => row('/village/' + v.id, 'bridge', v.name, t('Guest')))}
        <Link className="btn btn-outline btn-full" to="/world">{t('See every village')}</Link>
      </>
      case 'orgs': return <>{title}
        {myOrgs.length + myGroups.length === 0 && <p>{t('You are not in a group or crew yet.')}</p>}
        {myOrgs.map((o) => row('/orgs/' + o.id, 'people', o.name, t('Group')))}
        {myGroups.map((o) => row('/orgs/' + o.id, 'tent', o.name, t('Emergency crew')))}
        <Link className="btn btn-outline btn-full" to="/world?tab=orgs">{t('See every group')}</Link>
        <Link className="btn btn-outline btn-full" to="/start-group">{t('Start a group or crew')}</Link>
      </>
      case 'groups': return <>{title}
        {myGroups.length === 0 && <p>{t('You are not in an emergency crew yet. Crews help when disaster hits.')}</p>}
        {myGroups.map((o) => row('/orgs/' + o.id, 'tent', o.name, t('Emergency crew')))}
        <Link className="btn btn-outline btn-full" to="/start-group">{t('Start an emergency crew')}</Link>
      </>
      default: return title
    }
  }

  // Where each gift's first step happens.
  const GIFT_STEPS = { home: '/find-village', task: '/skillshare', vouch: '/my-code', org: '/groups' }
  function moveGift(k) {
    closeSheet()
    startArrange('me')
    setTimeout(() => { b.setPicked('gift-' + k); b.setPickTools(true) }, 0)
  }

  function giftsSheet() {
    const got = GIFTS.filter((g) => g.got)
    return <>
      <h2 id="vs-sheet-title"><span aria-hidden="true" className="vs-sheet-ic"><Icon name="sprout" size={36} /></span> {t('Your garden')}</h2>
      <p>{t('Small gifts grow in your garden as you take first steps with your neighbors. They never go away. People who can visit your cottage see them too (Name and visitors decides who).')}</p>
      {/* Oct 28 (Jade): every row does something. A grown gift opens editing with it picked,
          so you can move it. A gift still to grow takes you to the step that grows it. */}
      {got.map((g) => (
        <button key={g.k} type="button" className="vs-item vs-gift-row" onClick={() => moveGift(g.k)}>
          <img src={g.src} alt="" width="48" height="48" /><span><b>{t(g.label)}</b><small>{t(g.why)}. {t('Tap to move it on your map.')}</small></span>
          <span className="vs-gift-go" aria-hidden="true">&#8250;</span>
        </button>
      ))}
      {got.length < GIFTS.length && <h3 className="vs-arrange-h">{t('Still to grow')}</h3>}
      {GIFTS.filter((g) => !g.got).map((g) => (
        <button key={g.k} type="button" className="vs-item vs-gift-row vs-gift-next" onClick={() => { closeSheet(); navigate(GIFT_STEPS[g.k]) }}>
          <img src={g.src} alt="" width="48" height="48" /><span><b>{t(g.next)}</b><small>{t('A gift will grow when you do. Tap to start.')}</small></span>
          <span className="vs-gift-go" aria-hidden="true">&#8250;</span>
        </button>
      ))}
    </>
  }

  function openSheet(s) { lastFocus.current = document.activeElement; setSheet(s) }
  function closeSheet() {
    setSheet(null)
    if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus()
  }

  const mine = !!(village && village.is_mine)
  const nameOf = (vid) => (allVillages.find((v) => v.id === vid) || {}).name || t('A village')

  function info(k) {
    if (cottage) return cottageInfo(k)
    switch (k) {
      case 'charter': return { sub: t('Our story, what we care about, and house rules') }
      case 'sisters': return { sub: sisters.length ? (sisters.length === 1 ? t('1 sister village') : t('{n} sister villages', { n: sisters.length })) : t('No sister villages yet') }
      case 'keeper': return { sub: keeperNames.length ? t('Looked after by {names}', { names: keeperNames.join(', ') }) : life && !life.has_keeper ? t('Keeper wanted: this village needs someone to look after it') : t('The neighbor who looks after this village') }
      case 'chat': return { sub: mine ? (chatUnread ? t('{n} new since you last looked', { n: chatUnread }) : t('Say hello and share news')) : t('Join this village to read its chat'), badge: mine ? chatUnread : 0 }
      case 'campfires': {
        if (!mine) return { sub: life && FIRE_WORDS[life.fire_level] ? t(FIRE_WORDS[life.fire_level]) : t('Join this village to sit at its Campfires') }
        const f = rooms, inF = f.filter((r) => r.i_am_in).length
        const asks = f.reduce((n, r) => n + (r.asks_waiting || 0), 0)
        return { sub: f.length ? t('{n} here', { n: f.length }) + (inF ? ', ' + t('you are in {n}', { n: inF }) : '') + (asks ? ', ' + t('{n} asking to join', { n: asks }) : '') : t('Start the first one'), badge: asks }
      }
      case 'skillshare': return { sub: t('Help nearby: requests and offers') }
      case 'neighbors': return { sub: village && village.member_count ? t('{n} neighbors live here', { n: village.member_count }) : t('A few neighbors so far') }
      case 'cottage': return { sub: t('Private chats with people you chose') }
      case 'messages': return { sub: unreadCount ? t('{n} unread', { n: unreadCount }) : t('Requests and private messages'), badge: unreadCount }
      case 'orgs': {
        const c = orgs.filter((o) => o.kind === 'group').length, g = orgs.length - c
        const parts = [g ? (g === 1 ? t('1 group') : t('{n} groups', { n: g })) : '', c ? (c === 1 ? t('1 crew') : t('{n} crews', { n: c })) : ''].filter(Boolean)
        return { sub: parts.length ? parts.join(', ') : t('None working here yet') }
      }
      default: return { sub: '' }
    }
  }

  // Leaving the page from a map tap asks first (askGoTo). '#corner' scrolls to Your corner.
  const askRef = useRef(null)
  async function goTo(to, opts) {
    const spot = askRef.current
    askRef.current = null
    if (spot && !(await askGoTo(spot, info(spot.k).sub))) return
    if (to === '#corner') { document.getElementById('corner')?.scrollIntoView({ behavior: calmMotion() ? 'auto' : 'smooth', block: 'start' }); return }
    navigate(to, opts)
  }
  // fromMap: tapped on the map picture (asks first). The list under the map goes straight there.
  function tap(spot, fromMap) {
    askRef.current = fromMap ? spot : null
    if (!calmMotion()) {
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
      case 'cottage': goTo('/messages?tab=cottage'); return
      case 'messages': goTo('/messages'); return
      default: openSheet({ k: spot.k })
    }
  }

  function sheetBody(k) {
    if (cottage && k === 'gifts') return giftsSheet()
    if (cottage && k === 'name') return <><h2 id="vs-sheet-title">{t('Name and visitors')}</h2><CottageSettings onSaved={closeSheet} /></>
    const spot = SPOTS.find((s) => s.k === k)
    const title = <h2 id="vs-sheet-title"><span aria-hidden="true" className="vs-sheet-ic"><SpotIcon spot={spot} size={36} /></span> {t(spot.label)}</h2>
    if (cottage) return cottageSheet(k, title)
    if (spot.soon) {
      return <>{title}<p>{t('This part of the village is coming soon.')}</p></>
    }
    switch (k) {
      case 'sisters':
        return <>{title}
          {sisters.length === 0 && <p>{t('This village has no sister villages yet. The keeper can ask another village from the World map.')}</p>}
          {sisters.map((sid) => (
            <div key={sid} className="vs-sister">
              <button type="button" className="vs-row" onClick={() => { setSheet(null); navigate('/village/' + sid) }}>
                <span aria-hidden="true"><Icon name="houses" /></span> {nameOf(sid)}<small>{t('Sister village')}</small>
              </button>
              <SisterCampfireButton campfire={sisterFires.find((c) => c.village_a === sid || c.village_b === sid)} />
            </div>
          ))}
          <p className="vs-note">{t('Members of a sister village can join this one as a guest.')}</p>
        </>
      case 'campfires':
        return <>{title}<VillageRooms villageId={id} isMember={mine} isKeeper={!!(keepers && keepers.i_am_keeper)} onChanged={loadRooms} /></>
      case 'keeper':
        return <>{title}
          {!mine && <p>{t('Join this village to see who looks after it.')}</p>}
          {mine && keeperNames.length === 0 && (life && !life.has_keeper
            ? <p>{t('This village has no Keeper right now. If you would like to look after it, tell a Hope Ambassador or a VWB admin. They can ask you to be Keeper.')}</p>
            : <p>{t('Loading the keeper...')}</p>)}
          {mine && keeperNames.map((n) => <div key={n} className="vs-item"><b>{n}</b><small>{t('Keeper')}</small></div>)}
          {mine && keepers && keepers.i_am_keeper && <>
            <p className="vs-note">{t('You are a keeper here. You post announcements in the village chat and can hand the role to another member.')}</p>
            <button type="button" className="btn btn-primary btn-full" onClick={() => { setSheet(null); navigate('/village/' + id + '/keeper') }}><Icon name="toolbox" /> {t('Open keeper tools')}</button>
          </>}
        </>
      case 'chat':
        return <>{title}<p>{t("We couldn't find this village's chat. Try again in a moment.")}</p></>
      case 'neighbors':
        return <>{title}
          <p>{info('neighbors').sub}.</p>
          {mine && board
            ? <><p className="vs-note">{t('See who is here, vouch, or send a message request from the People button in the village chat.')}</p>
                <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/village-square?board=' + board.id)}>{t('Open the village chat')}</button></>
            : <p className="vs-note">{t('Join this village to see who lives here.')}</p>}
        </>
      case 'orgs': {
        const crews = orgs.filter((o) => o.kind === 'group'), groups = orgs.filter((o) => o.kind !== 'group')
        return <>{title}
          <h3 className="vs-sheet-sub">{t('Groups')}</h3>
          {groups.length === 0 && <p className="vs-note">{t('No groups work in this village yet.')}</p>}
          {groups.map((o) => (
            <button key={o.id} type="button" className="vs-row" onClick={() => { setSheet(null); navigate('/orgs/' + o.id) }}>
              <span aria-hidden="true"><Icon name="people" /></span> {o.name}<small>{t('Group')}</small>
            </button>
          ))}
          <h3 className="vs-sheet-sub">{t('Emergency crews')}</h3>
          <p className="vs-note">{t('Emergency crews show up when disaster hits here: flooding, storms, mold, fires. They plan together ahead of time.')}</p>
          {crews.length === 0 && <p className="vs-note">{t('No crews cover this village yet.')}</p>}
          {crews.map((o) => (
            <button key={o.id} type="button" className="vs-row" onClick={() => { setSheet(null); navigate('/orgs/' + o.id) }}>
              <span aria-hidden="true"><Icon name="tent" /></span> {o.name}<small>{t('Emergency crew')}</small>
            </button>
          ))}
          <Link className="btn btn-outline btn-full" to={'/start-group?village=' + id}>{t('Start a crew for {village}', { village: village ? village.name : t('this village') })}</Link>
        </>
      }
      default: return title
    }
  }

  // Simple view: the places most people need, in this order.
  const simpleMain = cottage ? ['messages', 'help', 'home', 'chat', 'me'] : ['chat', 'neighbors', 'skillshare', 'orgs']
  function roomRow(s) {
    const i = info(s.k)
    return (
      <button key={s.k} type="button" className={'vs-room' + (s.soon ? ' vs-soon' : '')} onClick={() => tap(s)}
        data-tip={s.k === 'skillshare' ? t('Neighbors who need a hand, and free things to share') : (typeof i.sub === 'string' ? i.sub : undefined)}>
        <span className="vs-room-ic" aria-hidden="true"><SpotIcon spot={s} size={40} /></span>
        <span className="vs-room-text"><b>{t(s.label)}{i.badge > 0 && <span className="vs-dot" aria-label={t('New')} />}</b><small>{s.k === 'skillshare' ? t('Neighbors who need a hand, and free things to share') : i.sub}</small></span>
        <span className="vs-go" aria-hidden="true">&#8250;</span>
      </button>
    )
  }

  if (loadError) {
    return <div className="vs-page vs-page-path"><div className="vs-top"><Link className="vs-crumb" to="/world">{t('World')}</Link></div><p className="vs-error" role="alert">{loadError}</p></div>
  }
  if (!cottage && !village) {
    return <div className="vs-page vs-page-path"><p className="vs-loading" role="status">{t('Loading the village...')}</p></div>
  }


  return (
    <div className="vs-page vs-page-path">
      {cottage ? (
        <div className="vs-title">
          <h1>{profile?.cottage_name || <>{t('My Cottage')}{plainName('My Cottage') && <small className="skin-plain"> {plainName('My Cottage')}</small>}</>}</h1>
          <p className="vs-cottage-sub">{profile?.cottage_name ? t('My Cottage') + (plainName('My Cottage') ? ' ' + plainName('My Cottage') : '') + '. ' : ''}{simple ? t('Everything you are part of, in one place.') : t('Everything you are part of, in one place.') + ' ' + visitorsLine(profile?.cottage_visitors || 'nobody')}</p>
          <div className="vs-chips">
            {home?.village_id
              ? <Link className="vs-chip vs-chip-in vs-chip-link" to={'/village/' + home.village_id}>{t('Home: {village}', { village: home.name })}</Link>
              : home && <Link className="vs-chip vs-chip-link" to="/find-village">{t('Find your home village')}</Link>}
            {/* Nov 8 (Jade): Your garden sits on the same line as your home village. */}
            {!arrange && (
              <button type="button" className="vs-gifts-btn" onClick={() => openSheet({ k: 'gifts' })}>
                <Icon name="sprout" size={28} /> {t('Your garden: {n} of {total} gifts grown', { n: GIFTS.filter((g) => g.got).length, total: GIFTS.length })}
              </button>
            )}
          </div>
        </div>
      ) : (<>

      <div className="vs-title">
        {/* Round C (Nov 10): "Ringgold village", not just "Ringgold, GA". */}
        <h1>{t('{name} village', { name: (village.name || '').replace(/,\s*[A-Za-z]{2}\s*$/, '') })}</h1>
        <div className="vs-chips">
          {mine && !isGuest && (profile?.home_village_id === village.id ? <span className="vs-chip vs-chip-in">{t('Your home village')}</span> : <span className="vs-chip vs-chip-in">{t('You are in')}</span>)}
          {mine && isGuest && <span className="vs-chip vs-chip-guest">{t('Guest')}</span>}
          {mine && keepers && keepers.i_am_keeper && <span className="vs-chip vs-chip-in">{t('Keeper')}</span>}
          {!mine && <span className="vs-chip">{t('Not joined yet')}</span>}
          <span className="vs-chip">{village.member_count ? t('{n} neighbors', { n: village.member_count }) : t('Just starting')}</span>
          {village.towns && (() => {
            // Oct 22: the town list folds into one chip so the map starts sooner. Tap to see them all.
            const n = village.towns.split(',').filter((tw) => tw.trim()).length
            return n > 1
              ? <button type="button" className="vs-chip vs-chip-btn-towns" aria-expanded={showTowns} onClick={() => setShowTowns((v) => !v)}>{t('{n} towns', { n })} {showTowns ? '\u25B4' : '\u25BE'}</button>
              : <span className="vs-chip">{village.towns}</span>
          })()}
        </div>
        {village.towns && showTowns && <p className="vs-towns-list">{village.towns}</p>}
      </div>

      </>)}

      {keeperAsk && (
        <Link className="vs-ask" to={'/keeper-offer/' + keeperAsk.offer_id}>
          <b>{t('{name} asked you to be Keeper of {village}', { name: keeperAsk.asked_by_name, village: village.name })}</b>
          <small>{t('Tap to say yes or no. Nothing changes until you answer.')}</small>
        </Link>
      )}

      {/* Oct 28 (Jade): the Customize drawer folded into the Edit button on the map. */}

      {/* Simple view (Oct 27): no map at all, so its pictures never download. */}
      {!simple && <div {...sceneProps(b, 'vs-scene vs-scene-path')}>
       {/* Oct 28: the same picture, soft and blurred, fills any space around the map. */}
       <img className="vs-ground-blur" src={backgroundSrc(world.bg)} alt="" aria-hidden="true" draggable="false" />
       <div {...zoomLayer(b)}>
        <img className="vs-ground" src={backgroundSrc(world.bg)} alt="" width="720" height="1080" fetchpriority="high" />
        <MapLayers b={b} />
        {cottage && GIFTS.filter((g) => g.got).map((g) => {
          const gs = placed(GIFT_SPOTS.find((x) => x.k === 'gift-' + g.k))
          if (!arrange && isHidden(gs.k)) return null
          const img = <img className={'vs-gift-img' + (gs.flip ? ' vs-flip' : '')} src={g.src} alt="" width="64" height="64" draggable="false" />
          const style = { left: gs.x + '%', top: gs.y + '%', '--s': gs.s || 1, zIndex: placeLayer(gs.z) }
          return arrange
            ? <button key={gs.k} type="button" data-spot={gs.k} className={'vs-gift vs-gift-edit' + (picked === gs.k ? ' vs-picked' : '') + (isHidden(gs.k) ? ' vs-hidden' : '')} style={style}
                aria-label={t(gs.label)} onPointerDown={(e) => dragStart(e, gs.k)} onClick={(e) => { if (e.detail === 0) pickByKey(gs.k) }}>{img}</button>
            : <span key={gs.k} className="vs-gift" style={style}>{img}</span>
        })}
        {SPOTS.filter((s0) => arrange || !isHidden(s0.k)).map((s0) => {
          const s = placed(s0)
          const i = info(s.k)
          return (
            <button key={s.k} type="button" data-spot={s.k}
              className={'vs-el' + (s.soon || (!cottage && !mine && GATED.includes(s.k)) ? ' vs-soon' : '') + (s.k === 'campfires' ? ' vs-flame' + (life ? ' vs-fire-' + life.fire_level : '') : '') + (bump === s.k ? ' vs-bump' : '') + (arrange && picked === s.k ? ' vs-picked' : '') + (arrange && isHidden(s.k) ? ' vs-hidden' : '')}
              style={{ left: s.x + '%', top: s.y + '%', '--s': (s.s || 1) * (s.k === 'campfires' && life ? FIRE_SIZE[life.fire_level] || 1 : 1), zIndex: placeLayer(s.z) }}
              aria-label={t(s.label) + '. ' + i.sub}
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
              <span className="vs-lab">{s.k === 'keeper' && life && !life.has_keeper ? t('Keeper wanted') : t(s.short)}</span>
              {cottage && i.lantern
                ? <span className="vs-lantern-tag" aria-hidden="true">{i.lantern}</span>
                : i.badge > 0 && <span className="vs-badge" aria-hidden="true">{i.badge > 9 ? '9+' : i.badge}</span>}
            </button>
          )
        })}
       </div>
        {/* Oct 28 (Jade): Edit map sits on the map itself, top corner, on phones and
            computers, so it's always in view. Keepers choose: their own view or the
            default look for everyone. */}
        {/* Oct 28 (Jade): one Edit button holds everything that used to be in Customize:
            arranging (your own view, or the default for Keepers) and name tags. */}
        {!arrange && (
          <div className="vs-edit-fab-wrap" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" className="vs-edit-fab" data-tour="village-arrange" aria-haspopup="menu" aria-expanded={editMenu}
              onClick={() => setEditMenu((v) => !v)}>
              <ToolIcon name="move" /><span>{cottage ? t('Edit cottage') : t('Edit map')}</span>
            </button>
            {editMenu && (
              <div className="vs-edit-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setEditMenu(false); startArrange('me') }}>
                  <b>{cottage ? t('Arrange and build') : keeperChoice ? t('My own view') : t('Arrange my view')}</b>
                  <small>{cottage ? t('Move places, add trees, draw roads and streams.') : t('Only you see it. Move places, add trees, draw roads.')}</small>
                </button>
                {keeperChoice && (
                  <button type="button" role="menuitem" onClick={() => { setEditMenu(false); startArrange('everyone') }}>
                    <b>{t('Default for everyone')}</b><small>{t('New neighbors start with this.')}{mapLoaded > 0 && mapLayouts.current.own ? ' ' + t('You see your own view, so you will not see the new default.') : ''}</small>
                  </button>
                )}
                {cottage && Object.prototype.hasOwnProperty.call(profile || {}, 'cottage_visitors') && (
                  <button type="button" role="menuitem" onClick={() => { setEditMenu(false); openSheet({ k: 'name' }) }}>
                    <b>{t('Name and visitors')}</b><small>{t('Name your cottage. Choose who can visit it.')}</small>
                  </button>
                )}
                <button type="button" role="menuitem" onClick={() => { setEditMenu(false); saveLabels(b.namesShowing ? 'hide' : 'show') }}>
                  <b>{b.namesShowing ? t('Hide name tags') : t('Show name tags')}</b><small>{t('On every map, for you.')}</small>
                </button>
              </div>
            )}
          </div>
        )}
        {/* The magnifier floats on the map, top left, so it is always in reach. */}
        <div className="vs-zoom-fab-wrap" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="vs-zoom-btn vs-zoom-one" aria-pressed={b.zoom.z > 1} onClick={() => (b.zoom.z > 1 ? b.zoomReset() : b.zoomBy(2))}>
            <ToolIcon name={b.zoom.z > 1 ? 'unmagnify' : 'magnify'} /><span>{b.zoom.z > 1 ? t('Whole map') : t('Zoom in')}</span>
          </button>
        </div>
        <div className="vs-fade" />
      </div>}
      {/* Name tags: on phones they show; with a mouse they show when you point at
          a place. This button turns them on or off for you, on every map.
          It sits under the map so it never covers a place. */}
      {!simple && <ScrollCue b={b} />}

      <p className="vs-hint">{arrange ? (cottage ? t('Arrange and build your cottage map. Your changes are saved as you go.') : arrangeFor === 'everyone' ? t('You are setting the default look for {village}. Personal views stay as they are. Changes are saved as you go.', { village: village.name }) : t('You are arranging your own view. Only you see it. Changes are saved as you go.')) : cottage ? t('Tap anything on your map to go there.') : t('Tap anything in the village to go there.')}</p>

      <MapToolbar b={b} more={<>
        <button type="button" className="btn btn-outline btn-full" onClick={resetLayout}>{cottage ? t('Back to the usual cottage') : arrangeFor === 'everyone' ? t('Default back to the starting village') : t('Back to the default look')}</button>
        {cottage && isFounder && <button type="button" className="btn btn-outline btn-full" onClick={copyLayout}>{t('Copy layout for everyone (founder)')}</button>}
        <p className="vs-note">{cottage ? t('Your cottage is saved on your account.') + ' ' + visitorsLine(profile?.cottage_visitors || 'nobody') : arrangeFor === 'everyone' ? t('This is the default look. Anyone who arranged their own view keeps theirs.') : t('Your view is saved on your account and only you see it.')} {t('Hidden places are still in the list under the map.')}</p>
      </>} />

      <div className="vs-body">
        {!cottage && !mine && <button type="button" className="btn btn-primary btn-full vs-big" onClick={() => navigate('/find-village?join=' + id)}>{t('Join {village}', { village: village.name })}</button>}
        {/* Nov 8 (Jade): Events near you moved up beside Keeper tools, so the page fits without scrolling. */}
        {!cottage && (
          <div className="vs-top-btns">
            {mine && keepers && keepers.i_am_keeper && <button type="button" data-tour="keeper-tools" className="btn btn-outline btn-full vs-big" onClick={() => navigate('/village/' + id + '/keeper')}><span aria-hidden="true"><Icon name="toolbox" /></span> {t('Keeper tools')}</button>}
            <Link className="btn btn-outline btn-full vs-big" to="/calendar"><span aria-hidden="true"><Icon name="calendar" /></span> {t('Events near you')}</Link>
          </div>
        )}
        {/* Your cottage: Today (what needs you, shortcuts, coming up) sits right under the map (Oct 22). */}
        {cottage && <section id="today" className="vs-panel vs-today" aria-label={t('Today')}><Dashboard embedded /></section>}
        {!cottage && <div className="vs-help">
          <button type="button" className="vs-big vs-find" onClick={() => navigate('/ask')}>{t('Ask for Help')}</button>
          <button type="button" className="vs-big vs-offer" onClick={() => navigate('/skillshare')}>{t('Offer Help')}</button>
        </div>}
        <h2 className="vs-pick-h">{t('Or pick from the list')}</h2>
        {/* Simple view (Oct 27): the main places first, the rest folded under More. */}
        {simple ? <>
          <div className="vs-list">{SPOTS.filter((s) => simpleMain.includes(s.k)).sort((a, b) => simpleMain.indexOf(a.k) - simpleMain.indexOf(b.k)).map(roomRow)}</div>
          {SPOTS.some((s) => !simpleMain.includes(s.k)) && (
            <details className="op-simple-more">
              <summary>{cottage ? t('More') : t('More about {village}', { village: village.name })}</summary>
              <div className="vs-list">{SPOTS.filter((s) => !simpleMain.includes(s.k)).map(roomRow)}</div>
            </details>
          )}
        </> : <div className="vs-list">{SPOTS.map(roomRow)}</div>}
        {/* Your cottage already has Calendar in its list, so no separate Events button there (Nov 8). */}
        {/* Oct 28 (Jade): My Corner is no longer repeated under the cottage map. The My Corner button opens it. */}
      </div>

      {sheet && (
        <div className="vs-shade" onClick={(e) => { if (e.target === e.currentTarget) closeSheet() }}>
          <div className="vs-sheet" role="dialog" aria-modal="true" aria-labelledby="vs-sheet-title" ref={sheetRef}>
            <button type="button" className="vs-sheet-close" onClick={closeSheet}><ToolIcon name="down" /><span>{t('Close')}</span></button>
            {sheetBody(sheet.k)}
          </div>
        </div>
      )}
    </div>
  )
}
