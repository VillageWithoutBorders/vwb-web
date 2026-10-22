import { useEffect, useRef, useState } from 'react'
import { DECOR_PIECES, BACKGROUNDS, HAS_SEASONS, backgroundSrc, DEFAULT_WORLDS } from '../data/worldElements'
import { supabase } from '../supabaseClient'
import { askConfirm } from './AdminDialog'

// The map builder (Oct 22): Arrange and build for every map page.
// Your cottage, village pages, organization and group pages all use it.
// Each page decides where a layout is saved (useMapBuilder's onSave);
// this file holds the editing: drag, tap for tools, add pieces, draw roads
// and streams, undo, and the tool bar.
//
// A layout ("world"):
//   spots:   where each working place sits (move, size, flip, hide)
//   decor:   pieces you add (trees, pond, fence, bridge...)
//   roads:   paths you draw with your finger
//   streams: water you draw with your finger (under the roads, so a road can cross it)
//   labels:  name tags: 'auto', 'show' or 'hide' (one choice for every map)
//   bg:      the background: 'seasons' (usual: the field for this time of year) or a BACKGROUNDS key

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
}
export function ToolIcon({ name }) {
  return <svg className="vs-tool-ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={TOOL_PATHS[name]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export { Road, Stream, StreamDefs, simplify }

// A saved layout, cleaned up. Unknown or missing parts become empty.
// base: the usual look for this kind of map (DEFAULT_WORLDS), used when nothing is saved.
export function fromSaved(v, base) {
  if (!v || typeof v !== 'object') return { spots: {}, decor: base ? base.decor : [], roads: base ? base.roads : [], streams: base ? base.streams : [], labels: 'auto', bg: 'seasons' }
  if (!v.spots && !v.decor && !v.roads && !v.streams && !v.ground && !v.labels && !v.bg) return { spots: v, decor: [], roads: [], streams: [], labels: 'auto', bg: 'seasons' } // older device copy
  const list = (a) => (Array.isArray(a) ? a : [])
  const bg = v.bg === 'seasons' || BACKGROUNDS.some((b) => b.k === v.bg) ? v.bg : 'seasons'
  return { spots: v.spots || {}, decor: list(v.decor), roads: list(v.roads), streams: list(v.streams), labels: ['show', 'hide'].includes(v.labels) ? v.labels : 'auto', bg }
}
// Nothing changed from the usual map (name tags aside)?
export function isPlainWorld(w, base) {
  const same = (a, c) => JSON.stringify(a || []) === JSON.stringify(c || [])
  return Object.keys(w.spots).length === 0 && same(w.decor, base && base.decor) && same(w.roads, base && base.roads) && same(w.streams, base && base.streams) && (w.bg || 'seasons') === 'seasons'
}
// Only the map, without the name tags choice: what gets saved for a page.
export function mapBody(w) {
  return { spots: w.spots, decor: w.decor, roads: w.roads, streams: w.streams, bg: w.bg || 'seasons' }
}

const stillMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

export function useMapBuilder({ spots, initial, onSave, base }) {
  const sceneRef = useRef(null)
  const dragRef = useRef(null)
  const drawRef = useRef(null)
  const drawKindRef = useRef('road')
  const holdRef = useRef(null) // a finger held down on the map, not arranging yet
  const holdFiredRef = useRef(false)
  const historyRef = useRef([])
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const [world, setWorldState] = useState(() => fromSaved(initial, base))
  const worldRef = useRef(world)
  worldRef.current = world
  const [arrange, setArrange] = useState(false)
  const [tool, setTool] = useState('move') // move | road | stream
  const [trayOpen, setTrayOpen] = useState(false)
  // Add tray tabs: Pieces, More (hidden places and start over).
  const [trayTab, setTrayTab] = useState('pieces')
  const [canUndo, setCanUndo] = useState(false)
  const [picked, setPicked] = useState(null) // a place key, or 'd:' + decor id
  // The picked piece's tools open on a tap, not while you drag it (Jade, Oct 22).
  const [pickTools, setPickTools] = useState(false)
  // Phones: when the picked piece is high on the screen, the tool panel drops to the bottom.
  const [panelLow, setPanelLow] = useState(false)
  const [layoutNote, setLayoutNote] = useState('')
  const [drawing, setDrawing] = useState(null) // points of the road being drawn

  const layout = world.spots
  // Show a layout without saving it (loading, or switching whose map you arrange).
  function setWorld(w) { worldRef.current = w; setWorldState(w) }
  function saveWorld(next) { setWorld(next); if (onSaveRef.current) onSaveRef.current(next) }
  // Undo: every change keeps the map as it was just before (last 30).
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
    commit({ ...worldRef.current, spots: { ...layout, [picked]: { ...(layout[picked] || {}), ...change } } })
  }
  function resize(by) {
    if (!picked) return
    const cur = pickedDecor ? pickedDecor.s || 1 : placed(spots.find((v) => v.k === picked) || {}).s || 1
    changePicked({ s: Math.min(pickedDecor ? 3 : 1.8, Math.max(0.3, Math.round((cur + by) * 10) / 10)) })
  }
  function flipPicked() {
    if (!picked) return
    changePicked({ flip: !(pickedDecor ? pickedDecor.flip : layout[picked] && layout[picked].flip) })
  }
  function addDecor(piece) {
    if (world.decor.length >= 80) { setLayoutNote('This map is full. Take a piece away to add another.'); return }
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
  // Nudge: move the picked thing a little, for anyone who finds dragging hard.
  function nudge(dx, dy) {
    if (!picked) return
    const cur = pickedDecor || placed(spots.find((v) => v.k === picked) || {})
    const lim = pickedDecor ? [1, 99] : [3, 97]
    changePicked({ x: round1(Math.min(lim[1], Math.max(lim[0], cur.x + dx))), y: round1(Math.min(lim[1], Math.max(lim[0], cur.y + dy))) })
  }
  // Keyboard: Enter on a place or piece while arranging picks it and opens its tools.
  function pickByKey(key) { if (tool === 'move') { setPicked(key); setPickTools(true) } }
  useEffect(() => {
    if (!arrange || !picked || !sceneRef.current) return
    const t = setTimeout(() => {
      const el = picked.startsWith('d:') ? sceneRef.current.querySelector('.vs-picked') : sceneRef.current.querySelector('[data-spot="' + picked + '"]')
      if (!el || window.innerWidth >= 1024) return
      // Phones: the tools sit on the right side, so only scroll if the piece is off screen.
      const r = el.getBoundingClientRect()
      const head = (document.querySelector('.app-header, header') || { getBoundingClientRect: () => ({ bottom: 64 }) }).getBoundingClientRect().bottom
      const foot = window.innerHeight - 80
      const how = stillMotion() ? 'auto' : 'smooth'
      let mid = (r.top + r.bottom) / 2
      if (r.top < head + 8) { window.scrollBy({ top: r.top - head - 24, behavior: how }); mid -= r.top - head - 24 }
      else if (r.bottom > foot) { window.scrollBy({ top: r.bottom - foot + 24, behavior: how }); mid -= r.bottom - foot + 24 }
      setPanelLow(mid < (head + foot) / 2)
    }, 60)
    return () => clearTimeout(t)
  }, [arrange, picked])
  const hiddenCount = spots.filter((v) => isHidden(v.k)).length
  function openArrange(startWorld) {
    if (startWorld) setWorld(startWorld)
    historyRef.current = []; setCanUndo(false)
    setArrange(true); setTool('move'); setTrayTab('pieces'); setLayoutNote(''); setPicked(null); setTrayOpen(false)
    setTimeout(() => sceneRef.current && sceneRef.current.scrollIntoView({ block: 'start', behavior: stillMotion() ? 'auto' : 'smooth' }), 120)
  }
  // Long press (about half a second) on the map asks to start arranging.
  // Moving the finger first (scrolling) or lifting it early cancels it.
  function holdStop() {
    const h = holdRef.current
    if (!h) return
    clearTimeout(h.timer)
    if (h.el) h.el.classList.remove('vs-holding')
    holdRef.current = null
  }
  function holdStart(e, onHold) {
    holdStop()
    if (arrange || !onHold || (e.pointerType === 'mouse' && e.button !== 0)) return
    const el = e.target.closest ? e.target.closest('[data-spot]') : null
    const key = el ? el.getAttribute('data-spot') : null
    if (el) el.classList.add('vs-holding')
    holdFiredRef.current = false
    holdRef.current = {
      x: e.clientX, y: e.clientY, el,
      timer: setTimeout(() => {
        holdStop()
        holdFiredRef.current = true
        try { if (navigator.vibrate) navigator.vibrate(15) } catch { /* no buzz */ }
        onHold(key)
      }, 550),
    }
  }
  function holdMove(e) {
    const h = holdRef.current
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) holdStop()
  }
  // The finger lifting after a long press should not also count as a tap.
  function holdClick(e) {
    if (!holdFiredRef.current) return
    holdFiredRef.current = false
    e.preventDefault(); e.stopPropagation()
  }
  function closeArrange() { setArrange(false); setPicked(null); setTool('move'); setTrayOpen(false) }
  // Do the name tags show right now (without pointing at a place)?
  const [canHover] = useState(() => { try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches } catch { return false } })
  const namesShowing = world.labels === 'show' || (world.labels !== 'hide' && !canHover)

  return {
    spots, sceneRef, world, worldRef, layout, setWorld, saveWorld, commit, remember, undo, canUndo,
    arrange, openArrange, closeArrange, tool, setTool, trayOpen, setTrayOpen, trayTab, setTrayTab,
    picked, setPicked, pickTools, setPickTools, panelLow, layoutNote, setLayoutNote, drawing,
    placed, isHidden, hiddenCount, pickedDecor, dragStart, dragMove, dragEnd, roadStart,
    changePicked, resize, flipPicked, addDecor, removePicked, nudge, pickByKey, namesShowing,
    holdStart, holdMove, holdStop, holdClick,
  }
}

