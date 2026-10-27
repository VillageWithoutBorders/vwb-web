import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { distanceMiles } from '../utils/location'
import { startingOrigin } from '../utils/calendar'
import { CATEGORIES, CAT_ICON_FILES, resourceCats, resourceMatches, currentCategory } from '../utils/resourceCategories'
import '../find-help.css'
import { searchScore } from '../utils/resourceSearch'
import AddressLink from '../components/AddressLink'
import BackLink from '../components/BackLink'
import HelpSwitch from '../components/HelpSwitch'
import Icon from '../components/Icon'
import AreaPicker from '../components/AreaPicker'
import CrnCardDetails from '../components/CrnCardDetails'
import ResourceReport from '../components/ResourceReport'
import SuggestResource from '../components/SuggestResource'
import ResourceSuggestionsReview from '../components/ResourceSuggestionsReview'
import { placesEnabled, getMyPlaces, getVisitorArea, setVisitorArea } from '../utils/places'
import { findHelpForMe, resourcesForPlace, friendlyError, saysNo } from '../utils/resourceReports'
import { tell } from '../components/AdminDialog'

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

export default function CommunityResources() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(() => searchParams.get('q') || '')
  const { user, profile, isAdmin, organizations: myOrgs } = useAuth()
  const canVerify = profile?.is_hope_ambassador || isAdmin
  const canSubmit = (myOrgs && myOrgs.length > 0) || isAdmin

  // Organizations (approved, public) — used for the Resources filter, org
  // attribution on cards, and the org picker in both submit forms.
  const [allOrgs, setAllOrgs] = useState([])
  const submitModalRef = useRef(null)

  // The viewer's own approximate location, used to sort resources with a
  // pinned location nearest-first. Resources without a pin just stay put.
  const [myLocation, setMyLocation] = useState(null)

  // Resource Library
  const [resources, setResources] = useState([])
  const [loadingResources, setLoadingResources] = useState(true)
  const [selectedCat, setSelectedCat] = useState(() => (searchParams.get('cat') ? currentCategory(searchParams.get('cat')) : null))
  const [showFilters, setShowFilters] = useState(false)
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

  // CRN preview (test project only): areas, reports, and the new Find Help lists.
  const [visitorArea, setVisitorAreaState] = useState(() => (placesEnabled ? getVisitorArea() : null))
  const [myAreaCount, setMyAreaCount] = useState(null) // null = not loaded yet
  const [reportFor, setReportFor] = useState(null) // the resource the "Something wrong?" sheet is open for
  const [cardNotice, setCardNotice] = useState(null) // { id, text } shown on one card after an action
  const [loadError, setLoadError] = useState('')
  const [accessFilter, setAccessFilter] = useState([]) // 'no_appt' | 'no_referral' | 'how:<delivery method>'

  useEffect(() => { loadOrgs(); loadVoteCounts(); loadReviews(); loadEditHistory() }, [])
  useEffect(() => { loadResources() }, [user?.id, visitorArea?.id, canVerify])
  useEffect(() => {
    if (!placesEnabled || !user) { setMyAreaCount(null); return }
    let gone = false
    getMyPlaces().then(({ data, error }) => { if (!gone && !error) setMyAreaCount(data.length) })
    return () => { gone = true }
  }, [user?.id])
  useEffect(() => { loadMyVotes() }, [user])
  // Distances only show when we already know the person's area. We never ask
  // the phone on page load, and never guess.
  useEffect(() => { setMyLocation(startingOrigin(profile)) }, [profile?.latitude, profile?.longitude])

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

  useEffect(() => { if (profile?.neighborhood && !subHood) setSubHood(profile.neighborhood) }, [profile])
  useEffect(() => {
    // If someone belongs to exactly one org, don't make them pick it every time.
    if (!isAdmin && myOrgs && myOrgs.length === 1) {
      setSubOrgId(myOrgs[0].id)
    }
  }, [myOrgs, isAdmin])

  async function loadOrgs() {
    const { data, error } = await supabase.from('organizations').select('id, name, description, website_url').eq('approved', true).order('name')
    if (error) console.error('Failed to load organizations:', error)
    if (data) setAllOrgs(data)
  }

  async function loadResources() {
    if (placesEnabled) { await loadPreviewResources(); return }
    setLoadingResources(true)
    const { data, error } = await supabase
      .from('community_resources')
      .select('*, organizations ( id, name, description, website_url, social_links )')
      .order('category')
      .order('name')
    if (error) console.error('Failed to load community resources:', error)
    if (data) setResources(data)
    setLoadingResources(false)
  }

  // CRN preview: members get find_help_for_me(), visitors get the list for the
  // county they chose. Reviewers also see what's waiting for review.
  async function loadPreviewResources() {
    setLoadingResources(true); setLoadError('')
    let list = []
    if (user) {
      const { data, error } = await findHelpForMe()
      if (error) {
        console.error('find_help_for_me failed:', error)
        setLoadError("We couldn't load Find Help. Pull down to try again.")
      }
      list = (data || []).map((r) => ({ ...r, verified: true }))
      if (profile?.is_hope_ambassador || isAdmin) {
        const { data: pending, error: pErr } = await supabase
          .from('community_resources')
          .select('*, organizations ( id, name, description, website_url, social_links )')
          .eq('verified', false)
          .order('name')
        if (pErr) console.error('Failed to load resources waiting for review:', pErr)
        list = list.concat(pending || [])
      }
    } else if (visitorArea) {
      const { data, error } = await resourcesForPlace(visitorArea.id)
      if (error) {
        console.error('resources_for_place failed:', error)
        setLoadError("We couldn't load Find Help. Try again in a moment.")
      }
      list = (data || []).map((r) => ({ ...r, verified: true }))
    }
    setResources(list)
    setLoadingResources(false)
  }

  function chooseVisitorArea(area) {
    setVisitorArea(area)
    setVisitorAreaState(area)
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
      tell('Could not post your review. Try again.', { tone: 'error' })
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
      tell("Add a link to where you found this: the organization's own website or social post.", { tone: 'error' })
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
      tell('Nothing was changed.')
      return
    }
    setSubmittingEdit(true)
    const { error } = await supabase.rpc('submit_resource_edit', payload)
    setSubmittingEdit(false)
    if (error) {
      console.error('Failed to submit resource edit:', error)
      tell(placesEnabled ? friendlyError(error, 'Could not send your edit. Try again.') : 'Could not save your edit. Try again.', { tone: 'error' })
      return
    }
    setEditFormFor(null)
    if (placesEnabled) setCardNotice({ id: r.id, text: 'Thank you. A Hope Ambassador will check your edit. The listing stays the same until then.' })
    await Promise.all([loadResources(), loadEditHistory()])
  }

  async function revertEdit(editId) {
    if (!canVerify) return
    setRevertingId(editId)
    const { error } = await supabase.rpc('revert_resource_edit', { p_edit_id: editId })
    setRevertingId(null)
    if (error) {
      console.error('Failed to undo resource edit:', error)
      tell('Could not undo this edit. Try again.', { tone: 'error' })
      return
    }
    await Promise.all([loadResources(), loadEditHistory()])
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
      tell('Could not submit this resource. Try again.', { tone: 'error' })
      return
    }
    setSubmitted(true)
    setSubName(''); setSubDesc(''); setSubCats([]); setSubPhone(''); setSubUrl(''); setSubAddress(''); setSubRequirements('')
    setSubLat(null); setSubLng(null)
    await loadResources()
  }

  async function verifyResource(id) {
    const { error } = await supabase.from('community_resources').update({ verified: true, verified_by: user.id }).eq('id', id)
    if (error) { console.error('Failed to verify resource:', error); tell('Could not verify this resource. Try again.', { tone: 'error' }); return }
    await loadResources()
  }

  // One kind of help at a time; the address keeps it (?cat=Food) so Back works.
  function openCat(cat) {
    setSelectedCat(cat)
    const next = new URLSearchParams(window.location.search)
    if (cat) next.set('cat', cat); else next.delete('cat')
    window.history.replaceState(null, '', window.location.pathname + (next.toString() ? '?' + next : ''))
    window.scrollTo({ top: 0 })
  }

  // The new lists don't carry the organization, so add it from the org list.
  const orgById = {}
  allOrgs.forEach((o) => { orgById[o.id] = o })
  const viewResources = placesEnabled
    ? resources.map((r) => (r.organizations || !r.organization_id ? r : { ...r, organizations: orgById[r.organization_id] || null }))
    : resources
  const verifiedResources = viewResources.filter(r => r.verified)
  const pendingResources = viewResources.filter(r => !r.verified)
  // Ways to get help, from the programs' own words (CRN preview).
  const deliveryMethods = placesEnabled
    ? [...new Set(verifiedResources.map((r) => (r.delivery_method || '').trim()).filter((v) => v && !/^unknown$/i.test(v)))].sort()
    : []
  const hasCrn = placesEnabled && verifiedResources.some((r) => r.source === 'crn')
  const allRegions = [...new Set(verifiedResources.map(r => r.region).filter(Boolean))].sort()
  const filteredVerifiedResources = verifiedResources.filter(r => {
    if (query.trim() && !resourceMatches(r, query) && searchScore(r, query) === 0) return false
    if (orgFilter !== 'all' && r.organization_id !== orgFilter) return false
    if (regionFilter !== 'all' && r.region !== regionFilter) return false
    if (accessFilter.includes('no_appt') && !saysNo(r.appointment_required)) return false
    if (accessFilter.includes('no_referral') && !saysNo(r.referral_required)) return false
    const hows = accessFilter.filter((f) => f.startsWith('how:')).map((f) => f.slice(4))
    if (hows.length && !hows.includes((r.delivery_method || '').trim())) return false
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


  const orderedCats = [...CATEGORIES, ...Object.keys(grouped).filter((c) => !CATEGORIES.includes(c))].filter((c) => grouped[c])
  const activeFilters = (orgFilter !== 'all' ? 1 : 0) + (regionFilter !== 'all' ? 1 : 0) + (radiusFilter !== 'all' ? 1 : 0) + accessFilter.length
  const accessLabel = (f) => f === 'no_appt' ? 'No appointment needed' : f === 'no_referral' ? 'No referral needed' : f.slice(4)
  const toggleAccess = (f) => setAccessFilter((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f])
  const managesOrg = (oid) => !!oid && (isAdmin || (myOrgs || []).some((o) => o.id === oid && (o.role === 'admin' || o.role === 'organizer')))
  const visitorNeedsArea = placesEnabled && !user && !visitorArea
  const orgName = (oid) => (allOrgs.find((o) => o.id === oid) || {}).name || 'Group'

  const submitOrgOptions = isAdmin ? allOrgs : (myOrgs || [])

  const fieldStyle = { display: 'block', width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)', fontSize: '0.85rem', marginBottom: '0.5rem', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', color: 'var(--text-secondary)', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }

  const resourceCard = (r) => (
                      <div key={r.id} className="fh-card">
                        <span className="fh-card-name">{r.name}</span>
                        {r.description && <p className="fh-card-desc">{r.description}</p>}
                        {placesEnabled && <CrnCardDetails r={r} />}
                        {r.address && <p className="fh-card-meta"><AddressLink address={r.address} /></p>}
                        {r.neighborhood && <p className="fh-card-meta">Area: {r.neighborhood}</p>}
                        {r.requirements && <p style={{ color: 'var(--warn)', fontSize: '0.8125rem', margin: '0.2rem 0', lineHeight: 1.4 }}><Icon name="clipboard" /> What to bring: {r.requirements}</p>}
                        {resourceDistance(r) != null && (
                          <p style={{ color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600, margin: '0.2rem 0 0' }}><Icon name="pin" /> {resourceDistance(r).toFixed(1)} mi away</p>
                        )}
                        {r.organizations && !user && (
                          <p style={{ color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600, margin: '0.4rem 0 0' }}>Shared by {r.organizations.name}</p>
                        )}
                        {r.organizations && user && (
                          <button onClick={() => navigate('/orgs/' + r.organizations.id)} style={{ display: 'block', background: 'none', border: 'none', padding: '0.3rem 0', marginTop: '0.2rem', color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>Shared by {r.organizations.name}</button>
                        )}
                        <div className="fh-card-links">
                          {r.phone && <a className="fh-link" href={'tel:' + r.phone.replace(/[^0-9+]/g, '')} style={{ color: 'var(--info)' }}>Call {r.phone}</a>}
                          {!r.phone && r.provider_phone && <a className="fh-link" href={'tel:' + r.provider_phone.replace(/[^0-9+]/g, '')} style={{ color: 'var(--info)' }}>Organization phone: {r.provider_phone}</a>}
                          {r.url && <a className="fh-link" href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Visit website &#8599;</a>}
                          {Array.isArray(r.links) && r.links.filter((l) => l && /^https?:\/\//i.test(l.url || '')).map((l, i) => (
                            <a key={i} className="fh-link" href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{l.label || 'Link'} &#8599;</a>
                          ))}
                        </div>

                        {placesEnabled && r.has_pending_edit && (
                          <p role="note" style={{ color: 'var(--text-soft)', fontSize: '0.85rem', margin: '0.4rem 0 0' }}><Icon name="hourglass" /> Your edit is waiting for a Hope Ambassador.</p>
                        )}
                        {placesEnabled && cardNotice?.id === r.id && (
                          <p role="status" style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 600, margin: '0.4rem 0 0' }}>{cardNotice.text}</p>
                        )}
                        {placesEnabled && user && r.verified && (
                          <button type="button" onClick={() => setReportFor(r)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', minHeight: 44, marginTop: '0.4rem', padding: '0 0.2rem', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>
                            <Icon name="flag" /> Something wrong?
                          </button>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                          {user && (<>
<button onClick={() => castVote(r.id, 1)} title="This checked out for me" aria-pressed={myVotes[r.id] === 1} aria-label={'This checked out for me, ' + (voteCounts[r.id]?.upvotes || 0) + ' people agree' + (myVotes[r.id] === 1 ? ', selected' : '')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', minHeight: '44px', background: myVotes[r.id] === 1 ? 'rgba(78,204,163,0.15)' : 'none', border: '1px solid ' + (myVotes[r.id] === 1 ? 'var(--accent)' : 'var(--border-strong)'), borderRadius: '14px', padding: '0.45rem 0.75rem', color: myVotes[r.id] === 1 ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
                            <Icon name="check" /> {voteCounts[r.id]?.upvotes || 0}
                          </button>
                          <button onClick={() => castVote(r.id, -1)} title="This didn't work out for me" aria-pressed={myVotes[r.id] === -1} aria-label={"This didn't work out for me, " + (voteCounts[r.id]?.downvotes || 0) + ' people agree' + (myVotes[r.id] === -1 ? ', selected' : '')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', minHeight: '44px', background: myVotes[r.id] === -1 ? 'rgba(255,90,90,0.12)' : 'none', border: '1px solid ' + (myVotes[r.id] === -1 ? '#ff5a5a' : 'var(--border-strong)'), borderRadius: '14px', padding: '0.45rem 0.75rem', color: myVotes[r.id] === -1 ? 'var(--danger)' : 'var(--text-secondary)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
                            <Icon name="cross" /> {voteCounts[r.id]?.downvotes || 0}
                          </button>
</>)}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginLeft: 'auto' }}>
                            <button onClick={() => toggleHistory(r.id)} aria-expanded={openHistoryFor.includes(r.id)} style={{ background: 'none', border: 'none', color: 'var(--info)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', padding: '0.5rem 0.1rem', minHeight: '44px' }}>
                              {(editHistoryByResource[r.id] || []).filter(e => !e.reverted).length > 0 ? (editHistoryByResource[r.id].filter(e => !e.reverted).length) + ' edit' + ((editHistoryByResource[r.id].filter(e => !e.reverted).length === 1) ? '' : 's') : 'Edit history'}
                            </button>
                            <button onClick={() => toggleReviews(r.id)} aria-expanded={openReviewsFor.includes(r.id)} style={{ background: 'none', border: 'none', color: 'var(--info)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', padding: '0.5rem 0.1rem', minHeight: '44px' }}>
                              {(reviewsByResource[r.id]?.length || 0) > 0 ? reviewsByResource[r.id].length + ' review' + (reviewsByResource[r.id].length === 1 ? '' : 's') : 'Leave a review'}
                            </button>
                          </div>
                        </div>

                        {openReviewsFor.includes(r.id) && (
                          <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                            {(reviewsByResource[r.id] || []).map(rev => (
                              <div key={rev.id} style={{ marginBottom: '0.5rem' }}>
                                <p style={{ color: 'var(--text-soft)', fontSize: '0.8125rem', margin: 0, lineHeight: 1.4 }}>{rev.body}</p>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                                  Anonymous &middot; {new Date(rev.created_at).toLocaleDateString()}
                                  {rev.user_id === user?.id && (
                                    <> &middot; <button onClick={() => deleteMyReview(r.id, rev.id)} aria-label="Delete your review" style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.8125rem', cursor: 'pointer', padding: '0.35rem 0.25rem', minHeight: '44px' }}>delete</button></>
                                  )}
                                </span>
                              </div>
                            ))}
                            {(reviewsByResource[r.id] || []).length === 0 && (
                              <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', margin: '0 0 0.4rem' }}>No reviews yet.</p>
                            )}
                            {user ? (<>
<textarea
                              value={reviewDrafts[r.id] || ''}
                              onChange={e => setReviewDrafts(prev => ({ ...prev, [r.id]: e.target.value }))}
                              placeholder="Add a note about how it went. Your name is never shown."
                              aria-label="Your anonymous review"
                              maxLength={500}
                              style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)', fontSize: '0.8125rem', marginBottom: '0.4rem', minHeight: '50px', resize: 'vertical', boxSizing: 'border-box' }}
                            />
                            <button onClick={() => submitReview(r.id)} disabled={!reviewDrafts[r.id]?.trim() || submittingReviewFor === r.id} style={{ padding: '0.55rem 0.9rem', minHeight: '44px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', opacity: (!reviewDrafts[r.id]?.trim() || submittingReviewFor === r.id) ? 0.5 : 1 }}>
                              {submittingReviewFor === r.id ? 'Posting...' : 'Post anonymously'}
                            </button>
</>) : (
<p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', margin: 0 }}>Sign in to add a note about your experience.</p>
)}
                          </div>
                        )}

                        {openHistoryFor.includes(r.id) && (
                          <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                            {(editHistoryByResource[r.id] || []).map(ed => (
                              <div key={ed.id} style={{ marginBottom: '0.5rem', opacity: ed.reverted ? 0.5 : 1 }}>
                                {Object.entries(ed.changes || {}).map(([field, diff]) => (
                                  <p key={field} style={{ color: 'var(--text-soft)', fontSize: '0.8125rem', margin: '0.1rem 0', lineHeight: 1.4 }}>
                                    <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{field}:</span>{' '}
                                    {diff?.old ? diff.old : '(blank)'} &rarr; {diff?.new ? diff.new : '(blank)'}
                                  </p>
                                ))}
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                                  {ed.edited_by_name || 'A neighbor'}{ed.edited_by_is_ambassador ? ' (Hope Ambassador)' : ''} &middot; {new Date(ed.created_at).toLocaleDateString()}
                                  {ed.source_url && <> &middot; <a href={ed.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--info)' }}>source</a></>}
                                  {ed.reverted && <> &middot; undone{ed.reverted_by_name ? ' by ' + ed.reverted_by_name : ''}</>}
                                  {!ed.reverted && canVerify && (
                                    <> &middot; <button onClick={() => revertEdit(ed.id)} disabled={revertingId === ed.id} aria-label="Undo this edit" style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.8125rem', cursor: 'pointer', padding: '0.35rem 0.25rem', minHeight: '44px' }}>{revertingId === ed.id ? 'undoing...' : 'undo'}</button></>
                                  )}
                                </span>
                              </div>
                            ))}
                            {(editHistoryByResource[r.id] || []).length === 0 && (
                              <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', margin: '0 0 0.4rem' }}>No edits yet.</p>
                            )}

                            {user && editFormFor !== r.id && (
                              <button onClick={() => openEditForm(r)} style={{ padding: '0.5rem 0.8rem', minHeight: '44px', borderRadius: '6px', border: '1px solid var(--accent)', background: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer' }}>
                                Suggest an edit
                              </button>
                            )}

                            {editFormFor === r.id && (
                              <div style={{ marginTop: '0.4rem', padding: '0.6rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', margin: '0 0 0.5rem', lineHeight: 1.4 }}>Fix anything that's out of date. Change only what's wrong -- everything else stays as-is.</p>
                                <label htmlFor={`edit-${r.id}-name`} style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '0.15rem' }}>Name</label>
                                <input id={`edit-${r.id}-name`} value={editDraft.name} onChange={e => setEditDraft(prev => ({ ...prev, name: e.target.value }))} style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)', fontSize: '0.82rem', marginBottom: '0.4rem', boxSizing: 'border-box' }} />
                                <label htmlFor={`edit-${r.id}-desc`} style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '0.15rem' }}>Description</label>
                                <textarea id={`edit-${r.id}-desc`} value={editDraft.description} onChange={e => setEditDraft(prev => ({ ...prev, description: e.target.value }))} style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)', fontSize: '0.82rem', marginBottom: '0.4rem', minHeight: '50px', resize: 'vertical', boxSizing: 'border-box' }} />
                                <label htmlFor={`edit-${r.id}-phone`} style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '0.15rem' }}>Phone</label>
                                <input id={`edit-${r.id}-phone`} value={editDraft.phone} onChange={e => setEditDraft(prev => ({ ...prev, phone: e.target.value }))} style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)', fontSize: '0.82rem', marginBottom: '0.4rem', boxSizing: 'border-box' }} />
                                <label htmlFor={`edit-${r.id}-url`} style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '0.15rem' }}>Website</label>
                                <input id={`edit-${r.id}-url`} value={editDraft.url} onChange={e => setEditDraft(prev => ({ ...prev, url: e.target.value }))} style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)', fontSize: '0.82rem', marginBottom: '0.4rem', boxSizing: 'border-box' }} />
                                <label htmlFor={`edit-${r.id}-address`} style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '0.15rem' }}>Address</label>
                                <input id={`edit-${r.id}-address`} value={editDraft.address} onChange={e => setEditDraft(prev => ({ ...prev, address: e.target.value }))} style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)', fontSize: '0.82rem', marginBottom: '0.4rem', boxSizing: 'border-box' }} />
                                <label htmlFor={`edit-${r.id}-requirements`} style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '0.15rem' }}>What to bring / barriers to know about</label>
                                <textarea id={`edit-${r.id}-requirements`} value={editDraft.requirements} onChange={e => setEditDraft(prev => ({ ...prev, requirements: e.target.value }))} placeholder="e.g. Photo ID and proof of address required, appointment needed, cash only" style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)', fontSize: '0.82rem', marginBottom: '0.4rem', minHeight: '45px', resize: 'vertical', boxSizing: 'border-box' }} />
                                <label htmlFor={`edit-${r.id}-source`} style={{ display: 'block', color: 'var(--accent)', fontSize: '0.8125rem', marginBottom: '0.15rem', fontWeight: 600 }}>Where did you confirm this? (required)</label>
                                <input id={`edit-${r.id}-source`} value={editDraft.source_url} onChange={e => setEditDraft(prev => ({ ...prev, source_url: e.target.value }))} placeholder="The organization's own website or social post" style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text-strong)', fontSize: '0.82rem', marginBottom: '0.5rem', boxSizing: 'border-box' }} />
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                  <button onClick={cancelEditForm} style={{ padding: '0.55rem 0.9rem', minHeight: '44px', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer' }}>Cancel</button>
                                  <button onClick={() => submitResourceEdit(r)} disabled={!editDraft.source_url?.trim() || submittingEdit} style={{ padding: '0.55rem 0.9rem', minHeight: '44px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', opacity: (!editDraft.source_url?.trim() || submittingEdit) ? 0.5 : 1 }}>
                                    {submittingEdit ? 'Saving...' : 'Save correction'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
  )

  return (
    <div className="community-page">
      {user ? <HelpSwitch /> : <BackLink fallback="/welcome" fallbackLabel="Welcome" />}
      <div className="fh-head">
        <img src="/art/icons/heart-hands.svg" alt="" width="48" height="48" />
        <h1>Find resources</h1>
      </div>
      <p className="feed-subtitle" style={{ marginBottom: '1rem' }}>Food, housing, safety, and more, shared by neighbors and local groups.</p>

      <form className="hub-search" role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="res-search" className="sr-only">Search resources</label>
        <input id="res-search" type="search" inputMode="search" enterKeyHint="search" placeholder="Food, rent, rides..." value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && <button type="button" className="btn btn-outline" onClick={() => setQuery('')}>Clear</button>}
      </form>

      {visitorNeedsArea && (
        <AreaPicker mode="visitor" heading="Where are you?" onChange={chooseVisitorArea} />
      )}
      {placesEnabled && !user && visitorArea && (
        <p style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.25rem 0.5rem', margin: '0 0 0.75rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          <span>Showing help for <strong style={{ color: 'var(--text)' }}>{visitorArea.label}</strong>.</span>
          <button type="button" onClick={() => chooseVisitorArea(null)} style={{ minHeight: 44, padding: '0 0.25rem', background: 'none', border: 'none', color: 'var(--accent)', font: 'inherit', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>Change area</button>
        </p>
      )}
      {placesEnabled && user && myAreaCount === 0 && (
        <p role="note" style={{ color: 'var(--text-soft)', fontSize: '0.95rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.6rem', margin: '0 0 0.75rem', lineHeight: 1.45 }}>
          Choose your area to see programs that serve you. <Link to="/settings?tab=account" style={{ color: 'var(--accent)', fontWeight: 600 }}>Choose your area</Link>
        </p>
      )}
      {placesEnabled && canVerify && (
        <p style={{ margin: '0 0 0.75rem' }}>
          <Link to="/resource-reports" className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', minHeight: 44, padding: '0 1rem' }}><Icon name="flag" /> Reports to review</Link>
        </p>
      )}
      {loadError && <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.95rem', margin: '0 0 0.75rem' }}>{loadError}</p>}

          {!visitorNeedsArea && (allOrgs.length > 0 || allRegions.length > 1 || myLocation || hasCrn) && (
            <div className="fh-filterbar">
              <button type="button" className="fh-filter-btn" aria-haspopup="dialog" onClick={() => setShowFilters(true)}>
                <span aria-hidden="true"><Icon name="gear" /></span> Filters{activeFilters ? ' (' + activeFilters + ')' : ''}
              </button>
              {orgFilter !== 'all' && <button type="button" className="fh-chip" onClick={() => setOrgFilter('all')} aria-label={'Remove filter: ' + orgName(orgFilter)}>{orgName(orgFilter)} <span aria-hidden="true">&#10005;</span></button>}
              {regionFilter !== 'all' && <button type="button" className="fh-chip" onClick={() => setRegionFilter('all')} aria-label={'Remove filter: ' + regionFilter}>{regionFilter} <span aria-hidden="true">&#10005;</span></button>}
              {radiusFilter !== 'all' && <button type="button" className="fh-chip" onClick={() => setRadiusFilter('all')} aria-label={'Remove filter: within ' + radiusFilter + ' miles'}>Within {radiusFilter} mi <span aria-hidden="true">&#10005;</span></button>}
              {accessFilter.map((f) => <button key={f} type="button" className="fh-chip" onClick={() => toggleAccess(f)} aria-label={'Remove filter: ' + accessLabel(f)}>{accessLabel(f)} <span aria-hidden="true">&#10005;</span></button>)}
            </div>
          )}

          {showFilters && (
            <div className="fh-shade" onClick={(e) => { if (e.target === e.currentTarget) setShowFilters(false) }}>
              <div className="fh-sheet" role="dialog" aria-modal="true" aria-labelledby="fh-filters-h">
                <h2 id="fh-filters-h">Filters</h2>
          {allOrgs.length > 0 && (
            <>
            <h3 className="fh-sheet-h">Who shares it</h3>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <button onClick={() => setOrgFilter('all')} aria-pressed={orgFilter === 'all'} style={{ padding: '0.5rem 0.85rem', minHeight: '44px', borderRadius: '16px', border: orgFilter === 'all' ? 'none' : '1px solid var(--border-strong)', background: orgFilter === 'all' ? 'var(--accent)' : 'none', color: orgFilter === 'all' ? 'var(--on-accent)' : 'var(--text-secondary)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>All groups</button>
              {allOrgs.map(o => (
                <button key={o.id} onClick={() => setOrgFilter(o.id)} aria-pressed={orgFilter === o.id} style={{ padding: '0.5rem 0.85rem', minHeight: '44px', borderRadius: '16px', border: orgFilter === o.id ? 'none' : '1px solid var(--border-strong)', background: orgFilter === o.id ? 'var(--accent)' : 'none', color: orgFilter === o.id ? 'var(--on-accent)' : 'var(--text-secondary)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{o.name}</button>
              ))}
            </div>
            </>
          )}

          {allRegions.length > 1 && (
            <>
            <h3 className="fh-sheet-h">Area</h3>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <button onClick={() => setRegionFilter('all')} aria-pressed={regionFilter === 'all'} style={{ padding: '0.5rem 0.85rem', minHeight: '44px', borderRadius: '16px', border: regionFilter === 'all' ? 'none' : '1px solid var(--border-strong)', background: regionFilter === 'all' ? 'var(--accent)' : 'none', color: regionFilter === 'all' ? 'var(--on-accent)' : 'var(--text-secondary)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>All areas</button>
              {allRegions.map(reg => (
                <button key={reg} onClick={() => setRegionFilter(reg)} aria-pressed={regionFilter === reg} style={{ padding: '0.5rem 0.85rem', minHeight: '44px', borderRadius: '16px', border: regionFilter === reg ? 'none' : '1px solid var(--border-strong)', background: regionFilter === reg ? 'var(--accent)' : 'none', color: regionFilter === reg ? 'var(--on-accent)' : 'var(--text-secondary)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{reg}</button>
              ))}
            </div>
            </>
          )}

          {myLocation && (
            <>
            <h3 className="fh-sheet-h">How far</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              
              {[['all', 'All'], [10, '10 mi'], [25, '25 mi'], [50, '50 mi']].map(([val, label]) => (
                <button key={String(val)} onClick={() => setRadiusFilter(val)} aria-pressed={radiusFilter === val} style={{ padding: '0.5rem 0.8rem', minHeight: '44px', borderRadius: '16px', border: radiusFilter === val ? 'none' : '1px solid var(--border-strong)', background: radiusFilter === val ? 'var(--accent)' : 'none', color: radiusFilter === val ? 'var(--on-accent)' : 'var(--text-secondary)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
              ))}
            </div>
          </>
          )}
          {hasCrn && (
            <>
            <h3 className="fh-sheet-h">How to get it</h3>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {['no_appt', 'no_referral', ...deliveryMethods.map((d) => 'how:' + d)].map((f) => (
                <button key={f} type="button" onClick={() => toggleAccess(f)} aria-pressed={accessFilter.includes(f)} style={{ padding: '0.5rem 0.85rem', minHeight: '44px', borderRadius: '16px', border: accessFilter.includes(f) ? 'none' : '1px solid var(--border-strong)', background: accessFilter.includes(f) ? 'var(--accent)' : 'none', color: accessFilter.includes(f) ? 'var(--on-accent)' : 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>{accessLabel(f)}</button>
              ))}
            </div>
            </>
          )}
                <button type="button" className="btn btn-primary btn-full" style={{ minHeight: 48, marginTop: '0.5rem' }} onClick={() => setShowFilters(false)}>
                  Show {filteredVerifiedResources.length} {filteredVerifiedResources.length === 1 ? 'place' : 'places'}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.1rem', color: 'var(--text)', margin: 0 }}>{!query.trim() && !selectedCat && !visitorNeedsArea ? 'Kinds of help' : ''}</h2>
            {canSubmit && <button onClick={() => { setShowSubmit(true); setSubmitted(false) }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>+ Add Resource</button>}
          </div>

          {!canSubmit && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: '0 0 0.75rem' }}>
              Listings come from local partner groups and the Community Resource Network.{user && <>{' '}
              <button onClick={() => navigate('/start-group')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.95rem', textDecoration: 'underline', padding: 0, minHeight: 44 }}>Want your group listed here?</button></>}
            </p>
          )}

          {!placesEnabled && user && profile && profile.latitude == null && (
            <p role="note" style={{ color: 'var(--text-soft)', fontSize: '0.8125rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.6rem', margin: '0 0 0.75rem' }}>
              Showing national resources. Add your zip code in your profile to see ones near you.
            </p>
          )}

          {showSubmit && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSubmit(false)}>
              <div ref={submitModalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="submit-resource-title" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', maxWidth: '400px', width: '90%', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 id="submit-resource-title" style={{ margin: 0, color: 'var(--accent)' }}>Submit a Resource</h3>
                  <button onClick={() => setShowSubmit(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.25rem', cursor: 'pointer' }}>&#10005;</button>
                </div>
                {submitted ? (
                  <p style={{ color: 'var(--accent)', fontWeight: 600, margin: 0 }}>Thank you! Your resource has been submitted for review.</p>
                ) : (
                  <>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', margin: '0 0 0.75rem' }}>Share a resource with your community. Hope Ambassadors will verify submissions.</p>
                    {submitOrgOptions.length > 0 && (
                      <>
                        <label htmlFor="sub-org" style={labelStyle}>Group</label>
                        <select id="sub-org" style={fieldStyle} value={subOrgId} onChange={e => setSubOrgId(e.target.value)}>
                          <option value="">{isAdmin ? 'No group (post as VWB)' : 'Choose your group'}</option>
                          {submitOrgOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </>
                    )}
                    <label id="sub-cat-label" style={labelStyle}>Category (required, choose one or more)</label>
                    <div role="group" aria-labelledby="sub-cat-label" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                      {CATEGORIES.map(c => (
                        <button key={c} type="button" onClick={() => setSubCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])} aria-pressed={subCats.includes(c)} style={{ padding: '0.5rem 0.75rem', minHeight: '44px', borderRadius: '16px', border: subCats.includes(c) ? 'none' : '1px solid var(--border-strong)', background: subCats.includes(c) ? 'var(--accent)' : 'none', color: subCats.includes(c) ? 'var(--on-accent)' : 'var(--text-secondary)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>{c}</button>
                      ))}
                    </div>
                    <label htmlFor="sub-name" style={labelStyle}>Resource name (required)</label>
                    <input id="sub-name" style={fieldStyle} placeholder="e.g. Ringgold Community Food Pantry" value={subName} onChange={e => setSubName(e.target.value)} maxLength={120} required />
                    <label htmlFor="sub-desc" style={labelStyle}>What do they offer?</label>
                    <textarea id="sub-desc" style={{ ...fieldStyle, minHeight: '60px', resize: 'vertical' }} placeholder="Who is it for? Anything people should know? Like: Free groceries every Tuesday, no ID needed" value={subDesc} onChange={e => setSubDesc(e.target.value)} maxLength={500} />
                    <label htmlFor="sub-phone" style={labelStyle}>Phone number (optional)</label>
                    <input id="sub-phone" style={fieldStyle} placeholder="e.g. (706) 555-0100" value={subPhone} onChange={e => setSubPhone(e.target.value)} />
                    <label htmlFor="sub-url" style={labelStyle}>Website (optional)</label>
                    <input id="sub-url" style={fieldStyle} placeholder="e.g. https://example.org" value={subUrl} onChange={e => setSubUrl(e.target.value)} />
                    <label htmlFor="sub-address" style={labelStyle}>Address (optional)</label>
                    <input id="sub-address" style={fieldStyle} placeholder="e.g. 123 Main St, Ringgold, GA" value={subAddress} onChange={e => setSubAddress(e.target.value)} />
                    <label htmlFor="sub-hood" style={labelStyle}>Neighborhood or area (optional)</label>
                    <input id="sub-hood" style={fieldStyle} placeholder="Town or county" value={subHood} onChange={e => setSubHood(e.target.value)} />
                    <label htmlFor="sub-requirements" style={labelStyle}>What to bring or know before you go (optional)</label>
                    <textarea id="sub-requirements" style={{ ...fieldStyle, minHeight: '50px', resize: 'vertical' }} placeholder="e.g. Photo ID and proof of address, first-come-first-served, no appointment needed" value={subRequirements} onChange={e => setSubRequirements(e.target.value)} maxLength={300} />
                    <button onClick={submitResource} disabled={!subName.trim() || !subCats.length || submitting} style={{ padding: '0.75rem 1.25rem', minHeight: '44px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer', opacity: (!subName.trim() || !subCats.length || submitting) ? 0.5 : 1 }}>
                      {submitting ? 'Submitting...' : 'Submit Resource'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {canVerify && <ResourceSuggestionsReview />}

          {canVerify && pendingResources.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ color: 'var(--warn)', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Pending review ({pendingResources.length})</p>
              {pendingResources.map(r => (
                <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '0.6rem', marginBottom: '0.35rem', borderLeft: '3px solid var(--warn)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{r.name}</span>
                    <button onClick={() => verifyResource(r.id)} style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer', fontSize: '0.8125rem' }}>Verify</button>
                  </div>
                  {r.description && <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', margin: '0.2rem 0' }}>{r.description}</p>}
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{resourceCats(r).join(' · ')}{r.organizations ? ' · ' + r.organizations.name : ''}</span>
                </div>
              ))}
            </div>
          )}

          {loadingResources && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>Loading...</p>}

          {!visitorNeedsArea && !loadingResources && !query.trim() && !selectedCat && (
            <div className="fh-grid">
              {orderedCats.map(cat => (
                <button key={cat} type="button" className="fh-tile" onClick={() => openCat(cat)}>
                  <img src={'/art/icons/' + (CAT_ICON_FILES[cat] || 'cat-other') + '.svg'} alt="" width="48" height="48" />
                  <span className="fh-tile-name">{cat}</span>
                  <span className="fh-tile-count">{grouped[cat].length} {grouped[cat].length === 1 ? 'place' : 'places'}</span>
                </button>
              ))}
            </div>
          )}

          {!loadingResources && (query.trim() ? orderedCats : selectedCat && grouped[selectedCat] ? [selectedCat] : []).map(cat => (
            <section key={cat} className="fh-cat" aria-labelledby={'fh-cat-' + cat}>
              <div className="fh-cat-head">
                {!query.trim() && <button type="button" className="fh-back" onClick={() => openCat(null)} aria-label="Back to all kinds of help">&#8249;</button>}
                <img src={'/art/icons/' + (CAT_ICON_FILES[cat] || 'cat-other') + '.svg'} alt="" width="40" height="40" />
                <h2 id={'fh-cat-' + cat}>{cat} <span>({grouped[cat].length})</span></h2>
              </div>
              <div className="fh-list">
                {grouped[cat].map(resourceCard)}
              </div>
            </section>
          ))}

          {/* A kind of help with nothing listed near you yet: say so instead of showing a blank page. */}
          {!visitorNeedsArea && !loadingResources && !query.trim() && selectedCat && !grouped[selectedCat] && filteredVerifiedResources.length > 0 && (
            <div style={{ textAlign: 'center', padding: '1.25rem 1rem' }}>
              <p style={{ color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>Nothing is listed for {selectedCat} near you yet.</p>
              <button type="button" className="btn btn-outline" onClick={() => openCat(null)} style={{ minHeight: '44px', marginRight: '0.5rem' }}>See all kinds of help</button>
              {user && <Link to="/ask" className="btn btn-primary" style={{ minHeight: '44px' }}>Ask a neighbor</Link>}
            </div>
          )}

          {!visitorNeedsArea && !loadingResources && filteredVerifiedResources.length === 0 && (
            <>
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem 1.5rem 0.75rem' }}>
                {query.trim() ? 'Nothing found for "' + query.trim() + '". Try a shorter word, or ask for help and a neighbor can point you the right way.' : activeFilters ? 'No resources match your filters. Try removing one.' : placesEnabled ? 'Nothing listed for your area yet.' : 'No resources yet. Be the first to add one.'}
              </p>
              {query.trim() && user && (
                <div style={{ textAlign: 'center', paddingBottom: '1rem' }}>
                  <Link to="/ask" className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '44px', padding: '0 1.25rem' }}>Ask neighbors instead</Link>
                </div>
              )}
            </>
          )}

      {user && (
            <div className="sr-suggest">
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-soft)' }}>Know a place that helps that isn't listed, or is a kind of help missing near you?</p>
              <SuggestResource category={selectedCat || ''} />
            </div>
          )}

      {reportFor && (
        <ResourceReport
          resource={reportFor}
          canChangeAreas={managesOrg(reportFor.organization_id)}
          onClose={() => setReportFor(null)}
          onSent={(paused) => { if (paused) loadResources() }}
        />
      )}
    </div>
  )
}
