import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

// Public page behind an invite link Jade sends to an organization's contact
// (Admin > Organizations > Invite an Organization). No login required to
// view it -- only to actually submit the form. See vwb-org-invitations.sql
// for the table/functions this talks to.
export default function JoinOrg() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [checking, setChecking] = useState(true)
  const [invite, setInvite] = useState(null)
  const [notFound, setNotFound] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [socialLink, setSocialLink] = useState('')

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [joinedName, setJoinedName] = useState('')

  useEffect(() => {
    async function check() {
      if (!token) { setChecking(false); setNotFound(true); return }
      const { data, error } = await supabase.rpc('get_organization_invitation', { p_token: token })
      if (error) { console.error('[JoinOrg] get_organization_invitation', error); setNotFound(true); setChecking(false); return }
      const row = Array.isArray(data) ? data[0] : data
      if (!row) { setNotFound(true); setChecking(false); return }
      setInvite(row)
      setChecking(false)
    }
    check()
  }, [token])

  function stashAndGo(path) {
    localStorage.setItem('vwb_pending_org_invite', JSON.stringify({
      token,
      name: name.trim(),
      description: description.trim(),
      contact_email: contactEmail.trim(),
      website_url: websiteUrl.trim(),
      social_link: socialLink.trim(),
    }))
    navigate(path)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Organization name is required.'); return }

    if (!user) {
      stashAndGo('/login?mode=signup')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.rpc('accept_organization_invitation', {
      p_token: token,
      p_name: name.trim(),
      p_description: description.trim() || null,
      p_contact_email: contactEmail.trim() || null,
      p_website_url: websiteUrl.trim() || null,
      p_social_link: socialLink.trim() || null,
    })
    setSubmitting(false)
    if (error) {
      console.error('[JoinOrg] accept_organization_invitation', error)
      setError('Something went wrong. Try again, or ask for a new link.')
      return
    }
    setJoinedName(name.trim())
    setDone(true)
  }

  function handleSignInInstead(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Organization name is required.'); return }
    stashAndGo('/login')
  }

  if (authLoading || checking) return null

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Village Without Borders</h1>
          <p className="login-subtitle">Add your organization</p>
        </div>

        {notFound && (
          <p className="form-error" role="alert">This invite link isn't valid. Ask whoever sent it for a new one.</p>
        )}

        {!notFound && invite?.status === 'revoked' && (
          <p className="form-error" role="alert">This invite is no longer available. Ask for a new link.</p>
        )}

        {!notFound && !done && invite?.status === 'accepted' && (
          <p className="form-success" role="status">
            This invite was already used{invite.organization_name ? ` -- ${invite.organization_name} has already joined` : ''}. Ask for a new link if that wasn't you.
          </p>
        )}

        {done && (
          <>
            <p className="form-success" role="status">
              Thanks! {joinedName} is saved and waiting for approval. Jade (or another admin) will review it soon -- you'll be able to post once it's approved.
            </p>
            <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/')}>Go to the app</button>
          </>
        )}

        {!notFound && !done && invite?.status === 'pending' && (
          <form onSubmit={handleSubmit} className="login-form">
            {invite.note && (
              <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.75rem', fontStyle: 'italic' }}>&ldquo;{invite.note}&rdquo;</p>
            )}
            <p style={{ color: '#999', fontSize: '0.85rem', margin: '0 0 1rem' }}>
              Tell us about your organization.{!user ? " You'll make (or sign in to) a Village Without Borders account next." : ''} A founder or admin reviews every new organization before it shows up for neighbors, same as usual.
            </p>

            <div className="form-field">
              <label htmlFor="org-name">Organization name *</label>
              <input id="org-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-field">
              <label htmlFor="org-desc">Short description</label>
              <textarea id="org-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="form-field">
              <label htmlFor="org-email">Contact email</label>
              <input id="org-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="org-website">Website</label>
              <input id="org-website" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://" />
            </div>
            <div className="form-field">
              <label htmlFor="org-social">Social media link (optional)</label>
              <input id="org-social" value={socialLink} onChange={(e) => setSocialLink(e.target.value)} />
            </div>

            {error && <p className="form-error" role="alert">{error}</p>}

            <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
              {submitting ? 'Saving...' : user ? 'Add our organization' : 'Continue to sign up'}
            </button>

            {!user && (
              <p className="login-toggle">
                Already have a Village Without Borders account?{' '}
                <button type="button" className="link-button" onClick={handleSignInInstead}>
                  Sign in instead
                </button>
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