// Classes and pointer handlers for the map's scene box.
// onHold(key): called after a long press while not arranging. key is the place held, or null.
export function sceneProps(b, extraClass, onHold) {
  return {
    ref: b.sceneRef,
    className: extraClass + ' vs-names-' + (b.world.labels || 'auto') + (b.arrange ? ' vs-arranging' : '') + (b.arrange && b.tool !== 'move' ? ' vs-drawing' : ''),
    onPointerDown: (e) => { b.roadStart(e); b.holdStart(e, onHold) },
    onPointerMove: (e) => { b.holdMove(e); b.dragMove(e) },
    onPointerUp: () => { b.holdStop(); b.dragEnd() },
    onPointerCancel: () => { b.holdStop(); b.dragEnd() },
    onPointerLeave: b.holdStop,
    onClickCapture: b.holdClick,
    // A long press on the map art should not open the phone's save-picture menu.
    onContextMenu: (e) => e.preventDefault(),
  }
}

// Roads, streams and added pieces, drawn on the field (inside the scene box).
export function MapLayers({ b }) {
  const { world, drawing, tool, arrange, picked, dragStart, pickByKey } = b
  return <>
    {(world.roads.length > 0 || world.streams.length > 0 || drawing) && (
      <svg className="vs-roads" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
        {(world.streams.length > 0 || tool === 'stream') && <StreamDefs />}
        {world.streams.map((r, i) => <Stream key={'s' + i} pts={r} />)}
        {drawing && drawing.length > 1 && tool === 'stream' && <Stream pts={drawing} drawing />}
        {world.roads.map((r, i) => <Road key={i} pts={r} />)}
        {drawing && drawing.length > 1 && tool === 'road' && <Road pts={drawing} drawing />}
      </svg>
    )}
    {world.decor.slice().sort((a, c) => a.y - c.y).map((d) => {
      const piece = DECOR_PIECES.find((p) => p.k === d.k)
      if (!piece) return null
      const style = { left: d.x + '%', top: d.y + '%', '--s': d.s || 1 }
      const img = <img className={'vs-deco-img' + (d.flip ? ' vs-flip' : '')} src={piece.src} alt="" width="96" height="96" draggable="false" />
      return arrange && tool === 'move'
        ? <button key={d.id} type="button" className={'vs-deco vs-deco-edit' + (picked === 'd:' + d.id ? ' vs-picked' : '')} style={style} aria-label={piece.label} onPointerDown={(e) => dragStart(e, 'd:' + d.id)} onClick={(e) => { if (e.detail === 0) pickByKey('d:' + d.id) }}>{img}</button>
        : <span key={d.id} className="vs-deco" style={style} aria-hidden="true">{img}</span>
    })}
  </>
}

