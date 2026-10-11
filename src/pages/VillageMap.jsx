import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import 'leaflet/dist/leaflet.css'
import BackLink from '../components/BackLink'

// The Village Network, in two tabs.
// Neighborhoods: zip code villages as a map and as a network web. Names, places, and rough sizes only, never people.
// Organizations: approved organizations as a list. Each row opens to show its details and a link to its page.
// Contact email is left to the organization page, which only shows it when the organization chose to.
// Deep link: /villages?tab=orgs opens the Organizations tab.

function countText(v) {
  if (v.just_starting || v.member_count == null) return 'Just getting started'
  return v.member_count + ' neighbors'
}

// Only open web addresses that start with http or https.
function safeUrl(u) {
  if (!u) return null
  const t = String(u).trim()
  if (/^https?:\/\//i.test(t)) return t
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(t)) return 'https://' + t
  return null
}

function distanceMiles(a, b) {
  const R = 3958.8
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Villages are linked when they share zip codes, and the line says how many.
// Villages that share nothing with any other village would float alone, so the
// closest of them are joined with a plain distance line (shared is 0) to keep
// the web in one piece.
function networkLinks(list, pointsByVillage) {
  const zipSets = list.map((v) => new Set((pointsByVillage[v.id] || []).map((p) => p.zip)))
  const edges = []
  const parent = list.map((_, i) => i)
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      let shared = 0
      for (const z of zipSets[i]) if (zipSets[j].has(z)) shared++
      if (shared > 0) {
        edges.push({ i, j, shared, d: distanceMiles(list[i], list[j]) })
        parent[find(i)] = find(j)
      }
    }
  }
  // Join any separate groups, shortest gaps first.
  const gaps = []
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) gaps.push({ i, j, shared: 0, d: distanceMiles(list[i], list[j]) })
  }
  gaps.sort((a, b) => a.d - b.d)
  for (const g of gaps) {
    if (find(g.i) !== find(g.j)) { edges.push(g); parent[find(g.i)] = find(g.j) }
  }
  return edges
}

function layout(list, w, h, pad) {
  const lat0 = list.reduce((s, v) => s + Number(v.latitude), 0) / list.length
  const kx = Math.cos((lat0 * Math.PI) / 180)
  const pts = list.map((v) => ({ x: Number(v.longitude) * kx, y: -Number(v.latitude) }))
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x))
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y))
  const spanX = maxX - minX || 1, spanY = maxY - minY || 1
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY)
  // Center the real spread of the villages. With one village (or villages in a
  // straight line) the spread is zero on that side, so it sits in the middle.
  const offX = (w - (maxX - minX) * scale) / 2, offY = (h - (maxY - minY) * scale) / 2
  return pts.map((p) => ({ x: offX + (p.x - minX) * scale, y: offY + (p.y - minY) * scale }))
}

const LABEL_FONT = 12
function labelWidth(name) { return Math.round(String(name || '').length * 7 + 22) }
function nodeRadius(v) { return v.member_count ? Math.min(24, 13 + Math.sqrt(v.member_count) * 0.9) : 13 }

// Each village takes up a box: its circle plus the name pill under it.
// Push boxes apart until none overlap, then fit everything in the view.
function spreadWeb(list, pts) {
  const boxes = list.map((v, i) => {
    const r = nodeRadius(v), lw = labelWidth(v.name)
    return { x: pts[i].x, y: pts[i].y, r, w: Math.max(lw, r * 2) + 16, h: r * 2 + 54 }
  })
  for (let pass = 0; pass < 200; pass++) {
    let moved = false
    // Push sideways while the web is narrow, so lines run beside the name pills.
    // Once it gets wide, push up and down instead, so it stays readable on a phone.
    const spanW = Math.max(...boxes.map((b) => b.x)) - Math.min(...boxes.map((b) => b.x))
    const spanH = Math.max(...boxes.map((b) => b.y)) - Math.min(...boxes.map((b) => b.y))
    const bias = spanW > spanH * 1.1 + 120 ? 0.5 : 2.5
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j]
        // Box centers sit a little below the circle so the label is inside the box.
        const ay = a.y + 10, by = b.y + 10
        const ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x)
        const oy = (a.h + b.h) / 2 - Math.abs(ay - by)
        if (ox > 0 && oy > 0) {
          moved = true
          if (ox < oy * bias) { const p = (ox / 2 + 1) * (a.x <= b.x ? -1 : 1); a.x += p; b.x -= p }
          else { const p = (oy / 2 + 1) * (ay <= by ? -1 : 1); a.y += p; b.y -= p }
        }
      }
    }
    if (!moved) break
  }
  const pad = 14
  const minX = Math.min(...boxes.map((b) => b.x - b.w / 2)) - pad
  const maxX = Math.max(...boxes.map((b) => b.x + b.w / 2)) + pad
  const minY = Math.min(...boxes.map((b) => b.y - b.r)) - pad
  const maxY = Math.max(...boxes.map((b) => b.y + b.r + 30)) + pad
  return { boxes, vb: [minX, minY, Math.max(maxX - minX, 200), Math.max(maxY - minY, 160)] }
}

