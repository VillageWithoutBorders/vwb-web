import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { getCurrentPosition } from '../utils/location'
import VouchButton from '../components/VouchButton'
import { createNotification } from '../utils/notificationHelpers'

async function enrichRequests(reqs) {
    const userIds = [...new Set(reqs.map(r => r.requester_id).filter(Boolean))]
    if (userIds.length === 0) return reqs
    const profiles = {}
    for (const uid of userIds) {
        const { data: p } = await supabase.from('helper_profiles').select('is_hope_ambassador, created_at, avatar_url').eq('user_id', uid).maybeSingle()
        if (p) profiles[uid] = p
    }
    return reqs.map(r => ({
        ...r,
        is_ambassador: profiles[r.requester_id]?.is_hope_ambassador || false,
        member_since: profiles[r.requester_id]?.created_at || null,
        avatar_url: profiles[r.requester_id]?.avatar_url || null,
    }))
}

async function enrichOffers(items) {
    const userIds = [...new Set(items.map(r => r.user_id).filter(Boolean))]
    if (userIds.length === 0) return items
    const profiles = {}
    for (const uid of userIds) {
        const { data: p } = await supabase.from('helper_profiles').select('display_name, is_hope_ambassador, created_at, avatar_url').eq('user_id', uid).maybeSingle()
        if (p) profiles[uid] = p
    }
    return items.map(r => ({
        ...r,
        poster_name: profiles[r.user_id]?.display_name || 'A neighbor',
        is_ambassador: profiles[r.user_id]?.is_hope_ambassador || false,
        member_since: profiles[r.user_id]?.created_at || null,
    }))
}

const URGENCY_CONFIG = {
    now: { label: 'Right now', className: 'urgency-now' },
    today: { label: 'Today', className: 'urgency-today' },
    this_week: { label: 'This week', className: 'urgency-week' },
    flexible: { label: 'Flexible', className: 'urgency-flexible' },
}

const OFFER_CATEGORIES = ['Food and Meals', 'Supplies', 'Clothes', 'Labor', 'Furniture', 'Transportation', 'Other']

