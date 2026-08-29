import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { getCurrentPosition } from '../utils/location'
import VouchButton from '../components/VouchButton'
import { createNotification } from '../utils/notificationHelpers'

async function createMatch(userId, requestId, requesterId, navigate) {
  const { data: match, error: matchErr } = await supabase
    .from('skill_matches')
    .insert({ helper_id: userId, request_id: requestId })
    .select()
    .single()
  if (matchErr) {
    if (matchErr.code === '23505') { alert('You already offered to help with this request.') }
    else { console.error('Match error:', matchErr); alert('Something went wrong. Try again.') }
    return
  }
  await supabase.from('help_requests').update({ status: 'matched' }).eq('id', requestId)
  const { data: convo } = await supabase.from('conversations').insert({ request_id: requestId, helper_id: userId, requester_id: requesterId }).select().single(); if (convo) { await supabase.from('chat_messages').insert({ conversation_id: convo.id, sender_id: userId, body: 'I can help!' }); createNotification({ userId: requesterId, type: 'match_request', title: 'Someone offered to help!', body: 'A neighbor wants to help with your request.', link: '/tasks' }); navigate('/conversation/' + convo.id) } else { navigate('/tasks') }
}

const URGENCY_CONFIG = {
  now:       { label: 'Right now', className: 'urgency-now' },
  today:     { label: 'Today',     className: 'urgency-today' },
  this_week: { label: 'This week', className: 'urgency-week' },
  flexible:  { label: 'Flexible',  className: 'urgency-flexible' },
}

const OFFER_CATEGORIES = ['Food and Meals', 'Supplies', 'Clothes', 'Labor', 'Furniture', 'Transportation', 'Other']

