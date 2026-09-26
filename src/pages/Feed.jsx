import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { loadSkillCategories, groupSkills, offerSkillRows, OFFER_ITEM_CATEGORIES, OFFER_ITEMS_GROUP } from '../utils/skillGroups'
import { getCurrentPosition } from '../utils/location'
import VouchButton from '../components/VouchButton'
import { createNotification } from '../utils/notificationHelpers'
import { getBlockedUserIds } from '../utils/blockedUsers'
import AvatarDisplay from '../components/AvatarDisplay'

// Request statuses that mean "not looking for helpers anymore".
const NO_LONGER_OPEN = ['in_progress', 'matched', 'completed', 'cancelled', 'closed', 'archived']

async function enrichRequests(reqs) {
    const userIds = [...new Set(reqs.map(r => r.requester_id).filter(Boolean))]
    if (userIds.length === 0) return reqs
    const profiles = {}
    for (const uid of userIds) {
        const { data: p, error } = await supabase.from('helper_profiles_public').select('is_hope_ambassador, created_at, avatar_url').eq('user_id', uid).maybeSingle()
        if (error) { console.error('enrichRequests: failed to load profile for', uid, error); continue }
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
        const { data: p, error } = await supabase.from('helper_profiles_public').select('display_name, is_hope_ambassador, created_at, avatar_url').eq('user_id', uid).maybeSingle()
        if (error) { console.error('enrichOffers: failed to load profile for', uid, error); continue }
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

    const [sortBy, setSortBy] = useState('urgency')
    // Track accepted helper counts and user's pending offers
    const [acceptedCounts, setAcceptedCounts] = useState({})
    const [myPendingOffers, setMyPendingOffers] = useState(new Set())

    useEffect(() => {
        async function loadSkills() {
            setSkillCategories(await loadSkillCategories())
        }
        loadSkills()
    }, [])

    // Load match data for visible requests
    async function loadMatchData(requestIds) {
        if (!requestIds.length) return { counts: {}, ended: new Set() }

        // Get accepted counts per request
        const { data: accepted, error: acceptedErr } = await supabase
            .from('skill_matches')
            .select('request_id')
            .in('request_id', requestIds)
            .eq('accepted', true)
        if (acceptedErr) console.error('Failed to load accepted helper counts:', acceptedErr)

        const counts = {}
        if (accepted) {
            for (const m of accepted) {
                counts[m.request_id] = (counts[m.request_id] || 0) + 1
            }
        }
        setAcceptedCounts(counts)

        // Get this user's pending offers (accepted is null)
        const { data: pending, error: pendingErr } = await supabase
            .from('skill_matches')
            .select('request_id')
            .in('request_id', requestIds)
            .eq('helper_id', user.id)
            .is('accepted', null)
        if (pendingErr) console.error('Failed to load your pending offers:', pendingErr)

        setMyPendingOffers(new Set((pending || []).map(m => m.request_id)))

        // Offers of mine that ended (I stepped back, or the requester closed them
        // out). The request stays off my feed so I cannot offer on it twice.
        const { data: endedRows, error: endedErr } = await supabase
            .from('skill_matches')
            .select('request_id')
            .in('request_id', requestIds)
            .eq('helper_id', user.id)
            .eq('accepted', false)
        if (endedErr) console.error('Failed to load your ended offers:', endedErr)

        return { counts, ended: new Set((endedRows || []).map(m => m.request_id)) }
    }

    const loadFeed = useCallback(async () => {
        setLoading(true)
        const [loc, blockedIds] = await Promise.all([getCurrentPosition(), getBlockedUserIds(user?.id)])
        setLocationStatus(loc.source === 'browser' ? 'active' : 'default')

        if (view === 'requests') {
            const helperSkills = filterSkill === 'all' ? [] : [filterSkill]
            const radius = profile?.radius_miles || 10
            const { data, error } = await supabase.rpc('nearby_matching_requests', {
                helper_lat: loc.lat, helper_lng: loc.lng, helper_radius: radius, helper_skills: helperSkills,
            })
            if (error) console.error('nearby_matching_requests failed, falling back to unfiltered feed:', error)
            let reqs
            if (error || !data || data.length === 0) {
                const { data: fallback, error: fallbackErr } = await supabase.from('open_requests_by_urgency').select('*').limit(50)
                if (fallbackErr) console.error('Failed to load fallback request feed:', fallbackErr)
                reqs = await enrichRequests(fallback || [])
            } else {
                reqs = await enrichRequests(data || [])
            }

            // Blocked either direction: don't surface their requests, and don't
            // let them show up as someone you could offer to help.
            reqs = reqs.filter(r => !blockedIds.has(r.requester_id))

            // Also need max_helpers from help_requests for helper count display
            const reqIds = reqs.map(r => r.id)
            if (reqIds.length > 0) {
                const { data: hrData, error: hrErr } = await supabase
                    .from('help_requests')
                    .select('id, max_helpers, status')
                    .in('id', reqIds)
                if (hrErr) console.error('Failed to load helper limits:', hrErr)
                const maxMap = {}
                const statusMap = {}
                if (hrData) {
                    for (const hr of hrData) { maxMap[hr.id] = hr.max_helpers; statusMap[hr.id] = hr.status }
                }
                reqs = reqs.map(r => ({ ...r, max_helpers: maxMap[r.id] ?? 1, status: statusMap[r.id] ?? r.status }))
            }

            // Once a request has its helpers it is no longer public. The requester
            // and the accepted helper find it under Tasks instead.
            reqs = reqs.filter(r => !NO_LONGER_OPEN.includes(r.status))
            const { counts, ended } = await loadMatchData(reqs.map(r => r.id))
            reqs = reqs.filter(r => !ended.has(r.id) && (r.max_helpers === null || (counts[r.id] || 0) < r.max_helpers))

            setRequests(reqs)
        } else {
            let query = supabase.from('offers').select('*').eq('is_available', true).order('created_at', { ascending: false })
            if (filterOfferCat !== 'all') { query = query.eq('category', filterOfferCat) }
            const { data, error: offersErr } = await query
            if (offersErr) console.error('Failed to load offers:', offersErr)
            const enrichedOffers = await enrichOffers((data || []).filter(o => !blockedIds.has(o.user_id)))
            setOffers(enrichedOffers)
        }
        setLoading(false)
    }, [profile, filterSkill, filterOfferCat, view, user])

    useEffect(() => { loadFeed() }, [loadFeed])

    async function handleOfferHelp(e, req) {
        e.stopPropagation()

        // Make sure it was on purpose. The requester is told the moment you offer.
        if (!confirm('Offer to help with ' + req.skill_needed + '?\n\nThe person is told right away. You can take your offer back until they say yes.')) return

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

        alert('Your offer has been sent! The requester will review it and get back to you. You can take it back with Withdraw, here or in Messages.')
    }

    // Take back an offer that has not been answered yet.
    async function handleWithdrawOffer(e, req) {
        e.stopPropagation()
        if (!confirm('Take back your offer to help with ' + req.skill_needed + '?')) return

        const { data: mine, error: findErr } = await supabase
            .from('skill_matches')
            .select('id')
            .eq('request_id', req.id)
            .eq('helper_id', user.id)
            .is('accepted', null)
            .maybeSingle()
        if (findErr || !mine) {
            console.error('Failed to find your offer to withdraw:', findErr)
            alert('Could not find your offer. It may already have been answered. Refresh to see where it stands.')
            return
        }

        const { error } = await supabase.rpc('withdraw_offer', { p_match_id: mine.id })
        if (error) {
            console.error('Failed to withdraw offer:', error)
            alert(error.code === '55000' || error.code === 'P0002' ? error.message : 'Could not withdraw your offer. Try again.')
            return
        }

        setMyPendingOffers(prev => {
            const next = new Set(prev)
            next.delete(req.id)
            return next
        })
        alert('Your offer was withdrawn.')
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

    const URGENCY_ORD = { now: 0, today: 1, this_week: 2, flexible: 3 }
    const sortedRequests = [...requests].sort((a, b) => sortBy === 'newest' ? new Date(b.created_at) - new Date(a.created_at) : (URGENCY_ORD[a.urgency] || 3) - (URGENCY_ORD[b.urgency] || 3) || new Date(b.created_at) - new Date(a.created_at))
    const sortedOffers = [...offers].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    return (
        <div className="feed-page">
            <div className="feed-header">
            <div className="feed-sticky">
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
                        {groupSkills(skillCategories).map(g => (
                            <optgroup key={g.group} label={g.group}>
                                {g.skills.map(s => <option key={s} value={s}>{s}</option>)}
                            </optgroup>
                        ))}
                    </select>
                ) : (
                    <select className="feed-filter-select" value={filterOfferCat} onChange={e => setFilterOfferCat(e.target.value)} aria-label="Filter by category">
                        <option value="all">All offers</option>
                        <optgroup label={OFFER_ITEMS_GROUP}>
                            {OFFER_ITEM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </optgroup>
                        {groupSkills(offerSkillRows(skillCategories)).map(g => (
                            <optgroup key={g.group} label={g.group}>
                                {g.skills.map(c => <option key={c} value={c}>{c}</option>)}
                            </optgroup>
                        ))}
                        {/* Labor was an offer category before skills were used here; kept so older offers can still be found. */}
                        <optgroup label="Other">
                            <option value="Other">Other</option>
                            <option value="Labor">Labor (older posts)</option>
                        </optgroup>
                    </select>
                )}
                <button className="btn btn-sm btn-outline" onClick={loadFeed} aria-label="Refresh feed">&#x21bb; Refresh</button>
                <select className="feed-filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)}><option value="urgency">Sort: Urgency</option><option value="newest">Sort: Newest</option></select>
            </div>

            </div>
            <div className="feed-scroll">
            {loading ? (
                <div className="feed-loading"><div className="feed-loading-spinner" /><p>Loading...</p></div>
            ) : view === 'requests' ? (
                sortedRequests.length === 0 ? (
                    <div className="feed-empty">
                        <span className="feed-empty-icon">&#x1F33F;</span>
                        <h2>No requests right now</h2>
                        <p>{filterSkill !== 'all' ? `No open "${filterSkill}" requests nearby.` : 'No open requests in your area right now.'}</p>
                        <button className="btn btn-primary" onClick={() => navigate('/ask')}>Post a request</button>
                    </div>
                ) : (
                    <div className="feed-list">
                        {sortedRequests.map(req => {
                            const urg = URGENCY_CONFIG[req.urgency] || URGENCY_CONFIG.flexible
                            const isExpanded = expandedId === req.id
                            const isPending = myPendingOffers.has(req.id)
                            const isFull = isRequestFull(req)
                            const helperStatus = getHelperStatus(req)

                            return (
                                <div key={req.id} className={'feed-card' + (isExpanded ? ' feed-card-expanded' : '')} onClick={() => setExpandedId(isExpanded ? null : req.id)} role="button" tabIndex={0} aria-expanded={isExpanded} aria-label={(isExpanded ? 'Collapse' : 'Expand') + ' request: ' + req.skill_needed} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isExpanded ? null : req.id) } }}>
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
                                            <span style={{ color: '#8a8a8a', fontSize: '0.7rem', marginLeft: '0.35rem' }}>
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
                                        {isFull ? "✅ " : "🤝 "}{helperStatus}
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
                                                <>
                                                    <span style={{ fontSize: '0.8rem', color: '#b8860b', fontWeight: 600 }}>
                                                        {"⏳"} Pending
                                                    </span>
                                                    <button className="btn btn-outline btn-sm" onClick={(e) => handleWithdrawOffer(e, req)}>
                                                        Withdraw
                                                    </button>
                                                </>
                                            )}
                                            {req.requester_id !== user.id && isFull && !isPending && (
                                                <span style={{ fontSize: '0.8rem', color: '#2d6a4f', fontWeight: 600 }}>
                                                    {"✅"} Full
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
                                <div key={offer.id} className={'feed-card' + (isExpanded ? ' feed-card-expanded' : '')} onClick={() => setExpandedId(isExpanded ? null : offer.id)} role="button" tabIndex={0} aria-expanded={isExpanded} aria-label={(isExpanded ? 'Collapse' : 'Expand') + ' offer: ' + offer.category} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isExpanded ? null : offer.id) } }}>
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
                                                <span style={{ color: '#8a8a8a', fontSize: '0.7rem' }}>
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
                                                    const { data: existing, error: existingErr } = await supabase
                                                        .from('conversations')
                                                        .select('id')
                                                        .or('and(helper_id.eq.' + offer.user_id + ',requester_id.eq.' + user.id + '),and(helper_id.eq.' + user.id + ',requester_id.eq.' + offer.user_id + ')')
                                                        .maybeSingle()
                                                    if (existingErr) {
                                                        console.error('Failed to check for an existing conversation:', existingErr)
                                                        alert('Something went wrong. Try again.')
                                                        return
                                                    }
                                                    if (existing) { navigate('/conversation/' + existing.id); return }
                                                    if (!confirm('Message ' + (offer.poster_name || 'this neighbor') + ' about "' + offer.title + '"?\n\nThis starts a chat and sends them a message right away.')) return
                                                    const { data: convo, error: convoErr } = await supabase
                                                        .from('conversations')
                                                        .insert({ helper_id: offer.user_id, requester_id: user.id })
                                                        .select()
                                                        .single()
                                                    if (convoErr || !convo) {
                                                        console.error('Failed to start a conversation:', convoErr)
                                                        alert('Could not start a conversation. Try again.')
                                                        return
                                                    }
                                                    const { error: msgErr } = await supabase.from('chat_messages').insert({
                                                        conversation_id: convo.id,
                                                        sender_id: user.id,
                                                        body: 'Hi! Interested in your offer: ' + offer.title,
                                                    })
                                                    if (msgErr) console.error('Failed to send the opening message:', msgErr)
                                                    navigate('/conversation/' + convo.id)
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
        </div>
    )
}