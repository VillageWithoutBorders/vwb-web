import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { peekReturnTo } from '../utils/returnTo'
import { circleLayout } from '../utils/circleLayout'
import SisterCampfireButton from '../components/SisterCampfireButton'
import '../village-scene.css'
import '../world.css'

// The World: the VWB globe with your connections on it, in two networks.
// Villages: circles that overlap where they share zip codes, and gold lines
// with a Sister Campfire between sister villages.
// Organizations: organizations and the gold lines between connected ones.
// Tap your village to step inside it. Tap the sea to see every village.
// Names follow the VWB Vocabulary sheet. Route: /world

const MAX_ON_GLOBE = 8
const LAND = { x0: 20, x1: 80, y0: 16, y1: 82 } // the part of the globe picture that is land, in percent

function stillMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

// Fit the laid-out circles onto the globe's land, in percent of the globe.
// Name pills keep the side the layout chose for them (under, above, or beside).
function fitToLand(lay) {
  const n = lay.nodes
  const minX = Math.min(...n.map((c) => c.x - c.r)), maxX = Math.max(...n.map((c) => c.x + c.r))
  const minY = Math.min(...n.map((c) => c.y - c.r)), maxY = Math.max(...n.map((c) => c.y + c.r))
  const w = LAND.x1 - LAND.x0, h = LAND.y1 - LAND.y0 - 8
  const s = Math.min(w / Math.max(maxX - minX, 1), h / Math.max(maxY - minY, 1), 0.34)
  const ox = LAND.x0 + (w - (maxX - minX) * s) / 2, oy = LAND.y0 + (h - (maxY - minY) * s) / 2
  return {
    nodes: n.map((c) => ({ gx: ox + (c.x - minX) * s, gy: oy + (c.y - minY) * s, gr: c.r * s })),
    labels: lay.labels.map((l, i) => {
      const c = n[i], gx = ox + (c.x - minX) * s, gy = oy + (c.y - minY) * s, k = (c.r * s) / c.r
      const dx = l.tx - c.x, dy = l.ty - c.y
      // Pills sit just outside the circle on the side the layout picked.
      // A pill inside the circle would cover its house, so it goes just under the circle instead.
      if (Math.hypot(dx, dy) < c.r) return { lx: gx, ly: gy + c.r * k + 3 }
      return { lx: gx + dx * k, ly: gy + dy * k + Math.sign(dy) * 3 }
    }),
  }
}

// A curved line between two points, and its middle point (for the 🔥).
function curve(p, q, bend) {
  const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1
  const cx = mx - (dy / len) * bend, cy = my + (dx / len) * bend
  return { d: `M${p.x.toFixed(1)} ${p.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`, x: 0.25 * p.x + 0.5 * cx + 0.25 * q.x, y: 0.25 * p.y + 0.5 * cy + 0.25 * q.y }
}

