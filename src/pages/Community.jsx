import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { getCurrentPosition, distanceMiles } from '../utils/location'

const CATEGORIES = ['Emergency Help', 'Safety', 'Food', 'Tenant Rights', 'Housing', 'Government', 'Other']
const CAT_ICONS = { 'Emergency Help': '&#9888;', 'Safety': '&#128156;', 'Food': '&#127859;', 'Tenant Rights': '&#127968;', 'Housing': '&#127969;', 'Government': '&#128203;', 'Other': '&#128204;' }

export default function Community() {
  const navigate = useNavigate()
  const { user, profile, isAdmin, organizations: myOrgs } = useAuth()
  const canVerify = profile?.is_hope_ambassador || isAdmin
  const canSubmit = (myOrgs && myOrgs.length > 0) || isAdmin

  const [tab, setTab] = useState('resources')

  // Organizations (approved, public) — used for the Resources filter, org
  // attribution on cards, and the org picker in both submit forms.
  const [allOrgs, setAllOrgs] = useState([])
  const [orgProfileOpen, setOrgProfileOpen] = useState(null)

  // The viewer's own approximate location, used to sort resources with a
  // pinned location nearest-first. Resources without a pin just stay put.
  const [myLocation, setMyLocation] = useState(null)

  // Resource Library
  const [resources, setResources] = useState([])
  const [loadingResources, setLoadingResources] = useState(true)
  const [expandedCats, setExpandedCats] = useState([])
  const [orgFilter, setOrgFilter] = useState('all')
  const [showSubmit, setShowSubmit] = useState(false)
  const [subName, setSubName] = useState('')
  const [subDesc, setSubDesc] = useState('')
  const [subCat, setSubCat] = useState('')
  const [subPhone, setSubPhone] = useState('')
  const [subUrl, setSubUrl] = useState('')
  const [subAddress, setSubAddress] = useState('')
  const [subHood, setSubHood] = useState('')
  const [subOrgId, setSubOrgId] = useState('')
  const [subLat, setSubLat] = useState(null)
  const [subLng, setSubLng] = useState(null)
  const [capturingSubLocation, setCapturingSubLocation] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Community Calendar
  const [events, setEvents] = useState([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [showEventSubmit, setShowEventSubmit] = useState(false)
  const [evTitle, setEvTitle] = useState('')
  const [evDesc, setEvDesc] = useState('')
  const [evLocation, setEvLocation] = useState('')
  const [evStartsAt, setEvStartsAt] = useState('')
  const [evEndsAt, setEvEndsAt] = useState('')
  const [evLink, setEvLink] = useState('')
  const [evOrgId, setEvOrgId] = useState('')
  const [submittingEvent, setSubmittingEvent] = useState(false)
  const [eventSubmitted, setEventSubmitted] = useState(false)

  useEffect(() => { loadResources(); loadOrgs(); loadEvents() }, [])
  useEffect(() => { getCurrentPosition().then(setMyLocation) }, [])
  useEffect(() => { if (profile?.neighborhood && !subHood) setSubHood(profile.neighborhood) }, [profile])
  useEffect(() => {
    // If someone belongs to exactly one org, don't make them pick it every time.
    if (!isAdmin && myOrgs && myOrgs.length === 1) {
      setSubOrgId(myOrgs[0].id)
      setEvOrgId(myOrgs[0].id)
    }
  }, [myOrgs, isAdmin])

  async function loadOrgs() {
    const { data, error } = await supabase.from('organizations').select('*').eq('approved', true).order('name')
    if (error) console.error('Failed to load organizations:', error)
    if (data) setAllOrgs(data)
  }

  async function loadResources() {
    setLoadingResources(true)
    const { data, error } = await supabase
      .from('community_resources')
      .select('*, organizations ( id, name, description, contact_email, website_url, social_links )')
      .order('category')
      .order('name')
    if (error) console.error('Failed to load community resources:', error)
    if (data) setResources(data)
    setLoadingResources(false)
  }

  async function captureSubLocation() {
    setCapturingSubLocation(true)
    const loc = await getCurrentPosition()
    setSubLat(loc.lat)
    setSubLng(loc.lng)
    setCapturingSubLocation(false)
  }

  async function submitResource() {
    if (!subName.trim() || !subCat) return
    setSubmitting(true)
    const { error } = await supabase.from('community_resources').insert({
      submitted_by: user.id, name: subName.trim(), description: subDesc.trim() || null,
      category: subCat, phone: subPhone.trim() || null, url: subUrl.trim() || null,
      address: subAddress.trim() || null, neighborhood: subHood.trim() || null,
      organization_id: subOrgId || null,
      latitude: subLat, longitude: subLng,
    })
    setSubmitting(false)
    if (error) {
      console.error('Failed to submit resource:', error)
      alert('Could not submit this resource. Try again.')
      return
    }
    setSubmitted(true)
    setSubName(''); setSubDesc(''); setSubCat(''); setSubPhone(''); setSubUrl(''); setSubAddress('')
    setSubLat(null); setSubLng(null)
    await loadResources()
  }

  async function verifyResource(id) {
    const { error } = await supabase.from('community_resources').update({ verified: true, verified_by: user.id }).eq('id', id)
    if (error) { console.error('Failed to verify resource:', error); alert('Could not verify this resource. Try again.'); return }
    await loadResources()
  }

  function toggleCat(cat) {
    setExpandedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  }

  async function loadEvents() {
    setLoadingEvents(true)
    const { data, error } = await supabase
      .from('community_events')
      .select('*, organizations ( id, name, description, contact_email, website_url, social_links )')
      .order('starts_at', { ascending: true })
    if (error) console.error('Failed to load community events:', error)
    if (data) setEvents(data)
    setLoadingEvents(false)
  }

  async function submitEvent() {
    if (!evTitle.trim() || !evStartsAt) return
    setSubmittingEvent(true)
    const { error } = await supabase.from('community_events').insert({
      submitted_by: user.id, title: evTitle.trim(), description: evDesc.trim() || null,
      location_name: evLocation.trim() || null, starts_at: new Date(evStartsAt).toISOString(),
      ends_at: evEndsAt ? new Date(evEndsAt).toISOString() : null, link: evLink.trim() || null,
      organization_id: evOrgId || null,
    })
    setSubmittingEvent(false)
    if (error) {
      console.error('Failed to submit event:', error)
      alert('Could not submit this event. Try again.')
      return
    }
    setEventSubmitted(true)
    setEvTitle(''); setEvDesc(''); setEvLocation(''); setEvStartsAt(''); setEvEndsAt(''); setEvLink('')
    await loadEvents()
  }

  async function verifyEvent(id) {
    const { error } = await supabase.from('community_events').update({ verified: true, verified_by: user.id }).eq('id', id)
    if (error) { console.error('Failed to verify event:', error); alert('Could not verify this event. Try again.'); return }
    await loadEvents()
  }

  function formatEventWhen(ev) {
    const start = new Date(ev.starts_at)
    const opts = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    let text = start.toLocaleString(undefined, opts)
    if (ev.ends_at) {
      text += ' – ' + new Date(ev.ends_at).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })
    }
    return text
  }

  const now = Date.now()
  const verifiedResources = resources.filter(r => r.verified)
  const pendingResources = resources.filter(r => !r.verified)
  const filteredVerifiedResources = orgFilter === 'all' ? verifiedResources : verifiedResources.filter(r => r.organization_id === orgFilter)
  const grouped = {}
  filteredVerifiedResources.forEach(r => { if (!grouped[r.category]) grouped[r.category] = []; grouped[r.category].push(r) })
  function resourceDistance(r) {
    if (!myLocation || r.latitude == null || r.longitude == null) return null
    return distanceMiles(myLocation.lat, myLocation.lng, r.latitude, r.longitude)
  }
  Object.keys(grouped).forEach(cat => {
    grouped[cat].sort((a, b) => {
      const da = resourceDistance(a)
      const db = resourceDistance(b)
      if (da != null && db != null) return da - db
      if (da != null) return -1
      if (db != null) return 1
      return a.name.localeCompare(b.name)
    })
  })

  const upcomingEvents = events.filter(e => e.verified && new Date(e.ends_at || e.starts_at).getTime() >= now)
  const pendingEvents = events.filter(e => !e.verified)

  const submitOrgOptions = isAdmin ? allOrgs : (myOrgs || [])

  const fieldStyle = { display: 'block', width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.85rem', marginBottom: '0.5rem', boxSizing: 'border-box' }
  const communityTabStyle = (active) => ({ padding: '0.5rem 0.9rem', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', background: active ? '#4ecca3' : '#2a2a2a', color: active ? '#1a1a1a' : '#aaa' })

  return (
    <div className="community-page">
      <h1>Community</h1>
      <p className="feed-subtitle" style={{ marginBottom: '1rem' }}>Connect, learn, and build together.</p>

      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginBottom: '1rem' }}>
        <button style={communityTabStyle(tab === 'resources')} onClick={() => setTab('resources')}>Resources</button>
        <button style={communityTabStyle(tab === 'events')} onClick={() => setTab('events')}>Events{canVerify && pendingEvents.length > 0 ? ' (' + pendingEvents.length + ')' : ''}</button>
      </div>

      {tab === 'resources' && (
        <>
          {allOrgs.length > 0 && (
            <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', marginBottom: '0.75rem' }}>
              <button onClick={() => setOrgFilter('all')} style={{ padding: '0.35rem 0.7rem', borderRadius: '16px', border: orgFilter === 'all' ? 'none' : '1px solid #444', background: orgFilter === 'all' ? '#4ecca3' : 'none', color: orgFilter === 'all' ? '#1a1a1a' : '#aaa', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>All orgs</button>
              {allOrgs.map(o => (
                <button key={o.id} onClick={() => setOrgFilter(o.id)} style={{ padding: '0.35rem 0.7rem', borderRadius: '16px', border: orgFilter === o.id ? 'none' : '1px solid #444', background: orgFilter === o.id ? '#4ecca3' : 'none', color: orgFilter === o.id ? '#1a1a1a' : '#aaa', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{o.name}</button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.1rem', color: '#4ecca3', margin: 0 }}>Resource Library</h2>
            {canSubmit && <button onClick={() => { setShowSubmit(true); setSubmitted(false) }} style={{ background: 'none', border: 'none', color: '#4ecca3', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>+ Add Resource</button>}
          </div>

          {!canSubmit && (
            <p style={{ color: '#888', fontSize: '0.75rem', margin: '0 0 0.75rem' }}>
              Resources are added by verified partner organizations.{' '}
              <button onClick={() => navigate('/profile')} style={{ background: 'none', border: 'none', color: '#4ecca3', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline', padding: 0 }}>Want your org involved?</button>
            </p>
          )}

          {showSubmit && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSubmit(false)}>
              <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '12px', padding: '1.25rem', maxWidth: '400px', width: '90%', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, color: '#4ecca3' }}>Submit a Resource</h3>
                  <button onClick={() => setShowSubmit(false)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.25rem', cursor: 'pointer' }}>&#10005;</button>
                </div>
                {submitted ? (
                  <p style={{ color: '#4ecca3', fontWeight: 600, margin: 0 }}>Thank you! Your resource has been submitted for review.</p>
                ) : (
                  <>
                    <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>Share a resource with your community. Hope Ambassadors will verify submissions.</p>
                    {submitOrgOptions.length > 0 && (
                      <select style={fieldStyle} value={subOrgId} onChange={e => setSubOrgId(e.target.value)}>
                        <option value="">{isAdmin ? 'No organization (post as VWB)' : 'Choose your organization'}</option>
                        {submitOrgOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    )}
                    <select style={fieldStyle} value={subCat} onChange={e => setSubCat(e.target.value)}>
                      <option value="">Choose a category</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input style={fieldStyle} placeholder="Resource name — e.g. Ringgold Community Food Pantry" value={subName} onChange={e => setSubName(e.target.value)} maxLength={120} />
                    <textarea style={{ ...fieldStyle, minHeight: '60px', resize: 'vertical' }} placeholder="What do they offer, who's it for, anything people should know? — e.g. Free groceries every Tuesday, no ID required" value={subDesc} onChange={e => setSubDesc(e.target.value)} maxLength={500} />
                    <input style={fieldStyle} placeholder="Phone number (optional) — e.g. (706) 555-0100" value={subPhone} onChange={e => setSubPhone(e.target.value)} />
                    <input style={fieldStyle} placeholder="Website URL (optional) — e.g. https://example.org" value={subUrl} onChange={e => setSubUrl(e.target.value)} />
                    <input style={fieldStyle} placeholder="Address (optional) — e.g. 123 Main St, Ringgold, GA" value={subAddress} onChange={e => setSubAddress(e.target.value)} />
                    {subAddress.trim() && (
                      <button type="button" onClick={captureSubLocation} disabled={capturingSubLocation} style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.5rem', borderRadius: '6px', border: '1px solid #4ecca3', background: 'none', color: '#4ecca3', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                        {capturingSubLocation ? 'Getting your location...' : (subLat != null ? '📍 Location captured — tap to update' : '📍 Pin this address (optional, helps neighbors see how far away it is)')}
                      </button>
                    )}
                    <input style={fieldStyle} placeholder="Neighborhood or area — e.g. Ringgold, Catoosa County" value={subHood} onChange={e => setSubHood(e.target.value)} />
                    <button onClick={submitResource} disabled={!subName.trim() || !subCat || submitting} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', opacity: (!subName.trim() || !subCat || submitting) ? 0.5 : 1 }}>
                      {submitting ? 'Submitting...' : 'Submit Resource'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {canVerify && pendingResources.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ color: '#ffaa44', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Pending review ({pendingResources.length})</p>
              {pendingResources.map(r => (
                <div key={r.id} style={{ background: '#1e1e1e', border: '1px solid #444', borderRadius: '8px', padding: '0.6rem', marginBottom: '0.35rem', borderLeft: '3px solid #ffaa44' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{r.name}</span>
                    <button onClick={() => verifyResource(r.id)} style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}>Verify</button>
                  </div>
                  {r.description && <p style={{ color: '#aaa', fontSize: '0.75rem', margin: '0.2rem 0' }}>{r.description}</p>}
                  <span style={{ color: '#888', fontSize: '0.7rem' }}>{r.category}{r.organizations ? ' · ' + r.organizations.name : ''}</span>
                </div>
              ))}
            </div>
          )}

          {loadingResources && <p style={{ textAlign: 'center', color: '#888', padding: '1rem' }}>Loading...</p>}

          {!loadingResources && Object.keys(grouped).map(cat => {
            const isOpen = expandedCats.includes(cat)
            return (
              <div key={cat} style={{ marginBottom: '0.5rem' }}>
                <button onClick={() => toggleCat(cat)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.75rem', background: '#1e1e1e', border: '1px solid #333', borderRadius: isOpen ? '10px 10px 0 0' : '10px', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span dangerouslySetInnerHTML={{ __html: CAT_ICONS[cat] || '&#128204;' }} style={{ fontSize: '1.1rem', color: cat === 'Emergency Help' ? '#ffaa44' : undefined }} />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ddd' }}>{cat}</span>
                    <span style={{ color: '#888', fontSize: '0.8rem' }}>({grouped[cat].length})</span>
                  </div>
                  <span style={{ color: '#4ecca3', fontSize: '1rem', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>&#9660;</span>
                </button>
                {isOpen && (
                  <div style={{ border: '1px solid #333', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
                    {grouped[cat].map(r => (
                      <div key={r.id} style={{ padding: '0.75rem', borderBottom: '1px solid #2a2a2a' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#eee' }}>{r.name}</span>
                        {r.description && <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.2rem 0 0.4rem', lineHeight: 1.4 }}>{r.description}</p>}
                        {r.address && <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.1rem 0' }}>{r.address}</p>}
                        {r.neighborhood && <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.1rem 0' }}>Area: {r.neighborhood}</p>}
                        {resourceDistance(r) != null && (
                          <p style={{ color: '#4ecca3', fontSize: '0.7rem', fontWeight: 600, margin: '0.2rem 0 0' }}>&#128205; {resourceDistance(r).toFixed(1)} mi away</p>
                        )}
                        {r.organizations && (
                          <button onClick={() => setOrgProfileOpen(r.organizations)} style={{ display: 'block', background: 'none', border: 'none', padding: 0, marginTop: '0.2rem', color: '#4ecca3', fontSize: '0.7rem', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>Shared by {r.organizations.name}</button>
                        )}
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                          {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#4ecca3', textDecoration: 'none', fontWeight: 600 }}>Visit &#8599;</a>}
                          {r.phone && <a href={'tel:' + r.phone.replace(/[^0-9+]/g, '')} style={{ fontSize: '0.8rem', color: '#66aaff', textDecoration: 'none', fontWeight: 600 }}>Call {r.phone}</a>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {!loadingResources && filteredVerifiedResources.length === 0 && (
            <p style={{ textAlign: 'center', color: '#666', padding: '1.5rem' }}>No resources yet. Be the first to add one.</p>
          )}
        </>
      )}

      {tab === 'events' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <h2 style={{ fontSize: '1.1rem', color: '#4ecca3', margin: 0 }}>Community Calendar</h2>
            {canSubmit && <button onClick={() => { setShowEventSubmit(true); setEventSubmitted(false) }} style={{ background: 'none', border: 'none', color: '#4ecca3', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>+ Add Event</button>}
          </div>
          <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>Events, workshops, and meetups from mutual aid partners across the Chattanooga Valley.</p>

          {!canSubmit && (
            <p style={{ color: '#888', fontSize: '0.75rem', margin: '0 0 0.75rem' }}>
              Events are added by verified partner organizations.{' '}
              <button onClick={() => navigate('/profile')} style={{ background: 'none', border: 'none', color: '#4ecca3', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline', padding: 0 }}>Want your org involved?</button>
            </p>
          )}

          {showEventSubmit && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowEventSubmit(false)}>
              <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '12px', padding: '1.25rem', maxWidth: '400px', width: '90%', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, color: '#4ecca3' }}>Submit an Event</h3>
                  <button onClick={() => setShowEventSubmit(false)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.25rem', cursor: 'pointer' }}>&#10005;</button>
                </div>
                {eventSubmitted ? (
                  <p style={{ color: '#4ecca3', fontWeight: 600, margin: 0 }}>Thank you! Your event has been submitted for review.</p>
                ) : (
                  <>
                    <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>Share an upcoming event with your community. Hope Ambassadors will verify submissions.</p>
                    {submitOrgOptions.length > 0 && (
                      <select style={fieldStyle} value={evOrgId} onChange={e => setEvOrgId(e.target.value)}>
                        <option value="">{isAdmin ? 'No organization (post as VWB)' : 'Choose your organization'}</option>
                        {submitOrgOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    )}
                    <input style={fieldStyle} placeholder="Event title — e.g. Community Food Distribution" value={evTitle} onChange={e => setEvTitle(e.target.value)} maxLength={120} />
                    <textarea style={{ ...fieldStyle, minHeight: '60px', resize: 'vertical' }} placeholder="What's happening, who's it for? — e.g. Free produce giveaway, first come first served" value={evDesc} onChange={e => setEvDesc(e.target.value)} maxLength={500} />
                    <input style={fieldStyle} placeholder="Location — e.g. Ringgold Community Center" value={evLocation} onChange={e => setEvLocation(e.target.value)} />
                    <label style={{ display: 'block', color: '#888', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Starts</label>
                    <input type="datetime-local" style={fieldStyle} value={evStartsAt} onChange={e => setEvStartsAt(e.target.value)} />
                    <label style={{ display: 'block', color: '#888', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Ends (optional)</label>
                    <input type="datetime-local" style={fieldStyle} value={evEndsAt} onChange={e => setEvEndsAt(e.target.value)} />
                    <input style={fieldStyle} placeholder="Event link — RSVP, more info, etc. (optional) — e.g. https://example.org/rsvp" value={evLink} onChange={e => setEvLink(e.target.value)} />
                    <button onClick={submitEvent} disabled={!evTitle.trim() || !evStartsAt || submittingEvent} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', opacity: (!evTitle.trim() || !evStartsAt || submittingEvent) ? 0.5 : 1 }}>
                      {submittingEvent ? 'Submitting...' : 'Submit Event'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {canVerify && pendingEvents.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ color: '#ffaa44', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Pending review ({pendingEvents.length})</p>
              {pendingEvents.map(ev => (
                <div key={ev.id} style={{ background: '#1e1e1e', border: '1px solid #444', borderRadius: '8px', padding: '0.6rem', marginBottom: '0.35rem', borderLeft: '3px solid #ffaa44' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{ev.title}</span>
                    <button onClick={() => verifyEvent(ev.id)} style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}>Verify</button>
                  </div>
                  <p style={{ color: '#aaa', fontSize: '0.75rem', margin: '0.2rem 0' }}>{formatEventWhen(ev)}</p>
                  {ev.description && <p style={{ color: '#aaa', fontSize: '0.75rem', margin: '0.2rem 0' }}>{ev.description}</p>}
                  {ev.organizations && <span style={{ color: '#888', fontSize: '0.7rem' }}>{ev.organizations.name}</span>}
                </div>
              ))}
            </div>
          )}

          {loadingEvents && <p style={{ textAlign: 'center', color: '#888', padding: '1rem' }}>Loading...</p>}

          {!loadingEvents && upcomingEvents.length === 0 && (
            <p style={{ textAlign: 'center', color: '#666', padding: '1.5rem' }}>No upcoming events yet. Be the first to add one.</p>
          )}

          {!loadingEvents && upcomingEvents.map(ev => (
            <div key={ev.id} style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#eee' }}>{ev.title}</span>
              <p style={{ color: '#4ecca3', fontSize: '0.8rem', margin: '0.2rem 0', fontWeight: 600 }}>{formatEventWhen(ev)}</p>
              {ev.location_name && <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.1rem 0' }}>{ev.location_name}</p>}
              {ev.description && <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.2rem 0 0.4rem', lineHeight: 1.4 }}>{ev.description}</p>}
              {ev.organizations && (
                <button onClick={() => setOrgProfileOpen(ev.organizations)} style={{ display: 'block', background: 'none', border: 'none', padding: 0, marginTop: '0.2rem', color: '#4ecca3', fontSize: '0.7rem', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>Hosted by {ev.organizations.name}</button>
              )}
              {ev.link && <a href={ev.link} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '0.4rem', fontSize: '0.8rem', color: '#66aaff', textDecoration: 'none', fontWeight: 600 }}>More info / RSVP &#8599;</a>}
            </div>
          ))}
        </>
      )}

      {orgProfileOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1002, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setOrgProfileOpen(null)}>
          <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '12px', padding: '1.25rem', maxWidth: '380px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 style={{ margin: 0, color: '#4ecca3' }}>{orgProfileOpen.name}</h3>
              <button onClick={() => setOrgProfileOpen(null)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.25rem', cursor: 'pointer' }}>&#10005;</button>
            </div>
            {orgProfileOpen.description && <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.5rem', lineHeight: 1.4 }}>{orgProfileOpen.description}</p>}
            {orgProfileOpen.contact_email && <p style={{ color: '#888', fontSize: '0.8rem', margin: '0.2rem 0' }}>{orgProfileOpen.contact_email}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem' }}>
              {orgProfileOpen.website_url && <a href={orgProfileOpen.website_url} target="_blank" rel="noopener noreferrer" style={{ color: '#4ecca3', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' }}>Visit their website &#8599;</a>}
              {orgProfileOpen.social_links?.primary && <a href={orgProfileOpen.social_links.primary} target="_blank" rel="noopener noreferrer" style={{ color: '#66aaff', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' }}>Social media &#8599;</a>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
