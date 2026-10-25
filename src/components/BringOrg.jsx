import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { ORG_TYPES } from '../data/orgTypes'

// "Bring your organization to VWB": the request form (Oct 22: moved from the old
// Around you page to the Calendar and the World's Organizations tab).
// ?bring=org in the address opens the form and scrolls to it.
export default function BringOrg() {
  const { profile, organizations } = useAuth()
  const emptyOrgForm = { name: '', description: '', email: '', website: '', social: '', orgType: '', hidePublic: false }
  const [pendingOrg, setPendingOrg] = useState(null)
  const [showOrgForm, setShowOrgForm] = useState(() => new URLSearchParams(window.location.search).get('bring') === 'org')
  const [orgForm, setOrgForm] = useState(emptyOrgForm)
  const [orgSending, setOrgSending] = useState(false)
  const [orgError, setOrgError] = useState('')
  const [orgSent, setOrgSent] = useState(false)
  const boxRef = useRef(null)
  const managedOrgs = organizations.filter((o) => o.role === 'admin' || o.role === 'organizer')

  useEffect(() => {
    if (!showOrgForm || !boxRef.current) return
    const t = setTimeout(() => boxRef.current && boxRef.current.scrollIntoView({ block: 'start' }), 300)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Is this member's organization request still waiting for approval?
  useEffect(() => {
    if (!profile) return
    let alive = true
    supabase.rpc('my_pending_organization').then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to check organization request:', error); return }
      setPendingOrg(data && data.length ? data[0] : null)
    })
    return () => { alive = false }
  }, [profile?.user_id]) // eslint-disable-line react-hooks/exhaustive-deps

  function setOrgField(key) {
    return (e) => setOrgForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function sendOrgRequest(e) {
    e.preventDefault()
    if (!orgForm.name.trim()) {
      setOrgError("Please add your organization's name.")
      return
    }
    setOrgSending(true)
    setOrgError('')
    const { data, error } = await supabase.rpc('request_organization', {
      p_name: orgForm.name,
      p_description: orgForm.description,
      p_contact_email: orgForm.email,
      p_website_url: orgForm.website,
      p_social_link: orgForm.social,
      p_hide_from_public: orgForm.hidePublic,
      p_org_type: orgForm.orgType || null,
    })
    setOrgSending(false)
    if (error) {
      console.error('Failed to send organization request:', error)
      const ours = ['P0001', '22023', '22001', '28000'].includes(error.code)
      setOrgError(ours ? error.message : "We couldn't send that. Check your connection and try again.")
      return
    }
    setPendingOrg({ id: data, name: orgForm.name.trim() })
    setOrgSent(true)
    setShowOrgForm(false)
    setOrgForm(emptyOrgForm)
  }

  if (managedOrgs.length > 0 && !pendingOrg) return null

  return (
    <section className="hub-section" aria-labelledby="bring-org-h" ref={boxRef} style={{ scrollMarginTop: 'calc(var(--header-height) + 12px)' }}>
      <div className="hub-section-head">
        <h2 id="bring-org-h">Bring your organization</h2>
      </div>
      {pendingOrg && (
        <div className="cal-card org-request-note" role="status">
          <span className="cal-card-title">{orgSent ? 'Thanks! Your request is in.' : 'Your request is waiting'}</span>
          <span className="cal-card-meta">We'll look over {pendingOrg.name} and send you an alert when there's news.</span>
        </div>
      )}
        {showOrgForm && !pendingOrg && (
          <form className="org-request-form" onSubmit={sendOrgRequest} noValidate aria-labelledby="org-request-title">
            <h3 id="org-request-title">Bring your organization to VWB</h3>
            <p className="org-request-help">Tell us a little about your group. We'll look it over. Once it's approved, you can post events and resources.</p>
            <p className="org-request-help">Starting a crew that shows up during emergencies? <Link to="/start-group">Start an emergency response group</Link> instead.</p>

            <label htmlFor="org-name">Organization name (required)</label>
            <input id="org-name" type="text" autoComplete="organization" maxLength={120} required aria-invalid={orgError && !orgForm.name.trim() ? 'true' : undefined} value={orgForm.name} onChange={setOrgField('name')} />

            <label htmlFor="org-type">What kind of organization is it? (optional)</label>
            <select id="org-type" value={orgForm.orgType} onChange={setOrgField('orgType')}>
              <option value="">Choose one</option>
              {ORG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>

            <label htmlFor="org-desc">What does your group do?</label>
            <textarea id="org-desc" rows={3} maxLength={1000} value={orgForm.description} onChange={setOrgField('description')} />

            <label htmlFor="org-email">Contact email</label>
            <input id="org-email" type="email" inputMode="email" autoComplete="email" maxLength={200} value={orgForm.email} onChange={setOrgField('email')} />

            <label htmlFor="org-website">Website</label>
            <input id="org-website" type="url" inputMode="url" autoComplete="url" placeholder="https://" maxLength={300} value={orgForm.website} onChange={setOrgField('website')} />

            <label htmlFor="org-social">One social media link</label>
            <input id="org-social" type="url" inputMode="url" placeholder="https://" maxLength={300} value={orgForm.social} onChange={setOrgField('social')} />

            <label htmlFor="org-private" style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontWeight: 400 }}>
              <input id="org-private" type="checkbox" checked={orgForm.hidePublic} onChange={(e) => setOrgForm((f) => ({ ...f, hidePublic: e.target.checked }))} style={{ width: '24px', minHeight: '24px', flexShrink: 0, marginTop: '2px' }} />
              <span>Only show our group to people with an account. Our name, resources and events will not appear to the public or on the website. You can change this any time.</span>
            </label>

            {orgError && <p className="cal-error" role="alert">{orgError}</p>}

            <button type="submit" className="btn btn-primary btn-full" disabled={orgSending}>{orgSending ? 'Sending...' : 'Send request'}</button>
            <button type="button" className="btn btn-outline btn-full" onClick={() => { setShowOrgForm(false); setOrgError('') }}>Cancel</button>
          </form>
        )}
      {!pendingOrg && !showOrgForm && (
        <button type="button" className="btn btn-outline btn-full" onClick={() => setShowOrgForm(true)}>Bring your organization to VWB</button>
      )}
    </section>
  )
}
