import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import 'leaflet/dist/leaflet.css'
import BackLink from '../components/BackLink'
import SisterVillages from '../components/SisterVillages'

import Icon from '../components/Icon'

// The Village Network, in two tabs.
// Neighborhoods: zip code villages as a circle map (like the prototype) or a street map. Names, places, and rough sizes only, never people.
// Organizations: approved organizations as a list. Each row opens to show its details and a link to its page.
// Contact email is left to the organization page, which only shows it when the organization chose to.
// Deep link: /villages?tab=orgs opens the Organizations tab.
// Organizations pick the neighborhoods they work in. A neighborhood keeper can remove one.

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

function nodeRadius(v) { return v.member_count ? Math.min(24, 13 + Math.sqrt(v.member_count) * 0.9) : 13 }

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
  // Oct 22: the globe on Home is the picture of the network; this page is its plain list twin.
  // The street map is an extra for people who think in roads and towns.
  const [view, setView] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  // The line someone tapped, so the card can say what the two villages share.
  const [linkInfo, setLinkInfo] = useState(null)
  // Which organizations work in which neighborhoods.
  const [orgLinks, setOrgLinks] = useState([])
  // Whether you keep the picked neighborhood, and an organization you are about to remove from it.
  const [keeperOf, setKeeperOf] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [removeNote, setRemoveNote] = useState('')
  // Sister Villages: every sister pair, villages you can join as a sister, and whether you started (keep) the picked one.
  const [sisters, setSisters] = useState([])
  const [sisterJoins, setSisterJoins] = useState([])
  const [starterOf, setStarterOf] = useState(null)
  // A short note under a village in the list, for a village the person cannot join.
  const [listNote, setListNote] = useState(null)
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const selectedRef = useRef(null)
  selectedRef.current = selectedId
  const cardRef = useRef(null)

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
    supabase.from('organizations').select('id, name, description, website_url, kind').eq('approved', true).order('name').then(({ data, error: err }) => {
      if (!alive) return
      if (err) { console.error('Failed to load organizations:', err); setOrgsError("We couldn't load the organizations. Try again in a moment."); setOrgs([]); return }
      setOrgs(data || [])
    })
    return () => { alive = false }
  }, [tab, orgs])

  function loadOrgLinks() {
    supabase.rpc('org_village_links').then(({ data, error: err }) => {
      if (err) { console.error('Failed to load organization neighborhoods:', err); return }
      setOrgLinks(data || [])
    })
  }
  useEffect(() => { loadOrgLinks() }, [])

  function loadSisters() {
    supabase.rpc('village_sister_list').then(({ data, error: err }) => {
      if (err) { console.error('Failed to load sister villages:', err); return }
      setSisters(data || [])
    })
    supabase.rpc('sister_join_options').then(({ data, error: err }) => {
      if (err) { console.error('Failed to load sister village joins:', err); return }
      setSisterJoins(data || [])
    })
  }
  useEffect(() => { loadSisters() }, [])

  const worksIn = useMemo(() => {
    const m = {}
    orgLinks.forEach((r) => { (m[r.org_id] = m[r.org_id] || []).push(r.village_name) })
    return m
  }, [orgLinks])
  const workingHere = useMemo(() => {
    const m = {}
    orgLinks.forEach((r) => { (m[r.village_id] = m[r.village_id] || []).push({ id: r.org_id, name: r.org_name }) })
    return m
  }, [orgLinks])

  useEffect(() => {
    // Only a member can keep a village, so only ask about villages you are in.
    setKeeperOf(null); setStarterOf(null); setRemoving(null); setRemoveNote('')
    const v = villages.find((x) => x.id === selectedId)
    if (!v || !v.is_mine) return
    let alive = true
    supabase.rpc('village_keepers_info', { p_village: v.id }).then(({ data, error: err }) => {
      if (!alive) return
      if (err) { console.error('Failed to check village keeper:', err); return }
      const row = Array.isArray(data) ? data[0] : data
      if (row && row.i_am_keeper) setKeeperOf(v.id)
      if (row && row.i_am_starter) setStarterOf(v.id)
    })
    return () => { alive = false }
  }, [selectedId, villages])

  async function confirmRemove() {
    if (!removing || !keeperOf) return
    const { error: err } = await supabase.rpc('remove_org_from_village', { p_org: removing.id, p_village: keeperOf })
    if (err) { console.error('Failed to remove organization from village:', err); setRemoveNote("We couldn't remove them. Try again."); return }
    setRemoveNote(removing.name + ' was removed from this neighborhood.')
    setRemoving(null)
    loadOrgLinks()
  }

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
    if (tab !== 'hoods' || view !== 'street' || !placed.length || !mapEl.current) return
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
      // Work out where each name would sit from the map itself, so it works
      // even before the browser has drawn the labels.
      const declutter = () => {
        const kept = []
        order.forEach((v) => {
          const m = markersRef.current[v.id]
          const el = m && m.getTooltip && m.getTooltip() && m.getTooltip().getElement()
          if (!el) return
          const pt = map.latLngToContainerPoint([Number(v.latitude), Number(v.longitude)])
          const w = labelWidth(v.name), top = pt.y + nodeRadius(v) + 6
          const r = { left: pt.x - w / 2, right: pt.x + w / 2, top, bottom: top + 22 }
          const hit = kept.some((k) => r.left < k.right && k.left < r.right && r.top < k.bottom && k.top < r.bottom)
          el.style.visibility = hit ? 'hidden' : 'visible'
          if (!hit) kept.push(r)
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
      map.whenReady(() => setTimeout(declutter, 50))
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


  // After a zip search, pick the closest village that covers it.
  useEffect(() => { if (nearSearch.length) setSelectedId(nearSearch[0].v.id) }, [nearSearch])

  if (loading) return <div className="cal-page"><p className="cal-empty">Loading...</p></div>

  return (
    <div className="cal-page hub-page" style={{ overflowX: 'clip' }}>
      <BackLink fallback="/" fallbackLabel="Home" />
      <style>{'.vwb-map-label{background:#f6f0e0;color:#0b3b38;border:1.5px solid #0b3b38;border-radius:10px;padding:2px 8px;font-weight:600;font-size:12px;box-shadow:none}.vwb-map-label:before{display:none}'}</style>
      <h1 className="hub-org-name">The Village Network</h1>

      <div role="tablist" aria-label="Village Network" style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0 0.75rem' }}>
        <button type="button" role="tab" id="tab-hoods" aria-selected={tab === 'hoods'} aria-controls="panel-hoods" className={'btn ' + (tab === 'hoods' ? 'btn-primary' : 'btn-outline')} style={{ flex: 1, minHeight: '48px', minWidth: 0 }} onClick={() => setTab('hoods')}><Icon name="tree" /> Neighborhoods</button>
        <button type="button" role="tab" id="tab-orgs" aria-selected={tab === 'orgs'} aria-controls="panel-orgs" className={'btn ' + (tab === 'orgs' ? 'btn-primary' : 'btn-outline')} style={{ flex: 1, minHeight: '48px', minWidth: 0 }} onClick={() => setTab('orgs')}><Icon name="people" /> Organizations</button>
      </div>

      {tab === 'orgs' && (
        <section id="panel-orgs" role="tabpanel" aria-labelledby="tab-orgs">
          <p className="cal-sub">Organizations working with Village Without Borders, and groups <Icon name="tent" /> that respond to emergencies. Tap a name to see more.</p>
          <Link className="btn btn-outline btn-full" style={{ minHeight: '48px', marginBottom: '0.75rem' }} to="/start-group"><Icon name="tent" /> Start an emergency response group</Link>
          {orgs === null && <p className="cal-empty">Loading...</p>}
          {orgsError && <p className="form-error" role="alert">{orgsError}</p>}
          {orgs && !orgsError && orgs.length === 0 && <p className="cal-empty">No organizations yet.</p>}
          {orgs && orgs.map((o) => {
            const open = !!openOrgs[o.id]
            const site = safeUrl(o.website_url)
            return (
              <div key={o.id} className="cal-card" style={{ width: '100%', padding: 0 }}>
                <button type="button" aria-expanded={open} aria-controls={'org-' + o.id} onClick={() => setOpenOrgs((m) => ({ ...m, [o.id]: !m[o.id] }))} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', minHeight: '56px', padding: '0.5rem 0.75rem', background: 'none', border: 0, color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                  <span aria-hidden="true" style={{ flex: 'none', width: '44px', height: '44px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', background: 'rgba(78, 204, 163, 0.15)' }}><Icon name={o.kind === 'group' ? 'tent' : 'people'} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="cal-card-title" style={{ display: 'block' }}>{o.name}</span>
                    <span className="cal-card-meta">{o.kind === 'group' ? 'Emergency response group' : 'Organization'}</span>
                  </span>
                  <span aria-hidden="true" style={{ flex: 'none', display: 'grid', placeItems: 'center', width: '44px', height: '44px', fontSize: '1.6rem', lineHeight: 1, color: 'var(--accent)', transform: open ? 'rotate(180deg)' : 'none' }}>{'\u25BE'}</span>
                </button>
                {open && (
                  <div id={'org-' + o.id} style={{ padding: '0 0.75rem 0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.12)' }}>
                    {o.description ? <p style={{ margin: '0.6rem 0' }}>{o.description}</p> : <p className="cal-sub" style={{ margin: '0.6rem 0' }}>No description yet.</p>}
                    {worksIn[o.id] && worksIn[o.id].length > 0 && <p className="cal-sub" style={{ margin: '0 0 0.6rem' }}>Works in: {worksIn[o.id].join(', ')}</p>}
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
      <section className="cal-box" aria-labelledby="zip-find" style={{ marginBottom: '0.75rem' }}>
        <h2 id="zip-find" style={{ marginTop: 0 }}>Find your village by zip code</h2>
        <form onSubmit={searchZip} style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0' }}>
          <label htmlFor="map-zip" className="sr-only">Zip code</label>
          <input id="map-zip" type="text" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" value={zipText} onChange={(e) => setZipText(e.target.value.replace(/\D/g, ''))} placeholder="Example: 30736" style={{ flex: 1, minWidth: 0, minHeight: '44px', boxSizing: 'border-box', padding: '0 0.75rem', fontSize: '1rem' }} />
          <button type="submit" className="btn btn-primary" style={{ minHeight: '44px' }} disabled={zipBusy}>{zipBusy ? 'Looking...' : 'Find'}</button>
        </form>
        <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/find-village')}>Start a village for my area</button>
      </section>
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
          {placed.length === 0 && <p className="cal-empty">These villages don't have a location yet, so there's nothing to draw. They're listed below.</p>}

          {placed.length > 0 && view === 'street' && <p className="cal-sub" style={{ margin: '0 0 0.5rem' }}>Tap a village to see what it has. Tap the dot on a line to see more.</p>}

          {view === 'street' && placed.length > 0 && (
            <div ref={mapEl} className="village-map" role="application" aria-label="Street map of villages. The same villages are listed below." />
          )}

          {placed.length > 0 && (
            <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px', marginBottom: '0.75rem' }} onClick={() => { setView(view === 'street' ? 'list' : 'street'); setLinkInfo(null) }}>
              {view === 'street' ? 'Hide the street map' : 'Show on a street map'}
            </button>
          )}

          {linkInfo && (
            <section className="cal-box" aria-live="polite">
              <p style={{ margin: 0 }}>{linkInfo.shared ? linkInfo.a + ' and ' + linkInfo.b + ' share ' + linkInfo.shared + ' zip code' + (linkInfo.shared === 1 ? '' : 's') + '. People in a shared zip code can join either village.' : linkInfo.a + ' and ' + linkInfo.b + ' share no zip codes. They are about ' + linkInfo.miles + ' miles apart.'}</p>
              <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px', marginTop: '0.5rem' }} onClick={() => setLinkInfo(null)}>Close</button>
            </section>
          )}

          {selected && (
            <section ref={cardRef} className="cal-box" aria-live="polite" aria-labelledby="village-sel" style={{ scrollMarginTop: 'calc(var(--header-height) + 12px)' }}>
              <h2 id="village-sel">{selected.name}{profile?.home_village_id === selected.id ? ' (your home)' : selected.is_mine ? ' (you visit)' : ''}</h2>
              {selected.region_label && <p className="cal-sub">{selected.region_label}</p>}
              <p className="cal-sub">{countText(selected)}{selected.zip_count ? ' \u00B7 covers ' + selected.zip_count + ' zip codes' : ''}</p>
              {selected.towns && <p className="cal-sub">Towns: {selected.towns}</p>}
              {(workingHere[selected.id] || []).length > 0 && (
                <div style={{ margin: '0.5rem 0' }}>
                  <p className="cal-sub" style={{ margin: '0 0 0.25rem' }}>Working here</p>
                  {(workingHere[selected.id] || []).map((o) => (
                    <div key={o.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '0.25rem 0' }}>
                      <Link to={'/orgs/' + o.id} className="btn btn-outline" style={{ flex: 1, minWidth: 0, minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '0.5rem' }}><Icon name="people" /> {o.name}</Link>
                      {keeperOf === selected.id && <button type="button" className="btn btn-outline" style={{ minHeight: '44px', flex: 'none' }} onClick={() => { setRemoving(o); setRemoveNote('') }} aria-label={'Remove ' + o.name + ' from ' + selected.name}>Remove</button>}
                    </div>
                  ))}
                </div>
              )}
              {removing && keeperOf === selected.id && (
                <div role="alertdialog" aria-labelledby="remove-org-q" className="cal-box" style={{ margin: '0.5rem 0' }}>
                  <p id="remove-org-q" style={{ margin: '0 0 0.5rem' }}>Remove {removing.name} from {selected.name}? They will not be able to add {selected.name} back unless a keeper lets them.</p>
                  <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px', marginBottom: '0.5rem' }} onClick={confirmRemove}>Yes, remove them</button>
                  <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} onClick={() => setRemoving(null)}>Keep them</button>
                </div>
              )}
              {removeNote && <p className="cal-sub" role="status">{removeNote}</p>}
              <SisterVillages
                village={selected}
                villages={villages}
                sisters={sisters}
                isKeeper={starterOf === selected.id}
                joinOptions={sisterJoins}
                onPick={(id) => { setSelectedId(id); setLinkInfo(null) }}
                onChanged={loadSisters}
              />
              <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px', marginBottom: '0.5rem' }} onClick={() => navigate('/village/' + selected.id)}><Icon name="houses" /> Step into {selected.name}</button>
              {selected.is_mine && boardFor(selected) && (
                <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/campfire?board=' + boardFor(selected).id)}>Open this village chat</button>
              )}
              {!selected.is_mine && covers(selected, myZip) && (
                <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/find-village?join=' + selected.id)}>Join this village chat</button>
              )}
              {!selected.is_mine && !covers(selected, myZip) && (
                <p className="cal-sub">{myZip ? 'Your zip code is not on this village\u2019s list.' : 'Add your zip code on your Profile to join.'}</p>
              )}
              {!selected.is_mine && <p className="cal-sub" style={{ marginTop: '0.4rem' }}>{profile?.home_village_id ? 'You already have a home village, so you would join this one as a guest. You will read a short warning first.' : 'Neighbors whose zip code is on its list can join. You will read a short warning first.'}</p>}
            </section>
          )}

          {view === 'street' && <p className="cal-sub" style={{ margin: '0.5rem 0' }}>Dotted lines join villages that share zip codes. Small dots are zip code areas, never people.</p>}

          <section className="hub-section" aria-labelledby="village-list">
            <div className="hub-section-head"><h2 id="village-list">All villages ({villages.length})</h2></div>
            {[...placed, ...unplaced].map((v) => (
              <div key={v.id}>
                <button type="button" className="cal-card" style={{ width: '100%', textAlign: 'left', minHeight: '44px' }} aria-pressed={v.id === selectedId} onClick={() => openVillage(v)}>
                  <span className="cal-card-title">{v.name}{profile?.home_village_id === v.id ? ' \u00B7 your home' : v.is_mine ? ' \u00B7 you visit' : ''}</span>
                  <span className="cal-card-meta">{v.region_label ? v.region_label + ' \u00B7 ' : ''}{countText(v)}</span>
                  {(v.is_mine || covers(v, myZip)) && <span className="cal-card-meta vm-tap">{v.is_mine ? 'Tap to open the chat' : profile?.home_village_id ? 'Tap to join as a guest' : 'Tap to join'}</span>}
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
