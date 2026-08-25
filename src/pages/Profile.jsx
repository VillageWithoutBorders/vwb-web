import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

const SKILL_OPTIONS = [
  'Mold Cleanup', 'Drywall Repair', 'Plumbing', 'Electrical',
  'Tree Removal', 'Roof Tarps', 'Mucking Out', 'Childcare',
  'Pet Care', 'Translation', 'Transport', 'Meal Prep',
  'Tech Help', 'Paperwork Help', 'Heavy Lifting', 'Yard Work',
]

export default function Profile() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Editable fields
  const [displayName, setDisplayName] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [selectedSkills, setSelectedSkills] = useState([])
  const [radiusMiles, setRadiusMiles] = useState(10)

  // Ambassador fields
  const [ambassador, setAmbassador] = useState(null)
  const [ambAvailability, setAmbAvailability] = useState('')
  const [ambInterests, setAmbInterests] = useState('')

  // Load profile data into form
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '')
      setZipCode(profile.zip_code || '')
      setNeighborhood(profile.neighborhood || '')
      setSelectedSkills(profile.skills || [])
      setRadiusMiles(profile.radius_miles || 10)
    }
  }, [profile])

  // Load ambassador data if applicable
  useEffect(() => {
    if (profile?.is_hope_ambassador && user) {
      loadAmbassador()
    }
  }, [profile, user])

  async function loadAmbassador() {
    const { data } = await supabase
      .from('hope_ambassadors')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (data) {
      setAmbassador(data)
      setAmbAvailability(data.availability || '')
      setAmbInterests(data.interests || '')
    }
  }

  function toggleSkill(skill) {
    setSelectedSkills((prev) =>
      prev.includes(skill)
        ? prev.filter((s) => s !== skill)
        : [...prev, skill]
    )
  }

  function startEditing() {
    setEditing(true)
    setMessage('')
    setError('')
  }

  function cancelEditing() {
    if (profile) {
      setDisplayName(profile.display_name || '')
      setZipCode(profile.zip_code || '')
      setNeighborhood(profile.neighborhood || '')
      setSelectedSkills(profile.skills || [])
      setRadiusMiles(profile.radius_miles || 10)
    }
    if (ambassador) {
      setAmbAvailability(ambassador.availability || '')
      setAmbInterests(ambassador.interests || '')
    }
    setEditing(false)
    setError('')
  }

  async function handleSave() {
    if (!displayName.trim()) {
      setError('Name is required.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    const { error: profileError } = await supabase
      .from('helper_profiles')
      .update({
        display_name: displayName.trim(),
        zip_code: zipCode.trim(),
        neighborhood: neighborhood.trim(),
        skills: selectedSkills,
        radius_miles: radiusMiles,
      })
      .eq('user_id', user.id)

    if (profileError) {
      setError('Could not save profile. Try again.')
      setSaving(false)
      return
    }

    if (ambassador) {
      const { error: ambError } = await supabase
        .from('hope_ambassadors')
        .update({
          availability: ambAvailability.trim(),
          interests: ambInterests.trim(),
          skills: selectedSkills,
        })
        .eq('user_id', user.id)

      if (ambError) {
        setError('Profile saved, but ambassador details failed. Try again.')
        setSaving(false)
        return
      }
    }

    await refreshProfile()

    setMessage('Profile saved.')
    setEditing(false)
    setSaving(false)
  }

  const name = profile?.display_name || 'Neighbor'

  // ---- View Mode ----
  if (!editing) {
    return (
      <div className="profile-page">
        <div className="profile-header-section">
          <div className="avatar-placeholder">
            {name.charAt(0).toUpperCase()}
          </div>
          <h1>{name}</h1>
          {profile?.is_hope_ambassador && (
            <span className="ambassador-badge">Hope Ambassador</span>
          )}
          <p className="profile-email">{user?.email}</p>
        </div>

        <div className="profile-details">
          <div className="detail-row">
            <span className="detail-label">Zip code</span>
            <span className="detail-value">{profile?.zip_code || 'Not set'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Neighborhood</span>
            <span className="detail-value">{profile?.neighborhood || 'Not set'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Skills</span>
            <span className="detail-value">
              {profile?.skills?.length > 0
                ? profile.skills.join(', ')
                : 'None yet'}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Help radius</span>
            <span className="detail-value">{profile?.radius_miles || 10} miles</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Tasks completed</span>
            <span className="detail-value">{profile?.tasks_completed || 0}</span>
          </div>
        </div>

        {ambassador && (
          <div className="profile-details" style={{ marginTop: '1rem' }}>
            <div className="detail-section-header">Ambassador Details</div>
            <div className="detail-row">
              <span className="detail-label">Availability</span>
              <span className="detail-value">{ambassador.availability || 'Not set'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Interests</span>
              <span className="detail-value">{ambassador.interests || 'Not set'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status</span>
              <span className="detail-value">
                <span className={`status-dot ${ambassador.is_active ? 'active' : 'inactive'}`} />
                {ambassador.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        )}

        {message && <p className="form-success" role="status" style={{ marginTop: '1rem' }}>{message}</p>}

        <button
          className="btn btn-primary btn-full"
          style={{ marginTop: '1.5rem' }}
          onClick={startEditing}
        >
          Edit profile
        </button>

        <button
          className="btn btn-outline btn-full"
          style={{ marginTop: '0.75rem' }}
          onClick={signOut}
        >
          Sign out
        </button>
      </div>
    )
  }

  // ---- Edit Mode ----
  return (
    <div className="profile-page">
      <div className="profile-header-section">
        <div className="avatar-placeholder">
          {(displayName || 'N').charAt(0).toUpperCase()}
        </div>
        <h1>Edit profile</h1>
      </div>

      <div className="edit-form">
        <div className="form-field">
          <label htmlFor="editName">Name or nickname</label>
          <input
            id="editName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="What should we call you?"
          />
        </div>

        <div className="form-field">
          <label htmlFor="editZip">Zip code</label>
          <input
            id="editZip"
            type="text"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            placeholder="e.g., 30736"
            maxLength={10}
          />
        </div>

        <div className="form-field">
          <label htmlFor="editHood">Neighborhood or area</label>
          <input
            id="editHood"
            type="text"
            value={neighborhood}
            onChange={(e) => setNeighborhood(e.target.value)}
            placeholder="e.g., Fort Oglethorpe, Ringgold"
          />
        </div>

        <div className="form-field">
          <label>Skills</label>
          <div className="skill-grid">
            {SKILL_OPTIONS.map((skill) => (
              <button
                key={skill}
                type="button"
                className={`skill-chip ${selectedSkills.includes(skill) ? 'active' : ''}`}
                onClick={() => toggleSkill(skill)}
              >
                {skill}
              </button>
            ))}
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="editRadius">How far can you help? ({radiusMiles} miles)</label>
          <input
            id="editRadius"
            type="range"
            min="1"
            max="50"
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(Number(e.target.value))}
            className="range-input"
          />
          <div className="range-labels">
            <span>1 mi</span>
            <span>25 mi</span>
            <span>50 mi</span>
          </div>
        </div>

        {ambassador && (
          <>
            <div className="edit-section-divider">
              <span>Ambassador Details</span>
            </div>

            <div className="form-field">
              <label htmlFor="editAvail">Availability</label>
              <input
                id="editAvail"
                type="text"
                value={ambAvailability}
                onChange={(e) => setAmbAvailability(e.target.value)}
                placeholder="e.g., Weekday mornings, weekends"
              />
            </div>

            <div className="form-field">
              <label htmlFor="editInterests">About you</label>
              <textarea
                id="editInterests"
                value={ambInterests}
                onChange={(e) => setAmbInterests(e.target.value)}
                placeholder="Your interests, experience, or why you help"
                rows={3}
              />
            </div>
          </>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="form-row" style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={cancelEditing}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
            style={{ flex: 1 }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
