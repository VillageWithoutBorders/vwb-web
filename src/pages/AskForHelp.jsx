import { useState, useEffect } from 'react'
import AddressHint from '../components/AddressHint'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import GroupedSkillChips from '../components/GroupedSkillChips'
import { loadSkillCategories } from '../utils/skillGroups'
import { skillsForCategory } from '../utils/resourceCategories'
import { getMyLocation, lookupZip } from '../utils/location'
import { LocationPrompt, LocationBar } from '../components/LocationPrompt'
import NearbyResourcesFirst from '../components/NearbyResourcesFirst'
import { useGoBack } from '../components/BackLink'
import { isSimpleView } from '../utils/simpleView'
import { savePendingAsk, isNoSignal } from '../utils/pendingAsks'
import { useT } from '../utils/lang'

// Each choice also sets when the request closes on its own (set by the database):
// now = 6 hours, today = midnight Eastern (at least 3 hours), this_week = 7 days.
// Changing it when editing starts a new closing time.
// 'flexible' still exists in the database for old requests, but is not offered.
const URGENCY_OPTIONS = [
    { value: 'now', label: 'Right now', desc: 'Stays open 6 hours' },
    { value: 'today', label: 'Today', desc: 'Stays open until midnight. Late at night, it stays open 3 hours.' },
    { value: 'this_week', label: 'This week', desc: 'Stays open 7 days' },
]

const HELPER_COUNT_OPTIONS = [
    { value: 1, label: '1 person' },
    { value: 2, label: '2 people' },
    { value: 3, label: '3 people' },
    { value: null, label: 'As many as possible' },
]