export default function VillageMap() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'orgs' ? 'orgs' : 'hoods'
  function setTab(t) {
    const next = new URLSearchParams(searchParams)
    if (t === 'orgs') next.set('tab', 'orgs'); else next.delete('tab')
    setSearchParams(next, { replace: true })
  }
  const [orgs, setOrgs] = useState(null)
  const [orgsError, setOrgsError] = useState('')
  const [openOrgs, setOpenOrgs] = useState({})
  const [zipText, setZipText] = useState('')
  const [searchPoint, setSearchPoint] = useState(null)
  const [zipError, setZipError] = useState('')
  const [zipBusy, setZipBusy] = useState(false)
  const [villages, setVillages] = useState([])
  const [boards, setBoards] = useState([])
  const [points, setPoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('map')
  const [selectedId, setSelectedId] = useState(null)
  // The line someone tapped, so the card can say what the two villages share.
  const [linkInfo, setLinkInfo] = useState(null)
  // A short note under a village in the list, for a village the person cannot join.
  const [listNote, setListNote] = useState(null)
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const selectedRef = useRef(null)
  selectedRef.current = selectedId

  useEffect(() => {
    let alive = true
    supabase.rpc('village_network').then(({ data, error: err }) => {
      if (!alive) return
      if (err) { console.error('Failed to load villages:', err); setError("We couldn't load the villages. Try again in a moment."); setLoading(false); return }
      const rows = data || []
      setVillages(rows)
      setSelectedId((rows.find((v) => v.is_mine) || rows[0] || {}).id || null)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    // The zip codes each village covers (public places, never people).
    supabase.rpc('village_zip_points').then(({ data, error: err }) => {
      if (err) { console.error('Failed to load village zips:', err); return }
      setPoints(data || [])
    })
  }, [])

  useEffect(() => {
    // The database only returns the boards this person is allowed to open.
    supabase.from('campfire_boards').select('id, village_id').not('village_id', 'is', null).then(({ data, error: err }) => {
      if (err) { console.error('Failed to load village boards:', err); return }
      setBoards(data || [])
    })
  }, [])

  useEffect(() => {
    // Approved organizations, loaded the first time the Organizations tab opens.
    if (tab !== 'orgs' || orgs !== null) return
    let alive = true
    supabase.from('organizations').select('id, name, description, website_url').eq('approved', true).order('name').then(({ data, error: err }) => {
      if (!alive) return
      if (err) { console.error('Failed to load organizations:', err); setOrgsError("We couldn't load the organizations. Try again in a moment."); setOrgs([]); return }
      setOrgs(data || [])
    })
    return () => { alive = false }
  }, [tab, orgs])

  const placed = useMemo(() => villages.filter((v) => v.latitude != null && v.longitude != null), [villages])
  const unplaced = useMemo(() => villages.filter((v) => v.latitude == null || v.longitude == null), [villages])
  const selected = villages.find((v) => v.id === selectedId) || null
  const pointsByVillage = useMemo(() => {
    const m = {}
    points.forEach((p) => { (m[p.village_id] = m[p.village_id] || []).push(p) })
    return m
  }, [points])
  const myZip = profile?.zip_code || ''
  const covers = (v, zip) => !!zip && (pointsByVillage[v.id] || []).some((p) => p.zip === zip)

  // Villages whose zip list includes the searched zip code, closest first.
  const nearSearch = useMemo(() => {
    if (!searchPoint) return []
    return placed
      .map((v) => ({ v, miles: Math.round(distanceMiles(searchPoint, { latitude: Number(v.latitude), longitude: Number(v.longitude) })) }))
      .filter((x) => covers(x.v, searchPoint.zip))
      .sort((a, b) => a.miles - b.miles)
  }, [searchPoint, placed, pointsByVillage])

  async function searchZip(e) {
    e.preventDefault()
    const z = zipText.trim()
    if (!/^\d{5}$/.test(z)) { setZipError('Enter a 5 digit zip code.'); return }
    setZipBusy(true); setZipError('')
    const { data, error: err } = await supabase.from('zip_codes').select('zip, city, state, latitude, longitude').eq('zip', z).maybeSingle()
    setZipBusy(false)
    if (err) { console.error('Zip lookup failed:', err); setZipError('We could not look that up. Try again.'); return }
    if (!data) { setSearchPoint(null); setZipError('We could not find that zip code.'); return }
    setSearchPoint({ zip: data.zip, city: data.city, state: data.state, latitude: Number(data.latitude), longitude: Number(data.longitude) })
    setView('map')
  }

  function clearSearch() { setSearchPoint(null); setZipText(''); setZipError('') }
  const boardFor = (v) => boards.find((b) => b.village_id === v.id)

  // Tapping a village in the list at the bottom: open the chat if you are in it,
  // ask to join if you are not (the join page shows the short warning first).
  function openVillage(v) {
    setSelectedId(v.id)
    setListNote(null)
    if (v.is_mine) {
      const b = boardFor(v)
      navigate(b ? '/campfire?board=' + b.id : '/find-village?join=' + v.id)
      return
    }
    if (covers(v, myZip)) { navigate('/find-village?join=' + v.id); return }
    setListNote({ id: v.id, text: myZip ? 'Your zip code is not on this village\u2019s list, so you cannot join it.' : 'Add your zip code on your Profile to join.' })
  }

  // The real map. Leaflet loads only when this page opens.
  useEffect(() => {
    if (tab !== 'hoods' || view !== 'map' || !placed.length || !mapEl.current) return
    let cancelled = false
    import('leaflet').then((mod) => {
      if (cancelled || !mapEl.current) return
      const L = mod.default || mod
      const map = L.map(mapEl.current, { scrollWheelZoom: false, zoomControl: true })
      mapRef.current = map
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)
      // Lines join villages. Drawn first so circles sit on top.
      const links = networkLinks(placed, pointsByVillage)
      links.forEach((e) => {
        const a = placed[e.i], b = placed[e.j]
        L.polyline([[Number(a.latitude), Number(a.longitude)], [Number(b.latitude), Number(b.longitude)]], { color: '#f4dca4', weight: e.shared ? 3 : 2, opacity: e.shared ? 0.9 : 0.6, dashArray: e.shared ? '1 8' : '6 8', lineCap: 'round', interactive: false }).addTo(map)
      })
      const bounds = []
      markersRef.current = {}
      placed.forEach((v) => {
        const ll = [Number(v.latitude), Number(v.longitude)]
        bounds.push(ll)
        // Each zip code the village covers shows as a small dot.
        ;(pointsByVillage[v.id] || []).forEach((p) => {
          L.circleMarker([Number(p.latitude), Number(p.longitude)], { radius: 5, color: '#4ecca3', weight: 1, fillColor: '#4ecca3', fillOpacity: 0.3, interactive: false }).addTo(map)
        })
        const picked = String(v.id) === String(selectedRef.current)
        const m = L.circleMarker(ll, { radius: nodeRadius(v), color: picked || v.is_mine ? '#ffcc66' : '#8fe6cd', weight: picked ? 5 : v.is_mine ? 4 : 2, fillColor: '#52c9aa', fillOpacity: 0.9 }).addTo(map)
        // Names stay on screen, since phones cannot hover.
        m.bindTooltip(v.name, { permanent: true, direction: 'bottom', offset: [0, 6], className: 'vwb-map-label' })
        m.on('click', () => { setSelectedId(v.id); setLinkInfo(null) })
        markersRef.current[v.id] = m
      })
      // A small dot on each line. Tap it to see what the two villages share.
      links.forEach((e) => {
        const a = placed[e.i], b = placed[e.j]
        const mid = [(Number(a.latitude) + Number(b.latitude)) / 2, (Number(a.longitude) + Number(b.longitude)) / 2]
        L.circleMarker(mid, { radius: 7, color: '#0b3b38', weight: 2, fillColor: '#f6f0e0', fillOpacity: 1 })
          .on('click', () => setLinkInfo({ a: a.name, b: b.name, shared: e.shared, miles: Math.round(e.d) }))
          .addTo(map)
      })
      // When names would sit on top of each other, show the most important ones:
      // your village first, then bigger villages. Tap any circle to see its name below.
      const order = [...placed].sort((x, y) => (y.is_mine ? 1 : 0) - (x.is_mine ? 1 : 0) || (y.member_count || 0) - (x.member_count || 0))
      const declutter = () => {
        const kept = []
        order.forEach((v) => {
          const m = markersRef.current[v.id]
          const el = m && m.getTooltip && m.getTooltip() && m.getTooltip().getElement()
          if (!el) return
          el.style.visibility = 'visible'
          const r = el.getBoundingClientRect()
          if (kept.some((k) => r.left < k.right && k.left < r.right && r.top < k.bottom && k.top < r.bottom)) el.style.visibility = 'hidden'
          else kept.push(r)
        })
      }
      map.on('zoomend moveend', declutter)
      if (searchPoint) {
        const ll = [searchPoint.latitude, searchPoint.longitude]
        L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#ff8844', fillOpacity: 1 }).addTo(map).bindTooltip('Your search: ' + searchPoint.zip, { direction: 'top' })
        const near = nearSearch.map((x) => [Number(x.v.latitude), Number(x.v.longitude)])
        if (near.length) map.fitBounds([ll, ...near], { padding: [40, 40], maxZoom: 10 })
        else map.setView(ll, 9)
      } else if (bounds.length === 1) map.setView(bounds[0], 9)
      else map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 })
      setTimeout(declutter, 0)
    }).catch((err) => console.error('Map failed to load:', err))
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [tab, view, placed, searchPoint, nearSearch, pointsByVillage])

  // Show which village is picked by giving its circle a thicker ring.
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, m]) => {
      const v = villages.find((x) => String(x.id) === String(id))
      if (!v || !m.setStyle) return
      const on = String(id) === String(selectedId)
      m.setStyle({ color: on || v.is_mine ? '#ffcc66' : '#8fe6cd', weight: on ? 5 : v.is_mine ? 4 : 2 })
    })
  }, [selectedId, villages, tab, view, placed])

  // The web: villages placed by where they really are, joined to their closest neighbors.
  const web = useMemo(() => {
    if (!placed.length) return null
    const W = 340, H = 300
    const { boxes, vb } = spreadWeb(placed, layout(placed, W, H, 60))
    // Put each line's dot where no circle or name pill covers it.
    const clear = (x, y) => boxes.every((b, k) => {
      const v = placed[k], w = labelWidth(v.name)
      const inCircle = Math.hypot(x - b.x, y - b.y) < b.r + 10
      const inLabel = x > b.x - w / 2 - 9 && x < b.x + w / 2 + 9 && y > b.y + b.r + 4 - 9 && y < b.y + b.r + 25 + 9
      return !inCircle && !inLabel
    })
    // Dots also keep apart from each other, so each one is easy to tap.
    const taken = []
    const free = (x, y) => clear(x, y) && taken.every((d) => Math.hypot(x - d[0], y - d[1]) > 34)
    const edges = networkLinks(placed, pointsByVillage).map((e) => {
      const a = boxes[e.i], b = boxes[e.j]
      let t = 0.5
      for (const c of [0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8]) {
        if (free(a.x + (b.x - a.x) * c, a.y + (b.y - a.y) * c)) { t = c; break }
      }
      taken.push([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t])
      return { ...e, miles: Math.round(e.d), mx: a.x + (b.x - a.x) * t, my: a.y + (b.y - a.y) * t }
    })
    return { vb, pts: boxes, edges }
  }, [placed, pointsByVillage])

  if (loading) return <div className="cal-page"><p className="cal-empty">Loading...</p></div>

  return (
    <div className="cal-page hub-page">
      <BackLink fallback="/" fallbackLabel="Home" />
      <style>{'.vwb-map-label{background:#f6f0e0;color:#0b3b38;border:1.5px solid #0b3b38;border-radius:10px;padding:2px 8px;font-weight:600;font-size:12px;box-shadow:none}.vwb-map-label:before{display:none}'}</style>
      <h1 className="hub-org-name">The Village Network</h1>

      <div role="tablist" aria-label="Village Network" style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0 0.75rem' }}>
        <button type="button" role="tab" id="tab-hoods" aria-selected={tab === 'hoods'} aria-controls="panel-hoods" className={'btn ' + (tab === 'hoods' ? 'btn-primary' : 'btn-outline')} style={{ flex: 1, minHeight: '48px', minWidth: 0 }} onClick={() => setTab('hoods')}>{'\u{1F333}'} Neighborhoods</button>
        <button type="button" role="tab" id="tab-orgs" aria-selected={tab === 'orgs'} aria-controls="panel-orgs" className={'btn ' + (tab === 'orgs' ? 'btn-primary' : 'btn-outline')} style={{ flex: 1, minHeight: '48px', minWidth: 0 }} onClick={() => setTab('orgs')}>{'\u{1F465}'} Organizations</button>
      </div>

      {tab === 'orgs' && (
        <section id="panel-orgs" role="tabpanel" aria-labelledby="tab-orgs">
          <p className="cal-sub">Organizations working with Village Without Borders. Tap a name to see more.</p>
          {orgs === null && <p className="cal-empty">Loading...</p>}
          {orgsError && <p className="form-error" role="alert">{orgsError}</p>}
          {orgs && !orgsError && orgs.length === 0 && <p className="cal-empty">No organizations yet.</p>}
          {orgs && orgs.map((o) => {
            const open = !!openOrgs[o.id]
            const site = safeUrl(o.website_url)
            return (
              <div key={o.id} className="cal-card" style={{ width: '100%', padding: 0 }}>
                <button type="button" aria-expanded={open} aria-controls={'org-' + o.id} onClick={() => setOpenOrgs((m) => ({ ...m, [o.id]: !m[o.id] }))} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', minHeight: '56px', padding: '0.5rem 0.75rem', background: 'none', border: 0, color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                  <span aria-hidden="true" style={{ flex: 'none', width: '44px', height: '44px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', background: 'rgba(78, 204, 163, 0.15)' }}>{'\u{1F465}'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="cal-card-title" style={{ display: 'block' }}>{o.name}</span>
                    <span className="cal-card-meta">Organization</span>
                  </span>
                  <span aria-hidden="true" style={{ flex: 'none', transform: open ? 'rotate(180deg)' : 'none' }}>{'\u25BE'}</span>
                </button>
                {open && (
                  <div id={'org-' + o.id} style={{ padding: '0 0.75rem 0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.12)' }}>
                    {o.description ? <p style={{ margin: '0.6rem 0' }}>{o.description}</p> : <p className="cal-sub" style={{ margin: '0.6rem 0' }}>No description yet.</p>}
                    {site && <a className="btn btn-outline btn-full" style={{ minHeight: '44px', marginBottom: '0.5rem' }} href={site} target="_blank" rel="noopener noreferrer">Visit their website</a>}
                    <Link className="btn btn-primary btn-full" style={{ minHeight: '44px' }} to={'/orgs/' + o.id}>Open {o.name}</Link>
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}

      {tab === 'hoods' && (
      <div id="panel-hoods" role="tabpanel" aria-labelledby="tab-hoods">
      <p className="cal-sub">Every neighborhood village. Only names, places, and rough sizes are shown, never people.</p>
      <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px', margin: '0.5rem 0' }} onClick={() => navigate('/find-village')}>Find, join, or start a village chat</button>

      <form onSubmit={searchZip} style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0' }}>
        <label htmlFor="map-zip" className="sr-only">Search the map by zip code</label>
        <input id="map-zip" type="text" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" value={zipText} onChange={(e) => setZipText(e.target.value.replace(/\D/g, ''))} placeholder="Search by zip code" style={{ flex: 1, minWidth: 0, minHeight: '44px', boxSizing: 'border-box', padding: '0 0.75rem', fontSize: '1rem' }} />
        <button type="submit" className="btn btn-outline" style={{ minHeight: '44px' }} disabled={zipBusy}>Search</button>
      </form>
      {zipError && <p className="form-error" role="alert">{zipError}</p>}

      {searchPoint && (
        <section className="cal-box" aria-live="polite" aria-labelledby="zip-result">
          <h2 id="zip-result">Near {searchPoint.zip}{searchPoint.city ? ' (' + searchPoint.city + ', ' + searchPoint.state + ')' : ''}</h2>
          {nearSearch.length > 0 ? nearSearch.map(({ v, miles }) => (
            <button key={v.id} type="button" className="cal-card" style={{ width: '100%', textAlign: 'left', minHeight: '44px' }} onClick={() => setSelectedId(v.id)}>
              <span className="cal-card-title">{v.name}{v.is_mine ? ' \u00B7 joined' : ''}</span>
              <span className="cal-card-meta">{countText(v)}{' \u00B7 about '}{miles} miles away</span>
            </button>
          )) : (
            <>
              <p className="cal-sub">No village chat covers this zip code yet.</p>
              {profile?.zip_code === searchPoint.zip && (
                <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/find-village')}>Start a village for my area</button>
              )}
            </>
          )}
          <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px', marginTop: '0.5rem' }} onClick={clearSearch}>Clear search</button>
        </section>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {!error && villages.length === 0 && <p className="cal-empty">No villages yet.</p>}

      {villages.length > 0 && (
        <>
          <div role="tablist" aria-label="Map view" style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0' }}>
            <button type="button" role="tab" aria-selected={view === 'map'} className={'btn ' + (view === 'map' ? 'btn-primary' : 'btn-outline')} style={{ flex: 1, minHeight: '44px' }} onClick={() => setView('map')}>Map</button>
            <button type="button" role="tab" aria-selected={view === 'web'} className={'btn ' + (view === 'web' ? 'btn-primary' : 'btn-outline')} style={{ flex: 1, minHeight: '44px' }} onClick={() => setView('web')}>Network web</button>
          </div>

          {placed.length === 0 && <p className="cal-empty">These villages don't have a location yet, so there's nothing to draw. They're listed below.</p>}

          {view === 'map' && placed.length > 0 && (
            <>
              <div ref={mapEl} className="village-map" role="application" aria-label="Map of villages. The same villages are listed below." />
              <p className="cal-sub" style={{ marginTop: '0.4rem' }}>Dotted lines join villages that share zip codes. Dashed lines join villages that share none, by distance. Tap the dot on a line to see more.</p>
              <p className="cal-sub">Dots show zip code areas and village centers, never people.</p>
            </>
          )}

          {view === 'web' && web && (
            // A big web keeps its names readable and scrolls sideways inside its own box.
            <div style={{ overflowX: 'auto', borderRadius: '16px', background: '#0f7f74' }}>
            <svg className="village-web" viewBox={web.vb.join(' ')} width="100%" style={{ display: 'block', margin: '0 auto', minWidth: Math.round(web.vb[2] * 0.85) + 'px', maxWidth: Math.round(web.vb[2] * 1.6) + 'px', height: 'auto', maxHeight: '460px' }} role="group" aria-label="Network web of villages. The same villages are listed below.">
              <defs>
                <radialGradient id="vwbHood" cx=".42" cy=".38" r=".7"><stop offset="0" stopColor="#7fdcc0" /><stop offset=".7" stopColor="#55c8a8" /><stop offset="1" stopColor="#3fb594" /></radialGradient>
              </defs>
              {web.edges.map((e, i) => {
                const a = web.pts[e.i], b = web.pts[e.j]
                return <line key={'l' + i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f4dca4" strokeWidth={e.shared ? 3 : 2} strokeLinecap="round" strokeDasharray={e.shared ? '1 8' : '6 8'} strokeOpacity={e.shared ? 0.95 : 0.6} />
              })}
              {placed.map((v, i) => {
                const p = web.pts[i], on = v.id === selectedId
                return (
                  <g key={v.id} tabIndex={0} role="button" aria-label={v.name + ', ' + countText(v)} aria-pressed={on} onClick={() => { setSelectedId(v.id); setLinkInfo(null) }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(v.id); setLinkInfo(null) } }} style={{ cursor: 'pointer' }}>
                    <circle cx={p.x} cy={p.y} r={Math.max(p.r, 22)} fill="transparent" />
                    <circle cx={p.x} cy={p.y} r={p.r} fill="url(#vwbHood)" stroke={v.is_mine ? '#ffcc66' : '#8fe6cd'} strokeWidth={v.is_mine ? 3 : 1.5} />
                    {on && <circle cx={p.x} cy={p.y} r={p.r + 4} fill="none" stroke="#ffd27a" strokeWidth="3" />}
                  </g>
                )
              })}
              {placed.map((v, i) => {
                const p = web.pts[i], w = labelWidth(v.name), ty = p.y + p.r + 18
                return (
                  <g key={'n' + v.id} pointerEvents="none">
                    <rect x={p.x - w / 2} y={ty - 14} width={w} height="21" rx="10.5" fill="#f6f0e0" stroke="#0b3b38" strokeWidth="1.5" />
                    <text x={p.x} y={ty + 1} fill="#0b3b38" fontSize={LABEL_FONT} fontWeight="600" textAnchor="middle">{v.name}</text>
                  </g>
                )
              })}
              {web.edges.map((e, i) => {
                const mx = e.mx, my = e.my
                const label = placed[e.i].name + ' and ' + placed[e.j].name + (e.shared ? ' share ' + e.shared + ' zip code' + (e.shared === 1 ? '' : 's') : ', about ' + e.miles + ' miles apart')
                const pick = () => setLinkInfo({ a: placed[e.i].name, b: placed[e.j].name, shared: e.shared, miles: e.miles })
                return (
                  <g key={'d' + i} tabIndex={0} role="button" aria-label={label} onClick={pick} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick() } }} style={{ cursor: 'pointer' }}>
                    <circle cx={mx} cy={my} r="22" fill="transparent" />
                    <circle cx={mx} cy={my} r="7" fill="#f6f0e0" stroke="#0b3b38" strokeWidth="2" />
                  </g>
                )
              })}
            </svg>
            </div>
          )}

          {view === 'web' && web && <p className="cal-sub" style={{ marginTop: '0.4rem' }}>Dotted lines join villages that share zip codes. Dashed lines join villages that share none. Tap the dot on a line to see more.</p>}

          {linkInfo && (
            <section className="cal-box" aria-live="polite">
              <p style={{ margin: 0 }}>{linkInfo.shared ? linkInfo.a + ' and ' + linkInfo.b + ' share ' + linkInfo.shared + ' zip code' + (linkInfo.shared === 1 ? '' : 's') + '. People in a shared zip code can join either village.' : linkInfo.a + ' and ' + linkInfo.b + ' share no zip codes. They are about ' + linkInfo.miles + ' miles apart.'}</p>
              <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px', marginTop: '0.5rem' }} onClick={() => setLinkInfo(null)}>Close</button>
            </section>
          )}

          {selected && (
            <section className="cal-box" aria-live="polite" aria-labelledby="village-sel">
              <h2 id="village-sel">{selected.name}{selected.is_mine ? ' (you joined)' : ''}</h2>
              {selected.region_label && <p className="cal-sub">{selected.region_label}</p>}
              <p className="cal-sub">{countText(selected)}{selected.zip_count ? ' \u00B7 covers ' + selected.zip_count + ' zip codes' : ''}</p>
              {selected.towns && <p className="cal-sub">Towns: {selected.towns}</p>}
              {selected.is_mine && boardFor(selected) && (
                <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/campfire?board=' + boardFor(selected).id)}>Open this village chat</button>
              )}
              {!selected.is_mine && covers(selected, myZip) && (
                <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/find-village?join=' + selected.id)}>Join this village chat</button>
              )}
              {!selected.is_mine && !covers(selected, myZip) && (
                <p className="cal-sub">{myZip ? 'Your zip code is not on this village\u2019s list.' : 'Add your zip code on your Profile to join.'}</p>
              )}
              {!selected.is_mine && <p className="cal-sub" style={{ marginTop: '0.4rem' }}>Anyone with an account near this village can join. You will read a short warning first.</p>}
            </section>
          )}

          <section className="hub-section" aria-labelledby="village-list">
            <div className="hub-section-head"><h2 id="village-list">All villages ({villages.length})</h2></div>
            {[...placed, ...unplaced].map((v) => (
              <div key={v.id}>
                <button type="button" className="cal-card" style={{ width: '100%', textAlign: 'left', minHeight: '44px' }} aria-pressed={v.id === selectedId} onClick={() => openVillage(v)}>
                  <span className="cal-card-title">{v.name}{v.is_mine ? ' \u00B7 joined' : ''}</span>
                  <span className="cal-card-meta">{v.region_label ? v.region_label + ' \u00B7 ' : ''}{countText(v)}</span>
                  {(v.is_mine || covers(v, myZip)) && <span className="cal-card-meta" style={{ color: '#7fe0bf', fontWeight: 600 }}>{v.is_mine ? 'Tap to open the chat' : 'Tap to join'}</span>}
                </button>
                {listNote && listNote.id === v.id && <p className="cal-sub" role="status" style={{ margin: '0.25rem 0 0.5rem' }}>{listNote.text}</p>}
              </div>
            ))}
          </section>
        </>
      )}
      </div>
      )}
    </div>
  )
}
