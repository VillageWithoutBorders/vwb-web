import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import SpotIcon from '../components/SpotIcon'
import { useAuth } from '../context/AuthContext'
import { useUnreadCount } from '../context/UnreadCountContext'
import { loadMyTaskOverview } from '../utils/myTasks'
import { VILLAGE_SPOTS, COTTAGE_SPOTS, LIFE_ART, FIRE_SIZE, FIRE_WORDS, DECOR_PIECES, GROUNDS } from '../data/worldElements'
import { askConfirm } from '../components/AdminDialog'
import SisterCampfireButton from '../components/SisterCampfireButton'
import VillageRooms from '../components/VillageRooms'
import '../village-scene.css'
import Icon from '../components/Icon'

// The Village page: one village as a little world. Every element on the
// hills is a button that goes to its own page. A plain list sits below for
// anyone who would rather tap a list. Names follow the VWB Vocabulary sheet.
// Route: /village/:id

// Roads you draw: fewer points (so the saved layout stays small), then a
// smooth curve through them. Points are percent of the map (x, y), and the
// map is 2 wide by 3 tall, so y counts 1.5 times as far.
function simplify(pts, eps) {
  if (pts.length < 3) return pts
  const d = (p, a, b) => {
    const ax = a[0], ay = a[1] * 1.5, bx = b[0], by = b[1] * 1.5, px = p[0], py = p[1] * 1.5
    const len = Math.hypot(bx - ax, by - ay) || 1
    return Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / len
  }
  let max = 0, at = 0
  for (let i = 1; i < pts.length - 1; i++) { const v = d(pts[i], pts[0], pts[pts.length - 1]); if (v > max) { max = v; at = i } }
  if (max <= eps) return [pts[0], pts[pts.length - 1]]
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)]
}
function roadPath(pts) {
  const P = pts.map(([x, y]) => [x, y * 1.5])
  if (P.length < 2) return ''
  let dd = 'M' + P[0][0] + ' ' + P[0][1]
  for (let i = 1; i < P.length - 1; i++) {
    const mx = (P[i][0] + P[i + 1][0]) / 2, my = (P[i][1] + P[i + 1][1]) / 2
    dd += ' Q' + P[i][0] + ' ' + P[i][1] + ' ' + mx.toFixed(1) + ' ' + my.toFixed(1)
  }
  const L = P[P.length - 1]
  return dd + ' L' + L[0] + ' ' + L[1]
}
function Road({ pts, drawing }) {
  const dd = roadPath(pts)
  return (
    <g className={drawing ? 'vs-road-live' : undefined}>
      <path d={dd} fill="none" stroke="#9c8250" strokeOpacity="0.45" strokeWidth="6.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d={dd} fill="none" stroke="#dcc48e" strokeWidth="5.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d={dd} fill="none" stroke="#efe0b4" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="0.6 2.4" />
    </g>
  )
}

// Water: soft, uneven banks (a little noise moves the edges), shallow and deep
// water in layers, and scattered glints that drift slowly downstream.
function StreamDefs() {
  return (
    <defs>
      <filter id="vs-water" filterUnits="userSpaceOnUse" x="-5" y="-5" width="110" height="160">
        <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="7" />
        <feDisplacementMap in="SourceGraphic" scale="4" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="vs-bank" filterUnits="userSpaceOnUse" x="-5" y="-5" width="110" height="160">
        <feTurbulence type="fractalNoise" baseFrequency="0.1" numOctaves="2" seed="3" />
        <feDisplacementMap in="SourceGraphic" scale="5" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feGaussianBlur in="d" stdDeviation="0.7" />
      </filter>
      <filter id="vs-glint" filterUnits="userSpaceOnUse" x="-5" y="-5" width="110" height="160">
        <feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="1" seed="11" />
        <feDisplacementMap in="SourceGraphic" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feGaussianBlur in="d" stdDeviation="0.15" />
      </filter>
    </defs>
  )
}
function Stream({ pts, drawing }) {
  const dd = roadPath(pts)
  const line = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <g className={'vs-stream' + (drawing ? ' vs-road-live' : '')}>
      <path d={dd} {...line} stroke="#5f7442" strokeOpacity="0.5" strokeWidth="10.5" filter="url(#vs-bank)" />
      <path d={dd} {...line} stroke="#9cc4a6" strokeWidth="8" filter="url(#vs-water)" />
      <path d={dd} {...line} stroke="#5aa3a4" strokeWidth="6.2" filter="url(#vs-water)" />
      <path d={dd} {...line} stroke="#347f8b" strokeOpacity="0.75" strokeWidth="3.6" filter="url(#vs-bank)" />
      <g filter="url(#vs-glint)">
        <path className="vs-ripple" d={dd} {...line} stroke="#effaf5" strokeOpacity="0.7" strokeWidth="0.45" strokeDasharray="1.4 4.5 0.6 7 2 5" transform="translate(0.4,-1.6)" />
        <path className="vs-ripple vs-ripple-2" d={dd} {...line} stroke="#effaf5" strokeOpacity="0.5" strokeWidth="0.35" strokeDasharray="0.8 6 1.8 3.5 0.5 8" transform="translate(-0.6,1.4)" />
        <path className="vs-ripple vs-ripple-3" d={dd} {...line} stroke="#d6f0ea" strokeOpacity="0.45" strokeWidth="0.3" strokeDasharray="0.6 9 1 5" transform="translate(0.2,0.2)" />
      </g>
    </g>
  )
}

