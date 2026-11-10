import { useState, useEffect, useCallback } from 'react'
import { useBlockedBy } from '../utils/blockedBy'
import { NEW_ACCOUNT_NOTE, isNewAccountBlock } from '../utils/newAccount'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { loadSkillCategories, groupSkills, offerSkillRows, OFFER_ITEM_CATEGORIES, OFFER_ITEMS_GROUP } from '../utils/skillGroups'
import { getMyLocation } from '../utils/location'
import { LocationPrompt, LocationBar } from '../components/LocationPrompt'
import VouchButton from '../components/VouchButton'
import { createNotification } from '../utils/notificationHelpers'
import { getBlockedUserIds } from '../utils/blockedUsers'
import { UserName } from '../components/AvatarDisplay'
import HelpSwitch from '../components/HelpSwitch'
import TownToday from '../components/TownToday'
import EmergencyDoor from '../components/EmergencyDoor'
import Icon from '../components/Icon'
import { forLine, helperNote } from '../utils/forSomeone'
import { askConfirm, tell } from '../components/AdminDialog'
import { useSimpleView } from '../utils/simpleView'
import { useT, getLang, t as tNow } from '../utils/lang'

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
        poster_name: profiles[r.user_id]?.display_name || tNow('A neighbor'),
        is_ambassador: profiles[r.user_id]?.is_hope_ambassador || false,
        member_since: profiles[r.user_id]?.created_at || null,
    }))
}

// Labels go through t() where they are shown.
const URGENCY_CONFIG = {
    now: { label: 'Right now', className: 'urgency-now' },
    today: { label: 'Today', className: 'urgency-today' },
    this_week: { label: 'This week', className: 'urgency-week' },
    flexible: { label: 'Flexible', className: 'urgency-flexible' },
}


