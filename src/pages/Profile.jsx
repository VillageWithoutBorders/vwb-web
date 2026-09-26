import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import GroupedSkillChips from '../components/GroupedSkillChips'
import { loadSkillCategories } from '../utils/skillGroups'
import AvatarBuilder, { AvatarPreview } from '../components/AvatarBuilder'
import AvailabilityPicker, { availabilityDisplayString } from '../components/AvailabilityPicker'

function reportError(context, error, userMessage) {
  if (!error) return false
  console.error(`[Profile:${context}]`, error)
  if (userMessage) alert(userMessage)
  return true
}

export default function Profile() {
  const { user, profile, isAdmin, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
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
  // Opt-in, off by default: Campfire is a group chat, and defaulting people
  // into push notifications for it is what led to the overwhelm this field
  // exists to prevent. They can flip it on any time from Campfire's own
  // settings panel too.
  const [ambSignupCampfireNotify, setAmbSignupCampfireNotify] = useState(false)
  const [ambSignupSaving, setAmbSignupSaving] = useState(false)
  const [ambSignupError, setAmbSignupError] = useState('')
  const [ambSignupHowKnown, setAmbSignupHowKnown] = useState('')
  // The most recent Ambassador application, so the page can say "your
  // application is in" instead of offering the signup form again.
  const [ambApplication, setAmbApplication] = useState(null)

  useEffect(() => {
    if (!user?.id || profile?.is_hope_ambassador) { setAmbApplication(null); return }
    supabase.from('ambassador_applications').select('id, status, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data, error }) => {
      if (error) { console.error('Failed to load your ambassador application:', error); return }
      setAmbApplication(data || null)
    })
  }, [user?.id, profile?.is_hope_ambassador])

  const [skillOptions, setSkillOptions] = useState([])
  const [showAdminApp, setShowAdminApp] = useState(false)
  const [adminAppRegion, setAdminAppRegion] = useState('')
  const [adminAppReason, setAdminAppReason] = useState('')
  const [adminAppSaving, setAdminAppSaving] = useState(false)
  const [adminAppStatus, setAdminAppStatus] = useState(null)
  const [adminAppId, setAdminAppId] = useState(null)
  const [adminAppInvitedBy, setAdminAppInvitedBy] = useState(null)

  const [coverageRegion, setCoverageRegion] = useState('')
  const [coverageLat, setCoverageLat] = useState(null)
  const [coverageLng, setCoverageLng] = useState(null)
  const [coverageLocating, setCoverageLocating] = useState(false)
  const [coverageSaving, setCoverageSaving] = useState(false)
  const [coverageError, setCoverageError] = useState('')

  useEffect(() => {
    async function loadSkills() {
      setSkillOptions(await loadSkillCategories())
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

  // The header account menu's "Edit Profile" item navigates here with
  // this flag set (since Profile.jsx no longer has its own Edit profile
  // button -- see AccountMenu.jsx) so it lands straight in the edit form
  // instead of just the read-only view. Clear the flag right after so
  // it doesn't re-trigger on a later re-render or a back/forward nav.
  useEffect(() => {
    if (location.state?.openEdit && profile) {
      startEditing()
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, profile])
  useEffect(() => { if (user?.id && profile?.is_hope_ambassador && !isAdmin) loadAdminAppStatus() }, [user?.id, profile?.is_hope_ambassador])

  useEffect(() => {
    async function prefillCoverageRegion() {
      const { data, error } = await supabase.from('admin_applications').select('region').eq('user_id', user.id).not('region', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
      reportError('prefillCoverageRegion', error)
      if (data?.region) setCoverageRegion(data.region)
    }
    if (isAdmin && user?.id && profile && !profile.admin_region_name) prefillCoverageRegion()
  }, [isAdmin, user?.id, profile?.admin_region_name])

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
    reportError('handleSave', profileError)
    if (profileError) { setError('Could not save profile. Try again.'); setSaving(false); return }
    await refreshProfile()
    setMessage('Profile saved.'); setEditing(false); setSaving(false)
  }

  async function handleAmbassadorSignup() {
    if (ambSignupSkills.length === 0) { setAmbSignupError('Pick at least one skill you can help with.'); return }
    if (!ambSignupHowKnown.trim()) { setAmbSignupError('Tell us how you know this community, or who can vouch for you.'); return }
    setAmbSignupSaving(true); setAmbSignupError('')
    // Details about you save right away. The Ambassador badge does not: an
    // admin hands it out when they approve the application, and the database
    // makes sure nobody can skip that step.
    const { error: updateError } = await supabase.from('helper_profiles').update({
      skills: ambSignupSkills,
      availability: ambSignupAvailability.trim(), interests: ambSignupInterests.trim(), is_available: true,
      campfire_notifications_enabled: ambSignupCampfireNotify,
    }).eq('user_id', user.id)
    reportError('handleAmbassadorSignup', updateError)
    if (updateError) { setAmbSignupError('Something went wrong. Try again.'); setAmbSignupSaving(false); return }
    const { data: waiting, error: waitingError } = await supabase.from('ambassador_applications').select('id').eq('user_id', user.id).eq('status', 'pending').limit(1).maybeSingle()
    reportError('handleAmbassadorSignup:existing', waitingError)
    if (!waiting) {
      const { data: app, error: appError } = await supabase.from('ambassador_applications').insert({ user_id: user.id, how_known: ambSignupHowKnown.trim() }).select('id, status, created_at').single()
      reportError('handleAmbassadorSignup:apply', appError)
      if (appError) { setAmbSignupError('Something went wrong sending your application. Try again.'); setAmbSignupSaving(false); return }
      setAmbApplication(app)
    }
    await refreshProfile()
    setShowAmbassadorSignup(false); setMessage('Application sent. An admin will look it over, and you will get a notification when there is an answer.'); setAmbSignupSaving(false)
  }

  async function loadAdminAppStatus() {
    const { data, error } = await supabase.from('admin_applications').select('id, status, invited_by').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    reportError('loadAdminAppStatus', error)
    if (data) {
      setAdminAppStatus(data.status)
      setAdminAppId(data.id)
      setAdminAppInvitedBy(data.invited_by || null)
    }
  }

  async function respondToAdminInvite(accept) {
    if (!adminAppId) return
    setAdminAppSaving(true); setError(''); setMessage('')
    const newStatus = accept ? 'pending' : 'declined'
    const { error: statusError } = await supabase.from('admin_applications').update({ status: newStatus }).eq('id', adminAppId)
    reportError('respondToAdminInvite:status', statusError)
    if (statusError) {
      setError('Could not save your response. Try again.')
      setAdminAppSaving(false)
      return
    }
    let notifyFailed = false
    if (adminAppInvitedBy) {
      const { error: notifyError } = await supabase.from('notifications').insert({
        user_id: adminAppInvitedBy,
        type: accept ? 'admin_invite_accepted' : 'admin_invite_declined',
        title: (profile?.display_name || 'A neighbor') + (accept ? ' accepted your admin invitation' : ' declined your admin invitation'),
        body: accept ? 'Review it in the Admin panel to finish granting access.' : '',
        link: '/admin',
        read: false,
      })
      if (reportError('respondToAdminInvite:notify', notifyError)) notifyFailed = true
    }
    setAdminAppStatus(newStatus)
    setMessage(
      accept
        ? notifyFailed
          ? 'Thanks! We saved your acceptance, but could not notify the admin who invited you. Let them know directly.'
          : 'Thanks! Your acceptance was sent back for final confirmation.'
        : 'Invitation declined.'
    )
    setAdminAppSaving(false)
  }

  async function submitAdminApplication() {
    if (!adminAppRegion.trim() || !adminAppReason.trim()) return
    setAdminAppSaving(true); setError(''); setMessage('')
    const { error: appError } = await supabase.from('admin_applications').insert({ user_id: user.id, region: adminAppRegion.trim(), reason: adminAppReason.trim() })
    reportError('submitAdminApplication', appError)
    if (appError) {
      setError('Could not submit your application. Try again.')
      setAdminAppSaving(false)
      return
    }
    setAdminAppSaving(false)
    setShowAdminApp(false)
    setAdminAppRegion('')
    setAdminAppReason('')
    setAdminAppStatus('pending')
    setMessage('Your admin application has been submitted!')
  }
function captureCoverageLocation() {
    setCoverageError('')
    if (!navigator.geolocation) { setCoverageError('Location is not available on this device.'); return }
    setCoverageLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoverageLat(pos.coords.latitude); setCoverageLng(pos.coords.longitude); setCoverageLocating(false) },
      () => { setCoverageError('Could not get your location. Check your browser permissions and try again.'); setCoverageLocating(false) },
      { enableHighAccuracy: false, timeout: 10000 }
    )
  }

  async function saveCoverageArea() {
    if (!coverageRegion.trim()) { setCoverageError('Add a region name first.'); return }
    if (coverageLat == null || coverageLng == null) { setCoverageError('Share your location first.'); return }
    setCoverageSaving(true); setCoverageError('')
    const { error: covErr } = await supabase.from('helper_profiles').update({
      admin_region_name: coverageRegion.trim(),
      admin_latitude: coverageLat,
      admin_longitude: coverageLng,
    }).eq('user_id', user.id)
    reportError('saveCoverageArea', covErr)
    if (covErr) { setCoverageError('Could not save. Try again.'); setCoverageSaving(false); return }
    await refreshProfile()
    setMessage('Your coverage area is set. Reports can now route to you.')
    setCoverageSaving(false)
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
          <button type="button" onClick={() => setShowAvatarBuilder(true)} aria-label="Change avatar" style={{ cursor: 'pointer', position: 'relative', background: 'none', border: 'none', padding: 0 }}>
            <AvatarPreview url={profile?.avatar_url} size={80} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '24px', height: '24px', borderRadius: '50%', background: '#4ecca3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#1a1a1a', fontWeight: 700, border: '2px solid #1a1a1a' }}>
              {'✎'}
            </div>
          </button>
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

        {!profile?.is_hope_ambassador && ambApplication?.status === 'pending' && (
          <div className="amb-signup-card">
            <div className="amb-signup-icon" aria-hidden="true">{'🌿'}</div>
            <h2 className="amb-signup-title">Your application is in</h2>
            <p className="amb-signup-desc">
              An admin will look it over and let you know. Until then you can ask
              for help, offer help, and look around.
            </p>
          </div>
        )}

        {!profile?.is_hope_ambassador && ambApplication?.status !== 'pending' && !showAmbassadorSignup && (
          <div className="amb-signup-card">
            <div className="amb-signup-icon" aria-hidden="true">{'🌿'}</div>
            <h2 className="amb-signup-title">Become a Hope Ambassador</h2>
            <p className="amb-signup-desc">
              Hope Ambassadors are neighbors who volunteer their time and skills
              to help others in the community. An admin looks over each application
              so this stays a community people can trust.
              {ambApplication?.status === 'declined' && ' Your last application was not approved. You can apply again, or reach out to an admin.'}
            </p>
            <button className="btn btn-primary btn-full" onClick={() => setShowAmbassadorSignup(true)}>
              Apply
            </button>
          </div>
        )}

        {!profile?.is_hope_ambassador && !isAdmin && ambApplication?.status !== 'pending' && !showAmbassadorSignup && (
          <button onClick={() => setShowAmbassadorSignup(true)} style={{ display: "flex", alignItems: "center", gap: "0.75rem", width: "100%", marginTop: "0.75rem", padding: "0.75rem", background: "linear-gradient(135deg, #3a2a10, #4a3520)", border: "2px solid #ff8844", borderRadius: "12px", cursor: "pointer", textAlign: "left" }}>
            <span style={{ fontSize: "1.5rem" }}>&#128293;</span>
            <div>
              <span style={{ display: "block", color: "#ffaa44", fontWeight: 700, fontSize: "0.95rem" }}>The Campfire</span>
              <span style={{ color: "#cc9966", fontSize: "0.75rem" }}>Want in? Apply to be a Hope Ambassador above &#8594;</span>
            </div>
          </button>
        )}

        {!profile?.is_hope_ambassador && showAmbassadorSignup && (
          <div className="amb-signup-form">
            <h2 className="amb-signup-title">Hope Ambassador Application</h2>
            <p className="amb-signup-desc" style={{ marginBottom: '1rem' }}>
              Tell us a little about how you can help.
            </p>
            <div className="form-field">
              <label>What skills can you offer?</label>
              <GroupedSkillChips skills={skillOptions} renderChip={(skill) => (
                <button key={skill} type="button" className={`skill-chip ${ambSignupSkills.includes(skill) ? 'active' : ''}`} onClick={() => toggleAmbSignupSkill(skill)}>
                  {skill}
                </button>
              )} />
            </div>
            <div className="form-field">
              <label>When are you usually available?</label>
              <AvailabilityPicker value={ambSignupAvailability} onChange={setAmbSignupAvailability} />
            </div>
            <div className="form-field">
              <label htmlFor="ambAbout">Anything else you want neighbors to know?</label>
              <textarea id="ambAbout" value={ambSignupInterests} onChange={(e) => setAmbSignupInterests(e.target.value)} placeholder="Your experience, why you want to help, or anything else" rows={3} />
            </div>
            <div className="form-field">
              <label htmlFor="ambHowKnown">How do you know this community, or who can vouch for you?</label>
              <textarea id="ambHowKnown" value={ambSignupHowKnown} onChange={(e) => setAmbSignupHowKnown(e.target.value)} placeholder="A neighbor, a group, an event, or a name an admin can reach out to" rows={2} />
            </div>
            <label className="checkbox-field" style={{ background: 'var(--green-light)', borderRadius: '10px', padding: '0.75rem 1rem', alignItems: 'flex-start' }}>
              <input type="checkbox" checked={ambSignupCampfireNotify} onChange={(e) => setAmbSignupCampfireNotify(e.target.checked)} />
              <span>
                <strong style={{ display: 'block', marginBottom: '0.15rem' }}>Notify me about Campfire messages</strong>
                The Campfire is the group chat for Ambassadors and admins. Leave this unchecked and you can still read it anytime, you just won't get a push for every message. Change this later from Campfire's settings.
              </span>
            </label>
            {ambSignupError && <p className="form-error" role="alert">{ambSignupError}</p>}
            <div className="form-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => { setShowAmbassadorSignup(false); setAmbSignupSkills([]); setAmbSignupAvailability(''); setAmbSignupInterests(''); setAmbSignupCampfireNotify(false); setAmbSignupError('') }} disabled={ambSignupSaving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleAmbassadorSignup} disabled={ambSignupSaving} style={{ flex: 1 }}>
                {ambSignupSaving ? 'Sending...' : 'Send application'}
              </button>
            </div>
          </div>
        )}

        {message && <p className="form-success" role="status" style={{ marginTop: '1rem' }}>{message}</p>}
        {error && <p className="form-error" role="alert" style={{ marginTop: '1rem' }}>{error}</p>}

        {isAdmin && !profile?.admin_latitude && (
          <div style={{ background: 'linear-gradient(135deg, #1a2a4a, #2a3a5a)', border: '1px solid #66aaff', borderRadius: '10px', padding: '1rem', marginTop: '0.75rem' }}>
            <h2 style={{ margin: '0 0 0.35rem', fontSize: '1rem', color: '#66aaff' }}>Set up your coverage area</h2>
            <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>Emergency dispute reviews (a false alarm or duplicate flag) route to the nearest admin, so add your area and share your location to catch the ones near you. Reports about a person or message go to every admin right away, wherever they're located.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input type="text" placeholder="What area do you cover? (e.g. Ringgold, Chickamauga)" value={coverageRegion} onChange={e => setCoverageRegion(e.target.value)} maxLength={100} style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.85rem' }} />
              <button type="button" className="btn btn-outline" onClick={captureCoverageLocation} disabled={coverageLocating} style={{ borderColor: '#66aaff', color: '#66aaff' }}>
                {coverageLocating ? 'Getting your location...' : coverageLat != null ? '✓ Location captured' : 'Share my location'}
              </button>
              {coverageError && <p className="form-error" role="alert">{coverageError}</p>}
              <button type="button" className="btn btn-primary" onClick={saveCoverageArea} disabled={coverageSaving || !coverageRegion.trim() || coverageLat == null} style={{ marginTop: '0.25rem' }}>
                {coverageSaving ? 'Saving...' : 'Save coverage area'}
              </button>
            </div>
          </div>
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
        {adminAppStatus === 'invited' && (
          <div style={{ background: 'linear-gradient(135deg, #1a2a4a, #2a3a5a)', border: '1px solid #66aaff', borderRadius: '10px', padding: '1rem', marginTop: '0.75rem' }}>
            <h2 style={{ margin: '0 0 0.35rem', fontSize: '1rem', color: '#66aaff' }}>You've been invited to become an Admin</h2>
            <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>An admin thinks you'd be a good fit to help coordinate responses in your area. Accepting sends this back to them for final confirmation.</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-outline" onClick={() => respondToAdminInvite(false)} disabled={adminAppSaving} style={{ flex: 1 }}>Decline</button>
              <button className="btn btn-primary" onClick={() => respondToAdminInvite(true)} disabled={adminAppSaving} style={{ flex: 1 }}>Accept</button>
            </div>
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

        <a href="https://villagewithoutborders.org" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'linear-gradient(135deg, #1a4a3a, #2d5a45)', border: '2px solid #4ecca3', borderRadius: '12px', textDecoration: 'none', marginTop: '0.75rem' }}>
          <img src="/images/vwb_header.png" alt="VWB" style={{ height: '40px', borderRadius: '50%' }} />
          <div>
            <span style={{ display: 'block', color: '#4ecca3', fontWeight: 700, fontSize: '0.95rem' }}>Village Without Borders</span>
            <span style={{ color: '#8fc', fontSize: '0.75rem' }}>Visit our website &#8599;</span>
          </div>
        </a>

        <button onClick={() => navigate('/help')} style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: '1px solid #444', borderRadius: '10px', padding: '0.6rem', marginTop: '0.75rem', color: '#aaa', fontSize: '0.85rem', cursor: 'pointer' }}>
          Help &amp; Feedback
        </button>
      </div>
    )
  }

  return (
    <div className="profile-page">
      <div className="profile-header-section">
        <button type="button" onClick={() => setShowAvatarBuilder(true)} aria-label="Change avatar" style={{ cursor: 'pointer', position: 'relative', background: 'none', border: 'none', padding: 0 }}>
          <AvatarPreview url={profile?.avatar_url} size={80} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '24px', height: '24px', borderRadius: '50%', background: '#4ecca3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#1a1a1a', fontWeight: 700, border: '2px solid #1a1a1a' }}>
            {'✎'}
          </div>
        </button>
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
          <GroupedSkillChips skills={skillOptions} renderChip={(skill) => (
            <button key={skill} type="button" className={`skill-chip ${selectedSkills.includes(skill) ? 'active' : ''}`} onClick={() => toggleSkill(skill)}>
              {skill}
            </button>
          )} />
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