// Small line pictures for the arrange tools (drawn here so they stay crisp).
// Village places only members can open. Visitors see a closed gate on them (Oct 22).
const GATED = ['chat', 'campfires', 'sidechats', 'keeper', 'neighbors']

const TOOL_PATHS = {
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  add: 'M12 5v14M5 12h14',
  road: 'M8 21c0-5 8-6 8-11S13 3 11 3M5 21c0-6 8-7 8-12M19 21c0-4-2-6-4-8',
  stream: 'M3 8c3-2 6 2 9 0s6-2 9 0M3 13c3-2 6 2 9 0s6-2 9 0M3 18c3-2 6 2 9 0s6-2 9 0',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  check: 'M4 12l5 5L20 6',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  flip: 'M12 3v18M9 7L4 12l5 5M15 7l5 5-5 5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', left: 'M15 6l-6 6 6 6', right: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  tag: 'M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01',
  turnl: 'M4 4v5h5M4.6 9A8 8 0 1 1 6 17',
  turnr: 'M20 4v5h-5M19.4 9A8 8 0 1 0 18 17',
}
function ToolIcon({ name }) {
  return <svg className="vs-tool-ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={TOOL_PATHS[name]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

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
  const SPOTS = cottage ? COTTAGE_SPOTS
    : isHome ? VILLAGE_SPOTS.map((v) => (v.k === 'me' ? { ...v, label: 'Your cottage', short: 'Your cottage' } : v))
    : VILLAGE_SPOTS
  const { unreadCount } = useUnreadCount()

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

  // Arrange and build my village (everyone). Your own village map, saved on
  // your account (helper_profiles.village_layout) so it follows you to any
  // device, and kept on this device too in case saving fails. It shows the
  // same way in every village you open. Nobody else sees it.
  //   spots:  where each working place sits (move, size, flip, hide)
  //   decor:  pieces you add (trees, pond, fence, bridge...)
  //   roads:  paths you draw with your finger
  //   streams: water you draw with your finger (under the roads, so a road can cross it)
  //   ground: 'path' (the painted path) or 'open' (an open meadow)
  // Hidden places stay in the list under the map.
  // The founder can also copy the place layout to make it everyone's starting layout.
  const LAYOUT_KEY = 'vwb_village_layout'
  const sceneRef = useRef(null)
  const dragRef = useRef(null)
  const drawRef = useRef(null)
  const drawKindRef = useRef('road')
  const saveTimer = useRef(null)
  const [arrange, setArrange] = useState(false)
  const [tool, setTool] = useState('move') // move | road | stream
  const [trayOpen, setTrayOpen] = useState(false)
  const [showTowns, setShowTowns] = useState(false)
  // Add tray tabs: Pieces, Ground, More (hidden places and start over).
  const [trayTab, setTrayTab] = useState('pieces')
  const historyRef = useRef([])
  const [canUndo, setCanUndo] = useState(false)
  const [picked, setPicked] = useState(null) // a place key, or 'd:' + decor id
  // Phones: when the picked piece is high on the screen, the tool panel drops to the bottom so it does not cover it.
  const [panelLow, setPanelLow] = useState(false)
  // The picked piece's tools open on a tap, not while you drag it (Jade, Oct 22).
  const [pickTools, setPickTools] = useState(false)
  const [layoutNote, setLayoutNote] = useState('')
  const [drawing, setDrawing] = useState(null) // points of the road being drawn
  const fromSaved = (v) => {
    if (!v || typeof v !== 'object') return { spots: {}, decor: [], roads: [], streams: [], ground: 'path', labels: 'auto' }
    if (!v.spots && !v.decor && !v.roads && !v.streams && !v.ground && !v.labels) return { spots: v, decor: [], roads: [], streams: [], ground: 'path', labels: 'auto' } // older device copy
    const list = (a) => (Array.isArray(a) ? a : [])
    return { spots: v.spots || {}, decor: list(v.decor), roads: list(v.roads), streams: list(v.streams), ground: GROUNDS.some((g) => g.k === v.ground) ? v.ground : 'path', labels: ['show', 'hide'].includes(v.labels) ? v.labels : 'auto' }
  }
  const [world, setWorld] = useState(() => {
    if (!cottage) return fromSaved(null)
    try { return fromSaved(JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null')) } catch { return fromSaved(null) }
  })
  const worldRef = useRef(world)
  worldRef.current = world
  const layout = world.spots
  // The account's saved layout wins once the profile has loaded.
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
  useEffect(() => {
    if (cottage) { if (accountLayout && typeof accountLayout === 'object') setWorld(fromSaved(accountLayout)); return }
    if (arrange) return
    const { own, shared } = mapLayouts.current
    setWorld({ ...fromSaved(own || shared), labels: fromSaved(accountLayout).labels })
  }, [accountLayout, cottage, mapLoaded, arrange]) // eslint-disable-line react-hooks/exhaustive-deps

  // Name tags are one choice for every map, saved with your account.
  function saveLabels(labels) {
    if (cottage) { saveWorld({ ...worldRef.current, labels }); return }
    const next = { ...worldRef.current, labels }
    setWorld(next); worldRef.current = next
    const acct = { ...fromSaved(accountLayout), labels }
    const empty = Object.keys(acct.spots).length === 0 && acct.decor.length === 0 && acct.roads.length === 0 && acct.streams.length === 0 && acct.ground === 'path' && acct.labels === 'auto'
    supabase.rpc('set_my_village_layout', { p_layout: empty ? null : acct }).then(({ error }) => {
      if (error) { console.error('Failed to save name tags choice:', error); return }
      if (refreshProfile) refreshProfile()
    })
  }

  // A village page's own view or shared look.
  function saveMapLayout(next) {
    const forWho = arrangeFor
    const body = { spots: next.spots, decor: next.decor, roads: next.roads, streams: next.streams, ground: next.ground }
    const empty = Object.keys(body.spots).length === 0 && body.decor.length === 0 && body.roads.length === 0 && body.streams.length === 0 && body.ground === 'path'
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
    if (!cottage) {
      const { own, shared } = mapLayouts.current
      setWorld({ ...fromSaved(forWho === 'everyone' ? shared : (own || shared)), labels: worldRef.current.labels })
    }
    historyRef.current = []; setCanUndo(false)
    setArrangeFor(forWho); setArrange(true); setTool('move'); setTrayTab('pieces'); setLayoutNote(''); setPicked(null)
    setTimeout(() => sceneRef.current && sceneRef.current.scrollIntoView({ block: 'start', behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 120)
  }

  function saveWorld(nextIn) {
    setWorld(nextIn)
    worldRef.current = nextIn
    if (!cottage) { saveMapLayout(nextIn); return }
    const next = nextIn
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)) } catch { /* private mode */ }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const empty = Object.keys(next.spots).length === 0 && next.decor.length === 0 && next.roads.length === 0 && next.streams.length === 0 && next.ground === 'path' && next.labels === 'auto'
      const { error } = await supabase.rpc('set_my_village_layout', { p_layout: empty ? null : next })
      if (error) {
        // Before the database step is run, the layout simply stays on this device.
        if (error.code !== 'PGRST202') { console.error('Failed to save village layout:', error); setLayoutNote('Saved on this device only. It will try again next time you change something.') }
        return
      }
      if (refreshProfile) refreshProfile()
    }, 800)
  }
  // Undo: every change keeps the village as it was just before (last 30).
  function remember(before) {
    historyRef.current = [...historyRef.current.slice(-29), before || worldRef.current]
    setCanUndo(true)
  }
  function commit(next) { remember(); saveWorld(next) }
  function undo() {
    const prev = historyRef.current.pop()
    setCanUndo(historyRef.current.length > 0)
    if (!prev) return
    saveWorld(prev)
    if (picked && picked.startsWith('d:') && !prev.decor.some((d) => d.id === picked.slice(2))) setPicked(null)
    setLayoutNote('Undone.')
  }
  const saveLayout = (spots) => commit({ ...worldRef.current, spots })
  const placed = (s) => (layout[s.k] ? { ...s, ...layout[s.k] } : s)
  const isHidden = (k) => !!(layout[k] && layout[k].hide)
  const round1 = (n) => Math.round(n * 2) / 2
  const pickedDecor = picked && picked.startsWith('d:') ? world.decor.find((d) => d.id === picked.slice(2)) : null
  function scenePoint(e) {
    const r = sceneRef.current.getBoundingClientRect()
    return [Math.min(99, Math.max(1, ((e.clientX - r.left) / r.width) * 100)), Math.min(99, Math.max(1, ((e.clientY - r.top) / r.height) * 100))]
  }
  function dragStart(e, key) {
    if (!arrange || tool !== 'move') return
    e.preventDefault(); e.stopPropagation()
    setPicked(key); setLayoutNote(''); setPickTools(false)
    dragRef.current = { key, moved: false, before: worldRef.current }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* older browsers */ }
  }
  function dragMove(e) {
    if (!arrange || !sceneRef.current) return
    if (drawRef.current) {
      const [x, y] = scenePoint(e)
      const pts = drawRef.current
      const last = pts[pts.length - 1]
      if (Math.hypot(x - last[0], (y - last[1]) * 1.5) > 1.2) { pts.push([round1(x), round1(y)]); setDrawing([...pts]) }
      return
    }
    if (!dragRef.current) return
    const [x, y] = scenePoint(e)
    const key = dragRef.current.key
    dragRef.current.moved = true
    const w = worldRef.current
    const next = key.startsWith('d:')
      ? { ...w, decor: w.decor.map((d) => (d.id === key.slice(2) ? { ...d, x: round1(x), y: round1(y) } : d)) }
      : { ...w, spots: { ...w.spots, [key]: { ...(w.spots[key] || {}), x: round1(Math.min(97, Math.max(3, x))), y: round1(Math.min(97, Math.max(3, y))) } } }
    worldRef.current = next
    setWorld(next)
  }
  function dragEnd() {
    if (drawRef.current) {
      const pts = simplify(drawRef.current, 0.7)
      drawRef.current = null
      setDrawing(null)
      if (pts.length >= 2) {
        const w = worldRef.current
        const kind = drawKindRef.current === 'stream' ? 'streams' : 'roads'
        if (w[kind].length >= 30) { setLayoutNote(kind === 'streams' ? 'That is a lot of streams. Take one away to draw another.' : 'That is a lot of roads. Take one away to draw another.'); return }
        commit({ ...w, [kind]: [...w[kind], pts] })
      }
      return
    }
    if (!dragRef.current) return
    const { moved, before } = dragRef.current
    dragRef.current = null
    if (moved) { remember(before); saveWorld(worldRef.current) }
    else setPickTools(true) // a tap: show its tools
  }
  function roadStart(e) {
    if (!arrange || (tool !== 'road' && tool !== 'stream') || !sceneRef.current) return
    drawKindRef.current = tool
    e.preventDefault()
    const [x, y] = scenePoint(e)
    drawRef.current = [[round1(x), round1(y)]]
    setDrawing(drawRef.current)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* older browsers */ }
  }
  function changePicked(change) {
    if (!picked) return
    if (pickedDecor) { commit({ ...world, decor: world.decor.map((d) => (d.id === pickedDecor.id ? { ...d, ...change } : d)) }); return }
    saveLayout({ ...layout, [picked]: { ...(layout[picked] || {}), ...change } })
  }
  function resize(by) {
    if (!picked) return
    const cur = pickedDecor ? pickedDecor.s || 1 : placed(SPOTS.find((v) => v.k === picked)).s || 1
    changePicked({ s: Math.min(pickedDecor ? 3 : 1.8, Math.max(0.3, Math.round((cur + by) * 10) / 10)) })
  }
  // Turn the picked piece a little (Oct 22). Saved as r, in degrees; straight is 0.
  function turnPicked(by) {
    if (!picked) return
    const cur = pickedDecor ? pickedDecor.r || 0 : (layout[picked] && layout[picked].r) || 0
    let r = ((cur + by + 540) % 360) - 180
    if (Math.abs(r) < 1) r = 0
    changePicked({ r })
  }
  function flipPicked() {
    if (!picked) return
    changePicked({ flip: !(pickedDecor ? pickedDecor.flip : layout[picked] && layout[picked].flip) })
  }
  function addDecor(piece) {
    if (world.decor.length >= 80) { setLayoutNote('Your village is full. Take a piece away to add another.'); return }
    const id = Math.random().toString(36).slice(2, 8)
    // Land it in the middle of the part of the map you can see.
    let y = 50
    const r = sceneRef.current && sceneRef.current.getBoundingClientRect()
    if (r && r.height) y = Math.min(90, Math.max(10, (((window.innerHeight / 2) - r.top) / r.height) * 100))
    commit({ ...world, decor: [...world.decor, { id, k: piece.k, x: 50, y: round1(y), s: piece.s }] })
    setTool('move'); setPicked('d:' + id); setPickTools(true); setTrayOpen(false)
    setLayoutNote(piece.label + ' added. Drag it, or use the arrows, to put it where you want.')
  }
  function removePicked() {
    if (!pickedDecor) return
    commit({ ...world, decor: world.decor.filter((d) => d.id !== pickedDecor.id) })
    setPicked(null)
  }
  async function copyLayout() {
    const text = 'Village layout:\n' + SPOTS.map((v) => { const p = placed(v); return v.k + ': x ' + p.x + ', y ' + p.y + ', size ' + (p.s || 1) + (p.flip ? ', flipped' : '') + (isHidden(v.k) ? ', hidden' : '') }).join('\n')
      + (world.decor.length || world.roads.length || world.streams.length ? '\nVillage build: ' + JSON.stringify({ decor: world.decor, roads: world.roads, streams: world.streams, ground: world.ground }) : '')
    try { await navigator.clipboard.writeText(text); setLayoutNote('Copied. Paste it to Claude to make it everyone’s starting layout.') }
    catch { setLayoutNote('Could not copy. Here it is to copy by hand:\n' + text) }
  }
  async function resetLayout() {
    if (!cottage && arrangeFor === 'me') {
      if (!(await askConfirm('Go back to how ' + (village ? village.name : 'this village') + ' looks for everyone? Your own view will be taken away.'))) return
      remember()
      const back = { ...fromSaved(mapLayouts.current.shared), labels: worldRef.current.labels }
      setWorld(back); worldRef.current = back; setPicked(null); setTrayOpen(false)
      clearTimeout(saveTimer.current)
      const { error } = await supabase.rpc('set_my_map_layout', { p_kind: 'village', p_id: id, p_layout: null })
      if (error) { console.error('Failed to remove your view:', error); setLayoutNote('Could not do that. Try again in a moment.'); return }
      mapLayouts.current = { ...mapLayouts.current, own: null }
      setLayoutNote('Back to the shared look.')
      return
    }
    const msg = !cottage ? 'Go back to the usual village for everyone? The pieces, roads and streams you added will be taken away. You can tap Undo right after.' : 'Go back to the usual village? Your pieces, roads and streams will be taken away. You can tap Undo right after if you change your mind.'
    if (!(await askConfirm(msg))) return
    commit(fromSaved(null)); setPicked(null); setTrayOpen(false); setLayoutNote('Back to the usual village.')
  }
  // Do the name tags show right now (without pointing at a place)?
  const [canHover] = useState(() => { try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches } catch { return false } })
  const namesShowing = world.labels === 'show' || (world.labels !== 'hide' && !canHover)
  // Nudge: move the picked thing a little, for anyone who finds dragging hard.
  function nudge(dx, dy) {
    if (!picked) return
    const cur = pickedDecor || placed(SPOTS.find((v) => v.k === picked))
    const lim = pickedDecor ? [1, 99] : [3, 97]
    changePicked({ x: round1(Math.min(lim[1], Math.max(lim[0], cur.x + dx))), y: round1(Math.min(lim[1], Math.max(lim[0], cur.y + dy))) })
  }
  useEffect(() => {
    if (!arrange || !picked || !sceneRef.current) return
    const t = setTimeout(() => {
      const el = picked.startsWith('d:') ? sceneRef.current.querySelector('.vs-picked') : sceneRef.current.querySelector('[data-spot="' + picked + '"]')
      if (!el || window.innerWidth >= 1024) return
      // Phones: the tools sit on the right side now, so only scroll if the piece is off screen.
      const r = el.getBoundingClientRect()
      const head = (document.querySelector('.app-header, header') || { getBoundingClientRect: () => ({ bottom: 64 }) }).getBoundingClientRect().bottom
      const foot = window.innerHeight - 80
      const how = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      let mid = (r.top + r.bottom) / 2
      if (r.top < head + 8) { window.scrollBy({ top: r.top - head - 24, behavior: how }); mid -= r.top - head - 24 }
      else if (r.bottom > foot) { window.scrollBy({ top: r.bottom - foot + 24, behavior: how }); mid -= r.bottom - foot + 24 }
      setPanelLow(mid < (head + foot) / 2)
    }, 60)
    return () => clearTimeout(t)
  }, [arrange, picked])
  const hiddenCount = SPOTS.filter((v) => isHidden(v.k)).length
  function closeArrange() { setArrange(false); setPicked(null); setTool('move'); setTrayOpen(false) }

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

  // Members only: this village's Campfires and Sidechats I can see.
  function loadRooms() {
    supabase.rpc('village_rooms', { p_village: id }).then(({ data, error }) => {
      if (error) { console.error('Failed to load Campfires and Sidechats:', error); return }
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
      case 'home': navigate(home?.village_id ? '/village/' + home.village_id : '/find-village'); return
      case 'calendar': navigate('/calendar'); return
      case 'connections': navigate('/connections'); return
      case 'cottage': case 'campfires': navigate('/messages?tab=chats'); return
      case 'chat': navigate('/messages?tab=villages'); return
      case 'help': navigate(offersWaiting ? '/tasks?tab=requests' : yourTurn ? '/tasks?tab=active' : '/help-doors'); return
      case 'me': navigate('/me'); return
      case 'messages': navigate('/messages'); return
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
        <Link className="btn btn-outline btn-full" to="/villages">See every village</Link>
      </>
      case 'orgs': return <>{title}
        {myOrgs.length === 0 && <p>You are not in an organization yet.</p>}
        {myOrgs.map((o) => row('/orgs/' + o.id, 'people', o.name, 'Organization'))}
        <Link className="btn btn-outline btn-full" to="/villages?tab=orgs">See every organization</Link>
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
        const f = rooms.filter((r) => r.kind === 'campfire'), inF = f.filter((r) => r.i_am_in).length
        const asks = f.reduce((n, r) => n + (r.asks_waiting || 0), 0)
        return { sub: f.length ? f.length + ' here' + (inF ? ', you are in ' + inF : '') + (asks ? ', ' + asks + ' asking to join' : '') : 'Start the first one', badge: asks }
      }
      case 'sidechats': {
        if (!mine) return { sub: 'Join this village first' }
        const s = rooms.filter((r) => r.kind === 'sidechat').length
        return { sub: s ? 'You are in ' + s : (keepers && keepers.i_am_keeper ? 'Start one for a few neighbors' : 'Small chats a keeper starts') }
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

  function tap(spot) {
    if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setBump(spot.k); setTimeout(() => setBump(null), 450)
    }
    if (cottage) { cottageTap(spot.k); return }
    if (spot.soon) { openSheet({ k: spot.k }); return }
    switch (spot.k) {
      case 'chat':
        if (mine && board) navigate('/campfire?board=' + board.id)
        else if (!mine) navigate('/find-village?join=' + id)
        else openSheet({ k: 'chat' })
        return
      case 'charter': navigate('/village/' + id + '/charter'); return
      case 'skillshare': navigate('/skillshare'); return
      case 'cottage': navigate('/messages'); return
      case 'messages': navigate('/messages'); return
      // In your home village, your house is your cottage: your own private map.
      case 'me': navigate(isHome ? '/cottage' : '/me'); return
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
          {sisters.length === 0 && <p>This village has no sister villages yet. The keeper can ask another village from the Village Network map.</p>}
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
      case 'sidechats':
        return <>{title}<VillageRooms villageId={id} kind={k === 'sidechats' ? 'sidechat' : 'campfire'} isMember={mine} isKeeper={!!(keepers && keepers.i_am_keeper)} onChanged={loadRooms} /></>
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
                <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/campfire?board=' + board.id)}>Open the village chat</button></>
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
    return <div className="vs-page vs-page-path"><div className="vs-top"><Link className="vs-crumb" to="/villages">Village Network</Link></div><p className="vs-error" role="alert">{loadError}</p></div>
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
        <Link className="vs-crumb" to="/villages">Village Network</Link>
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
            <small>{cottage ? 'Move places, add trees and bridges, draw roads, pick a ground' : 'Only you see your view. Move places, add trees, draw roads.'}</small>
          </span>
        </button>
      )}
      {!arrange && !cottage && keepers && keepers.i_am_keeper && (
        <button type="button" className="vs-build-start vs-build-shared" onClick={() => startArrange('everyone')}>
          <span className="vs-build-start-ic" aria-hidden="true"><ToolIcon name="move" /></span>
          <span className="vs-build-start-text">
            <b>Arrange {village.name} for everyone</b>
            <small>As Keeper or Helper, you set the look every neighbor starts with.</small>
          </span>
        </button>
      )}

      <div ref={sceneRef} className={'vs-scene vs-scene-path vs-names-' + (world.labels || 'auto') + (arrange ? ' vs-arranging' : '') + (arrange && tool !== 'move' ? ' vs-drawing' : '')} onPointerDown={roadStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
        <img className="vs-ground" src={(GROUNDS.find((g) => g.k === world.ground) || GROUNDS[0]).src} alt="" width="768" height="1152" fetchpriority="high" />
        {(world.roads.length > 0 || world.streams.length > 0 || drawing) && (
          <svg className="vs-roads" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
            {(world.streams.length > 0 || tool === 'stream') && <StreamDefs />}
            {world.streams.map((r, i) => <Stream key={'s' + i} pts={r} />)}
            {drawing && drawing.length > 1 && tool === 'stream' && <Stream pts={drawing} drawing />}
            {world.roads.map((r, i) => <Road key={i} pts={r} />)}
            {drawing && drawing.length > 1 && tool === 'road' && <Road pts={drawing} drawing />}
          </svg>
        )}
        {world.decor.slice().sort((a, b) => a.y - b.y).map((d) => {
          const piece = DECOR_PIECES.find((p) => p.k === d.k)
          if (!piece) return null
          const style = { left: d.x + '%', top: d.y + '%', '--s': d.s || 1 }
          const img = <img className={'vs-deco-img' + (d.flip ? ' vs-flip' : '')} src={piece.src} alt="" width="96" height="96" draggable="false" style={d.r ? { rotate: d.r + 'deg' } : undefined} />
          return arrange && tool === 'move'
            ? <button key={d.id} type="button" className={'vs-deco vs-deco-edit' + (picked === 'd:' + d.id ? ' vs-picked' : '')} style={style} aria-label={piece.label} onPointerDown={(e) => dragStart(e, 'd:' + d.id)} onClick={(e) => { if (e.detail === 0) { setPicked('d:' + d.id); setPickTools(true) } }}>{img}</button>
            : <span key={d.id} className="vs-deco" style={style} aria-hidden="true">{img}</span>
        })}
        {cottage && GIFTS.filter((g) => g.got).map((g) => (
          <img key={'gift-' + g.k} className="vs-gift" src={g.src} alt="" width="64" height="64" draggable="false" style={{ left: g.x + '%', top: g.y + '%' }} />
        ))}
        {SPOTS.filter((s0) => arrange || !isHidden(s0.k)).map((s0) => {
          const s = placed(s0)
          const i = info(s.k)
          return (
            <button key={s.k} type="button" data-spot={s.k}
              className={'vs-el' + (s.soon || (!cottage && !mine && GATED.includes(s.k)) ? ' vs-soon' : '') + (s.k === 'campfires' ? ' vs-flame' + (life ? ' vs-fire-' + life.fire_level : '') : '') + (bump === s.k ? ' vs-bump' : '') + (arrange && picked === s.k ? ' vs-picked' : '') + (arrange && isHidden(s.k) ? ' vs-hidden' : '')}
              style={{ left: s.x + '%', top: s.y + '%', '--s': (s.s || 1) * (s.k === 'campfires' && life ? FIRE_SIZE[life.fire_level] || 1 : 1) }}
              aria-label={s.label + '. ' + i.sub}
              onPointerDown={(e) => dragStart(e, s.k)}
              onClick={(e) => { if (!arrange) tap(s); else if (e.detail === 0 && tool === 'move') { setPicked(s.k); setPickTools(true) } }}>
              <span className={'vs-em' + (s.flip ? ' vs-flip' : '')} aria-hidden="true" style={s.r ? { rotate: s.r + 'deg' } : undefined}>
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
                {s.k === 'keeper' && life && life.has_keeper && <img className="vs-lantern" src={LIFE_ART.lantern} alt="" width="48" height="48" draggable="false" />}
                {s.k === 'keeper' && life && !life.has_keeper && <img className="vs-wanted" src={LIFE_ART.sign} alt="" width="48" height="48" draggable="false" />}
              </span>
              <span className="vs-lab">{s.k === 'keeper' && life && !life.has_keeper ? 'Keeper wanted' : s.short}</span>
              {cottage && i.lantern
                ? <span className="vs-lantern-tag" aria-hidden="true">{i.lantern}</span>
                : i.badge > 0 && <span className="vs-badge" aria-hidden="true">{i.badge > 9 ? '9+' : i.badge}</span>}
            </button>
          )
        })}
        {/* Name tags: on phones they show; with a mouse they show when you point at
            a place. This button turns them on or off for you (saved with your village). */}
        <button type="button" className="vs-names-toggle" onPointerDown={(e) => e.stopPropagation()}
          aria-pressed={namesShowing}
          onClick={() => saveLabels(namesShowing ? 'hide' : 'show')}>
          <ToolIcon name={namesShowing ? 'eye' : 'tag'} />
          <span>{namesShowing ? 'Hide names' : 'Show names'}</span>
        </button>
        <div className="vs-fade" />
      </div>

      {cottage && !arrange && (
        <button type="button" className="vs-gifts-btn" onClick={() => openSheet({ k: 'gifts' })}>
          <Icon name="sprout" size={28} /> Your garden: {GIFTS.filter((g) => g.got).length} of {GIFTS.length} gifts grown
        </button>
      )}
      <p className="vs-hint">{arrange ? (cottage ? 'Arrange and build your cottage map. Your changes are saved as you go.' : arrangeFor === 'everyone' ? 'You are arranging ' + village.name + ' for everyone. Changes are saved as you go.' : 'You are arranging your own view. Only you see it. Changes are saved as you go.') : cottage ? 'Tap anything on your map to go there.' : 'Tap anything in the village to go there.'}</p>

      {<div className={'vs-arrange' + (arrange ? ' vs-arrange-on' : '')}>
        {arrange && (
          <div className={'vs-toolbar' + (trayOpen || (tool === 'move' && picked && pickTools) || tool !== 'move' || layoutNote ? ' vs-toolbar-wide' : '') + (panelLow && picked && !trayOpen ? ' vs-toolbar-low' : '')} role="region" aria-label="Arrange and build tools">
            {/* Oct 22: on phones the tools are a rail on the right side; this panel slides out beside it and scrolls. */}
            <div className="vs-toolpanel">
            {trayOpen && (
              <button type="button" className="vs-drawer-close" onClick={() => { setTrayOpen(false); setPicked(null) }}>
                <ToolIcon name="right" /><span>Close Add</span>
              </button>
            )}
            {layoutNote && <p className="vs-tool-note" role="status">{layoutNote}</p>}
            {!layoutNote && tool === 'move' && !picked && !trayOpen && <p className="vs-tool-note">Drag a place to move it, or tap it for more choices. Tap <b>Add</b> for trees, ground, and more.</p>}

            {tool === 'move' && picked && pickTools && !trayOpen && (
              <div className="vs-tool-picked">
                <div className="vs-tool-picked-head">
                  <b>{pickedDecor ? ((DECOR_PIECES.find((p) => p.k === pickedDecor.k) || {}).label || 'Piece') : (SPOTS.find((v) => v.k === picked) || {}).label}{!pickedDecor && isHidden(picked) ? ' (hidden)' : ''}</b>
                  <button type="button" className="vs-tool-x" aria-label="Stop changing this" onClick={() => setPicked(null)}><ToolIcon name="close" /></button>
                </div>
                <div className="vs-tool-row">
                  <button type="button" className="vs-tool" onClick={() => resize(-0.1)}><ToolIcon name="minus" /><span>Smaller</span></button>
                  <button type="button" className="vs-tool" onClick={() => resize(0.1)}><ToolIcon name="plus" /><span>Bigger</span></button>
                  <button type="button" className="vs-tool" onClick={flipPicked}><ToolIcon name="flip" /><span>Flip</span></button>
                  <button type="button" className="vs-tool" onClick={() => turnPicked(-15)}><ToolIcon name="turnl" /><span>Turn left</span></button>
                  <button type="button" className="vs-tool" onClick={() => turnPicked(15)}><ToolIcon name="turnr" /><span>Turn right</span></button>
                  {pickedDecor
                    ? <button type="button" className="vs-tool" onClick={removePicked}><ToolIcon name="trash" /><span>Remove</span></button>
                    : <button type="button" className="vs-tool" onClick={() => changePicked({ hide: !isHidden(picked) })}><ToolIcon name="eye" /><span>{isHidden(picked) ? 'Show' : 'Hide'}</span></button>}
                </div>
                <div className="vs-tool-nudge" role="group" aria-label="Move it a little">
                  <button type="button" className="vs-tool vs-tool-sm" aria-label="Move left" onClick={() => nudge(-1, 0)}><ToolIcon name="left" /></button>
                  <button type="button" className="vs-tool vs-tool-sm" aria-label="Move up" onClick={() => nudge(0, -1)}><ToolIcon name="up" /></button>
                  <button type="button" className="vs-tool vs-tool-sm" aria-label="Move down" onClick={() => nudge(0, 1)}><ToolIcon name="down" /></button>
                  <button type="button" className="vs-tool vs-tool-sm" aria-label="Move right" onClick={() => nudge(1, 0)}><ToolIcon name="right" /></button>
                </div>
              </div>
            )}

            {tool !== 'move' && (
              <div className="vs-draw-banner" role="status">
                <span>{tool === 'road' ? 'Drawing roads.' : 'Drawing streams.'} Drag your finger on the map.</span>
                <button type="button" onClick={() => setTool('move')}>Stop</button>
              </div>
            )}
            {tool !== 'move' && (
              <div className="vs-tool-row">
                <button type="button" className="vs-tool" disabled={!(tool === 'road' ? world.roads : world.streams).length} onClick={() => { const k = tool === 'road' ? 'roads' : 'streams'; commit({ ...world, [k]: world[k].slice(0, -1) }) }}><ToolIcon name="undo" /><span>{tool === 'road' ? 'Last road' : 'Last stream'}</span></button>
                <button type="button" className="vs-tool" disabled={!(tool === 'road' ? world.roads : world.streams).length} onClick={() => { const k = tool === 'road' ? 'roads' : 'streams'; commit({ ...world, [k]: [] }) }}><ToolIcon name="trash" /><span>{tool === 'road' ? 'All roads' : 'All streams'}</span></button>
              </div>
            )}

            {trayOpen && (
              <div className="vs-tray">
                <div className="vs-tray-tabs" role="tablist" aria-label="Add to your village">
                  <button type="button" role="tab" id="vs-tab-pieces" aria-controls="vs-panel" aria-selected={trayTab === 'pieces'} className={'vs-tray-tab' + (trayTab === 'pieces' ? ' on' : '')} onClick={() => setTrayTab('pieces')}>Pieces</button>
                  <button type="button" role="tab" id="vs-tab-ground" aria-controls="vs-panel" aria-selected={trayTab === 'ground'} className={'vs-tray-tab' + (trayTab === 'ground' ? ' on' : '')} onClick={() => setTrayTab('ground')}>Ground</button>
                  <button type="button" role="tab" id="vs-tab-more" aria-controls="vs-panel" aria-selected={trayTab === 'more'} className={'vs-tray-tab' + (trayTab === 'more' ? ' on' : '')} onClick={() => setTrayTab('more')}>
                    More{hiddenCount > 0 && <span className="vs-tray-count" aria-label={hiddenCount + ' hidden'}>{hiddenCount}</span>}
                  </button>
                </div>
                <div id="vs-panel" role="tabpanel" aria-labelledby={'vs-tab-' + trayTab}>
                {trayTab === 'pieces' && <>
                <p className="vs-tray-help">Tap a piece to add it. Then drag it where you want it.</p>
                <div className="vs-palette">
                  {DECOR_PIECES.map((p) => (
                    <button key={p.k} type="button" className="vs-palette-item" onClick={() => addDecor(p)}>
                      <img src={p.src} alt="" width="56" height="56" loading="lazy" />
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
                </>}
                {trayTab === 'more' && hiddenCount === 0 && <p className="vs-tray-help">No places are hidden. To hide one, tap Move, tap the place, then Hide.</p>}
                {trayTab === 'more' && hiddenCount > 0 && <>
                  <h3 className="vs-arrange-h">Hidden places</h3>
                  <div className="vs-chips-row">
                    {SPOTS.filter((v) => isHidden(v.k)).map((v) => (
                      <button key={v.k} type="button" className="vs-chip-btn" onClick={() => { commit({ ...world, spots: { ...layout, [v.k]: { ...(layout[v.k] || {}), hide: false } } }); setLayoutNote(v.label + ' is back on the map.') }}>Show {v.label}</button>
                    ))}
                  </div>
                </>}
                {trayTab === 'ground' && <>
                <p className="vs-tray-help">Pick the land your village sits on.</p>
                <div className="vs-grounds" role="group" aria-label="Ground">
                  {GROUNDS.map((g) => (
                    <button key={g.k} type="button" className={'vs-ground-card' + (world.ground === g.k ? ' on' : '')} aria-pressed={world.ground === g.k} onClick={() => commit({ ...world, ground: g.k })}>
                      <img src={g.src} alt="" width="72" height="108" loading="lazy" />
                      <span>{g.label}</span>
                    </button>
                  ))}
                </div>
                </>}
                {trayTab === 'more' && <div className="vs-tray-more">
                  <button type="button" className="btn btn-outline btn-full" onClick={resetLayout}>{cottage ? 'Back to the usual village' : arrangeFor === 'everyone' ? 'Back to the usual village for everyone' : 'Back to the shared look'}</button>
                  {cottage && isFounder && <button type="button" className="btn btn-outline btn-full" onClick={copyLayout}>Copy layout for everyone (founder)</button>}
                  <p className="vs-note">{cottage ? 'Your cottage is saved on your account and only you see it.' : arrangeFor === 'everyone' ? 'Every neighbor sees this look, unless they arranged their own view.' : 'Your view is saved on your account and only you see it.'} Hidden places are still in the list under the map.</p>
                </div>}
                </div>
              </div>
            )}
            </div>

            <div className="vs-tool-main" role="group" aria-label="What to do">
              <button type="button" className={'vs-tool' + (tool === 'move' && !trayOpen ? ' on' : '')} aria-pressed={tool === 'move' && !trayOpen} onClick={() => { setTool('move'); setTrayOpen(false) }}><ToolIcon name="move" /><span>Move</span></button>
              <button type="button" className={'vs-tool' + (trayOpen ? ' on' : '')} aria-pressed={trayOpen} aria-expanded={trayOpen} onClick={() => { setTrayOpen(!trayOpen); setTool('move') }}><ToolIcon name="add" /><span>Add</span></button>
              <button type="button" className={'vs-tool' + (tool === 'road' ? ' on' : '')} aria-pressed={tool === 'road'} onClick={() => { setTool('road'); setPicked(null); setTrayOpen(false) }}><ToolIcon name="road" /><span>Road</span></button>
              <button type="button" className={'vs-tool' + (tool === 'stream' ? ' on' : '')} aria-pressed={tool === 'stream'} onClick={() => { setTool('stream'); setPicked(null); setTrayOpen(false) }}><ToolIcon name="stream" /><span>Stream</span></button>
              <button type="button" className="vs-tool" disabled={!canUndo} onClick={undo}><ToolIcon name="undo" /><span>Undo</span></button>
              <button type="button" className="vs-tool vs-tool-done" onClick={closeArrange}><ToolIcon name="check" /><span>Done</span></button>
            </div>
          </div>
        )}
      </div>}

      <div className="vs-body">
        {!cottage && !mine && <button type="button" className="btn btn-primary btn-full vs-big" onClick={() => navigate('/find-village?join=' + id)}>Join {village.name}</button>}
        {!cottage && mine && keepers && keepers.i_am_keeper && <button type="button" data-tour="keeper-tools" className="btn btn-outline btn-full vs-big" onClick={() => navigate('/village/' + id + '/keeper')}><span aria-hidden="true"><Icon name="toolbox" /></span> Keeper tools</button>}
        <div className="vs-help">
          <button type="button" className="vs-big vs-ask" onClick={() => navigate('/ask')}>Ask for help</button>
          <button type="button" className="vs-big vs-offer" onClick={() => navigate('/post-offer')}>I can help</button>
        </div>
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
        <Link className="btn btn-outline btn-full vs-big" to="/community">Local help, events, and calendar</Link>
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
