import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import 'leaflet/dist/leaflet.css'
import BackLink from '../components/BackLink'

// The villages of Village Without Borders, as a map and as a network web.
// Shows village names, places, and rough sizes only. Never people.

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

export default function VillageMap() {
  const { profile } = useAuth()
  const navigate = useNavigate()
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
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})

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
        // Each zip code the village covers shows as a small dot.
        ;(pointsByVillage[v.id] || []).forEach((p) => {
          L.circleMarker([Number(p.latitude), Number(p.longitude)], { radius: 5, color: '#4ecca3', weight: 1, fillColor: '#4ecca3', fillOpacity: 0.35, interactive: false }).addTo(map)
        })
        const size = v.member_count ? Math.min(22, 9 + Math.sqrt(v.member_count)) : 9
        const m = L.circleMarker(ll, { radius: size, color: v.is_mine ? '#ffaa44' : '#1a4a3a', weight: 3, fillColor: v.is_mine ? '#ffcc66' : '#4ecca3', fillOpacity: 0.95 }).addTo(map)
        m.bindTooltip(v.name, { direction: 'top' })
        m.on('click', () => setSelectedId(v.id))
        markersRef.current[v.id] = m
      })
      // Solid lines join villages that share zip codes. Dashed lines join separate groups.
      networkLinks(placed, pointsByVillage).forEach((e) => {
        const a = placed[e.i], b = placed[e.j]
        L.polyline([[Number(a.latitude), Number(a.longitude)], [Number(b.latitude), Number(b.longitude)]], { color: '#4ecca3', weight: e.shared ? 3 : 2, opacity: e.shared ? 0.8 : 0.5, dashArray: e.shared ? null : '6 6' })
          .bindTooltip(e.shared ? 'Shares ' + e.shared + ' zip code' + (e.shared === 1 ? '' : 's') : Math.round(e.d) + ' miles apart', { sticky: true }).addTo(map)
      })
      if (searchPoint) {
        const ll = [searchPoint.latitude, searchPoint.longitude]
        L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#ff8844', fillOpacity: 1 }).addTo(map).bindTooltip('Your search: ' + searchPoint.zip, { direction: 'top' })
        const near = nearSearch.map((x) => [Number(x.v.latitude), Number(x.v.longitude)])
        if (near.length) map.fitBounds([ll, ...near], { padding: [40, 40], maxZoom: 10 })
        else map.setView(ll, 9)
      } else if (bounds.length === 1) map.setView(bounds[0], 9)
      else map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 })
    }).catch((err) => console.error('Map failed to load:', err))
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [view, placed, searchPoint, nearSearch, pointsByVillage])

  // The web: villages placed by where they really are, joined to their closest neighbors.
  const web = useMemo(() => {
    if (!placed.length) return null
    const W = 340, H = 300
    const pts = layout(placed, W, H, 46)
    return { W, H, pts, edges: networkLinks(placed, pointsByVillage).map((e) => ({ ...e, miles: Math.round(e.d) })) }
  }, [placed, pointsByVillage])

  if (loading) return <div className="cal-page"><p className="cal-empty">Loading...</p></div>

  return (
    <div className="cal-page hub-page">
      <BackLink fallback="/" fallbackLabel="Home" />
      <h1 className="hub-org-name">Village map</h1>
      <p className="cal-sub">Every Village Without Borders village. Only names, places, and rough sizes are shown, never people.</p>
      <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px', margin: '0.5rem 0' }} onClick={() => navigate('/find-village')}>Find, join, or start a village chat</button>

      <form onSubmit={searchZip} style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0' }}>
        <label htmlFor="map-zip" className="sr-only">Search the map by zip code</label>
        <input id="map-zip" type="text" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" value={zipText} onChange={(e) => setZipText(e.target.value.replace(/\D/g, ''))} placeholder="Search by zip code" style={{ flex: 1, minHeight: '44px', boxSizing: 'border-box', padding: '0 0.75rem', fontSize: '1rem' }} />
        <button type="submit" className="btn btn-outline" style={{ minHeight: '44px' }} disabled={zipBusy}>Search</button>
      </form>
      {zipError && <p className="form-error" role="alert">{zipError}</p>}

      {searchPoint && (
        <section className="cal-box" aria-live="polite" aria-labelledby="zip-result">
          <h2 id="zip-result">Near {searchPoint.zip}{searchPoint.city ? ' (' + searchPoint.city + ', ' + searchPoint.state + ')' : ''}</h2>
          {nearSearch.length > 0 ? nearSearch.map(({ v, miles }) => (
            <button key={v.id} type="button" className="cal-card" style={{ width: '100%', textAlign: 'left', minHeight: '44px' }} onClick={() => setSelectedId(v.id)}>
              <span className="cal-card-title">{v.name}{v.is_mine ? ' · joined' : ''}</span>
              <span className="cal-card-meta">{countText(v)} · about {miles} miles away</span>
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
              <p className="cal-sub" style={{ marginTop: '0.4rem' }}>Solid lines join villages that share zip codes. Dashed lines join villages that share none, by distance.</p>
              <p className="cal-sub">Dots show zip code areas and village centers, never people.</p>
            </>
          )}

          {view === 'web' && web && (
            <svg className="village-web" viewBox={'0 0 ' + web.W + ' ' + web.H} role="group" aria-label="Network web of villages. The same villages are listed below.">
              {web.edges.map((e, i) => (
                <g key={i}>
                  <line x1={web.pts[e.i].x} y1={web.pts[e.i].y} x2={web.pts[e.j].x} y2={web.pts[e.j].y} stroke="#4ecca3" strokeWidth={e.shared ? 3 : 2} strokeOpacity={e.shared ? 0.85 : 0.5} strokeDasharray={e.shared ? undefined : '6 6'} />
                  <text x={(web.pts[e.i].x + web.pts[e.j].x) / 2} y={(web.pts[e.i].y + web.pts[e.j].y) / 2 - 4} fill="#9ab" fontSize="9" textAnchor="middle">{e.shared ? 'shares ' + e.shared + ' zip' + (e.shared === 1 ? '' : 's') : e.miles + ' mi'}</text>
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
              <h2 id="village-sel">{selected.name}{selected.is_mine ? ' (you joined)' : ''}</h2>
              {selected.region_label && <p className="cal-sub">{selected.region_label}</p>}
              <p className="cal-sub">{countText(selected)}{selected.zip_count ? ' · covers ' + selected.zip_count + ' zip codes' : ''}</p>
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
              <button key={v.id} type="button" className="cal-card" style={{ width: '100%', textAlign: 'left', minHeight: '44px' }} aria-pressed={v.id === selectedId} onClick={() => setSelectedId(v.id)}>
                <span className="cal-card-title">{v.name}{v.is_mine ? ' · joined' : ''}</span>
                <span className="cal-card-meta">{v.region_label ? v.region_label + ' · ' : ''}{countText(v)}</span>
              </button>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
