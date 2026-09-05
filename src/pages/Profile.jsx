import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import AvatarBuilder, { AvatarDisplay } from '../components/AvatarBuilder'
import AvailabilityPicker, { availabilityDisplayString } from '../components/AvailabilityPicker'

export default function Profile() {
  const { user, profile, isAdmin, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showAvatarBuilder, setShowAvatarBuilder] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [selectedSkills, setSelectedSkills] = useState([])
  const [radiusMiles, setRadiusMiles] = useState(10)

  const [ambAvailability, setAmbAvailability] = useState('')
  const [ambInterests, setAmbInterests] = useState('')

  const [showAmbassadorSignup, setShowAmbassadorSignup] = useState(false)
  const [ambSignupSkills, setAmbSignupSkills] = useState([])
  const [ambSignupAvailability, setAmbSignupAvailability] = useState('')
  const [ambSignupInterests, setAmbSignupInterests] = useState('')
  const [ambSignupSaving, setAmbSignupSaving] = useState(false)
  const [ambSignupError, setAmbSignupError] = useState('')

  const [skillOptions, setSkillOptions] = useState([])
  const [showAdminApp, setShowAdminApp] = useState(false)
  const [adminAppRegion, setAdminAppRegion] = useState('')
  const [adminAppReason, setAdminAppReason] = useState('')
  const [adminAppSaving, setAdminAppSaving] = useState(false)
  const [adminAppStatus, setAdminAppStatus] = useState(null)

  useEffect(() => {
    async function loadSkills() {
      const { data } = await supabase.from('skill_categories').select('name').order('sort_order')
      if (data) setSkillOptions(data.map((s) => s.name))
    }
    loadSkills()
  }, [])

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '')
      setZipCode(profile.zip_code || '')
      setNeighborhood(profile.neighborhood || '')
      setSelectedSkills(profile.skills || [])
      setRadiusMiles(profile.radius_miles || 10)
      setAmbAvailability(profile.availability || '')
      setAmbInterests(profile.interests || '')
    }
  }, [profile])
  useEffect(() => { if (user?.id && profile?.is_hope_ambassador && !isAdmin) loadAdminAppStatus() }, [user?.id, profile?.is_hope_ambassador])

  function toggleSkill(skill) {
    setSelectedSkills((prev) => prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill])
  }

  function toggleAmbSignupSkill(skill) {
    setAmbSignupSkills((prev) => prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill])
  }

  function startEditing() { setEditing(true); setMessage(''); setError('') }

  function cancelEditing() {
    if (profile) {
      setDisplayName(profile.display_name || '')
      setZipCode(profile.zip_code || '')
      setNeighborhood(profile.neighborhood || '')
      setSelectedSkills(profile.skills || [])
      setRadiusMiles(profile.radius_miles || 10)
      setAmbAvailability(profile.availability || '')
      setAmbInterests(profile.interests || '')
    }
    setEditing(false); setError('')
  }

  async function handleSave() {
    if (!displayName.trim()) { setError('Name is required.'); return }
    setSaving(true); setError(''); setMessage('')
    const updates = {
      display_name: displayName.trim(),
      zip_code: zipCode.trim(),
      neighborhood: neighborhood.trim(),
      skills: selectedSkills,
      radius_miles: radiusMiles,
    }
    if (profile?.is_hope_ambassador) {
      updates.availability = ambAvailability.trim()
      updates.interests = ambInterests.trim()
    }
    const { error: profileError } = await supabase.from('helper_profiles').update(updates).eq('user_id', user.id)
    if (profileError) { setError('Could not save profile. Try again.'); setSaving(false); return }
    await refreshProfile()
    setMessage('Profile saved.'); setEditing(false); setSaving(false)
  }

  async function handleAmbassadorSignup() {
    if (ambSignupSkills.length === 0) { setAmbSignupError('Pick at least one skill you can help with.'); return }
    setAmbSignupSaving(true); setAmbSignupError('')
    const { error: updateError } = await supabase.from('helper_profiles').update({
      is_hope_ambassador: true, skills: ambSignupSkills,
      availability: ambSignupAvailability.trim(), interests: ambSignupInterests.trim(), is_available: true,
    }).eq('user_id', user.id)
    if (updateError) { setAmbSignupError('Something went wrong. Try again.'); setAmbSignupSaving(false); return }
    await supabase.from('helper_profiles').update({ is_hope_ambassador: true, skills: ambSignupSkills }).eq('user_id', user.id)
    await refreshProfile()
    setShowAmbassadorSignup(false); setMessage('Welcome aboard! You are now a Hope Ambassador.'); setAmbSignupSaving(false)
  }

  async function loadAdminAppStatus() {
    const { data } = await supabase.from('admin_applications').select('status').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (data) setAdminAppStatus(data.status)
  }

  async function submitAdminApplication() {
    if (!adminAppRegion.trim() || !adminAppReason.trim()) return
    setAdminAppSaving(true)
    await supabase.from('admin_applications').insert({ user_id: user.id, region: adminAppRegion.trim(), reason: adminAppReason.trim() })
    setAdminAppSaving(false)
    setShowAdminApp(false)
    setAdminAppRegion('')
    setAdminAppReason('')
    setAdminAppStatus('pending')
    setMessage('Your admin application has been submitted!')
  }

  function handleAvatarSaved(url, config) {
    setShowAvatarBuilder(false)
    setMessage('Avatar saved!')
    refreshProfile()
  }

  const name = profile?.display_name || 'Neighbor'

  if (showAvatarBuilder) {
    return (
      <AvatarBuilder
        onSave={handleAvatarSaved}
        onCancel={() => setShowAvatarBuilder(false)}
        initialConfig={profile?.avatar_config || null}
      />
    )
  }

  if (!editing) {
    return (
      <div className="profile-page">
        <div className="profile-header-section">
          <div onClick={() => setShowAvatarBuilder(true)} style={{ cursor: 'pointer', position: 'relative' }}>
            <AvatarDisplay url={profile?.avatar_url} size={80} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '24px', height: '24px', borderRadius: '50%', background: '#4ecca3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#1a1a1a', fontWeight: 700, border: '2px solid #1a1a1a' }}>
              {'\u270E'}
            </div>
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
              {profile?.skills?.length > 0 ? profile.skills.join(', ') : 'None yet'}
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

        {profile?.is_hope_ambassador && (
          <div className="profile-details" style={{ marginTop: '1rem' }}>
            <div className="detail-section-header">Ambassador Details</div>
            <div className="detail-row">
              <span className="detail-label">Availability</span>
              <span className="detail-value">{availabilityDisplayString(profile.availability)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">About me</span>
              <span className="detail-value">{profile.interests || 'Not set'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status</span>
              <span className="detail-value">
                <span className={`status-dot ${profile.is_available !== false ? 'active' : 'inactive'}`} />
                {profile.is_available !== false ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        )}

        {!profile?.is_hope_ambassador && !showAmbassadorSignup && (
          <div className="amb-signup-card">
            <div className="amb-signup-icon" aria-hidden="true">{'\uD83C\uDF3F'}</div>
            <h2 className="amb-signup-title">Become a Hope Ambassador</h2>
            <p className="amb-signup-desc">
              Hope Ambassadors are neighbors who volunteer their time and skills
              to help others in the community. Sign up and we will match you with
              people nearby who need a hand.
            </p>
            <button className="btn btn-primary btn-full" onClick={() => setShowAmbassadorSignup(true)}>
              Sign me up
            </button>
          </div>
        )}

        {!profile?.is_hope_ambassador && showAmbassadorSignup && (
          <div className="amb-signup-form">
            <h2 className="amb-signup-title">Hope Ambassador Signup</h2>
            <p className="amb-signup-desc" style={{ marginBottom: '1rem' }}>
              Tell us a little about how you can help.
            </p>
            <div className="form-field">
              <label>What skills can you offer?</label>
              <div className="skill-grid">
                {skillOptions.map((skill) => (
                  <button key={skill} type="button" className={`skill-chip ${ambSignupSkills.includes(skill) ? 'active' : ''}`} onClick={() => toggleAmbSignupSkill(skill)}>
                    {skill}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-field">
              <label>When are you usually available?</label>
              <AvailabilityPicker value={ambSignupAvailability} onChange={setAmbSignupAvailability} />
            </div>
            <div className="form-field">
              <label htmlFor="ambAbout">Anything else you want neighbors to know?</label>
              <textarea id="ambAbout" value={ambSignupInterests} onChange={(e) => setAmbSignupInterests(e.target.value)} placeholder="Your experience, why you want to help, or anything else" rows={3} />
            </div>
            {ambSignupError && <p className="form-error" role="alert">{ambSignupError}</p>}
            <div className="form-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => { setShowAmbassadorSignup(false); setAmbSignupSkills([]); setAmbSignupAvailability(''); setAmbSignupInterests(''); setAmbSignupError('') }} disabled={ambSignupSaving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleAmbassadorSignup} disabled={ambSignupSaving} style={{ flex: 1 }}>
                {ambSignupSaving ? 'Saving...' : 'Become an Ambassador'}
              </button>
            </div>
          </div>
        )}

        {message && <p className="form-success" role="status" style={{ marginTop: '1rem' }}>{message}</p>}

        <button className="btn btn-primary btn-full" style={{ marginTop: '1.5rem' }} onClick={startEditing}>Edit profile</button>
        <button className="btn btn-outline btn-full" style={{ marginTop: '0.75rem' }} onClick={signOut}>Sign out</button>
        {isAdmin && (
          <button className="btn btn-outline btn-full" onClick={() => navigate("/admin")} style={{ marginTop: "0.5rem", borderColor: "#4ecca3", color: "#4ecca3" }}>
            {'\u2699'} Admin Panel
          </button>
        )}
        {profile?.is_hope_ambassador && !isAdmin && !adminAppStatus && (
          <div style={{ background: 'linear-gradient(135deg, #1a2a4a, #2a3a5a)', border: '1px solid #66aaff', borderRadius: '10px', padding: '1rem', marginTop: '0.75rem' }}>
            <h2 style={{ margin: '0 0 0.35rem', fontSize: '1rem', color: '#66aaff' }}>Apply to become an Admin</h2>
            <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>Admins help coordinate responses in their region and keep the community safe.</p>
            {!showAdminApp ? (
              <button className="btn btn-outline btn-full" onClick={() => setShowAdminApp(true)} style={{ borderColor: '#66aaff', color: '#66aaff' }}>Start Application</button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input type="text" placeholder="What area would you cover? (e.g. Ringgold, Chickamauga)" value={adminAppRegion} onChange={e => setAdminAppRegion(e.target.value)} maxLength={100} style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.85rem' }} />
                <textarea placeholder="Why do you want to help coordinate? What experience do you bring?" value={adminAppReason} onChange={e => setAdminAppReason(e.target.value)} rows={3} maxLength={500} style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.85rem', resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-outline" onClick={() => { setShowAdminApp(false); setAdminAppRegion(''); setAdminAppReason('') }} disabled={adminAppSaving}>Cancel</button>
                  <button className="btn btn-primary" onClick={submitAdminApplication} disabled={adminAppSaving || !adminAppRegion.trim() || !adminAppReason.trim()} style={{ flex: 1 }}>{adminAppSaving ? 'Submitting...' : 'Submit Application'}</button>
                </div>
              </div>
            )}
          </div>
        )}
        {adminAppStatus === 'pending' && (
          <div style={{ background: '#1a2a4a', border: '1px solid #66aaff', borderRadius: '10px', padding: '0.75rem', marginTop: '0.75rem', textAlign: 'center' }}>
            <p style={{ color: '#66aaff', fontWeight: 600, margin: 0, fontSize: '0.9rem' }}>Your admin application is under review</p>
          </div>
        )}
        {adminAppStatus === 'declined' && (
          <div style={{ background: '#2a1a1a', border: '1px solid #ff6666', borderRadius: '10px', padding: '0.75rem', marginTop: '0.75rem', textAlign: 'center' }}>
            <p style={{ color: '#ff6666', fontWeight: 600, margin: 0, fontSize: '0.9rem' }}>Your application was not approved at this time</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="profile-page">
      <div className="profile-header-section">
        <div onClick={() => setShowAvatarBuilder(true)} style={{ cursor: 'pointer', position: 'relative' }}>
          <AvatarDisplay url={profile?.avatar_url} size={80} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '24px', height: '24px', borderRadius: '50%', background: '#4ecca3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#1a1a1a', fontWeight: 700, border: '2px solid #1a1a1a' }}>
            {'\u270E'}
          </div>
        </div>
        <h1>Edit profile</h1>
      </div>
      <div className="edit-form">
        <div className="form-field">
          <label htmlFor="editName">Name or nickname</label>
          <input id="editName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="What should we call you?" />
        </div>
        <div className="form-field">
          <label htmlFor="editZip">Zip code</label>
          <input id="editZip" type="text" value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="e.g., 30736" maxLength={10} />
        </div>
        <div className="form-field">
          <label htmlFor="editHood">Neighborhood or area</label>
          <input id="editHood" type="text" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="e.g., Fort Oglethorpe, Ringgold" />
        </div>
        <div className="form-field">
          <label>Skills</label>
          <div className="skill-grid">
            {skillOptions.map((skill) => (
              <button key={skill} type="button" className={`skill-chip ${selectedSkills.includes(skill) ? 'active' : ''}`} onClick={() => toggleSkill(skill)}>
                {skill}
              </button>
            ))}
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="editRadius">How far can you help? ({radiusMiles} miles)</label>
          <input id="editRadius" type="range" min="1" max="50" value={radiusMiles} onChange={(e) => setRadiusMiles(Number(e.target.value))} className="range-input" />
          <div className="range-labels"><span>1 mi</span><span>25 mi</span><span>50 mi</span></div>
        </div>
        {profile?.is_hope_ambassador && (
          <>
            <div className="edit-section-divider"><span>Ambassador Details</span></div>
            <div className="form-field">
              <label>Availability</label>
              <AvailabilityPicker value={ambAvailability} onChange={setAmbAvailability} />
            </div>
            <div className="form-field">
              <label htmlFor="editInterests">About you</label>
              <textarea id="editInterests" value={ambInterests} onChange={(e) => setAmbInterests(e.target.value)} placeholder="Your interests, experience, or why you help" rows={3} />
            </div>
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-row" style={{ marginTop: '0.5rem' }}>
          <button type="button" className="btn btn-outline" onClick={cancelEditing} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