export default function Feed() {
    const { user, profile } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const [successMsg, setSuccessMsg] = useState(location.state?.message || null)

    const [view, setView] = useState('requests')
    const [requests, setRequests] = useState([])
    const [offers, setOffers] = useState([])
    const [loading, setLoading] = useState(true)
    const [locationStatus, setLocationStatus] = useState('checking')
    const [filterSkill, setFilterSkill] = useState('all')
    const [filterOfferCat, setFilterOfferCat] = useState('all')
    const [skillCategories, setSkillCategories] = useState([])
    const [expandedId, setExpandedId] = useState(null)

    // Track accepted helper counts and user's pending offers
    const [acceptedCounts, setAcceptedCounts] = useState({})
    const [myPendingOffers, setMyPendingOffers] = useState(new Set())

    useEffect(() => {
        async function loadSkills() {
            const { data } = await supabase.from('skill_categories').select('name').order('sort_order')
            if (data) setSkillCategories(data.map(s => s.name))
        }
        loadSkills()
    }, [])

    // Load match data for visible requests
    async function loadMatchData(requestIds) {
        if (!requestIds.length) return

        // Get accepted counts per request
        const { data: accepted } = await supabase
            .from('skill_matches')
            .select('request_id')
            .in('request_id', requestIds)
            .eq('accepted', true)

        const counts = {}
        if (accepted) {
            for (const m of accepted) {
                counts[m.request_id] = (counts[m.request_id] || 0) + 1
            }
        }
        setAcceptedCounts(counts)

        // Get this user's pending offers (accepted is null)
        const { data: pending } = await supabase
            .from('skill_matches')
            .select('request_id')
            .in('request_id', requestIds)
            .eq('helper_id', user.id)
            .is('accepted', null)

        setMyPendingOffers(new Set((pending || []).map(m => m.request_id)))
    }

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
            let reqs
            if (error || !data || data.length === 0) {
                const { data: fallback } = await supabase.from('open_requests_by_urgency').select('*').limit(50)
                reqs = await enrichRequests(fallback || [])
            } else {
                reqs = await enrichRequests(data || [])
            }

            // Also need max_helpers from help_requests for helper count display
            const reqIds = reqs.map(r => r.id)
            if (reqIds.length > 0) {
                const { data: hrData } = await supabase
                    .from('help_requests')
                    .select('id, max_helpers')
                    .in('id', reqIds)
                const maxMap = {}
                if (hrData) {
                    for (const hr of hrData) maxMap[hr.id] = hr.max_helpers
                }
                reqs = reqs.map(r => ({ ...r, max_helpers: maxMap[r.id] ?? 1 }))
            }

            setRequests(reqs)
            await loadMatchData(reqIds)
        } else {
            let query = supabase.from('offers').select('*').eq('is_available', true).order('created_at', { ascending: false })
            if (filterOfferCat !== 'all') { query = query.eq('category', filterOfferCat) }
            const { data } = await query
            setOffers(await enrichOffers(data || []))
        }
        setLoading(false)
    }, [profile, filterSkill, filterOfferCat, view])

    useEffect(() => { loadFeed() }, [loadFeed])

    async function handleOfferHelp(e, req) {
        e.stopPropagation()

        // Check if request is already full
        const accepted = acceptedCounts[req.id] || 0
        if (req.max_helpers !== null && accepted >= req.max_helpers) {
            alert('This request has enough helpers. Thank you for wanting to help!')
            return
        }

        // Create pending skill_match (accepted = null by default from migration)
        const { error: matchErr } = await supabase
            .from('skill_matches')
            .insert({ helper_id: user.id, request_id: req.id })

        if (matchErr) {
            if (matchErr.code === '23505') {
                alert('You already offered to help with this request.')
            } else {
                console.error('Match error:', matchErr)
                alert('Something went wrong. Try again.')
            }
            return
        }

        // Notify the requester
        createNotification({
            userId: req.requester_id,
            type: 'help_offer',
            title: 'Someone wants to help!',
            body: `A neighbor offered to help with your request: ${req.skill_needed}`,
            link: '/messages',
        })

        // Update local state so the card shows "Pending" immediately
        setMyPendingOffers(prev => new Set([...prev, req.id]))

        alert('Your offer has been sent! The requester will review it and get back to you.')
    }

    function getHelperStatus(req) {
        const accepted = acceptedCounts[req.id] || 0
        const max = req.max_helpers

        if (max === null) {
            // Unlimited
            return accepted > 0 ? `${accepted} helper${accepted !== 1 ? 's' : ''} accepted` : 'Looking for help'
        }
        return `${accepted}/${max} helper${max !== 1 ? 's' : ''} accepted`
    }

    function isRequestFull(req) {
        if (req.max_helpers === null) return false
        return (acceptedCounts[req.id] || 0) >= req.max_helpers
    }

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

            {successMsg && (
                <div className="toast toast-success" style={{ marginBottom: '0.75rem' }}>
                    {successMsg}
                    <button onClick={() => setSuccessMsg(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem' }}>&times;</button>
                </div>
            )}

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
                        <button className="btn btn-primary" onClick={() => navigate('/ask')}>Post a request</button>
                    </div>
                ) : (
                    <div className="feed-list">
                        {requests.map(req => {
                            const urg = URGENCY_CONFIG[req.urgency] || URGENCY_CONFIG.flexible
                            const isExpanded = expandedId === req.id
                            const isPending = myPendingOffers.has(req.id)
                            const isFull = isRequestFull(req)
                            const helperStatus = getHelperStatus(req)

                            return (
                                <div key={req.id} className={'feed-card' + (isExpanded ? ' feed-card-expanded' : '')} onClick={() => setExpandedId(isExpanded ? null : req.id)}>
                                    <div className="feed-card-top">
                                        <span className={'urgency-badge ' + urg.className}>{urg.label}</span>
                                        {req.requester_id === user.id && (
                                            <span className="urgency-badge" style={{ background: '#2d6a4f', color: '#fff' }}>Your request</span>
                                        )}
                                        {isPending && (
                                            <span className="urgency-badge" style={{ background: '#b8860b', color: '#fff' }}>Pending</span>
                                        )}
                                        <span className="feed-card-time">{timeAgo(req.created_at)}</span>
                                    </div>

                                    <div className="feed-card-meta">
                                        <span className="feed-card-skill">{req.skill_needed}</span>
                                        {req.distance_miles != null && <span className="feed-card-distance">{req.distance_miles} mi</span>}
                                    </div>

                                    <div className="feed-card-who">
                                        <span className="feed-card-name" onClick={(e) => { e.stopPropagation(); if (req.requester_id) navigate('/u/' + req.requester_id) }} style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#444', textUnderlineOffset: '2px' }}>{req.requester_name || 'A neighbor'}</span>
                                        {req.neighborhood && <span className="feed-card-hood"> in {req.neighborhood}</span>}
                                        {req.is_ambassador && (
                                            <span style={{ background: '#1a4a3a', color: '#4ecca3', fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', marginLeft: '0.35rem' }}>
                                                Hope Ambassador
                                            </span>
                                        )}
                                        {req.member_since && (
                                            <span style={{ color: '#666', fontSize: '0.7rem', marginLeft: '0.35rem' }}>
                                                Member since {new Date(req.member_since).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                            </span>
                                        )}
                                    </div>

                                    {req.requester_id && (
                                        <div className="feed-card-vouch-row">
                                            <VouchButton userId={req.requester_id} size="sm" showCount={true} />
                                        </div>
                                    )}

                                    {/* Helper count status */}
                                    <div style={{ fontSize: '0.75rem', color: isFull ? '#2d6a4f' : '#888', marginTop: '0.25rem' }}>
                                        {isFull ? 'âœ… ' : 'ðŸ¤ '}{helperStatus}
                                    </div>

                                    <p className={'feed-card-desc' + (isExpanded ? '' : ' feed-card-desc-clamp')}>{req.description}</p>

                                    {isExpanded && (
                                        <div className="feed-card-actions">
                                            {req.requester_id !== user.id && !isPending && !isFull && (
                                                <button className="btn btn-primary btn-sm" onClick={(e) => handleOfferHelp(e, req)}>
                                                    I can help
                                                </button>
                                            )}
                                            {req.requester_id !== user.id && isPending && (
                                                <span style={{ fontSize: '0.8rem', color: '#b8860b', fontWeight: 600 }}>
                                                    â³ Waiting for response
                                                </span>
                                            )}
                                            {req.requester_id !== user.id && isFull && !isPending && (
                                                <span style={{ fontSize: '0.8rem', color: '#2d6a4f', fontWeight: 600 }}>
                                                    âœ… Enough helpers found
                                                </span>
                                            )}
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
                                    {offer.poster_name && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                            <span className="feed-card-name" onClick={(e) => { e.stopPropagation(); if (offer.user_id) navigate('/u/' + offer.user_id) }} style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#444', textUnderlineOffset: '2px' }}>{offer.poster_name}</span>
                                            {offer.is_ambassador && (
                                                <span style={{ background: '#1a4a3a', color: '#4ecca3', fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }}>
                                                    Hope Ambassador
                                                </span>
                                            )}
                                            {offer.member_since && (
                                                <span style={{ color: '#666', fontSize: '0.7rem' }}>
                                                    Member since {new Date(offer.member_since).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    {offer.neighborhood && (
                                        <div className="feed-card-who">
                                            <span className="feed-card-hood">in {offer.neighborhood}</span>
                                        </div>
                                    )}
                                    <p className={'feed-card-desc' + (isExpanded ? '' : ' feed-card-desc-clamp')}>{offer.description}</p>
                                    {isExpanded && offer.user_id && (
                                        <div className="feed-card-actions">
                                            {offer.user_id !== user.id && (
                                                <button className="btn btn-primary btn-sm" onClick={async (e) => {
                                                    e.stopPropagation()
                                                    const { data: existing } = await supabase
                                                        .from('conversations')
                                                        .select('id')
                                                        .eq('helper_id', offer.user_id)
                                                        .eq('requester_id', user.id)
                                                        .maybeSingle()
                                                    if (existing) { navigate('/conversation/' + existing.id); return }
                                                    const { data: convo } = await supabase
                                                        .from('conversations')
                                                        .insert({ helper_id: offer.user_id, requester_id: user.id })
                                                        .select()
                                                        .single()
                                                    if (convo) {
                                                        await supabase.from('chat_messages').insert({
                                                            conversation_id: convo.id,
                                                            sender_id: user.id,
                                                            body: 'Hi! Interested in your offer: ' + offer.title,
                                                        })
                                                        navigate('/conversation/' + convo.id)
                                                    }
                                                }}>I'm interested</button>
                                            )}
                                            <VouchButton userId={offer.user_id} size="md" showCount={true} />
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