export default function Feed() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [view, setView] = useState('requests')
  const [requests, setRequests] = useState([])
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [locationStatus, setLocationStatus] = useState('checking')
  const [filterSkill, setFilterSkill] = useState('all')
  const [filterOfferCat, setFilterOfferCat] = useState('all')
  const [skillCategories, setSkillCategories] = useState([])
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    async function loadSkills() {
      const { data } = await supabase.from('skill_categories').select('title').order('title')
      if (data) setSkillCategories(data.map(s => s.title))
    }
    loadSkills()
  }, [])

  const loadFeed = useCallback(async () => {
    setLoading(true)
    const loc = await getCurrentPosition()
    setLocationStatus(loc.source === 'browser' ? 'active' : 'default')

    if (view === 'requests') {
      const helperSkills = filterSkill === 'all' ? [] : [filterSkill]
      const radius = profile?.radius_miles || 10
      const { data, error } = await supabase.rpc('nearby_matching_requests', {
        helper_lat: loc.lat, helper_lng: loc.lng, helper_radius: radius, helper_skills: helperSkills,
      })
      if (error) {
        const { data: fallback } = await supabase.from('open_requests_by_urgency').select('*').limit(50)
        setRequests(fallback || [])
      } else {
        setRequests(data || [])
      }
    } else {
      let query = supabase.from('offers').select('*').eq('is_available', true).order('created_at', { ascending: false })
      if (filterOfferCat !== 'all') { query = query.eq('category', filterOfferCat) }
      const { data } = await query
      setOffers(data || [])
    }
    setLoading(false)
  }, [profile, filterSkill, filterOfferCat, view])

  useEffect(() => { loadFeed() }, [loadFeed])

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return mins + 'm ago'
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return hrs + 'h ago'
    return Math.floor(hrs / 24) + 'd ago'
  }

  return (
    <div className="feed-page">
      <div className="feed-header">
        <h1>SkillShare</h1>
        <p className="feed-subtitle">Help requests and free offers from your neighbors</p>
      </div>

      <div className="tasks-tabs" style={{ marginBottom: '0.75rem' }}>
        <button className={'tasks-tab' + (view === 'requests' ? ' tasks-tab-active' : '')} onClick={() => { setView('requests'); setExpandedId(null) }}>Requests</button>
        <button className={'tasks-tab' + (view === 'offers' ? ' tasks-tab-active' : '')} onClick={() => { setView('offers'); setExpandedId(null) }}>Offers</button>
      </div>

      <div className={`location-banner location-${locationStatus}`}>
        <span className="location-dot" />
        {locationStatus === 'active'
          ? `Showing within ${profile?.radius_miles || 10} miles`
          : 'Using approximate location. Enable location for better matches.'}
      </div>

      <div className="feed-filters">
        {view === 'requests' ? (
          <select className="feed-filter-select" value={filterSkill} onChange={e => setFilterSkill(e.target.value)} aria-label="Filter by skill">
            <option value="all">All skills</option>
            {skillCategories.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <select className="feed-filter-select" value={filterOfferCat} onChange={e => setFilterOfferCat(e.target.value)} aria-label="Filter by category">
            <option value="all">All offers</option>
            {OFFER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <button className="btn btn-sm btn-outline" onClick={loadFeed} aria-label="Refresh feed">&#x21bb; Refresh</button>
      </div>

      {loading ? (
        <div className="feed-loading"><div className="feed-loading-spinner" /><p>Loading...</p></div>
      ) : view === 'requests' ? (
        requests.length === 0 ? (
          <div className="feed-empty">
            <span className="feed-empty-icon">&#x1F33F;</span>
            <h2>No requests right now</h2>
            <p>{filterSkill !== 'all' ? `No open "${filterSkill}" requests nearby.` : 'No open requests in your area right now.'}</p>
            <button className="btn btn-primary" onClick={() => navigate(view === 'offers' ? '/post-offer' : '/ask')}>Post a request</button>
          </div>
        ) : (
          <div className="feed-list">
            {requests.map(req => {
              const urg = URGENCY_CONFIG[req.urgency] || URGENCY_CONFIG.flexible
              const isExpanded = expandedId === req.id
              return (
                <div key={req.id} className={'feed-card' + (isExpanded ? ' feed-card-expanded' : '')} onClick={() => setExpandedId(isExpanded ? null : req.id)}>
                  <div className="feed-card-top">
                    <span className={'urgency-badge ' + urg.className}>{urg.label}</span>
                    <span className="feed-card-time">{timeAgo(req.created_at)}</span>
                  </div>
                  <div className="feed-card-meta">
                    <span className="feed-card-skill">{req.skill_needed}</span>
                    {req.distance_miles != null && <span className="feed-card-distance">{req.distance_miles} mi</span>}
                  </div>
                  <div className="feed-card-who">
                    <span className="feed-card-name">{req.requester_name || 'A neighbor'}</span>
                    {req.neighborhood && <span className="feed-card-hood"> in {req.neighborhood}</span>}
                  </div>
                  {req.requester_id && <div className="feed-card-vouch-row"><VouchButton userId={req.requester_id} size="sm" showCount={true} /></div>}
                  <p className={'feed-card-desc' + (isExpanded ? '' : ' feed-card-desc-clamp')}>{req.description}</p>
                  {isExpanded && (
                    <div className="feed-card-actions">
                      <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); createMatch(user.id, req.id, req.requester_id, navigate) }}>I can help</button>
                      {req.requester_id && <VouchButton userId={req.requester_id} size="md" showCount={false} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      ) : (
        offers.length === 0 ? (
          <div className="feed-empty">
            <span className="feed-empty-icon">&#x1F381;</span>
            <h2>No offers right now</h2>
            <p>Be the first to share something with your neighbors.</p>
          </div>
        ) : (
          <div className="feed-list">
            {offers.map(offer => {
              const isExpanded = expandedId === offer.id
              return (
                <div key={offer.id} className={'feed-card' + (isExpanded ? ' feed-card-expanded' : '')} onClick={() => setExpandedId(isExpanded ? null : offer.id)}>
                  <div className="feed-card-top">
                    <span className="offer-badge">{offer.category}</span>
                    <span className="feed-card-time">{timeAgo(offer.created_at)}</span>
                  </div>
                  <div className="feed-card-meta">
                    <span className="feed-card-skill">{offer.title}</span>
                  </div>
                  {offer.neighborhood && (
                    <div className="feed-card-who">
                      <span className="feed-card-hood">in {offer.neighborhood}</span>
                    </div>
                  )}
                  <p className={'feed-card-desc' + (isExpanded ? '' : ' feed-card-desc-clamp')}>{offer.description}</p>
                  {isExpanded && offer.user_id && (
                    <div className="feed-card-actions">
                      {offer.user_id !== user.id && <button className="btn btn-primary btn-sm" onClick={async (e) => { e.stopPropagation(); const { data: existing } = await supabase.from('conversations').select('id').eq('helper_id', offer.user_id).eq('requester_id', user.id).maybeSingle(); if (existing) { navigate('/conversation/' + existing.id); return; } const { data: convo } = await supabase.from('conversations').insert({ helper_id: offer.user_id, requester_id: user.id }).select().single(); if (convo) { await supabase.from('chat_messages').insert({ conversation_id: convo.id, sender_id: user.id, body: 'Hi! Interested in your offer: ' + offer.title }); navigate('/conversation/' + convo.id); } }}>I'm interested</button>} <VouchButton userId={offer.user_id} size="md" showCount={true} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      <button className="fab" onClick={() => navigate(view === 'offers' ? '/post-offer' : '/ask')} aria-label="Ask for help">+</button>
    </div>
  )
}
