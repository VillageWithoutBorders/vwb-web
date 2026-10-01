import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import 'leaflet/dist/leaflet.css'

// The villages of Village Without Borders, as a map and as a network web.
// Shows village names, places, and rough sizes only. Never people.

const MILES_TO_METERS = 1609.34

function countText(v) {
  if (v.just_starting || v.member_count == null) return 'Just getting started'
  return v.member_count + ' neighbors'
}

function distanceMiles(a, b) {
  const R = 3958.8
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Connects every village to its closest neighbors with the fewest lines
// (a minimum spanning tree), so the web shows how the villages link up.
function networkEdges(list) {
  if (list.length < 2) return []
  const inTree = new Set([0])
  const edges = []
  while (inTree.size < list.length) {
    let best = null
    for (const i of inTree) {
      for (let j = 0; j < list.length; j++) {
        if (inTree.has(j)) continue
        const d = distanceMiles(list[i], list[j])
        if (!best || d < best.d) best = { i, j, d }
      }
    }
    edges.push(best)
    inTree.add(best.j)
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
  const offX = (w - spanX * scale) / 2, offY = (h - spanY * scale) / 2
  return pts.map((p) => ({ x: offX + (p.x - minX) * scale, y: offY + (p.y - minY) * scale }))
}

export default function VillageMap() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [villages, setVillages] = useState([])
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('map')
  const [selectedId, setSelectedId] = useState(null)
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})

  const hasCampfire = !!(profile?.is_hope_ambassador || isAdmin)

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
    if (!hasCampfire) return
    supabase.from('campfire_boards').select('id, village_id').not('village_id', 'is', null).then(({ data, error: err }) => {
      if (err) { console.error('Failed to load village boards:', err); return }
      setBoards(data || [])
    })
  }, [hasCampfire])

  const placed = useMemo(() => villages.filter((v) => v.latitude != null && v.longitude != null), [villages])
  const unplaced = useMemo(() => villages.filter((v) => v.latitude == null || v.longitude == null), [villages])
  const selected = villages.find((v) => v.id === selectedId) || null
  const boardFor = (v) => boards.find((b) => b.village_id === v.id)

  // The real map. Leaflet loads only when this page opens.
  useEffect(() => {
    if (view !== 'map' || !placed.length || !mapEl.current) return
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
      const bounds = []
      markersRef.current = {}
      placed.forEach((v) => {
        const ll = [Number(v.latitude), Number(v.longitude)]
        bounds.push(ll)
        if (v.radius_miles) {
          L.circle(ll, { radius: Number(v.radius_miles) * MILES_TO_METERS, color: '#4ecca3', weight: 1, fillColor: '#4ecca3', fillOpacity: 0.12, interactive: false }).addTo(map)
        }
        const size = v.member_count ? Math.min(22, 9 + Math.sqrt(v.member_count)) : 9
        const m = L.circleMarker(ll, { radius: size, color: v.is_mine ? '#ffaa44' : '#1a4a3a', weight: 3, fillColor: v.is_mine ? '#ffcc66' : '#4ecca3', fillOpacity: 0.95 }).addTo(map)
        m.bindTooltip(v.name, { direction: 'top' })
        m.on('click', () => setSelectedId(v.id))
        markersRef.current[v.id] = m
      })
      if (bounds.length === 1) map.setView(bounds[0], 9)
      else map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 })
    }).catch((err) => console.error('Map failed to load:', err))
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [view, placed])

  // The web: villages placed by where they really are, joined to their closest neighbors.
  const web = useMemo(() => {
    if (!placed.length) return null
    const W = 340, H = 300
    const pts = layout(placed, W, H, 46)
    return { W, H, pts, edges: networkEdges(placed).map((e) => ({ ...e, miles: Math.round(e.d) })) }
  }, [placed])

  if (loading) return <div className="cal-page"><p className="cal-empty">Loading...</p></div>

  return (
    <div className="cal-page hub-page">
      <Link to="/" className="hub-back">&#8592; Home</Link>
      <h1 className="hub-org-name">Village map</h1>
      <p className="cal-sub">Every Village Without Borders village. Only names, places, and rough sizes are shown, never people.</p>

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
            <div ref={mapEl} className="village-map" role="application" aria-label="Map of villages. The same villages are listed below." />
          )}

          {view === 'web' && web && (
            <svg className="village-web" viewBox={'0 0 ' + web.W + ' ' + web.H} role="group" aria-label="Network web of villages. The same villages are listed below.">
              {web.edges.map((e, i) => (
                <g key={i}>
                  <line x1={web.pts[e.i].x} y1={web.pts[e.i].y} x2={web.pts[e.j].x} y2={web.pts[e.j].y} stroke="#4ecca3" strokeWidth="2" strokeOpacity="0.6" />
                  <text x={(web.pts[e.i].x + web.pts[e.j].x) / 2} y={(web.pts[e.i].y + web.pts[e.j].y) / 2 - 4} fill="#9ab" fontSize="9" textAnchor="middle">{e.miles} mi</text>
                </g>
              ))}
              {placed.map((v, i) => {
                const r = v.member_count ? Math.min(26, 12 + Math.sqrt(v.member_count)) : 12
                const on = v.id === selectedId
                return (
                  <g key={v.id} tabIndex={0} role="button" aria-label={v.name + ', ' + countText(v)} aria-pressed={on} onClick={() => setSelectedId(v.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(v.id) } }} style={{ cursor: 'pointer' }}>
                    <circle cx={web.pts[i].x} cy={web.pts[i].y} r={Math.max(r, 22)} fill="transparent" />
                    <circle cx={web.pts[i].x} cy={web.pts[i].y} r={r} fill={v.is_mine ? '#ffcc66' : '#4ecca3'} stroke={on ? '#fff' : '#1a4a3a'} strokeWidth={on ? 3 : 2} />
                    <text x={web.pts[i].x} y={web.pts[i].y + r + 13} fill="#ddd" fontSize="11" fontWeight="600" textAnchor="middle">{v.name}</text>
                  </g>
                )
              })}
            </svg>
          )}

          {selected && (
            <section className="cal-box" aria-live="polite" aria-labelledby="village-sel">
              <h2 id="village-sel">{selected.name}{selected.is_mine ? ' (your village)' : ''}</h2>
              {selected.region_label && <p className="cal-sub">{selected.region_label}</p>}
              <p className="cal-sub">{countText(selected)}{selected.radius_miles ? ' · serves about ' + Math.round(selected.radius_miles) + ' miles around its center' : ''}</p>
              {hasCampfire && boardFor(selected) && (
                <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/campfire?board=' + boardFor(selected).id)}>Open this village's Campfire board</button>
              )}
              {!selected.is_mine && !hasCampfire && <p className="cal-sub">Not your village? You can change the zip code on your profile.</p>}
            </section>
          )}

          <section className="hub-section" aria-labelledby="village-list">
            <div className="hub-section-head"><h2 id="village-list">All villages ({villages.length})</h2></div>
            {[...placed, ...unplaced].map((v) => (
              <button key={v.id} type="button" className="cal-card" style={{ width: '100%', textAlign: 'left', minHeight: '44px' }} aria-pressed={v.id === selectedId} onClick={() => setSelectedId(v.id)}>
                <span className="cal-card-title">{v.name}{v.is_mine ? ' · yours' : ''}</span>
                <span className="cal-card-meta">{v.region_label ? v.region_label + ' · ' : ''}{countText(v)}</span>
              </button>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