export default function AskForHelp() {
    const t = useT()
    const { user, profile, organizations } = useAuth()
    const [searchParams] = useSearchParams()
    // "Ask again" from an old task: the details come along, but it posts as a brand new request.
    const repost = useLocation().state?.repost || null
    const managedOrgs = organizations.filter((o) => o.role === 'admin' || o.role === 'organizer')
    const [postAs, setPostAs] = useState(() => {
        const want = searchParams.get('org')
        return managedOrgs.some((o) => o.id === want) ? want : ''
    })
    // Nov 7 (Jade): a group's need can show its details on the group page,
    // only if the group ticks this. Off unless ticked.
    const [publicDetails, setPublicDetails] = useState(false)
    const navigate = useNavigate()
    const goBack = useGoBack()
    // /ask?edit=ID opens this same form filled in, to change a request already posted.
    const editId = searchParams.get('edit')
    // First screen: look at nearby resources before asking a neighbor. Skipped
    // when editing, when posting as a group, or with ?skip=1.
    const [checkedResources, setCheckedResources] = useState(() => Boolean(editId) || Boolean(searchParams.get('org')) || searchParams.get('skip') === '1' || Boolean(repost))

    const [skills, setSkills] = useState([])
    const [skillNeeded, setSkillNeeded] = useState(repost?.skill_needed || '')
    // The kind of help picked on the first screen (Food, Rides, ...). Used once
    // to pick the matching neighbor skill, so the ask reaches the right helpers.
    const [fromCat, setFromCat] = useState('')
    const [autoPicked, setAutoPicked] = useState('')
    // Who sees it first. 'everyone' is the normal request. 'group' and 'network' keep it
    // inside the person's group (or its network) until the time is up.
    const [audience, setAudience] = useState('everyone')
    const [audienceOrg, setAudienceOrg] = useState('')
    const [openHours, setOpenHours] = useState('24')
    const [description, setDescription] = useState(repost?.description || '')
    // An old 'flexible' request asked again becomes 'this_week', since Flexible is no longer a choice.
    const [urgency, setUrgency] = useState(repost?.urgency === 'flexible' ? 'this_week' : (repost?.urgency || 'today'))
    const [maxHelpers, setMaxHelpers] = useState(repost && repost.max_helpers !== undefined ? repost.max_helpers : 1)
    const [neighborhood, setNeighborhood] = useState(repost?.neighborhood || '')

    // Who is this for? 'me' or 'other'. Asked first on a new request.
    // For someone else: their first name only, their area, and their okay.
    const [forWho, setForWho] = useState(() => (repost?.for_name ? 'other' : ''))
    const [forName, setForName] = useState(repost?.for_name || '')
    const [forConsent, setForConsent] = useState(false)
    const [forWhere, setForWhere] = useState('near') // 'near' = near me, 'zip' = somewhere else
    const [forZip, setForZip] = useState('')
    const [forPlace, setForPlace] = useState(null)
    const [zipBusy, setZipBusy] = useState(false)
    const [editForName, setEditForName] = useState('')
    // Can I post for someone else? Filled from my_ask_for_others_status().
    const [forStatus, setForStatus] = useState(null)
    const forOther = !editId && forWho === 'other'
    const theirName = forName.trim() || t('them')

    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    // Bumped when the person sets or changes their area, to re-read it.
    const [, setLocTick] = useState(0)
    const myLoc = getMyLocation(profile)
    // No signal (Nov 3): the form still works. The request is saved on this phone
    // and sends by itself when the signal comes back.
    const [online, setOnline] = useState(() => navigator.onLine !== false)
    useEffect(() => {
        const up = () => setOnline(true)
        const down = () => setOnline(false)
        window.addEventListener('online', up)
        window.addEventListener('offline', down)
        return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
    }, [])

    useEffect(() => {
        async function loadSkills() {
            setSkills(await loadSkillCategories())
        }
        loadSkills()
    }, [])

    useEffect(() => {
        if (!fromCat || skillNeeded || !skills.length) return
        const match = skillsForCategory(fromCat, skills.map((s) => s.title))[0]
        if (match) { setSkillNeeded(match); setAutoPicked(match) }
        setFromCat('')
    }, [fromCat, skills, skillNeeded])

    useEffect(() => {
        if (editId) return
        let alive = true
        supabase.rpc('my_ask_for_others_status').then(({ data, error: stErr }) => {
            if (!alive) return
            if (stErr) { console.error('my_ask_for_others_status failed:', stErr); return }
            setForStatus(Array.isArray(data) ? data[0] || null : data)
        })
        return () => { alive = false }
    }, [editId])

    // Why "Someone else" can't be used right now, or '' if it can.
    const forBlocked = !forStatus ? ''
        : !forStatus.allowed ? 'You can ask for someone else after your first 14 days, once someone vouches for you, or right away if you run a group.'
        : (!forStatus.unlimited && forStatus.open_count >= 3) ? 'You already have 3 open requests for other people. When one is done, you can post another.'
        : ''

    async function findTheirZip() {
        setError('')
        const clean = forZip.replace(/[^0-9]/g, '')
        if (clean.length !== 5) { setError('Zip codes have 5 numbers.'); return }
        if (navigator.onLine === false) { setError("No signal right now, so we can't look up zip codes. Choose \"Near me\", or try again when you have signal."); return }
        setZipBusy(true)
        const found = await lookupZip(clean)
        setZipBusy(false)
        if (!found) { setError("We couldn't find that zip code. Try again."); return }
        setForPlace(found)
        setNeighborhood(found.city || found.label)
    }

    useEffect(() => {
        if (!editId && !repost && profile?.neighborhood) {
            setNeighborhood(profile.neighborhood)
        }
    }, [profile, editId]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!editId) return
        let alive = true
        supabase.rpc('get_help_request_to_edit', { p_id: editId }).then(({ data, error: loadErr }) => {
            if (!alive) return
            const row = Array.isArray(data) ? data[0] : data
            if (loadErr || !row) {
                if (loadErr) console.error('Failed to load request to edit:', loadErr)
                setError("We couldn't find that request, or you can't edit it.")
                return
            }
            setSkillNeeded(row.skill_needed || '')
            setDescription(row.description || '')
            setUrgency(row.urgency || 'today')
            setMaxHelpers(row.max_helpers === undefined ? 1 : row.max_helpers)
            setNeighborhood(row.neighborhood || '')
            setEditForName(row.for_name || '')
        })
        return () => { alive = false }
    }, [editId])

    // The group the request is for: the one picked, else the one posting as, else the first.
    const groupId = audienceOrg || postAs || organizations[0]?.id || ''
    // With more than one group and none picked yet, don't name one at random.
    const groupPicked = Boolean(audienceOrg || postAs) || organizations.length === 1
    const groupName = groupPicked ? ((organizations.find((o) => o.id === groupId) || {}).name || t('your group')) : t('your group')

    async function handleSubmit(e) {
        e.preventDefault()
        setError('')

        if (forOther) {
            if (forBlocked) { setError(forBlocked); return }
            if (!forName.trim()) { setError('Please add their first name.'); return }
            if (!/^[\p{L}][\p{L} .'-]*$/u.test(forName.trim())) { setError('Please use just their first name, with letters only.'); return }
            if (forWhere === 'zip' && !forPlace) { setError('Please find their zip code, or choose "Near me".'); return }
            if (!forConsent) { setError("Please check that they said it's okay to post this for them."); return }
        }

        if (!skillNeeded) {
            setError('Please choose what kind of help you need.')
            return
        }
        if (!description.trim()) {
            setError('Please describe what you need.')
            return
        }

        if (editId) {
            setSubmitting(true)
            const { error: editError } = await supabase.rpc('edit_help_request', {
                p_id: editId,
                p_skill: skillNeeded,
                p_description: description.trim(),
                p_urgency: urgency,
                p_max_helpers: maxHelpers,
                p_neighborhood: neighborhood.trim() || null,
            })
            setSubmitting(false)
            if (editError) {
                console.error(editError)
                if (isNoSignal(editError)) { setError('No signal right now. Your changes are still here. Try Save again when you have signal.'); return }
                setError(editError.message && editError.message.length < 140 ? editError.message : 'Something went wrong. Please try again.')
                return
            }
            navigate('/tasks?tab=requests', { state: { message: 'Your request is updated.' } })
            return
        }

        // Neighbors are matched by area, so we need one. Never a guess.
        // For someone else, the area is where they are.
        const where = forOther && forWhere === 'zip' && forPlace
            ? { lat: forPlace.latitude, lng: forPlace.longitude }
            : myLoc
        if (!where) {
            setError(forOther ? 'Add your zip code at the top, or choose "Somewhere else" and add their zip code.' : 'Add your zip code at the top so neighbors near you can see this.')
            window.scrollTo({ top: 0, behavior: 'smooth' })
            return
        }

        setSubmitting(true)
        const lat = where.lat
        const lng = where.lng

        const row = {
            requester_id: user.id,
            skill_needed: skillNeeded,
            description: description.trim(),
            urgency,
            max_helpers: maxHelpers,
            neighborhood: neighborhood.trim(),
            latitude: lat || null,
            longitude: lng || null,
            organization_id: postAs || null,
            audience,
            audience_org_id: audience === 'everyone' ? null : groupId,
            for_name: forOther ? forName.trim() : null,
            for_consent: forOther ? forConsent : false,
        }
        if (postAs) row.public_details = !forOther && audience === 'everyone' && publicDetails
        // No signal: keep it on this phone and send it later.
        function saveForLater() {
            if (!savePendingAsk(user.id, { ...row, open_hours: openHours })) {
                setError("No signal right now, and this phone can't save the request for later. Please try again when you have signal.")
                setSubmitting(false)
                return
            }
            // The note at the top of the page says it is waiting, then that it was sent.
            // Simple view goes Home. The full view stays here (Tasks may not be on the
            // phone yet with no signal), with the form cleared so it isn't posted twice.
            if (isSimpleView()) { navigate('/'); return }
            setSubmitting(false)
            setDescription('')
            setSkillNeeded('')
            setForWho('')
            setForName('')
            setForConsent(false)
            window.scrollTo(0, 0)
        }
        if (navigator.onLine === false) { saveForLater(); return }

        const { error: insertError } = await supabase
            .from('help_requests')
            .insert({
                ...row,
                opens_to_all_at: audience === 'everyone' ? null : new Date(Date.now() + Number(openHours) * 3600 * 1000).toISOString(),
            })

        if (insertError && isNoSignal(insertError) && insertError.code !== 'PGRST301') { console.error(insertError); saveForLater(); return }
        if (insertError) {
            const plain = insertError.message && insertError.message.length < 140 && (/group/i.test(insertError.message) || ['P0001', '42501'].includes(insertError.code))
            setError(plain ? insertError.message : 'Something went wrong. Please try again.')
            console.error(insertError)
            setSubmitting(false)
            return
        }

        // Simple view goes back to Home, where the new request shows under Waiting on you (Oct 27).
        navigate(isSimpleView() ? '/' : '/tasks?tab=requests', { state: { message: forOther ? 'Your request for ' + forName.trim() + ' has been posted. Helpers will message you.' : audience === 'everyone' ? 'Your request has been posted.' : 'Your request is posted. Your group can see it now. Everyone nearby sees it after your chosen time, or when you open it from Tasks.' } })
    }

    if (!checkedResources) {
        return <NearbyResourcesFirst profile={profile} onContinue={(cat) => { setFromCat(cat || ''); setCheckedResources(true); window.scrollTo(0, 0) }} />
    }

    return (
        <div className="ask-page">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button onClick={() => goBack('/')} aria-label={t('Go back')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem', flexShrink: 0, minWidth: 44, minHeight: 44 }}>&#8592;</button>
                <h1 style={{ margin: 0 }}>{t(editId ? 'Edit your request' : 'Ask for Help')}</h1>
            </div>
            <p className="ask-intro">
                {forOther
                    ? t('Tell us what {name} needs. Helpers will talk with you, and you pass things along. Never share their address here.', { name: theirName })
                    : t('Tell us what you need. Neighbors and Hope Ambassadors near you will see it, with your name and town. Never your address.')}
            </p>

            {!online && (
                <p className="ask-offline" role="status">
                    <b>{t('No signal right now.')}</b> {t('You can still fill this out. We will save it on this phone and send it when you have signal.')}
                </p>
            )}

            {editId && editForName && (
                <p className="ask-intro"><span className="for-chip">{t('For {name}', { name: editForName })}</span> {t('Helpers talk with you about this request.')}</p>
            )}

            {!editId && (
                <fieldset className="form-field ask-who" style={{ border: 'none', padding: 0, margin: '0 0 1rem' }}>
                    <legend className="ask-who-q">{t('Who is this for?')}</legend>
                    <div className="urgency-options ask-who-row">
                        <label className={'urgency-option' + (forWho === 'me' ? ' active' : '')}>
                            <input type="radio" name="forWho" className="sr-only" checked={forWho === 'me'} onChange={() => { setForWho('me'); setError('') }} />
                            <span className="urgency-label">{t('Me')}</span>
                        </label>
                        <label className={'urgency-option' + (forWho === 'other' ? ' active' : '')}>
                            <input type="radio" name="forWho" className="sr-only" checked={forWho === 'other'} onChange={() => { setForWho('other'); setError('') }} />
                            <span className="urgency-label">{t('Someone else')}</span>
                            <span className="urgency-desc">{t("A family member or neighbor who doesn't use the app")}</span>
                        </label>
                    </div>
                </fieldset>
            )}

            {!editId && !forWho && (
                <p className="field-hint" style={{ fontSize: '0.9375rem' }}>{t('Choose one to keep going.')}</p>
            )}

            {forOther && forBlocked && (
                <p className="form-error" role="alert">{t(forBlocked)}</p>
            )}

            {repost && !editId && (
                <p className="ask-intro">{t('Filled in from your earlier request. Change anything you like, then post. This is a new request, so neighbors see it fresh.')}</p>
            )}

            {editId && (
                <p className="ask-intro">{t("Change anything below. If someone already said they can help, we'll let them know it changed.")}</p>
            )}

            {(editId || (forWho && !(forOther && forBlocked))) && (<>
            {forOther && (
                <div className="ask-for-box">
                    <div className="form-field">
                        <label htmlFor="forName">{t('Their first name')}</label>
                        <input id="forName" type="text" value={forName} maxLength={30} autoComplete="off" autoCapitalize="words"
                            onChange={(e) => setForName(e.target.value)} placeholder={t('Like Ruth')} />
                        <span className="field-hint">{t('First name only. No last name, phone, or address.')}</span>
                    </div>

                    <fieldset className="form-field" style={{ border: 'none', padding: 0, margin: '0 0 1rem' }}>
                        <legend style={{ fontWeight: 600, marginBottom: '0.4rem' }}>{t('Where do they live?')}</legend>
                        <div className="urgency-options">
                            <label className={'urgency-option' + (forWhere === 'near' ? ' active' : '')}>
                                <input type="radio" name="forWhere" className="sr-only" checked={forWhere === 'near'} onChange={() => { setForWhere('near'); setForPlace(null); if (profile?.neighborhood) setNeighborhood(profile.neighborhood) }} />
                                <span className="urgency-label">{t('Near me')}</span>
                                <span className="urgency-desc">{t('Use my area')}</span>
                            </label>
                            <label className={'urgency-option' + (forWhere === 'zip' ? ' active' : '')}>
                                <input type="radio" name="forWhere" className="sr-only" checked={forWhere === 'zip'} onChange={() => setForWhere('zip')} />
                                <span className="urgency-label">{t('Somewhere else')}</span>
                                <span className="urgency-desc">{t('Type their zip code')}</span>
                            </label>
                        </div>
                        {forWhere === 'zip' && (forPlace ? (
                            <p className="ask-zip-found">{t('Near')} {forPlace.label}{' '}
                                <button type="button" className="link-button" onClick={() => { setForPlace(null); setForZip('') }}>{t('Change')}</button>
                            </p>
                        ) : (
                            <div className="ask-zip-row">
                                <label htmlFor="forZip" className="sr-only">{t('Their zip code')}</label>
                                <input id="forZip" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={5} autoComplete="off"
                                    placeholder={t('Their zip code')} value={forZip}
                                    onChange={(e) => setForZip(e.target.value.replace(/[^0-9]/g, ''))}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); findTheirZip() } }} />
                                <button type="button" className="btn btn-primary" disabled={zipBusy} onClick={findTheirZip}>{t(zipBusy ? 'Looking...' : 'Find')}</button>
                            </div>
                        ))}
                        <span className="field-hint">{t("Just the zip code. It is never saved to anyone's profile.")}</span>
                    </fieldset>

                    <label className="checkbox-field ask-consent">
                        <input type="checkbox" checked={forConsent} onChange={(e) => setForConsent(e.target.checked)} />
                        <span>{t("{name} said it's okay for me to post this.", { name: forName.trim() || t('They') })}</span>
                    </label>
                    <p className="field-hint" style={{ marginTop: 0 }}>{t('Helpers will message you, not {name}. You pass things along.', { name: theirName })}</p>
                </div>
            )}

            {!editId && !(forOther && forWhere === 'zip') && (myLoc
                ? <LocationBar loc={myLoc} prefix="Neighbors near" onChanged={() => setLocTick(t => t + 1)} />
                : <LocationPrompt
                    title="Where do you need help?"
                    intro="Enter your zip code so neighbors nearby can see your request. We never guess where you are, and we never share your address."
                    onDone={() => { setError(''); setLocTick(t => t + 1) }}
                  />)}

            <form onSubmit={handleSubmit} className="ask-form">

                <div className="form-field">
                    <label id="skillNeededQ">{forOther ? t('What kind of help does {name} need?', { name: theirName }) : t('What kind of help do you need?')}</label>
                    <div role="group" aria-labelledby="skillNeededQ">
                    <GroupedSkillChips selected={skillNeeded ? [skillNeeded] : []} skills={skills} renderChip={(skill) => (
                        <button
                            key={skill}
                            type="button"
                            aria-pressed={skillNeeded === skill}
                            className={`skill-chip ${skillNeeded === skill ? 'active' : ''}`}
                            onClick={() => setSkillNeeded(skill)}
                        >
                            {t(skill)}
                        </button>
                    )} />
                    </div>
                    {autoPicked && skillNeeded === autoPicked && (
                        <p style={{ margin: '0.5rem 0 0', fontSize: '0.95rem', color: 'var(--text-soft)' }}>{t('We picked {skill} from what you chose. Tap another if it fits better.', { skill: t(autoPicked) })}</p>
                    )}
                </div>

                <div className="form-field">
                    <label htmlFor="description">{t("What's going on?")}</label>
                    <textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={forOther ? t('What does {name} need? Leave out their address and anything private.', { name: theirName }) : t("Describe your situation. Be as specific as you're comfortable with.")}
                        rows={4}
                        required
                    />
                    <AddressHint text={description} />
                </div>

                <div className="form-field">
                    <label id="urgencyQ">{t(forOther ? 'How soon do they need help?' : 'How soon do you need help?')}</label>
                    <div className="urgency-options" role="radiogroup" aria-labelledby="urgencyQ">
                        {URGENCY_OPTIONS.map((opt) => (
                            <label
                                key={opt.value}
                                className={`urgency-option urgency-time ${urgency === opt.value ? 'active' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="urgency"
                                    value={opt.value}
                                    checked={urgency === opt.value}
                                    onChange={() => setUrgency(opt.value)}
                                    className="sr-only"
                                />
                                <span className="urgency-label">{t(opt.label)}</span>
                                <span className="urgency-desc">{t(opt.desc)}</span>
                            </label>
                        ))}
                    </div>
                    <span className="field-hint">{t('An hour before it closes, we ask if you still need help.')}</span>
                </div>

                <div className="form-field">
                    <label id="maxHelpersQ">{t(forOther ? 'How many people do they need?' : 'How many people do you need?')}</label>
                    <div className="urgency-options" role="radiogroup" aria-labelledby="maxHelpersQ">
                        {HELPER_COUNT_OPTIONS.map((opt) => (
                            <label
                                key={String(opt.value)}
                                className={`urgency-option ${maxHelpers === opt.value ? 'active' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="maxHelpers"
                                    value={String(opt.value)}
                                    checked={maxHelpers === opt.value}
                                    onChange={() => setMaxHelpers(opt.value)}
                                    className="sr-only"
                                />
                                <span className="urgency-label">{t(opt.label)}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="form-field">
                    <label htmlFor="neighborhood">{t('Town or neighborhood to show (optional)')}</label>
                    <input
                        id="neighborhood"
                        type="text"
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                        placeholder={t(forOther ? 'Their town or neighborhood' : 'Your town or neighborhood')}
                    />
                    <span className="field-hint">
                        {t(forOther ? 'Just their town or neighborhood. Never their address.' : 'Just your town or neighborhood. We never share your exact address.')}
                    </span>
                </div>

                {!editId && managedOrgs.length > 0 && (
                    <div className="form-field">
                        <label htmlFor="postAs">{t('Post as')}</label>
                        <select id="postAs" value={postAs} onChange={(e) => setPostAs(e.target.value)}>
                            <option value="">{t('Myself')}</option>
                            {managedOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        <span className="field-hint">{t('Posting as your group lists it on your group dashboard.')}</span>
                    </div>
                )}

                {!editId && postAs && !forOther && audience === 'everyone' && (
                    <div className="form-field">
                        <label className="checkbox-field">
                            <input type="checkbox" checked={publicDetails} onChange={(e) => setPublicDetails(e.target.checked)} aria-describedby="publicDetailsHint" />
                            <span>{t('Show the details on our group page')}</span>
                        </label>
                        <span className="field-hint" id="publicDetailsHint">{t('Anyone on VWB can read them there. Only say what is needed, like "diapers, size 4, 2 packs". Never who it is for, where to bring it, or anything about health, family, or legal matters. Left off, the page shows only the kind of help.')}</span>
                    </div>
                )}

                {!editId && organizations.length > 0 && (
                    <fieldset className="form-field" style={{ border: 'none', padding: 0, margin: '0 0 1rem' }}>
                        <legend style={{ fontWeight: 600, marginBottom: '0.4rem' }}>{t('Who sees this first?')}</legend>
                        <label className="audience-option">
                            <input type="radio" name="audience" checked={audience === 'everyone'} onChange={() => setAudience('everyone')} style={{ marginTop: '0.3rem' }} />
                            <span>{t('Everyone nearby')}</span>
                        </label>
                        <label className="audience-option">
                            <input type="radio" name="audience" checked={audience === 'group'} onChange={() => setAudience('group')} style={{ marginTop: '0.3rem' }} />
                            <span>{t('Only {group} first', { group: groupName })}<small style={{ display: 'block', color: 'var(--text-secondary)' }}>{t('Members of your group see it right away. Neighbors and Hope Ambassadors see it once it opens to everyone.')}</small></span>
                        </label>
                        <label className="audience-option">
                            <input type="radio" name="audience" checked={audience === 'network'} onChange={() => setAudience('network')} style={{ marginTop: '0.3rem' }} />
                            <span>{t('{group} and its network first', { group: groupName })}<small style={{ display: 'block', color: 'var(--text-secondary)' }}>{t('Groups connected to {group} can see it too.', { group: groupName })}</small></span>
                        </label>
                        {audience !== 'everyone' && (
                            <>
                                {organizations.length > 1 && !postAs && (
                                    <>
                                        <label htmlFor="audienceOrg">{t('Which group?')}</label>
                                        <select id="audienceOrg" value={groupId} onChange={(e) => setAudienceOrg(e.target.value)}>
                                            {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                                        </select>
                                    </>
                                )}
                                <label htmlFor="openHours">{t('Then open it to everyone nearby after')}</label>
                                <select id="openHours" value={openHours} onChange={(e) => setOpenHours(e.target.value)}>
                                    <option value="6">{t('6 hours')}</option>
                                    <option value="24">{t('1 day')}</option>
                                    <option value="72">{t('3 days')}</option>
                                    <option value="168">{t('7 days')}</option>
                                </select>
                                <span className="field-hint">{t('You can open it sooner from Tasks. If nobody in your group can help, it still reaches your neighbors.')}</span>
                            </>
                        )}
                    </fieldset>
                )}

                {error && <p className="form-error" role="alert">{t(error)}</p>}

                <div className="form-row" style={{ marginTop: '0.5rem' }}>
                    <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => goBack('/')}
                    >
                        {t('Cancel')}
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting}
                        style={{ flex: 1 }}
                    >
                        {t(submitting ? (editId ? 'Saving...' : 'Posting...') : (editId ? 'Save changes' : 'Post request'))}
                    </button>
                </div>
            </form>
            </>)}
        </div>
    )
}