// The Show names / Hide names button on the map.
export function NamesToggle({ b, onChange }) {
  return (
    <button type="button" className="vs-names-toggle" onPointerDown={(e) => e.stopPropagation()}
      aria-pressed={b.namesShowing}
      onClick={() => onChange(b.namesShowing ? 'hide' : 'show')}>
      <ToolIcon name={b.namesShowing ? 'eye' : 'tag'} />
      <span>{b.namesShowing ? 'Hide names' : 'Show names'}</span>
    </button>
  )
}

// The arrange and build tools. Phones: a rail on the right side with a panel
// that slides out beside it. Computers: a box beside the map.
// more: what goes at the top of the More tab (start over buttons and a note).
export function MapToolbar({ b, more }) {
  const { world, layout, spots, tool, setTool, trayOpen, setTrayOpen, trayTab, setTrayTab, picked, setPicked, pickTools,
    panelLow, layoutNote, setLayoutNote, pickedDecor, isHidden, hiddenCount, resize, flipPicked, removePicked, changePicked,
    nudge, commit, addDecor, canUndo, undo, closeArrange } = b
  if (!b.arrange) return <div className="vs-arrange" />
  return (
    <div className="vs-arrange vs-arrange-on">
      <div className={'vs-toolbar' + (trayOpen || (tool === 'move' && picked && pickTools) || tool !== 'move' || layoutNote ? ' vs-toolbar-wide' : '') + (panelLow && picked && !trayOpen ? ' vs-toolbar-low' : '')} role="region" aria-label="Arrange and build tools">
        <div className="vs-toolpanel">
        {trayOpen && (
          <button type="button" className="vs-drawer-close" onClick={() => { setTrayOpen(false); setPicked(null) }}>
            <ToolIcon name="right" /><span>Close Add</span>
          </button>
        )}
        {layoutNote && <p className="vs-tool-note" role="status">{layoutNote}</p>}
        {!layoutNote && tool === 'move' && !picked && !trayOpen && <p className="vs-tool-note">Drag a place to move it, or tap it for more choices. Tap <b>Add</b> for trees, bridges, and more.</p>}

            {tool === 'move' && picked && pickTools && !trayOpen && (
              <div className="vs-tool-picked">
                <div className="vs-tool-picked-head">
                  <b>{pickedDecor ? ((DECOR_PIECES.find((p) => p.k === pickedDecor.k) || {}).label || 'Piece') : (spots.find((v) => v.k === picked) || {}).label}{!pickedDecor && isHidden(picked) ? ' (hidden)' : ''}</b>
                  <button type="button" className="vs-tool-x" aria-label="Stop changing this" onClick={() => setPicked(null)}><ToolIcon name="close" /></button>
                </div>
                <div className="vs-tool-row">
                  <button type="button" className="vs-tool" onClick={() => resize(-0.1)}><ToolIcon name="minus" /><span>Smaller</span></button>
                  <button type="button" className="vs-tool" onClick={() => resize(0.1)}><ToolIcon name="plus" /><span>Bigger</span></button>
                  <button type="button" className="vs-tool" onClick={flipPicked}><ToolIcon name="flip" /><span>Flip</span></button>
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
                  {(BACKGROUNDS.length > 1 || HAS_SEASONS) && <button type="button" role="tab" id="vs-tab-bg" aria-controls="vs-panel" aria-selected={trayTab === 'bg'} className={'vs-tray-tab' + (trayTab === 'bg' ? ' on' : '')} onClick={() => setTrayTab('bg')}>Backgrounds</button>}
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
                    {spots.filter((v) => isHidden(v.k)).map((v) => (
                      <button key={v.k} type="button" className="vs-chip-btn" onClick={() => { commit({ ...world, spots: { ...layout, [v.k]: { ...(layout[v.k] || {}), hide: false } } }); setLayoutNote(v.label + ' is back on the map.') }}>Show {v.label}</button>
                    ))}
                  </div>
                </>}
                {trayTab === 'bg' && <>
                <p className="vs-tray-help">Pick the ground your map sits on.</p>
                <div className="vs-grounds" role="group" aria-label="Backgrounds">
                  {HAS_SEASONS && (
                    <button type="button" className={'vs-ground-card' + (world.bg === 'seasons' ? ' on' : '')} aria-pressed={world.bg === 'seasons'} onClick={() => commit({ ...world, bg: 'seasons' })}>
                      <img src={backgroundSrc('seasons')} alt="" width="72" height="108" loading="lazy" />
                      <span>Change with the seasons</span>
                    </button>
                  )}
                  {BACKGROUNDS.map((g) => (
                    <button key={g.k} type="button" className={'vs-ground-card' + ((world.bg || 'seasons') === g.k ? ' on' : '')} aria-pressed={(world.bg || 'seasons') === g.k} onClick={() => commit({ ...world, bg: g.k })}>
                      <img src={g.src} alt="" width="72" height="108" loading="lazy" />
                      <span>{g.label}</span>
                    </button>
                  ))}
                </div>
                </>}
                {trayTab === 'more' && <div className="vs-tray-more">{more}</div>}
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
    </div>
  )
}

// A shared page map (organization and group pages; vwb-map-layouts.sql).
// Leaders set the shared look for everyone; anyone signed in can arrange their own
// view on top. You see your own view if you made one, else the shared look, else
// the usual map. Name tags stay one account-wide choice (helper_profiles.village_layout).
//   kind: 'org' (organizations and groups). name: shown in the start-over question.
export function usePageMap({ kind, id, spots, user, accountLayout, refreshProfile, name, base }) {
  const [arrangeFor, setArrangeFor] = useState('me') // me | everyone
  const mapLayouts = useRef({ own: null, shared: null })
  const [mapLoaded, setMapLoaded] = useState(0)
  const saveTimer = useRef(null)
  const b = useMapBuilder({ spots, initial: null, base, onSave: (next) => saveMap(next) })

  useEffect(() => {
    if (!id || !user) return
    let alive = true
    mapLayouts.current = { own: null, shared: null }
    Promise.all([
      supabase.from('map_layouts').select('layout').eq('map_kind', kind).eq('map_id', id).maybeSingle(),
      supabase.from('map_shared_layouts').select('layout').eq('map_kind', kind).eq('map_id', id).maybeSingle(),
    ]).then(([own, shared]) => {
      if (!alive) return
      // Before vwb-map-layouts.sql is run the tables are missing: show the usual map.
      ;[own, shared].forEach((r) => { if (r.error && !['42P01', 'PGRST205'].includes(r.error.code)) console.error('Failed to load the map layout:', r.error) })
      mapLayouts.current = { own: (own.data && own.data.layout) || null, shared: (shared.data && shared.data.layout) || null }
      setMapLoaded((n) => n + 1)
    })
    return () => { alive = false }
  }, [kind, id, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (b.arrange) return
    const { own, shared } = mapLayouts.current
    b.setWorld({ ...fromSaved(own || shared, base), labels: fromSaved(accountLayout).labels })
  }, [mapLoaded, b.arrange, accountLayout, base]) // eslint-disable-line react-hooks/exhaustive-deps

  function saveMap(next) {
    const forWho = arrangeFor
    const body = mapBody(next)
    const empty = isPlainWorld(next, base)
    const shared = forWho === 'everyone'
    // Keep it here right away, so tapping Done before it saves still shows it.
    mapLayouts.current = { ...mapLayouts.current, [shared ? 'shared' : 'own']: empty ? null : body }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase.rpc(shared ? 'set_map_shared_layout' : 'set_my_map_layout', { p_kind: kind, p_id: id, p_layout: empty ? null : body })
      if (error) {
        console.error('Failed to save the map:', error)
        b.setLayoutNote(error.code === '42501' ? error.message : error.code === 'PGRST202' ? 'This needs a database update first, so your changes are not saved yet.' : 'Could not save. Try again in a moment.')
      }
    }, 800)
  }

  // Name tags are one choice for every map, saved with your account.
  function saveLabels(labels) {
    b.setWorld({ ...b.worldRef.current, labels })
    const acct = { ...fromSaved(accountLayout, DEFAULT_WORLDS.cottage), labels }
    const empty = isPlainWorld(acct, DEFAULT_WORLDS.cottage) && acct.labels === 'auto'
    supabase.rpc('set_my_village_layout', { p_layout: empty ? null : acct }).then(({ error }) => {
      if (error) { console.error('Failed to save name tags choice:', error); return }
      if (refreshProfile) refreshProfile()
    })
  }

  function startArrange(forWho) {
    const { own, shared } = mapLayouts.current
    setArrangeFor(forWho)
    b.openArrange({ ...fromSaved(forWho === 'everyone' ? shared : (own || shared), base), labels: b.worldRef.current.labels })
  }

  async function resetLayout() {
    if (arrangeFor === 'me') {
      if (!(await askConfirm('Go back to how ' + (name || 'this page') + ' looks for everyone? Your own view will be taken away.'))) return
      b.remember()
      b.setWorld({ ...fromSaved(mapLayouts.current.shared, base), labels: b.worldRef.current.labels })
      b.setPicked(null); b.setTrayOpen(false)
      clearTimeout(saveTimer.current)
      const { error } = await supabase.rpc('set_my_map_layout', { p_kind: kind, p_id: id, p_layout: null })
      if (error) { console.error('Failed to remove your view:', error); b.setLayoutNote('Could not do that. Try again in a moment.'); return }
      mapLayouts.current = { ...mapLayouts.current, own: null }
      b.setLayoutNote('Back to the shared look.')
      return
    }
    if (!(await askConfirm('Go back to the usual map for everyone? The pieces, roads and streams you added will be taken away. You can tap Undo right after.'))) return
    b.commit(fromSaved(null, base)); b.setPicked(null); b.setTrayOpen(false); b.setLayoutNote('Back to the usual map.')
  }

  return { b, arrangeFor, startArrange, resetLayout, saveLabels }
}
