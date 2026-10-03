import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import GroupedSkillChips from '../components/GroupedSkillChips'
import { loadSkillCategories } from '../utils/skillGroups'
import { getMyLocation } from '../utils/location'
import { LocationPrompt, LocationBar } from '../components/LocationPrompt'
import NearbyResourcesFirst from '../components/NearbyResourcesFirst'

const URGENCY_OPTIONS = [
    { value: 'now', label: 'Right now', desc: 'Emergency or same-day need' },
    { value: 'today', label: 'Today', desc: 'Within the next few hours' },
    { value: 'this_week', label: 'This week', desc: 'Can wait a day or two' },
    { value: 'flexible', label: 'Flexible', desc: 'No rush, whenever someone is free' },
]

const HELPER_COUNT_OPTIONS = [
    { value: 1, label: '1 person' },
    { value: 2, label: '2 people' },
    { value: 3, label: '3 people' },
    { value: null, label: 'As many as possible' },
]

export default function AskForHelp() {
    const { user, profile, organizations } = useAuth()
    const [searchParams] = useSearchParams()
    const managedOrgs = organizations.filter((o) => o.role === 'admin' || o.role === 'organizer')
    const [postAs, setPostAs] = useState(() => {
        const want = searchParams.get('org')
        return managedOrgs.some((o) => o.id === want) ? want : ''
    })
    const navigate = useNavigate()
    // /ask?edit=ID opens this same form filled in, to change a request already posted.
    const editId = searchParams.get('edit')
    // First screen: look at nearby resources before asking a neighbor. Skipped
    // when editing, when posting as a group, or with ?skip=1.
    const [checkedResources, setCheckedResources] = useState(() => Boolean(editId) || Boolean(searchParams.get('org')) || searchParams.get('skip') === '1')

    const [skills, setSkills] = useState([])
    const [skillNeeded, setSkillNeeded] = useState('')
    // Who sees it first. 'everyone' is the normal request. 'group' and 'network' keep it
    // inside the person's group (or its network) until the time is up.
    const [audience, setAudience] = useState('everyone')
    const [audienceOrg, setAudienceOrg] = useState('')
    const [openHours, setOpenHours] = useState('24')
    const [description, setDescription] = useState('')
    const [urgency, setUrgency] = useState('today')
    const [maxHelpers, setMaxHelpers] = useState(1)
    const [neighborhood, setNeighborhood] = useState('')

    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    // Bumped when the person sets or changes their area, to re-read it.
    const [, setLocTick] = useState(0)
    const myLoc = getMyLocation(profile)

    useEffect(() => {
        async function loadSkills() {
            setSkills(await loadSkillCategories())
        }
        loadSkills()
    }, [])

    useEffect(() => {
        if (!editId && profile?.neighborhood) {
            setNeighborhood(profile.neighborhood)
        }
    }, [profile, editId])

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
        })
        return () => { alive = false }
    }, [editId])

    // The group the request is for: the one picked, else the one posting as, else the first.
    const groupId = audienceOrg || postAs || organizations[0]?.id || ''
    const groupName = (organizations.find((o) => o.id === groupId) || {}).name || 'your group'

    async function handleSubmit(e) {
        e.preventDefault()
        setError('')

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
                setError(editError.message && editError.message.length < 140 ? editError.message : 'Something went wrong. Please try again.')
                return
            }
            navigate('/tasks')
            return
        }

        // Neighbors are matched by area, so we need one. Never a guess.
        if (!myLoc) {
            setError('Add your zip code at the top so neighbors near you can see this.')
            window.scrollTo({ top: 0, behavior: 'smooth' })
            return
        }

        setSubmitting(true)
        const lat = myLoc.lat
        const lng = myLoc.lng

        const { error: insertError } = await supabase
            .from('help_requests')
            .insert({
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
                opens_to_all_at: audience === 'everyone' ? null : new Date(Date.now() + Number(openHours) * 3600 * 1000).toISOString(),
            })

        if (insertError) {
            setError(insertError.message && insertError.message.length < 140 && /group/i.test(insertError.message) ? insertError.message : 'Something went wrong. Please try again.')
            console.error(insertError)
            setSubmitting(false)
            return
        }

        navigate('/skillshare', { state: { message: audience === 'everyone' ? 'Your request has been posted.' : 'Your request is posted. Your group can see it now. Everyone nearby sees it after your chosen time, or when you open it from Tasks.' } })
    }

    if (!checkedResources) {
        return <NearbyResourcesFirst profile={profile} onContinue={() => setCheckedResources(true)} />
    }

    return (
        <div className="ask-page">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button onClick={() => navigate(-1)} aria-label="Go back" style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem', flexShrink: 0 }}>&#8592;</button>
                <h1 style={{ margin: 0 }}>{editId ? 'Edit your request' : 'Ask for help'}</h1>
            </div>
            <p className="ask-intro">
                Tell us what you need. Only Hope Ambassadors in your area will see this.
                No personal details are shared until you say so.
            </p>

            {editId && (
                <p className="ask-intro">Change anything below. If someone already said they can help, we'll let them know it changed.</p>
            )}

            {!editId && (myLoc
                ? <LocationBar loc={myLoc} prefix="Neighbors near" onChanged={() => setLocTick(t => t + 1)} />
                : <LocationPrompt
                    title="Where do you need help?"
                    intro="Enter your zip code so neighbors nearby can see your request. We never guess where you are, and we never share your address."
                    onDone={() => { setError(''); setLocTick(t => t + 1) }}
                  />)}

            <form onSubmit={handleSubmit} className="ask-form">

                <div className="form-field">
                    <label htmlFor="skillNeeded">What kind of help do you need?</label>
                    <GroupedSkillChips selected={skillNeeded ? [skillNeeded] : []} skills={skills} renderChip={(skill) => (
                        <button
                            key={skill}
                            type="button"
                            className={`skill-chip ${skillNeeded === skill ? 'active' : ''}`}
                            onClick={() => setSkillNeeded(skill)}
                        >
                            {skill}
                        </button>
                    )} />
                </div>

                <div className="form-field">
                    <label htmlFor="description">What's going on?</label>
                    <textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Describe your situation. Be as specific as you're comfortable with."
                        rows={4}
                        required
                    />
                </div>

                <div className="form-field">
                    <label>How soon do you need help?</label>
                    <div className="urgency-options">
                        {URGENCY_OPTIONS.map((opt) => (
                            <label
                                key={opt.value}
                                className={`urgency-option ${urgency === opt.value ? 'active' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="urgency"
                                    value={opt.value}
                                    checked={urgency === opt.value}
                                    onChange={() => setUrgency(opt.value)}
                                    className="sr-only"
                                />
                                <span className="urgency-label">{opt.label}</span>
                                <span className="urgency-desc">{opt.desc}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="form-field">
                    <label>How many people do you need?</label>
                    <div className="urgency-options">
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
                                <span className="urgency-label">{opt.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="form-field">
                    <label htmlFor="neighborhood">Town or neighborhood to show (optional)</label>
                    <input
                        id="neighborhood"
                        type="text"
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                        placeholder="Your town or neighborhood"
                    />
                    <span className="field-hint">
                        Just your town or neighborhood. We never share your exact address.
                    </span>
                </div>

                {!editId && managedOrgs.length > 0 && (
                    <div className="form-field">
                        <label htmlFor="postAs">Post as</label>
                        <select id="postAs" value={postAs} onChange={(e) => setPostAs(e.target.value)}>
                            <option value="">Myself</option>
                            {managedOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        <span className="field-hint">Posting as your group lists it on your organization dashboard.</span>
                    </div>
                )}

                {!editId && organizations.length > 0 && (
                    <fieldset className="form-field" style={{ border: 'none', padding: 0, margin: '0 0 1rem' }}>
                        <legend style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Who sees this first?</legend>
                        <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', minHeight: '44px', marginBottom: '0.4rem' }}>
                            <input type="radio" name="audience" checked={audience === 'everyone'} onChange={() => setAudience('everyone')} style={{ marginTop: '0.3rem' }} />
                            <span>Everyone nearby</span>
                        </label>
                        <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', minHeight: '44px', marginBottom: '0.4rem' }}>
                            <input type="radio" name="audience" checked={audience === 'group'} onChange={() => setAudience('group')} style={{ marginTop: '0.3rem' }} />
                            <span>Only {groupName} first<small style={{ display: 'block', color: '#aaa' }}>Members of your group can see it right away. Neighbors and Hope Ambassadors do not, until it opens.</small></span>
                        </label>
                        <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', minHeight: '44px', marginBottom: '0.4rem' }}>
                            <input type="radio" name="audience" checked={audience === 'network'} onChange={() => setAudience('network')} style={{ marginTop: '0.3rem' }} />
                            <span>{groupName} and its network first<small style={{ display: 'block', color: '#aaa' }}>If your group is linked to a council, the council and its other groups can see it too.</small></span>
                        </label>
                        {audience !== 'everyone' && (
                            <>
                                {organizations.length > 1 && !postAs && (
                                    <>
                                        <label htmlFor="audienceOrg">Which group?</label>
                                        <select id="audienceOrg" value={groupId} onChange={(e) => setAudienceOrg(e.target.value)}>
                                            {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                                        </select>
                                    </>
                                )}
                                <label htmlFor="openHours">Then open it to everyone nearby after</label>
                                <select id="openHours" value={openHours} onChange={(e) => setOpenHours(e.target.value)}>
                                    <option value="6">6 hours</option>
                                    <option value="24">1 day</option>
                                    <option value="72">3 days</option>
                                    <option value="168">7 days</option>
                                </select>
                                <span className="field-hint">You can open it sooner from Tasks. If nobody in your group can help, it still reaches your neighbors.</span>
                            </>
                        )}
                    </fieldset>
                )}

                {error && <p className="form-error" role="alert">{error}</p>}

                <div className="form-row" style={{ marginTop: '0.5rem' }}>
                    <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => navigate('/skillshare')}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting}
                        style={{ flex: 1 }}
                    >
                        {submitting ? (editId ? 'Saving...' : 'Posting...') : (editId ? 'Save changes' : 'Post request')}
                    </button>
                </div>
            </form>
        </div>
    )
}