export default function World() {
  const navigate = useNavigate()
  const { profile, organizations } = useAuth()
  const [net, setNet] = useState('villages')
  const [villages, setVillages] = useState(null)
  const [points, setPoints] = useState([])
  const [sisters, setSisters] = useState([])
  const [orgs, setOrgs] = useState([])
  const [orgLinks, setOrgLinks] = useState([])
  const [sisterFires, setSisterFires] = useState([])
  const [announceBoard, setAnnounceBoard] = useState(null)
  const [error, setError] = useState('')
  const [sheet, setSheet] = useState(null)
  const [leaving, setLeaving] = useState(null)
  const globeRef = useRef(null)
  const sheetRef = useRef(null)
  const lastFocus = useRef(null)

  const myOrgs = useMemo(() => organizations || [], [organizations])

  // Coming back from "confirm your email" after tapping Sign up on an event:
  // send them to that event instead of leaving them on the globe.
  useEffect(() => {
    const back = peekReturnTo()
    if (back) navigate(back, { replace: true })
  }, [navigate])

  useEffect(() => {
    let alive = true
    supabase.rpc('village_network').then(({ data, error: err }) => {
      if (!alive) return
      if (err) { console.error('Failed to load villages:', err); setError("We couldn't load the world. Check your connection and try again."); setVillages([]); return }
      setVillages(data || [])
    })
    supabase.rpc('village_zip_points').then(({ data, error: err }) => {
      if (!alive) return
      if (err) { console.error('Failed to load village zip codes:', err); return }
      setPoints(data || [])
    })
    supabase.rpc('village_sister_list').then(({ data, error: err }) => {
      if (!alive) return
      if (err) { console.error('Failed to load sister villages:', err); return }
      setSisters(data || [])
    })
    supabase.rpc('sister_campfires').then(({ data, error: err }) => {
      if (!alive) return
      if (err) { console.error('Failed to load Sister Campfires:', err); return }
      setSisterFires((data || []).filter((c) => !c.closed_at))
    })
    supabase.rpc('org_connection_lines').then(({ data, error: err }) => {
      if (!alive) return
      if (err) { console.error('Failed to load organization connections:', err); return }
      setOrgLinks((data || []).map((r) => [r.org_a, r.org_b]))
    })
    supabase.from('organizations').select('id, name, description').eq('approved', true).order('name').then(({ data, error: err }) => {
      if (!alive) return
      if (err) { console.error('Failed to load organizations:', err); return }
      setOrgs(data || [])
    })
    supabase.from('campfire_boards').select('id').eq('is_general', true).eq('archived', false).limit(1).then(({ data, error: err }) => {
      if (!alive) return
      if (err) { console.error('Failed to load Announcements:', err); return }
      setAnnounceBoard(((data || [])[0] || {}).id || null)
    })
    return () => { alive = false }
  }, [])

  const pointsByVillage = useMemo(() => {
    const m = {}
    points.forEach((p) => { (m[p.village_id] = m[p.village_id] || []).push(p) })
    return m
  }, [points])

  // Which villages go on the globe: yours, the ones that overlap yours, and
  // your sisters. With none yet, the villages around your zip code.
  const shown = useMemo(() => {
    if (!villages) return []
    const placed = villages.filter((v) => v.latitude != null && v.longitude != null)
    const zipsOf = (v) => new Set((pointsByVillage[v.id] || []).map((p) => p.zip))
    const mine = placed.filter((v) => v.is_mine)
    const pick = new Map()
    const add = (v) => { if (v && pick.size < MAX_ON_GLOBE && !pick.has(v.id)) pick.set(v.id, v) }
    mine.forEach(add)
    const myZips = new Set()
    mine.forEach((v) => zipsOf(v).forEach((z) => myZips.add(z)))
    if (!mine.length && profile && profile.zip_code) myZips.add(profile.zip_code)
    const mineIds = new Set(mine.map((v) => v.id))
    sisters.forEach((s) => {
      if (mineIds.has(s.village_a)) add(placed.find((v) => v.id === s.village_b))
      if (mineIds.has(s.village_b)) add(placed.find((v) => v.id === s.village_a))
    })
    placed.filter((v) => [...zipsOf(v)].some((z) => myZips.has(z))).forEach(add)
    if (!pick.size) placed.slice().sort((a, b) => (b.member_count || 0) - (a.member_count || 0)).forEach(add)
    return [...pick.values()]
  }, [villages, pointsByVillage, sisters, profile])

  const villageMap = useMemo(() => {
    if (!shown.length) return null
    const lay = circleLayout(shown, pointsByVillage)
    const fit = fitToLand(lay)
    const byId = {}
    shown.forEach((v, i) => { byId[v.id] = { ...v, ...fit.nodes[i], ...fit.labels[i] } })
    const lines = sisters.filter((s) => byId[s.village_a] && byId[s.village_b]).map((s) => {
      const a = byId[s.village_a], b = byId[s.village_b], dx = b.gx - a.gx, dy = b.gy - a.gy, len = Math.hypot(dx, dy) || 1
      const p = { x: a.gx + (dx / len) * a.gr, y: a.gy + (dy / len) * a.gr }, q = { x: b.gx - (dx / len) * b.gr, y: b.gy - (dy / len) * b.gr }
      return { a, b, mine: a.is_mine || b.is_mine, both: a.is_mine && b.is_mine, ...curve(p, q, 5) }
    })
    return { nodes: shown.map((v) => byId[v.id]), lines }
  }, [shown, pointsByVillage, sisters])

  // Organizations on the globe: yours first, then the ones connected to
  // yours, then others, placed in a gentle spiral over the land.
  const orgMap = useMemo(() => {
    const mineIds = new Set(myOrgs.map((o) => o.id))
    const linked = new Set(orgLinks.flat())
    const list = orgs.slice().sort((a, b) => (mineIds.has(b.id) - mineIds.has(a.id)) || (linked.has(b.id) - linked.has(a.id)) || a.name.localeCompare(b.name)).slice(0, MAX_ON_GLOBE)
    const n = list.length
    const nodes = list.map((o, i) => {
      const ang = i * 2.39996 - Math.PI / 2, rad = n === 1 ? 0 : 10 + 22 * Math.sqrt(i / Math.max(n - 1, 1))
      return { ...o, mine: mineIds.has(o.id), role: (myOrgs.find((m) => m.id === o.id) || {}).role, gx: 50 + Math.cos(ang) * rad, gy: 48 + Math.sin(ang) * rad * 0.95 }
    })
    const byId = Object.fromEntries(nodes.map((o) => [o.id, o]))
    const lines = orgLinks.filter(([a, b]) => byId[a] && byId[b]).map(([a, b]) => ({ a: byId[a], b: byId[b], ...curve({ x: byId[a].gx, y: byId[a].gy }, { x: byId[b].gx, y: byId[b].gy }, 5) }))
    return { nodes, lines }
  }, [orgs, myOrgs, orgLinks])

  useEffect(() => {
    if (!sheet) return
    const first = sheetRef.current && sheetRef.current.querySelector('button, a')
    if (first) first.focus()
    function onKey(e) { if (e.key === 'Escape') closeSheet() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])

  function openSheet(s) { lastFocus.current = document.activeElement; setSheet(s) }
  function closeSheet() { setSheet(null); if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus() }

  // Zoom toward a spot on the globe, then go.
  function zoomTo(xPct, yPct, to, spin) {
    if (stillMotion() || !globeRef.current) { navigate(to); return }
    setLeaving({ x: xPct, y: yPct, spin })
    setTimeout(() => navigate(to), spin ? 1100 : 600)
  }

  function tapVillage(v) {
    if (v.is_mine) { zoomTo(v.gx, v.gy, '/village/' + v.id); return }
    openSheet({ kind: 'village', v })
  }
  function tapOrg(o) { zoomTo(o.gx, o.gy, '/orgs/' + o.id) }

  const view = net === 'villages' ? villageMap : orgMap
  const hasMine = net === 'villages' ? shown.some((v) => v.is_mine) : myOrgs.length > 0

  return (
    <div className="vs-page wd-page">
      <div className="wd-brand">Village Without Borders</div>

      <div className="wd-switch" role="group" aria-label="Which network">
        <button type="button" aria-pressed={net === 'villages'} onClick={() => setNet('villages')}><span aria-hidden="true">{'\u{1F3D8}️'}</span> Villages</button>
        <button type="button" aria-pressed={net === 'orgs'} onClick={() => setNet('orgs')}><span aria-hidden="true">{'\u{1F465}'}</span> Organizations</button>
      </div>

      <div className="wd-globe-wrap">
        {announceBoard && (
          <button type="button" className="wd-news" aria-label="Announcements" onClick={() => navigate('/campfire?board=' + announceBoard)}>{'\u{1F4E3}'}</button>
        )}
        <div className={'wd-float' + (leaving ? ' wd-leaving' : '')}>
          <div ref={globeRef} className={'wd-globe' + (leaving ? (leaving.spin ? ' wd-spin' : ' wd-zoom') : '')}
            style={leaving ? { transformOrigin: leaving.x + '% ' + leaving.y + '%' } : undefined}>
            <button type="button" className="wd-sea" aria-label="Spin the globe to see every village" onClick={() => zoomTo(50, 50, '/villages', true)}>
              <img src="/art/globe.webp" alt="" width="720" height="720" fetchpriority="high" />
            </button>
            <svg className="wd-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {net === 'villages' && villageMap && villageMap.nodes.slice().sort((a, b) => (a.is_mine ? 1 : 0) - (b.is_mine ? 1 : 0)).map((v) => (
                <circle key={v.id} cx={v.gx} cy={v.gy} r={v.gr}
                  fill={v.is_mine ? '#7fdcc0' : '#bfeee0'} fillOpacity={v.is_mine ? 0.55 : 0.12}
                  stroke={v.is_mine ? '#f2c763' : '#e8fff7'} strokeOpacity={v.is_mine ? 1 : 0.7}
                  strokeDasharray={v.is_mine ? undefined : '1.6 1.6'} vectorEffect="non-scaling-stroke" style={{ strokeWidth: v.is_mine ? '3px' : '2px' }} />
              ))}
              {view && view.lines.map((l, i) => (
                <path key={i} d={l.d} fill="none" stroke="#f2c763" strokeOpacity={l.both === false && net === 'villages' ? 0.45 : 1}
                  strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: l.both === false && net === 'villages' ? '3px' : '5px' }} />
              ))}
            </svg>

            {net === 'villages' && villageMap && villageMap.nodes.map((v) => (
              <button key={v.id} type="button" className={'wd-circle' + (v.is_mine ? ' wd-in' : ' wd-none')}
                style={{ left: v.gx + '%', top: v.gy + '%', width: (v.gr * 2) + '%' }}
                aria-label={v.name + (v.is_mine ? ', you are in. Step inside.' : ', not joined yet')}
                onClick={() => tapVillage(v)}>
                {v.is_mine && <span className="wd-em" aria-hidden="true">{'\u{1F3D8}️'}</span>}
              </button>
            ))}
            {net === 'villages' && villageMap && villageMap.nodes.map((v) => (
              <span key={'t' + v.id} className={'wd-tag' + (v.is_mine ? ' wd-tag-under' : ' wd-tag-mid')} aria-hidden="true" style={{ left: v.gx + '%', top: v.gy + '%' }}>
                {v.is_mine ? '' : '+ '}{v.name}
              </span>
            ))}

            {net === 'orgs' && orgMap.nodes.map((o) => (
              <button key={o.id} type="button" className={'wd-org' + (o.mine ? ' wd-in' : ' wd-none')}
                style={{ left: o.gx + '%', top: o.gy + '%' }}
                aria-label={o.name + (o.mine ? ', you belong' : ', not joined yet')}
                onClick={() => tapOrg(o)}>
                <span className="wd-em" aria-hidden="true">{'\u{1F465}'}</span>
                <span className="wd-org-tag">{o.mine ? '' : '+ '}{o.name}</span>
              </button>
            ))}

            {view && view.lines.map((l, i) => (
              <button key={'m' + i} type="button" className={'wd-mid' + (net === 'villages' && !l.mine ? ' wd-faint' : '')}
                style={{ left: l.x.toFixed(1) + '%', top: l.y.toFixed(1) + '%' }}
                aria-label={(net === 'villages' ? 'Sister Campfire for ' : 'Shared Campfire for ') + l.a.name + ' and ' + l.b.name}
                onClick={() => openSheet({ kind: net === 'villages' ? 'sister' : 'orglink', a: l.a, b: l.b })}>
                {'\u{1F525}'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {villages === null && <p className="wd-sub" role="status">Loading your world...</p>}
      {error && <p className="vs-error" role="alert">{error}</p>}

      <h1 className="wd-hint">{net === 'villages' ? 'Your villages' : 'Your organizations'}</h1>
      <p className="wd-sub">
        {net === 'villages'
          ? (hasMine ? 'Villages overlap where they share zip codes. A gold line joins sister villages. Tap your village to step inside.' : 'You have not joined a village yet. Tap a village near you to join, or find yours by zip code.')
          : (myOrgs.length ? 'Organizations are people working together, not places. A gold line joins two that chose to connect.' : 'You do not belong to an organization yet. Tap one to see what it does.')}
      </p>

      <div className="wd-actions">
        {net === 'villages' && <button type="button" className="btn btn-outline btn-full" onClick={() => navigate('/villages')}>See every village</button>}
        {net === 'villages' && !hasMine && <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/find-village')}>Find my village</button>}
        {net === 'orgs' && <button type="button" className="btn btn-outline btn-full" onClick={() => navigate('/villages?tab=orgs')}>See every organization</button>}
        <button type="button" className="btn btn-outline btn-full" onClick={() => navigate('/home')}>Your day</button>
      </div>

      {sheet && (
        <div className="vs-shade" onClick={(e) => { if (e.target === e.currentTarget) closeSheet() }}>
          <div className="vs-sheet" role="dialog" aria-modal="true" aria-labelledby="wd-sheet-title" ref={sheetRef}>
            {sheet.kind === 'village' && <>
              <h2 id="wd-sheet-title"><span aria-hidden="true">{'\u{1F3D8}️'}</span> {sheet.v.name}</h2>
              <p>{sheet.v.member_count ? sheet.v.member_count + ' neighbors' : 'Just getting started'}{sheet.v.towns ? '. ' + sheet.v.towns : ''}</p>
              <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/find-village?join=' + sheet.v.id)}>Join {sheet.v.name}</button>
              <button type="button" className="btn btn-outline btn-full" onClick={() => navigate('/village/' + sheet.v.id)}>Look around first</button>
              <p className="vs-note">If your zip code is not in this village, you can join as a guest when a member invites you or when it becomes a sister of your village.</p>
            </>}
            {sheet.kind === 'sister' && <>
              <h2 id="wd-sheet-title"><span aria-hidden="true">{'\u{1F525}'}</span> {sheet.a.name} and {sheet.b.name}</h2>
              <p>These are sister villages. They share a Sister Campfire. Anyone in either village can join it.</p>
              <SisterCampfireButton campfire={sisterFires.find((c) => [c.village_a, c.village_b].sort().join('|') === [sheet.a.id, sheet.b.id].sort().join('|'))} />
            </>}
            {sheet.kind === 'orglink' && <>
              <h2 id="wd-sheet-title"><span aria-hidden="true">{'\u{1F525}'}</span> {sheet.a.name} and {sheet.b.name}</h2>
              <p>These organizations are connected. Their Heads and organizers share a Campfire. Find it under Cottage Chats and Campfires in Messages.</p>
              <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/messages')}>Open Messages</button>
            </>}
            <button type="button" className="btn btn-outline btn-full" onClick={closeSheet}>Back to the globe</button>
          </div>
        </div>
      )}
    </div>
  )
}
