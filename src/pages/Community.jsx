import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { getCurrentPosition, distanceMiles } from '../utils/location'

const CATEGORIES = ['Emergency Help', 'Safety', 'Food', 'Donation Points', 'Tenant Rights', 'Housing', 'Government', 'Recovery Support', 'Other']
const CAT_ICONS = { 'Emergency Help': '&#9888;', 'Safety': '&#128156;', 'Food': '&#127859;', 'Donation Points': '&#128230;', 'Tenant Rights': '&#127968;', 'Housing': '&#127969;', 'Government': '&#128203;', 'Recovery Support': '&#129419;', 'Other': '&#128204;' }

// A resource can now belong to more than one category. Falls back to the
// old single `category` field for any row that hasn't been migrated yet.
function resourceCats(r) {
  return (r.categories && r.categories.length) ? r.categories : (r.category ? [r.category] : ['Other'])
}

// Keeps Tab/Shift+Tab cycling inside an open dialog instead of leaking focus
// out to the page behind it.
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
function trapTabKey(e, container) {
  if (e.key !== 'Tab' || !container) return
  const focusable = container.querySelectorAll(FOCUSABLE_SELECTOR)
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

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
  const submitModalRef = useRef(null)
  const orgModalRef = useRef(null)

  // The viewer's own approximate location, used to sort resources with a
  // pinned location nearest-first. Resources without a pin just stay put.
  const [myLocation, setMyLocation] = useState(null)

  // Resource Library
  const [resources, setResources] = useState([])
  const [loadingResources, setLoadingResources] = useState(true)
  const [expandedCats, setExpandedCats] = useState([])
  const [orgFilter, setOrgFilter] = useState('all')
  const [radiusFilter, setRadiusFilter] = useState('all') // 'all' | 10 | 25 | 50 (miles)
  const [regionFilter, setRegionFilter] = useState('all') // 'all' or a region name, once more than one exists
  const [showSubmit, setShowSubmit] = useState(false)
  const [subName, setSubName] = useState('')
  const [subDesc, setSubDesc] = useState('')
  const [subCats, setSubCats] = useState([])
  const [subPhone, setSubPhone] = useState('')
  const [subUrl, setSubUrl] = useState('')
  const [subAddress, setSubAddress] = useState('')
  const [subHood, setSubHood] = useState('')
  const [subRequirements, setSubRequirements] = useState('')
  const [subOrgId, setSubOrgId] = useState('')
  const [subLat, setSubLat] = useState(null)
  const [subLng, setSubLng] = useState(null)
  const [capturingSubLocation, setCapturingSubLocation] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Resource votes and anonymous reviews
  const [voteCounts, setVoteCounts] = useState({}) // { [resourceId]: { upvotes, downvotes } }
  const [myVotes, setMyVotes] = useState({}) // { [resourceId]: 1 | -1 }
  const [reviewsByResource, setReviewsByResource] = useState({}) // { [resourceId]: [review, ...] }
  const [openReviewsFor, setOpenReviewsFor] = useState([])
  const [reviewDrafts, setReviewDrafts] = useState({}) // { [resourceId]: text }
  const [submittingReviewFor, setSubmittingReviewFor] = useState(null)

  // Resource edit history -- suggest-an-edit + revert, Wikipedia-style
  const [editHistoryByResource, setEditHistoryByResource] = useState({}) // { [resourceId]: [edit, ...] }
  const [openHistoryFor, setOpenHistoryFor] = useState([])
  const [editFormFor, setEditFormFor] = useState(null) // resource id currently open for editing, or null
  const [editDraft, setEditDraft] = useState({ name: '', description: '', phone: '', url: '', address: '', requirements: '', source_url: '' })
  const [submittingEdit, setSubmittingEdit] = useState(false)
  const [revertingId, setRevertingId] = useState(null)

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

  useEffect(() => { loadResources(); loadOrgs(); loadEvents(); loadVoteCounts(); loadReviews(); loadEditHistory() }, [])
  useEffect(() => { loadMyVotes() }, [user])
  useEffect(() => { getCurrentPosition().then(setMyLocation) }, [])

  // Submit a Resource: move focus in on open, trap Tab inside it, close on Escape.
  useEffect(() => {
    if (!showSubmit) return
    submitModalRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') { setShowSubmit(false); return }
      trapTabKey(e, submitModalRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSubmit])

  // Organization profile card: same treatment.
  useEffect(() => {
    if (!orgProfileOpen) return
    orgModalRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') { setOrgProfileOpen(null); return }
      trapTabKey(e, orgModalRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [orgProfileOpen])
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

  async function loadVoteCounts() {
    const { data, error } = await supabase.from('resource_vote_counts').select('*')
    if (error) { console.error('Failed to load resource vote counts:', error); return }
    const map = {}
    ;(data || []).forEach(row => { map[row.resource_id] = { upvotes: row.upvotes, downvotes: row.downvotes } })
    setVoteCounts(map)
  }

  async function loadMyVotes() {
    if (!user) { setMyVotes({}); return }
    const { data, error } = await supabase.from('resource_votes').select('resource_id, vote').eq('user_id', user.id)
    if (error) { console.error('Failed to load your resource votes:', error); return }
    const map = {}
    ;(data || []).forEach(row => { map[row.resource_id] = row.vote })
    setMyVotes(map)
  }

  async function castVote(resourceId, vote) {
    if (!user) return
    if (myVotes[resourceId] === vote) {
      // Tapping the same arrow again takes your vote back.
      const { error } = await supabase.from('resource_votes').delete().eq('resource_id', resourceId).eq('user_id', user.id)
      if (error) { console.error('Failed to remove vote:', error); return }
    } else {
      const { error } = await supabase.from('resource_votes').upsert(
        { resource_id: resourceId, user_id: user.id, vote },
        { onConflict: 'resource_id,user_id' }
      )
      if (error) { console.error('Failed to cast vote:', error); return }
    }
    await Promise.all([loadVoteCounts(), loadMyVotes()])
  }

  async function loadReviews() {
    const { data, error } = await supabase
      .from('resource_reviews')
      .select('*')
      .eq('hidden', false)
      .order('created_at', { ascending: false })
    if (error) { console.error('Failed to load resource reviews:', error); return }
    const map = {}
    ;(data || []).forEach(row => { if (!map[row.resource_id]) map[row.resource_id] = []; map[row.resource_id].push(row) })
    setReviewsByResource(map)
  }

  function toggleReviews(resourceId) {
    setOpenReviewsFor(prev => prev.includes(resourceId) ? prev.filter(id => id !== resourceId) : [...prev, resourceId])
  }

  async function submitReview(resourceId) {
    const body = (reviewDrafts[resourceId] || '').trim()
    if (!body || !user) return
    setSubmittingReviewFor(resourceId)
    const { error } = await supabase.from('resource_reviews').upsert(
      { resource_id: resourceId, user_id: user.id, body },
      { onConflict: 'resource_id,user_id' }
    )
    setSubmittingReviewFor(null)
    if (error) {
      console.error('Failed to post review:', error)
      alert('Could not post your review. Try again.')
      return
    }
    setReviewDrafts(prev => ({ ...prev, [resourceId]: '' }))
    await loadReviews()
  }

  async function deleteMyReview(resourceId, reviewId) {
    if (!user) return
    const { error } = await supabase.from('resource_reviews').delete().eq('id', reviewId).eq('user_id', user.id)
    if (error) { console.error('Failed to delete review:', error); return }
    await loadReviews()
  }

  async function loadEditHistory() {
    const { data, error } = await supabase
      .from('resource_edit_history')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { console.error('Failed to load resource edit history:', error); return }
    const map = {}
    ;(data || []).forEach(row => { if (!map[row.resource_id]) map[row.resource_id] = []; map[row.resource_id].push(row) })
    setEditHistoryByResource(map)
  }

  function toggleHistory(resourceId) {
    setOpenHistoryFor(prev => prev.includes(resourceId) ? prev.filter(id => id !== resourceId) : [...prev, resourceId])
  }

  function openEditForm(r) {
    setEditDraft({
      name: r.name || '',
      description: r.description || '',
      phone: r.phone || '',
      url: r.url || '',
      address: r.address || '',
      requirements: r.requirements || '',
      source_url: r.url || '',
    })
    setEditFormFor(r.id)
  }

  function cancelEditForm() {
    setEditFormFor(null)
  }

  async function submitResourceEdit(r) {
    if (!user) return
    const sourceUrl = (editDraft.source_url || '').trim()
    if (!sourceUrl) {
      alert("Add a link to where you found this -- the organization's own website or social post.")
      return
    }
    const payload = { p_resource_id: r.id, p_source_url: sourceUrl }
    // Only send a field if it actually changed, so the rest of the resource
    // never gets overwritten with a stale draft value.
    if ((editDraft.name || '').trim() !== (r.name || '')) payload.p_name = editDraft.name.trim()
    if ((editDraft.description || '').trim() !== (r.description || '')) payload.p_description = editDraft.description.trim()
    if ((editDraft.phone || '').trim() !== (r.phone || '')) payload.p_phone = editDraft.phone.trim()
    if ((editDraft.url || '').trim() !== (r.url || '')) payload.p_url = editDraft.url.trim()
    if ((editDraft.address || '').trim() !== (r.address || '')) payload.p_address = editDraft.address.trim()
    if ((editDraft.requirements || '').trim() !== (r.requirements || '')) payload.p_requirements = editDraft.requirements.trim()
    if (Object.keys(payload).length <= 2) {
      alert('Nothing was changed.')
      return
    }
    setSubmittingEdit(true)
    const { error } = await supabase.rpc('submit_resource_edit', payload)
    setSubmittingEdit(false)
    if (error) {
      console.error('Failed to submit resource edit:', error)
      alert('Could not save your edit. Try again.')
      return
    }
    setEditFormFor(null)
    await Promise.all([loadResources(), loadEditHistory()])
  }

  async function revertEdit(editId) {
    if (!canVerify) return
    setRevertingId(editId)
    const { error } = await supabase.rpc('revert_resource_edit', { p_edit_id: editId })
    setRevertingId(null)
    if (error) {
      console.error('Failed to undo resource edit:', error)
      alert('Could not undo this edit. Try again.')
      return
    }
    await Promise.all([loadResources(), loadEditHistory()])
  }

  async function captureSubLocation() {
    setCapturingSubLocation(true)
    const loc = await getCurrentPosition()
    setSubLat(loc.lat)
    setSubLng(loc.lng)
    setCapturingSubLocation(false)
  }

  async function submitResource() {
    if (!subName.trim() || !subCats.length) return
    setSubmitting(true)
    const { error } = await supabase.from('community_resources').insert({
      submitted_by: user.id, name: subName.trim(), description: subDesc.trim() || null,
      categories: subCats, phone: subPhone.trim() || null, url: subUrl.trim() || null,
      address: subAddress.trim() || null, neighborhood: subHood.trim() || null,
      requirements: subRequirements.trim() || null,
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
    setSubName(''); setSubDesc(''); setSubCats([]); setSubPhone(''); setSubUrl(''); setSubAddress(''); setSubRequirements('')
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
  const allRegions = [...new Set(verifiedResources.map(r => r.region).filter(Boolean))].sort()
  const filteredVerifiedResources = verifiedResources.filter(r => {
    if (orgFilter !== 'all' && r.organization_id !== orgFilter) return false
    if (regionFilter !== 'all' && r.region !== regionFilter) return false
    if (radiusFilter !== 'all') {
      const d = resourceDistance(r)
      // Resources with no pinned address (many phone-only lines, sober-living
      // homes without a published address) stay visible regardless -- there's
      // no distance to compare, so a radius filter can't fairly exclude them.
      if (d != null && d > radiusFilter) return false
    }
    return true
  })
  const grouped = {}
  filteredVerifiedResources.forEach(r => { resourceCats(r).forEach(cat => { if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(r) }) })
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
  const labelStyle = { display: 'block', color: '#aaa', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }
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
              <button onClick={() => setOrgFilter('all')} aria-pressed={orgFilter === 'all'} style={{ padding: '0.5rem 0.85rem', minHeight: '40px', borderRadius: '16px', border: orgFilter === 'all' ? 'none' : '1px solid #444', background: orgFilter === 'all' ? '#4ecca3' : 'none', color: orgFilter === 'all' ? '#1a1a1a' : '#aaa', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>All orgs</button>
              {allOrgs.map(o => (
                <button key={o.id} onClick={() => setOrgFilter(o.id)} aria-pressed={orgFilter === o.id} style={{ padding: '0.5rem 0.85rem', minHeight: '40px', borderRadius: '16px', border: orgFilter === o.id ? 'none' : '1px solid #444', background: orgFilter === o.id ? '#4ecca3' : 'none', color: orgFilter === o.id ? '#1a1a1a' : '#aaa', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{o.name}</button>
              ))}
            </div>
          )}

          {allRegions.length > 1 && (
            <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', marginBottom: '0.75rem' }}>
              <button onClick={() => setRegionFilter('all')} aria-pressed={regionFilter === 'all'} style={{ padding: '0.5rem 0.85rem', minHeight: '40px', borderRadius: '16px', border: regionFilter === 'all' ? 'none' : '1px solid #444', background: regionFilter === 'all' ? '#4ecca3' : 'none', color: regionFilter === 'all' ? '#1a1a1a' : '#aaa', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>All areas</button>
              {allRegions.map(reg => (
                <button key={reg} onClick={() => setRegionFilter(reg)} aria-pressed={regionFilter === reg} style={{ padding: '0.5rem 0.85rem', minHeight: '40px', borderRadius: '16px', border: regionFilter === reg ? 'none' : '1px solid #444', background: regionFilter === reg ? '#4ecca3' : 'none', color: regionFilter === reg ? '#1a1a1a' : '#aaa', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{reg}</button>
              ))}
            </div>
          )}

          {myLocation && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflowX: 'auto', marginBottom: '0.75rem' }}>
              <span style={{ color: '#999', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>Distance:</span>
              {[['all', 'All'], [10, '10 mi'], [25, '25 mi'], [50, '50 mi']].map(([val, label]) => (
                <button key={String(val)} onClick={() => setRadiusFilter(val)} aria-pressed={radiusFilter === val} style={{ padding: '0.5rem 0.8rem', minHeight: '40px', borderRadius: '16px', border: radiusFilter === val ? 'none' : '1px solid #444', background: radiusFilter === val ? '#4ecca3' : 'none', color: radiusFilter === val ? '#1a1a1a' : '#aaa', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
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
              <div ref={submitModalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="submit-resource-title" style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '12px', padding: '1.25rem', maxWidth: '400px', width: '90%', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 id="submit-resource-title" style={{ margin: 0, color: '#4ecca3' }}>Submit a Resource</h3>
                  <button onClick={() => setShowSubmit(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.25rem', cursor: 'pointer' }}>&#10005;</button>
                </div>
                {submitted ? (
                  <p style={{ color: '#4ecca3', fontWeight: 600, margin: 0 }}>Thank you! Your resource has been submitted for review.</p>
                ) : (
                  <>
                    <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>Share a resource with your community. Hope Ambassadors will verify submissions.</p>
                    {submitOrgOptions.length > 0 && (
                      <>
                        <label htmlFor="sub-org" style={labelStyle}>Organization</label>
                        <select id="sub-org" style={fieldStyle} value={subOrgId} onChange={e => setSubOrgId(e.target.value)}>
                          <option value="">{isAdmin ? 'No organization (post as VWB)' : 'Choose your organization'}</option>
                          {submitOrgOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </>
                    )}
                    <label id="sub-cat-label" style={labelStyle}>Category (required, choose one or more)</label>
                    <div role="group" aria-labelledby="sub-cat-label" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                      {CATEGORIES.map(c => (
                        <button key={c} type="button" onClick={() => setSubCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])} aria-pressed={subCats.includes(c)} style={{ padding: '0.5rem 0.75rem', minHeight: '40px', borderRadius: '16px', border: subCats.includes(c) ? 'none' : '1px solid #444', background: subCats.includes(c) ? '#4ecca3' : 'none', color: subCats.includes(c) ? '#1a1a1a' : '#aaa', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>{c}</button>
                      ))}
                    </div>
                    <label htmlFor="sub-name" style={labelStyle}>Resource name (required)</label>
                    <input id="sub-name" style={fieldStyle} placeholder="e.g. Ringgold Community Food Pantry" value={subName} onChange={e => setSubName(e.target.value)} maxLength={120} required />
                    <label htmlFor="sub-desc" style={labelStyle}>What do they offer?</label>
                    <textarea id="sub-desc" style={{ ...fieldStyle, minHeight: '60px', resize: 'vertical' }} placeholder="Who's it for, anything people should know? — e.g. Free groceries every Tuesday, no ID required" value={subDesc} onChange={e => setSubDesc(e.target.value)} maxLength={500} />
                    <label htmlFor="sub-phone" style={labelStyle}>Phone number (optional)</label>
                    <input id="sub-phone" style={fieldStyle} placeholder="e.g. (706) 555-0100" value={subPhone} onChange={e => setSubPhone(e.target.value)} />
                    <label htmlFor="sub-url" style={labelStyle}>Website (optional)</label>
                    <input id="sub-url" style={fieldStyle} placeholder="e.g. https://example.org" value={subUrl} onChange={e => setSubUrl(e.target.value)} />
                    <label htmlFor="sub-address" style={labelStyle}>Address (optional)</label>
                    <input id="sub-address" style={fieldStyle} placeholder="e.g. 123 Main St, Ringgold, GA" value={subAddress} onChange={e => setSubAddress(e.target.value)} />
                    {subAddress.trim() && (
                      <button type="button" onClick={captureSubLocation} disabled={capturingSubLocation} style={{ display: 'block', width: '100%', padding: '0.65rem', minHeight: '44px', marginBottom: '0.5rem', borderRadius: '6px', border: '1px solid #4ecca3', background: 'none', color: '#4ecca3', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                        {capturingSubLocation ? 'Getting your location...' : (subLat != null ? '📍 Location captured — tap to update' : '📍 Pin this address (optional, helps neighbors see how far away it is)')}
                      </button>
                    )}
                    <label htmlFor="sub-hood" style={labelStyle}>Neighborhood or area (optional)</label>
                    <input id="sub-hood" style={fieldStyle} placeholder="e.g. Ringgold, Catoosa County" value={subHood} onChange={e => setSubHood(e.target.value)} />
                    <label htmlFor="sub-requirements" style={labelStyle}>What to bring or know before you go (optional)</label>
                    <textarea id="sub-requirements" style={{ ...fieldStyle, minHeight: '50px', resize: 'vertical' }} placeholder="e.g. Photo ID and proof of address, first-come-first-served, no appointment needed" value={subRequirements} onChange={e => setSubRequirements(e.target.value)} maxLength={300} />
                    <button onClick={submitResource} disabled={!subName.trim() || !subCats.length || submitting} style={{ padding: '0.75rem 1.25rem', minHeight: '44px', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', opacity: (!subName.trim() || !subCats.length || submitting) ? 0.5 : 1 }}>
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
                  <span style={{ color: '#999', fontSize: '0.78rem' }}>{resourceCats(r).join(' · ')}{r.organizations ? ' · ' + r.organizations.name : ''}</span>
                </div>
              ))}
            </div>
          )}

          {loadingResources && <p style={{ textAlign: 'center', color: '#888', padding: '1rem' }}>Loading...</p>}

          {!loadingResources && Object.keys(grouped).map(cat => {
            const isOpen = expandedCats.includes(cat)
            return (
              <div key={cat} style={{ marginBottom: '0.5rem' }}>
                <button onClick={() => toggleCat(cat)} aria-expanded={isOpen} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.75rem', background: '#1e1e1e', border: '1px solid #333', borderRadius: isOpen ? '10px 10px 0 0' : '10px', cursor: 'pointer', textAlign: 'left' }}>
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
                        {r.requirements && <p style={{ color: '#ddaa44', fontSize: '0.78rem', margin: '0.2rem 0', lineHeight: 1.4 }}>&#128203; What to bring: {r.requirements}</p>}
                        {resourceDistance(r) != null && (
                          <p style={{ color: '#4ecca3', fontSize: '0.78rem', fontWeight: 600, margin: '0.2rem 0 0' }}>&#128205; {resourceDistance(r).toFixed(1)} mi away</p>
                        )}
                        {r.organizations && (
                          <button onClick={() => setOrgProfileOpen(r.organizations)} style={{ display: 'block', background: 'none', border: 'none', padding: '0.3rem 0', marginTop: '0.2rem', color: '#4ecca3', fontSize: '0.78rem', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>Shared by {r.organizations.name}</button>
                        )}
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                          {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#4ecca3', textDecoration: 'none', fontWeight: 600 }}>Visit &#8599;</a>}
                          {r.phone && <a href={'tel:' + r.phone.replace(/[^0-9+]/g, '')} style={{ fontSize: '0.8rem', color: '#66aaff', textDecoration: 'none', fontWeight: 600 }}>Call {r.phone}</a>}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                          <button onClick={() => castVote(r.id, 1)} title="This checked out for me" aria-pressed={myVotes[r.id] === 1} aria-label={'This checked out for me, ' + (voteCounts[r.id]?.upvotes || 0) + ' people agree' + (myVotes[r.id] === 1 ? ', selected' : '')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', minHeight: '40px', background: myVotes[r.id] === 1 ? 'rgba(78,204,163,0.15)' : 'none', border: '1px solid ' + (myVotes[r.id] === 1 ? '#4ecca3' : '#444'), borderRadius: '14px', padding: '0.45rem 0.75rem', color: myVotes[r.id] === 1 ? '#4ecca3' : '#aaa', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                            &#128077; {voteCounts[r.id]?.upvotes || 0}
                          </button>
                          <button onClick={() => castVote(r.id, -1)} title="This didn't work out for me" aria-pressed={myVotes[r.id] === -1} aria-label={"This didn't work out for me, " + (voteCounts[r.id]?.downvotes || 0) + ' people agree' + (myVotes[r.id] === -1 ? ', selected' : '')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', minHeight: '40px', background: myVotes[r.id] === -1 ? 'rgba(255,90,90,0.12)' : 'none', border: '1px solid ' + (myVotes[r.id] === -1 ? '#ff5a5a' : '#444'), borderRadius: '14px', padding: '0.45rem 0.75rem', color: myVotes[r.id] === -1 ? '#ff8888' : '#aaa', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                            &#128078; {voteCounts[r.id]?.downvotes || 0}
                          </button>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginLeft: 'auto' }}>
                            <button onClick={() => toggleHistory(r.id)} aria-expanded={openHistoryFor.includes(r.id)} style={{ background: 'none', border: 'none', color: '#66aaff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: '0.5rem 0.1rem', minHeight: '40px' }}>
                              {(editHistoryByResource[r.id] || []).filter(e => !e.reverted).length > 0 ? (editHistoryByResource[r.id].filter(e => !e.reverted).length) + ' edit' + ((editHistoryByResource[r.id].filter(e => !e.reverted).length === 1) ? '' : 's') : 'Edit history'}
                            </button>
                            <button onClick={() => toggleReviews(r.id)} aria-expanded={openReviewsFor.includes(r.id)} style={{ background: 'none', border: 'none', color: '#66aaff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: '0.5rem 0.1rem', minHeight: '40px' }}>
                              {(reviewsByResource[r.id]?.length || 0) > 0 ? reviewsByResource[r.id].length + ' review' + (reviewsByResource[r.id].length === 1 ? '' : 's') : 'Leave a review'}
                            </button>
                          </div>
                        </div>

                        {openReviewsFor.includes(r.id) && (
                          <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #2a2a2a' }}>
                            {(reviewsByResource[r.id] || []).map(rev => (
                              <div key={rev.id} style={{ marginBottom: '0.5rem' }}>
                                <p style={{ color: '#ccc', fontSize: '0.78rem', margin: 0, lineHeight: 1.4 }}>{rev.body}</p>
                                <span style={{ color: '#999', fontSize: '0.75rem' }}>
                                  Anonymous &middot; {new Date(rev.created_at).toLocaleDateString()}
                                  {rev.user_id === user?.id && (
                                    <> &middot; <button onClick={() => deleteMyReview(r.id, rev.id)} aria-label="Delete your review" style={{ background: 'none', border: 'none', color: '#ff8888', fontSize: '0.75rem', cursor: 'pointer', padding: '0.35rem 0.1rem', minHeight: '32px' }}>delete</button></>
                                  )}
                                </span>
                              </div>
                            ))}
                            {(reviewsByResource[r.id] || []).length === 0 && (
                              <p style={{ color: '#999', fontSize: '0.78rem', margin: '0 0 0.4rem' }}>No reviews yet.</p>
                            )}
                            <textarea
                              value={reviewDrafts[r.id] || ''}
                              onChange={e => setReviewDrafts(prev => ({ ...prev, [r.id]: e.target.value }))}
                              placeholder="Add an anonymous note about your experience — no name shown, ever"
                              aria-label="Your anonymous review"
                              maxLength={500}
                              style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.8rem', marginBottom: '0.4rem', minHeight: '50px', resize: 'vertical', boxSizing: 'border-box' }}
                            />
                            <button onClick={() => submitReview(r.id)} disabled={!reviewDrafts[r.id]?.trim() || submittingReviewFor === r.id} style={{ padding: '0.55rem 0.9rem', minHeight: '40px', borderRadius: '6px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: (!reviewDrafts[r.id]?.trim() || submittingReviewFor === r.id) ? 0.5 : 1 }}>
                              {submittingReviewFor === r.id ? 'Posting...' : 'Post anonymously'}
                            </button>
                          </div>
                        )}

                        {openHistoryFor.includes(r.id) && (
                          <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #2a2a2a' }}>
                            {(editHistoryByResource[r.id] || []).map(ed => (
                              <div key={ed.id} style={{ marginBottom: '0.5rem', opacity: ed.reverted ? 0.5 : 1 }}>
                                {Object.entries(ed.changes || {}).map(([field, diff]) => (
                                  <p key={field} style={{ color: '#ccc', fontSize: '0.75rem', margin: '0.1rem 0', lineHeight: 1.4 }}>
                                    <span style={{ color: '#888', textTransform: 'capitalize' }}>{field}:</span>{' '}
                                    {diff?.old ? diff.old : '(blank)'} &rarr; {diff?.new ? diff.new : '(blank)'}
                                  </p>
                                ))}
                                <span style={{ color: '#999', fontSize: '0.75rem' }}>
                                  {ed.edited_by_name || 'A neighbor'}{ed.edited_by_is_ambassador ? ' (Hope Ambassador)' : ''} &middot; {new Date(ed.created_at).toLocaleDateString()}
                                  {ed.source_url && <> &middot; <a href={ed.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#66aaff' }}>source</a></>}
                                  {ed.reverted && <> &middot; undone{ed.reverted_by_name ? ' by ' + ed.reverted_by_name : ''}</>}
                                  {!ed.reverted && canVerify && (
                                    <> &middot; <button onClick={() => revertEdit(ed.id)} disabled={revertingId === ed.id} aria-label="Undo this edit" style={{ background: 'none', border: 'none', color: '#ff8888', fontSize: '0.75rem', cursor: 'pointer', padding: '0.35rem 0.1rem', minHeight: '32px' }}>{revertingId === ed.id ? 'undoing...' : 'undo'}</button></>
                                  )}
                                </span>
                              </div>
                            ))}
                            {(editHistoryByResource[r.id] || []).length === 0 && (
                              <p style={{ color: '#999', fontSize: '0.78rem', margin: '0 0 0.4rem' }}>No edits yet.</p>
                            )}

                            {user && editFormFor !== r.id && (
                              <button onClick={() => openEditForm(r)} style={{ padding: '0.5rem 0.8rem', minHeight: '40px', borderRadius: '6px', border: '1px solid #4ecca3', background: 'none', color: '#4ecca3', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
                                Suggest an edit
                              </button>
                            )}

                            {editFormFor === r.id && (
                              <div style={{ marginTop: '0.4rem', padding: '0.6rem', background: '#181818', border: '1px solid #333', borderRadius: '8px' }}>
                                <p style={{ color: '#999', fontSize: '0.75rem', margin: '0 0 0.5rem', lineHeight: 1.4 }}>Fix anything that's out of date. Change only what's wrong -- everything else stays as-is.</p>
                                <label htmlFor={`edit-${r.id}-name`} style={{ display: 'block', color: '#aaa', fontSize: '0.75rem', marginBottom: '0.15rem' }}>Name</label>
                                <input id={`edit-${r.id}-name`} value={editDraft.name} onChange={e => setEditDraft(prev => ({ ...prev, name: e.target.value }))} style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.82rem', marginBottom: '0.4rem', boxSizing: 'border-box' }} />
                                <label htmlFor={`edit-${r.id}-desc`} style={{ display: 'block', color: '#aaa', fontSize: '0.75rem', marginBottom: '0.15rem' }}>Description</label>
                                <textarea id={`edit-${r.id}-desc`} value={editDraft.description} onChange={e => setEditDraft(prev => ({ ...prev, description: e.target.value }))} style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.82rem', marginBottom: '0.4rem', minHeight: '50px', resize: 'vertical', boxSizing: 'border-box' }} />
                                <label htmlFor={`edit-${r.id}-phone`} style={{ display: 'block', color: '#aaa', fontSize: '0.75rem', marginBottom: '0.15rem' }}>Phone</label>
                                <input id={`edit-${r.id}-phone`} value={editDraft.phone} onChange={e => setEditDraft(prev => ({ ...prev, phone: e.target.value }))} style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.82rem', marginBottom: '0.4rem', boxSizing: 'border-box' }} />
                                <label htmlFor={`edit-${r.id}-url`} style={{ display: 'block', color: '#aaa', fontSize: '0.75rem', marginBottom: '0.15rem' }}>Website</label>
                                <input id={`edit-${r.id}-url`} value={editDraft.url} onChange={e => setEditDraft(prev => ({ ...prev, url: e.target.value }))} style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.82rem', marginBottom: '0.4rem', boxSizing: 'border-box' }} />
                                <label htmlFor={`edit-${r.id}-address`} style={{ display: 'block', color: '#aaa', fontSize: '0.75rem', marginBottom: '0.15rem' }}>Address</label>
                                <input id={`edit-${r.id}-address`} value={editDraft.address} onChange={e => setEditDraft(prev => ({ ...prev, address: e.target.value }))} style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.82rem', marginBottom: '0.4rem', boxSizing: 'border-box' }} />
                                <label htmlFor={`edit-${r.id}-requirements`} style={{ display: 'block', color: '#aaa', fontSize: '0.75rem', marginBottom: '0.15rem' }}>What to bring / barriers to know about</label>
                                <textarea id={`edit-${r.id}-requirements`} value={editDraft.requirements} onChange={e => setEditDraft(prev => ({ ...prev, requirements: e.target.value }))} placeholder="e.g. Photo ID and proof of address required, appointment needed, cash only" style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.82rem', marginBottom: '0.4rem', minHeight: '45px', resize: 'vertical', boxSizing: 'border-box' }} />
                                <label htmlFor={`edit-${r.id}-source`} style={{ display: 'block', color: '#4ecca3', fontSize: '0.75rem', marginBottom: '0.15rem', fontWeight: 600 }}>Where did you confirm this? (required)</label>
                                <input id={`edit-${r.id}-source`} value={editDraft.source_url} onChange={e => setEditDraft(prev => ({ ...prev, source_url: e.target.value }))} placeholder="The organization's own website or social post" style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #4ecca3', background: '#222', color: '#fff', fontSize: '0.82rem', marginBottom: '0.5rem', boxSizing: 'border-box' }} />
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                  <button onClick={cancelEditForm} style={{ padding: '0.55rem 0.9rem', minHeight: '40px', borderRadius: '6px', border: '1px solid #444', background: 'none', color: '#aaa', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                                  <button onClick={() => submitResourceEdit(r)} disabled={!editDraft.source_url?.trim() || submittingEdit} style={{ padding: '0.55rem 0.9rem', minHeight: '40px', borderRadius: '6px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: (!editDraft.source_url?.trim() || submittingEdit) ? 0.5 : 1 }}>
                                    {submittingEdit ? 'Saving...' : 'Save correction'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {!loadingResources && filteredVerifiedResources.length === 0 && (
            <p style={{ textAlign: 'center', color: '#8a8a8a', padding: '1.5rem' }}>
              {(orgFilter !== 'all' || regionFilter !== 'all' || radiusFilter !== 'all') ? 'No resources match your filters -- try widening them.' : 'No resources yet. Be the first to add one.'}
            </p>
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
                  <button onClick={() => setShowEventSubmit(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.25rem', cursor: 'pointer' }}>&#10005;</button>
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
            <p style={{ textAlign: 'center', color: '#8a8a8a', padding: '1.5rem' }}>No upcoming events yet. Be the first to add one.</p>
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
          <div ref={orgModalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="org-profile-title" style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '12px', padding: '1.25rem', maxWidth: '380px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 id="org-profile-title" style={{ margin: 0, color: '#4ecca3' }}>{orgProfileOpen.name}</h3>
              <button onClick={() => setOrgProfileOpen(null)} aria-label="Close" style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.25rem', cursor: 'pointer', minWidth: '40px', minHeight: '40px' }}>&#10005;</button>
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