export default function Feed() {
    const simple = useSimpleView()
    const t = useT()
    const { user, profile, refreshProfile } = useAuth()
    // Round B (Nov 10): at Larger and Largest the skill and sort menus fold behind one
    // "Filter and sort" button (index.css hides them until it is open).
    const [filtersOpen, setFiltersOpen] = useState(false)
    // Round B: "Look farther away" on an empty list. Saves the help radius on the account.
    const [fartherOpen, setFartherOpen] = useState(false)
    const [fartherNote, setFartherNote] = useState('')
    async function lookFarther(miles) {
        setFartherNote('')
        const { error } = await supabase.from('helper_profiles').update({ radius_miles: miles }).eq('user_id', user.id)
        if (error) { console.error('Failed to change help radius:', error); setFartherNote(t("We couldn't change that. Try again.")); return }
        setFartherOpen(false)
        await refreshProfile()
        loadFeed()
    }
    const navigate = useNavigate()
    const location = useLocation()
    const [successMsg, setSuccessMsg] = useState(location.state?.message || null)

    // /skillshare?tab=offers opens the Offers list (after sharing an offer).
    const [view, setView] = useState(() => (new URLSearchParams(location.search).get('tab') === 'offers' ? 'offers' : 'requests'))
    const [requests, setRequests] = useState([])
    const [offers, setOffers] = useState([])
    const [loading, setLoading] = useState(true)
    const [myLoc, setMyLoc] = useState(null)
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
        // Never a guess: no location means we ask for a zip (see LocationPrompt).
        const loc = getMyLocation(profile)
        setMyLoc(loc)
        // The database decides what is "nearby". Tell it where you are looking
        // from (it checks the point against your saved area and limits moves).
        if (loc) {
            const { data: vp, error: vpErr } = await supabase.rpc('set_view_point', { p_lat: loc.lat, p_lng: loc.lng })
            if (vpErr) console.error('set_view_point failed:', vpErr)
            else if (vp === 'limit') console.warn('Area changed too many times today; keeping the last one.')
        }
        const blockedIds = await getBlockedUserIds(user?.id)

        if (view === 'requests') {
            // Group-only requests whose time is up open to everyone (this also alerts ambassadors).
            supabase.rpc('release_due_solidarity_requests').then(() => {}, () => {})
            const helperSkills = filterSkill === 'all' ? [] : [filterSkill]
            const radius = profile?.radius_miles || 25
            const { data, error } = loc
                ? await supabase.rpc('nearby_matching_requests', {
                    helper_lat: loc.lat, helper_lng: loc.lng, helper_radius: radius, helper_skills: helperSkills,
                })
                : { data: null, error: null }
            if (error) console.error('nearby_matching_requests failed, falling back to unfiltered feed:', error)
            // Only ever nearby requests. (The old "show everything" fallback
            // pointed at a view that no longer exists, so it always came back empty.)
            let reqs = await enrichRequests(data || [])

            // Blocked either direction: don't surface their requests, and don't
            // let them show up as someone you could offer to help.
            reqs = reqs.filter(r => !blockedIds.has(r.requester_id))

            // Also need max_helpers from help_requests for helper count display
            const reqIds = reqs.map(r => r.id)
            if (reqIds.length > 0) {
                const { data: hrData, error: hrErr } = await supabase
                    .from('help_requests')
                    .select('id, max_helpers, status, audience, opens_to_all_at, for_name, organization_id')
                    .in('id', reqIds)
                if (hrErr) console.error('Failed to load helper limits:', hrErr)
                const maxMap = {}
                const statusMap = {}
                const audMap = {}
                const forMap = {}
                if (hrData) {
                    for (const hr of hrData) { maxMap[hr.id] = hr.max_helpers; statusMap[hr.id] = hr.status; audMap[hr.id] = { audience: hr.audience, opens_to_all_at: hr.opens_to_all_at }; forMap[hr.id] = hr.for_name || null }
                }
                // Nov 7: a need posted by a group shows the group's name, so neighbors
                // know it's the pantry or the church asking. A group set to invisible
                // can't be read here, so its name never shows.
                const groupOf = {}
                const groupIds = [...new Set((hrData || []).map(hr => hr.organization_id).filter(Boolean))]
                if (groupIds.length > 0) {
                    const { data: groups, error: gErr } = await supabase.from('organizations').select('id, name').in('id', groupIds).eq('approved', true)
                    if (gErr) console.error('Failed to load group names for needs:', gErr)
                    const nameOf = Object.fromEntries((groups || []).map(g => [g.id, g.name]))
                    for (const hr of hrData) if (hr.organization_id && nameOf[hr.organization_id]) groupOf[hr.id] = { id: hr.organization_id, name: nameOf[hr.organization_id] }
                }
                reqs = reqs.map(r => ({ ...r, max_helpers: maxMap[r.id] ?? 1, status: statusMap[r.id] ?? r.status, audience: audMap[r.id]?.audience, opens_to_all_at: audMap[r.id]?.opens_to_all_at, for_name: forMap[r.id] || null, group: groupOf[r.id] || null }))
            }

            // Once a request has its helpers it is no longer public. The requester
            // and the accepted helper find it under Tasks instead.
            reqs = reqs.filter(r => !NO_LONGER_OPEN.includes(r.status))
            const { counts, ended } = await loadMatchData(reqs.map(r => r.id))
            reqs = reqs.filter(r => !ended.has(r.id) && (r.max_helpers === null || (counts[r.id] || 0) < r.max_helpers))

            setRequests(reqs)
        } else {
            // Only offers near you, same as requests (vwb-nearby-offers.sql).
            // The database hands back just offer numbers and distances; the
            // offers themselves load the normal way, so blocks and bans apply.
            // No area set means no offers, never the whole app's list.
            let data = []
            if (loc) {
                const radius = profile?.radius_miles || 25
                const { data: near, error: nearErr } = await supabase.rpc('nearby_offers', { p_lat: loc.lat, p_lng: loc.lng, p_radius: radius })
                if (nearErr) console.error('nearby_offers failed:', nearErr)
                const distById = new Map((near || []).map(r => [r.offer_id, r.distance_miles]))
                if (distById.size > 0) {
                    let query = supabase.from('offers').select('*').eq('is_available', true).in('id', [...distById.keys()]).order('created_at', { ascending: false })
                    if (filterOfferCat !== 'all') { query = query.eq('category', filterOfferCat) }
                    const { data: rows, error: offersErr } = await query
                    if (offersErr) console.error('Failed to load offers:', offersErr)
                    data = (rows || []).map(o => ({ ...o, distance_miles: distById.get(o.id) ?? null }))
                }
            }
            const enrichedOffers = await enrichOffers(data.filter(o => !blockedIds.has(o.user_id)))
            setOffers(enrichedOffers)
        }
        setLoading(false)
    }, [profile, filterSkill, filterOfferCat, view, user])

    useEffect(() => { loadFeed() }, [loadFeed])

    async function handleOfferHelp(e, req) {
        e.stopPropagation()

        // Make sure it was on purpose. The requester is told the moment you offer.
        if (!(await askConfirm(t('Offer to help with {skill}?', { skill: t(req.skill_needed) }) + '\n\n' + t('The person is told right away. You can take your offer back until they say yes.')))) return

        // Check if request is already full
        const accepted = acceptedCounts[req.id] || 0
        if (req.max_helpers !== null && accepted >= req.max_helpers) {
            tell(t('This request has enough helpers. Thank you for wanting to help!'))
            return
        }

        // Create pending skill_match (accepted = null by default from migration)
        const { error: matchErr } = await supabase
            .from('skill_matches')
            .insert({ helper_id: user.id, request_id: req.id })

        if (matchErr) {
            if (matchErr.code === '23505') {
                tell(t('You already offered to help with this request.'))
            } else {
                console.error('Match error:', matchErr)
                tell(t('Something went wrong. Try again.'), { tone: 'error' })
            }
            return
        }

        // Notify the requester
        createNotification({
            userId: req.requester_id,
            type: 'help_offer',
            title: 'Someone wants to help!',
            body: `A neighbor offered to help with your request: ${req.skill_needed}`,
            link: '/tasks?tab=requests',
        })

        // Update local state so the card shows "Pending" immediately
        setMyPendingOffers(prev => new Set([...prev, req.id]))

        tell(t('Your offer has been sent! The requester will review it and get back to you. You can take it back with Withdraw, here or in Messages.'))
    }

    // Take back an offer that has not been answered yet.
    async function handleWithdrawOffer(e, req) {
        e.stopPropagation()
        if (!(await askConfirm(t('Take back your offer to help with {skill}?', { skill: t(req.skill_needed) })))) return

        const { data: mine, error: findErr } = await supabase
            .from('skill_matches')
            .select('id')
            .eq('request_id', req.id)
            .eq('helper_id', user.id)
            .is('accepted', null)
            .maybeSingle()
        if (findErr || !mine) {
            console.error('Failed to find your offer to withdraw:', findErr)
            tell(t('Could not find your offer. It may already have been answered. Refresh to see where it stands.'), { tone: 'error' })
            return
        }

        const { error } = await supabase.rpc('withdraw_offer', { p_match_id: mine.id })
        if (error) {
            console.error('Failed to withdraw offer:', error)
            tell(error.code === '55000' || error.code === 'P0002' ? error.message : t('Could not withdraw your offer. Try again.'), { tone: 'error' })
            return
        }

        setMyPendingOffers(prev => {
            const next = new Set(prev)
            next.delete(req.id)
            return next
        })
        tell(t('Your offer was withdrawn.'))
    }

    function getHelperStatus(req) {
        const accepted = acceptedCounts[req.id] || 0
        const max = req.max_helpers

        if (max === null) {
            // Unlimited
            return accepted > 0 ? t(accepted === 1 ? '1 helper accepted' : '{n} helpers accepted', { n: accepted }) : t('Looking for help')
        }
        return t(max === 1 ? '{n}/{max} helper accepted' : '{n}/{max} helpers accepted', { n: accepted, max })
    }

    function isRequestFull(req) {
        if (req.max_helpers === null) return false
        return (acceptedCounts[req.id] || 0) >= req.max_helpers
    }

    function timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime()
        const mins = Math.floor(diff / 60000)
        if (mins < 1) return t('Just now')
        if (mins < 60) return t('{n}m ago', { n: mins })
        const hrs = Math.floor(mins / 60)
        if (hrs < 24) return t('{n}h ago', { n: hrs })
        return t('{n}d ago', { n: Math.floor(hrs / 24) })
    }

    const URGENCY_ORD = { now: 0, today: 1, this_week: 2, flexible: 3 }
    const sortedRequests = [...requests].sort((a, b) => sortBy === 'newest' ? new Date(b.created_at) - new Date(a.created_at) : (URGENCY_ORD[a.urgency] || 3) - (URGENCY_ORD[b.urgency] || 3) || new Date(b.created_at) - new Date(a.created_at))

    return (
        <div className="feed-page fo-page">
            <div className="feed-header">
            <div className="feed-sticky">
                {/* Simple view (Oct 27): plain title, no switches or sort, just the list. */}
                {/* Oct 27 (Jade): the page is called what the bottom tab says. */}
                {/* Oct 28 (Jade): All help and the switch first, like Find resources; then the title
                    with Offer something beside it, so the top takes less room. */}
                {!simple && <HelpSwitch />}
                <div className="feed-title-row">
                    {/* Round D (Nov 10, Jade): the title said Offer Help right under the Offer Help tab.
                        It stays for screen readers; on screen the tab already says it. Simple view keeps it. */}
                    <h1 className={simple ? undefined : 'sr-only'}>{t('Offer Help')}</h1>
                    {!simple && <button type="button" className="btn btn-primary feed-title-btn" onClick={() => navigate('/post-offer')}><span aria-hidden="true">+</span> {t('Post an offer')}</button>}
                </div>
                <p className="feed-subtitle feed-subtitle-tight">{view === 'offers' ? t('Free things and help your neighbors are sharing.') : t('Neighbors near you who need a hand. Tap Offer Help on one, or tap the card to read more.')}</p>
            </div>

            {successMsg && (
                <div className="toast toast-success" style={{ marginBottom: '0.75rem' }}>
                    {successMsg}
                    <button onClick={() => setSuccessMsg(null)} aria-label={t('Close this note')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.3rem', minWidth: 44, minHeight: 44 }}>&times;</button>
                </div>
            )}

            <div className="tasks-tabs" style={{ marginBottom: '0.75rem' }}>
                <button className={'tasks-tab' + (view === 'requests' ? ' tasks-tab-active' : '')} onClick={() => { setView('requests'); setExpandedId(null) }}>{t('Requests')}</button>
                <button className={'tasks-tab' + (view === 'offers' ? ' tasks-tab-active' : '')} onClick={() => { setView('offers'); setExpandedId(null) }}>{t('Offers')}</button>
            </div>

            {myLoc
                ? <LocationBar loc={myLoc} prefix={t('Within {n} miles of', { n: profile?.radius_miles || 25 })} onChanged={loadFeed} />
                : <LocationPrompt onDone={loadFeed} intro={t('Enter your zip code to see requests near you. We never guess where you are.')} />}
            {/* Nov 7 (Jade): "I'm in town today". Accounts past their first 14 days. */}
            {view === 'requests' && myLoc && <TownToday onChanged={loadFeed} />}
            {/* Nov 10 (Jade): Emergency Response is one tap from here too. */}
            <EmergencyDoor />

            {!simple && (
                <button type="button" className="btn btn-outline btn-full feed-filter-toggle" aria-expanded={filtersOpen} aria-controls="feed-filters" onClick={() => setFiltersOpen((o) => !o)}>
                    {t('Filter and sort')} <span aria-hidden="true">{filtersOpen ? '\u25B4' : '\u25BE'}</span>
                </button>
            )}
            <div className={'feed-filters' + (filtersOpen ? ' feed-filters-open' : '')} id="feed-filters">
                {view === 'requests' ? (
                    <select className="feed-filter-select" value={filterSkill} onChange={e => setFilterSkill(e.target.value)} aria-label={t('Filter by skill')}>
                        <option value="all">{t('All skills')}</option>
                        {groupSkills(skillCategories).map(g => (
                            <optgroup key={g.group} label={t(g.group)}>
                                {g.skills.map(s => <option key={s} value={s}>{t(s)}</option>)}
                            </optgroup>
                        ))}
                    </select>
                ) : (
                    <select className="feed-filter-select" value={filterOfferCat} onChange={e => setFilterOfferCat(e.target.value)} aria-label={t('Filter by category')}>
                        <option value="all">{t('All offers')}</option>
                        <optgroup label={t(OFFER_ITEMS_GROUP)}>
                            {OFFER_ITEM_CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
                        </optgroup>
                        {groupSkills(offerSkillRows(skillCategories)).map(g => (
                            <optgroup key={g.group} label={t(g.group)}>
                                {g.skills.map(c => <option key={c} value={c}>{t(c)}</option>)}
                            </optgroup>
                        ))}
                        {/* Labor was an offer category before skills were used here; kept so older offers can still be found. */}
                        <optgroup label={t('Other')}>
                            <option value="Other">{t('Other')}</option>
                            <option value="Labor">{t('Labor (older posts)')}</option>
                        </optgroup>
                    </select>
                )}
                <button className="btn btn-sm btn-outline" onClick={loadFeed} aria-label={t('Refresh feed')}>&#x21bb; {t('Refresh')}</button>
                {!simple && <select className="feed-filter-select" aria-label={t('Sort')} value={sortBy} onChange={e => setSortBy(e.target.value)}><option value="urgency">{t('Sort: Urgency')}</option><option value="newest">{t('Sort: Newest')}</option></select>}
            </div>

            </div>
            <div className="feed-scroll">
            {loading ? (
                <div className="feed-loading"><div className="feed-loading-spinner" /><p>{t('Loading...')}</p></div>
            ) : view === 'requests' ? (
                !myLoc ? null : sortedRequests.length === 0 ? (
                    // Round B (Nov 10, Jade): one line, and two ways forward.
                    <div className="feed-empty feed-empty-short">
                        <p className="feed-empty-line">{filterSkill !== 'all' ? t('No open "{skill}" requests nearby.', { skill: t(filterSkill) }) : t('No requests near you right now.')}</p>
                        <div className="feed-empty-actions">
                            <button type="button" className="btn btn-outline" aria-expanded={fartherOpen} onClick={() => setFartherOpen((o) => !o)}>{t('Look farther away')}</button>
                            <button type="button" className="btn btn-primary" onClick={() => navigate('/post-offer')}>{t('Post an offer')}</button>
                        </div>
                        {fartherOpen && (
                            <div className="feed-farther" role="group" aria-label={t('How far to look')}>
                                <p className="feed-empty-line">{t('Now {n} miles. Look within:', { n: profile?.radius_miles || 25 })}</p>
                                <div className="feed-empty-actions">
                                    {[25, 35, 50].filter((m) => m > (profile?.radius_miles || 25)).map((m) => (
                                        <button key={m} type="button" className="btn btn-outline" onClick={() => lookFarther(m)}>{t('{n} miles', { n: m })}</button>
                                    ))}
                                    {(profile?.radius_miles || 25) >= 50 && <p className="feed-empty-line">{t('This is as far as it goes. Try Find resources, or post an offer.')}</p>}
                                </div>
                                {fartherNote && <p className="form-error" role="alert">{fartherNote}</p>}
                            </div>
                        )}
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
                                <div key={req.id} className={'feed-card' + (isExpanded ? ' feed-card-expanded' : '')} onClick={() => setExpandedId(isExpanded ? null : req.id)} role="button" tabIndex={0} aria-expanded={isExpanded} aria-label={t(isExpanded ? 'Collapse request: {skill}' : 'Expand request: {skill}', { skill: t(req.skill_needed) })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isExpanded ? null : req.id) } }}>
                                    <div className="feed-card-top">
                                        <span className={'urgency-badge ' + urg.className}>{t(urg.label)}</span>
                                        {req.requester_id === user.id && (
                                            <span className="urgency-badge" style={{ background: 'var(--btn-bg)', color: 'var(--btn-ink)' }}>{t('Your request')}</span>
                                        )}
                                        {req.audience && req.audience !== 'everyone' && (!req.opens_to_all_at || new Date(req.opens_to_all_at) > new Date()) && (
                                            <span className="urgency-badge" style={{ background: 'var(--info-bg)', color: 'var(--text-strong)' }}>{req.audience === 'network' ? t('From your network') : t('From your group')}</span>
                                        )}
                                        {isPending && (
                                            <span className="urgency-badge" style={{ background: 'var(--gold)', color: 'var(--on-accent)' }}>{t('Pending')}</span>
                                        )}
                                        <span className="feed-card-time">{timeAgo(req.created_at)}</span>
                                    </div>

                                    <div className="feed-card-meta">
                                        <span className="feed-card-skill">{t(req.skill_needed)}</span>
                                        {req.distance_miles != null && <span className="feed-card-distance">{req.distance_miles} mi</span>}
                                    </div>

                                    <div className="feed-card-who">
                                        <UserName userId={req.requester_id} name={req.requester_name || t('A neighbor')} className="feed-card-name" />
                                        {req.neighborhood && <span className="feed-card-hood"> {t('in {place}', { place: req.neighborhood })}</span>}
                                        {req.is_ambassador && (
                                            <span style={{ background: 'var(--success-bg)', color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', marginLeft: '0.35rem' }}>
                                                {t('Hope Ambassador')}
                                            </span>
                                        )}
                                        {req.member_since && (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginLeft: '0.35rem' }}>
                                                {t('Member since {date}', { date: new Date(req.member_since).toLocaleDateString(getLang() === 'es' ? 'es-US' : 'en-US', { month: 'short', year: 'numeric' }) })}
                                            </span>
                                        )}
                                    </div>

                                    {req.group && (
                                        <span className="for-line">
                                            <span aria-hidden="true"><Icon name="people" /></span>{' '}
                                            {t('A need from')} <Link to={'/orgs/' + req.group.id} onClick={(e) => e.stopPropagation()}>{req.group.name}</Link>
                                        </span>
                                    )}
                                    {req.for_name && (
                                        <span className="for-line">{forLine(req, req.requester_id === user.id ? 'you' : (req.requester_name || 'a neighbor'))}</span>
                                    )}
                                    {req.for_name && isExpanded && req.requester_id !== user.id && (
                                        <span className="for-note">{helperNote(req, req.requester_name)}</span>
                                    )}

                                    {req.requester_id && (
                                        <div className="feed-card-vouch-row">
                                            <VouchButton userId={req.requester_id} size="sm" showCount={true} />
                                        </div>
                                    )}

                                    {/* Helper count status */}
                                    <div style={{ fontSize: '0.8125rem', color: isFull ? 'var(--accent)' : 'var(--text-muted)', marginTop: '0.25rem' }}>
                                        <Icon name={isFull ? 'check' : 'handshake'} />{' '}{helperStatus}
                                    </div>

                                    <p className={'feed-card-desc' + (isExpanded ? '' : ' feed-card-desc-clamp')}>{req.description}</p>

                                    {/* Oct 27: the actions show on every card, not only after it is opened. */}
                                    {(
                                        <div className="feed-card-actions">
                                            {req.requester_id !== user.id && !isPending && !isFull && (
                                                <button className="btn btn-primary btn-sm" onClick={(e) => handleOfferHelp(e, req)}>
                                                    {t('Offer Help')}
                                                </button>
                                            )}
                                            {req.requester_id !== user.id && isPending && (
                                                <>
                                                    <span style={{ fontSize: '0.8125rem', color: 'var(--gold)', fontWeight: 600 }}>
                                                        <Icon name="hourglass" /> {t('Pending')}
                                                    </span>
                                                    <button className="btn btn-outline btn-sm" onClick={(e) => handleWithdrawOffer(e, req)}>
                                                        {t('Withdraw')}
                                                    </button>
                                                </>
                                            )}
                                            {req.requester_id !== user.id && isFull && !isPending && (
                                                <span style={{ fontSize: '0.8125rem', color: 'var(--accent)', fontWeight: 600 }}>
                                                    <Icon name="check" /> {t('Full')}
                                                </span>
                                            )}
                                            {isExpanded && req.requester_id && <VouchButton userId={req.requester_id} size="md" showCount={false} />}
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
                        <span className="feed-empty-icon" aria-hidden="true"><Icon name="gift" size={64} /></span>
                        <h2>{t('No offers right now')}</h2>
                        <p>{t('Be the first to share something with your neighbors.')}</p>
                    </div>
                ) : (
                    <div className="feed-list">
                        {offers.map(offer => {
                            const isExpanded = expandedId === offer.id
                            return (
                                <div key={offer.id} className={'feed-card' + (isExpanded ? ' feed-card-expanded' : '')} onClick={() => setExpandedId(isExpanded ? null : offer.id)} role="button" tabIndex={0} aria-expanded={isExpanded} aria-label={t(isExpanded ? 'Collapse offer: {kind}' : 'Expand offer: {kind}', { kind: t(offer.category) })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isExpanded ? null : offer.id) } }}>
                                    <div className="feed-card-top">
                                        <span className="offer-badge">{t(offer.category)}</span>
                                        <span className="feed-card-time">{timeAgo(offer.created_at)}</span>
                                    </div>
                                    <div className="feed-card-meta">
                                        <span className="feed-card-skill">{offer.title}</span>
                                        {offer.distance_miles != null && <span className="feed-card-distance">{offer.distance_miles} mi</span>}
                                    </div>
                                    {offer.poster_name && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                            <UserName userId={offer.user_id} name={offer.poster_name} className="feed-card-name" />
                                            {offer.is_ambassador && (
                                                <span style={{ background: 'var(--success-bg)', color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }}>
                                                    {t('Hope Ambassador')}
                                                </span>
                                            )}
                                            {offer.member_since && (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                                                    {t('Member since {date}', { date: new Date(offer.member_since).toLocaleDateString(getLang() === 'es' ? 'es-US' : 'en-US', { month: 'short', year: 'numeric' }) })}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    {offer.neighborhood && (
                                        <div className="feed-card-who">
                                            <span className="feed-card-hood">{t('in {place}', { place: offer.neighborhood })}</span>
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
                                                        tell(t('Something went wrong. Try again.'), { tone: 'error' })
                                                        return
                                                    }
                                                    if (existing) { navigate('/conversation/' + existing.id); return }
                                                    if (!(await askConfirm(t('Message {name} about "{title}"?', { name: offer.poster_name || t('this neighbor'), title: offer.title }) + '\n\n' + t('This opens a private chat with them.')))) return
                                                    const { data: convo, error: convoErr } = await supabase
                                                        .from('conversations')
                                                        .insert({ helper_id: offer.user_id, requester_id: user.id, offer_id: offer.id })
                                                        .select()
                                                        .single()
                                                    if (convoErr || !convo) {
                                                        if (isNewAccountBlock(convoErr)) { tell(NEW_ACCOUNT_NOTE); return }
                                                        console.error('Failed to start a conversation:', convoErr)
                                                        tell(t('Could not start a conversation. Try again.'), { tone: 'error' })
                                                        return
                                                    }
                                                    // No automatic opening message: it used to be stored as
                                                    // plain text. The chat's banner shows which offer this is
                                                    // about (conversations.offer_id), and the person writes
                                                    // their own first message, encrypted like any other.
                                                    navigate('/conversation/' + convo.id)
                                                }}>{t("I'm interested")}</button>
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

            {/* No floating button here: Ask for Help and Offer something sit at the top of this page. */}
            </div>
        </div>
    )
}