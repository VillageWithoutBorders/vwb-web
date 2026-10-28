import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { getMyLocation, distanceMiles } from '../utils/location'
import { resourceCats, currentCategory, CAT_ICON_FILES } from '../utils/resourceCategories'
import { searchResources } from '../utils/resourceSearch'
import AddressLink from './AddressLink'
import { useGoBack } from './BackLink'
import SuggestResource from './SuggestResource'
import { useWideScreen } from '../hooks/useWideScreen'

// The resource hub (Oct 25): the World tab's Resources button and Ask for help
// both open here. Resources in your area first, then asking a neighbor. The database already limits Find Help to your area plus national
// resources, so whatever comes back here is local or national.
// The 12 kinds of help, most asked first (211 data, Oct 2026).
const QUICK_PICKS = ['Food', 'Housing', 'Bills and Utilities', 'Rides', 'Health', 'Home Repair', 'Legal and Tenant Help',
  'Money and Benefits', 'Mental Health and Recovery', 'Family and Child Care', 'Emergency Help', 'Safety']
const SHOW = 5

export default function NearbyResourcesFirst({ profile, onContinue }) {
  const navigate = useNavigate()
  const goBack = useGoBack()
  const [rows, setRows] = useState(null)
  const [cat, setCat] = useState('')
  const [query, setQuery] = useState('')
  const loc = getMyLocation(profile)
  const wide = useWideScreen()
  const resultsRef = useRef(null)
  const [scrollAsked, setScrollAsked] = useState(0)

  useEffect(() => {
    let alive = true
    supabase
      .from('community_resources')
      .select('id, name, description, phone, url, address, category, categories, latitude, longitude, requirements, neighborhood, region')
      .eq('verified', true)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('NearbyResourcesFirst', error)
        setRows(data || [])
      })
    return () => { alive = false }
  }, [])

  const results = useMemo(() => {
    if (!rows) return []
    let list = rows
    if (query.trim()) list = searchResources(list, query)
    else if (cat) list = list.filter((r) => resourceCats(r).includes(cat))
    else return []
    const dist = (r) => (loc && r.latitude != null && r.longitude != null ? distanceMiles(loc.lat, loc.lng, r.latitude, r.longitude) : null)
    return query.trim()
      ? list.map((r) => ({ r, d: dist(r) }))
      : list.map((r) => ({ r, d: dist(r) })).sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9) || a.r.name.localeCompare(b.r.name))
  }, [rows, cat, query, loc])

  const picked = Boolean(cat || query.trim())

  // Phones: tapping a kind of help slides down to what it found (Oct 28).
  // Computers show the results beside the tiles, so nothing needs to move.
  useEffect(() => {
    if (!scrollAsked || wide || !resultsRef.current) return
    const reduce = document.documentElement.classList.contains('calm-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    resultsRef.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [scrollAsked, wide, rows])
  const link = { minHeight: '44px', display: 'inline-flex', alignItems: 'center', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none' }

  return (
    <div className="ask-page nr-page">
      <div className="nr-left">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button onClick={() => goBack('/')} aria-label="Go back" style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem', flexShrink: 0, minWidth: 44, minHeight: 44 }}>&#8592;</button>
        <h1 style={{ margin: 0 }}>Resources near you</h1>
      </div>
      <p className="ask-intro nr-intro">Food, bills, rides, hotlines, and more near you. Can't find it? Ask a neighbor at the bottom.</p>
      <div className="nr-top-row">
        <a href="tel:911" className="nr-911">In danger? Call 911</a>
        <a href="#nr-ask" className="nr-skip">Ask a neighbor &#8595;</a>
      </div>

      <label htmlFor="nr-q" className="nr-label">Search or pick what you need</label>
      <input id="nr-q" type="search" inputMode="search" enterKeyHint="search" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="rent, diapers, ride, mold" style={{ display: 'block', width: '100%', boxSizing: 'border-box', minHeight: '48px', padding: '0.5rem 0.75rem', marginBottom: '0.6rem', borderRadius: '10px', border: '2px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)', fontSize: '1rem', fontFamily: 'inherit' }} />

      <div role="group" aria-label="What do you need?" className="hub-tiles nr-tiles">
        {QUICK_PICKS.map((c) => (
          <button key={c} type="button" className={'hub-tile nr-tile' + (cat === c && !query.trim() ? ' on' : '')} aria-pressed={cat === c && !query.trim()} onClick={() => { setQuery(''); const next = cat === c ? '' : c; setCat(next); if (next) setScrollAsked(n => n + 1) }}>
            <img className="hub-tile-icon" src={'/art/icons/' + (CAT_ICON_FILES[c] || 'cat-other') + '.svg'} alt="" width="40" height="40" />
            <span>{c}</span>
          </button>
        ))}
      </div>

      {!loc && <p style={{ fontSize: '0.9rem', color: 'var(--text-soft)' }}>Add your zip code in your profile to see distances and ones near you. Until then you see national resources.</p>}
      </div>

      <div className="nr-right">
      <div ref={resultsRef} className="nr-results">
      {!picked && <p className="nr-pick-hint">Pick a kind of help or search on the left. What is near you shows up here.</p>}
      {rows === null && <p>Loading...</p>}
      {rows && picked && results.length === 0 && <p style={{ color: 'var(--text-soft)' }}>Nothing found nearby. A neighbor may be able to help. Ask at the bottom of this page.</p>}
      {results.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0 0 0.5rem', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {results.slice(0, SHOW).map(({ r, d }) => (
            <li key={r.id} className="nr-card" style={{ padding: '0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
              {/* Oct 28 (Jade): the whole card opens the full listing in Find resources. */}
              <Link className="nr-card-open" to={'/community/resources?cat=' + encodeURIComponent((cat && !query.trim()) ? cat : (resourceCats(r)[0] || '')) + '&show=' + r.id} style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{r.name} <span aria-hidden="true">&#8250;</span></Link>
              {d != null && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{d < 1 ? 'Under a mile away' : Math.round(d) + ' miles away'}</div>}
              {r.description && <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem', color: 'var(--text-soft)', overflowWrap: 'anywhere' }}>{r.description}</p>}
              {r.address && <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}><AddressLink address={r.address} /></p>}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                {r.phone && <a href={'tel:' + r.phone.replace(/[^0-9+]/g, '')} style={{ ...link, color: 'var(--info)' }}>Call {r.phone}</a>}
                {r.url && /^https?:\/\//i.test(r.url) && <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ ...link, color: 'var(--accent)' }}>Visit &#8599;</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {results.length > SHOW && (
        <Link to={cat && !query.trim() ? '/community/resources?cat=' + encodeURIComponent(cat) : '/community/resources'} style={{ ...link, color: 'var(--accent)', marginBottom: '0.5rem' }}>See all {results.length} in Find Help</Link>
      )}
      </div>

      <div className="sr-suggest">
        <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-soft)' }}>Know a place that helps, or is a kind of help missing near you?</p>
        <SuggestResource category={query.trim() ? '' : cat} />
      </div>

      <div id="nr-ask" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
        <h2 style={{ margin: '0 0 0.3rem', fontSize: '1.15rem' }}>Didn't find what you need?</h2>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.95rem', color: 'var(--text-soft)' }}>Ask your neighbors. Someone nearby may have the skill, the tool, or the time to help.</p>
        <button type="button" onClick={() => onContinue(query.trim() ? '' : currentCategory(cat))} style={{ width: '100%', minHeight: '52px', borderRadius: '10px', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, fontSize: '1.05rem', cursor: 'pointer' }}>Ask a neighbor for help</button>
        <button type="button" onClick={() => navigate(-1)} style={{ width: '100%', minHeight: '48px', marginTop: '0.5rem', borderRadius: '10px', border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-soft)', fontSize: '1rem', cursor: 'pointer' }}>I found what I need</button>
      </div>
      </div>
    </div>
  )
}
