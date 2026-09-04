import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { getCurrentPosition } from '../utils/location'

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
    const { user, profile } = useAuth()
    const navigate = useNavigate()

    const [skills, setSkills] = useState([])
    const [skillNeeded, setSkillNeeded] = useState('')
    const [description, setDescription] = useState('')
    const [urgency, setUrgency] = useState('today')
    const [maxHelpers, setMaxHelpers] = useState(1)
    const [neighborhood, setNeighborhood] = useState('')

    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        async function loadSkills() {
            const { data } = await supabase
                .from('skill_categories')
                .select('name')
                .order('sort_order')

            if (data) {
                setSkills(data.map((s) => s.title))
            }
        }
        loadSkills()
    }, [])

    useEffect(() => {
        if (profile?.neighborhood) {
            setNeighborhood(profile.neighborhood)
        }
    }, [profile])

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

        setSubmitting(true)

        let lat = null
        let lng = null
        try {
            const loc = await getCurrentPosition()
            if (loc && loc.lat) { lat = loc.lat; lng = loc.lng }
        } catch (err) { }

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
            })

        if (insertError) {
            setError('Something went wrong. Please try again.')
            console.error(insertError)
            setSubmitting(false)
            return
        }

        navigate('/skillshare', { state: { message: 'Your request has been posted.' } })
    }

    return (
        <div className="ask-page">
            <h1>Ask for help</h1>
            <p className="ask-intro">
                Tell us what you need. Only Hope Ambassadors in your area will see this.
                No personal details are shared until you say so.
            </p>

            <form onSubmit={handleSubmit} className="ask-form">

                <div className="form-field">
                    <label htmlFor="skillNeeded">What kind of help do you need?</label>
                    <div className="skill-grid">
                        {skills.map((skill) => (
                            <button
                                key={skill}
                                type="button"
                                className={`skill-chip ${skillNeeded === skill ? 'active' : ''}`}
                                onClick={() => setSkillNeeded(skill)}
                            >
                                {skill}
                            </button>
                        ))}
                    </div>
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
                    <label htmlFor="neighborhood">Your general area</label>
                    <input
                        id="neighborhood"
                        type="text"
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                        placeholder="e.g., Ringgold, Fort Oglethorpe"
                    />
                    <span className="field-hint">
                        Just your town or neighborhood. We never share your exact address.
                    </span>
                </div>

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
                        {submitting ? 'Posting...' : 'Post request'}
                    </button>
                </div>
            </form>
        </div>
    )
}