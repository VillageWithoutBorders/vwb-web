import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { fetchCalendarEvents } from '../utils/calendar'
import { CalendarEventList } from '../components/CalendarParts'
import { resourceCats } from '../utils/resourceCategories'
import QrShare from '../components/QrShare'

// One organization: who they are, what's coming up, what they share, and
// how to reach them. Organizers can set the group's home area here.

function safeLink(url) {
  if (!url) return null
  return /^https?:\/\//i.test(url) ? url : 'https://' + url
}

export default function OrgPage() {
  const { id } = useParams()
  const { isAdmin, organizations } = useAuth()
  const [org, setOrg] = useState(null)
  const [place, setPlace] = useState('')
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [events, setEvents] = useState([])
  const [resources, setResources] = useState([])

  const [zip, setZip] = useState('')
  const [savingZip, setSavingZip] = useState(false)
  const [zipNote, setZipNote] = useState('')
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [privacyNote, setPrivacyNote] = useState('')
  const [contactEmail, setContactEmail] = useState(null)
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailNote, setEmailNote] = useState('')

  const mine = organizations.find((o) => o.id === id)
  const canManage = isAdmin || (mine && (mine.role === 'admin' || mine.role === 'organizer'))

  async function loadOrg() {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, description, website_url, social_links, home_zip, approved, hide_from_public, show_contact_email')
      .eq('id', id)
      .eq('approved', true)
      .maybeSingle()
    if (error) console.error('Failed to load organization:', error)
    if (!data) { setMissing(true); return null }
    setOrg(data)
    const { data: em } = await supabase.rpc('get_org_contact_email', { p_org: id })
    setContactEmail(typeof em === 'string' && em ? em : null)
    if (data.home_zip) {
      const { data: z } = await supabase.from('zip_codes').select('city, state').eq('zip', data.home_zip).maybeSingle()
      setPlace(z ? z.city + ', ' + z.state : data.home_zip)
    } else {
      setPlace('')
    }
    return data
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    setMissing(false)
    Promise.all([
      loadOrg(),
      fetchCalendarEvents(),
      supabase.from('community_resources').select('id, name, description, categories, category, phone, url').eq('organization_id', id).eq('verified', true).order('name'),
    ]).then(([, ev, res]) => {
      if (!alive) return
      const now = Date.now()
      setEvents((ev.events || [])
        .filter((e) => e.organization_id === id && e.status !== 'cancelled' && new Date(e.ends_at || e.starts_at).getTime() >= now)
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)))
      if (res.error) console.error('Failed to load organization resources:', res.error)
      setResources(res.data || [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveZip(e, raw = zip) {
    e.preventDefault()
    const clean = String(raw || '').replace(/[^0-9]/g, '')
    if (clean && clean.length !== 5) { setZipNote('Enter a 5-digit zip code.'); return }
    setSavingZip(true); setZipNote('')
    const { data, error } = await supabase.rpc('set_org_home_zip', { p_org: id, p_zip: clean || null })
    setSavingZip(false)
    if (error) {
      console.error('Failed to set home zip:', error)
      setZipNote("We couldn't save that. Try again.")
      return
    }
    if (data === 'not_found') { setZipNote("We couldn't find that zip code. Check it and try again."); return }
    setZip('')
    setZipNote(data === 'cleared' ? 'Home area removed.' : 'Saved. Neighbors nearby will see your group.')
    await loadOrg()
  }

  async function togglePrivacy() {
    const next = !org.hide_from_public
    setSavingPrivacy(true); setPrivacyNote('')
    const { error } = await supabase.rpc('set_org_hide_from_public', { p_org: id, p_hide: next })
    setSavingPrivacy(false)
    if (error) {
      console.error('Failed to change group privacy:', error)
      setPrivacyNote("We couldn't save that. Try again.")
      return
    }
    setPrivacyNote(next ? 'Saved. Your group is now hidden from the public.' : 'Saved. Your group can now be seen by anyone.')
    await loadOrg()
  }

  async function toggleContactEmail() {
    const next = !org.show_contact_email
    setSavingEmail(true); setEmailNote('')
    const { error } = await supabase.rpc('set_org_show_contact_email', { p_org: id, p_show: next })
    setSavingEmail(false)
    if (error) {
      console.error('Failed to change contact email setting:', error)
      setEmailNote("We couldn't save that. Try again.")
      return
    }
    setEmailNote(next ? 'Saved. Your contact email now shows on this page.' : 'Saved. Your contact email is hidden.')
    await loadOrg()
  }

  if (loading) return <div className="cal-page"><p className="cal-empty">Loading...</p></div>
  if (missing || !org) {
    return (
      <div className="cal-page">
        <Link to="/community" className="hub-back">&#8592; Community</Link>
        <p className="cal-empty">We couldn't find this group. It may not be on VWB anymore.</p>
      </div>
    )
  }

  const website = safeLink(org.website_url)
  const social = safeLink(org.social_links?.primary)

  return (
    <div className="cal-page hub-page">
      <Link to="/community" className="hub-back">&#8592; Community</Link>
      <h1 className="hub-org-name">{org.name}</h1>
      {place && <p className="cal-sub">Based near {place}</p>}
      {mine && <p className="hub-member-note">You're part of this group</p>}
      {canManage && <Link to={'/orgs/' + id + '/dashboard'} className="btn btn-primary btn-full" style={{ minHeight: '44px', marginBottom: '0.75rem' }}>Open organization dashboard</Link>}
      {org.description && <p className="hub-org-about">{org.description}</p>}
      {(mine || canManage) && <QrShare url={window.location.origin + '/orgs/' + id} title={org.name} hint="Your friend scans this to open this group's page, see what's coming up, and get in touch." />}

      {(contactEmail && org.show_contact_email || website || social) && (
        <section className="cal-box" aria-labelledby="org-contact">
          <h2 id="org-contact">Get involved</h2>
          <div className="cal-actions">
            {contactEmail && org.show_contact_email && <a className="btn btn-primary btn-full" href={'mailto:' + contactEmail}>Email {org.name}</a>}
            {website && <a className="btn btn-outline btn-full" href={website} target="_blank" rel="noopener noreferrer">Visit their website</a>}
            {social && <a className="btn btn-outline btn-full" href={social} target="_blank" rel="noopener noreferrer">Follow them online</a>}
          </div>
        </section>
      )}

      <section className="hub-section" aria-labelledby="org-events">
        <div className="hub-section-head">
          <h2 id="org-events">Coming up</h2>
          {canManage && <Link to="/calendar/new" className="hub-more">+ Post an event</Link>}
        </div>
        <CalendarEventList events={events} emptyText="No upcoming events from this group yet." />
      </section>

      <section className="hub-section" aria-labelledby="org-resources">
        <div className="hub-section-head">
          <h2 id="org-resources">What they share</h2>
        </div>
        {resources.length === 0 && <p className="hub-empty">No resources shared yet.</p>}
        {resources.map((r) => (
          <div key={r.id} className="cal-card hub-resource">
            <span className="cal-card-title">{r.name}</span>
            {r.description && <span className="hub-org-desc">{r.description}</span>}
            <span className="cal-card-meta">{resourceCats(r).join(' · ')}</span>
            {(r.phone || r.url) && (
              <span className="hub-resource-links">
                {r.phone && <a href={'tel:' + r.phone.replace(/[^0-9+]/g, '')}>Call {r.phone}</a>}
                {r.url && <a href={safeLink(r.url)} target="_blank" rel="noopener noreferrer">Website</a>}
              </span>
            )}
          </div>
        ))}
      </section>

      {canManage && (
        <section className="cal-box" aria-labelledby="org-home">
          <h2 id="org-home">Home area</h2>
          <p className="cal-sub" style={{ marginBottom: '0.75rem' }}>
            {org.home_zip
              ? 'Your group shows up for neighbors near ' + (place || org.home_zip) + '. Only the zip code is saved, never an address.'
              : "Add the zip code where your group serves, so neighbors can find you even before you post. Only the zip code is saved, never an address."}
          </p>
          <form className="hub-search" onSubmit={(e) => saveZip(e)} noValidate>
            <label htmlFor="org-zip" className="sr-only">Home zip code</label>
            <input id="org-zip" type="text" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]*" maxLength={5} placeholder={org.home_zip || '12345'} value={zip} onChange={(e) => { setZip(e.target.value.replace(/[^0-9]/g, '')); setZipNote('') }} aria-describedby={zipNote ? 'org-zip-note' : undefined} />
            <button type="submit" className="btn btn-primary" disabled={savingZip || !zip}>{savingZip ? 'Saving...' : 'Save'}</button>
          </form>
          {org.home_zip && (
            <button type="button" className="hub-link-btn" onClick={() => { setZip(''); saveZip({ preventDefault() {} }, '') }} disabled={savingZip}>Remove home area</button>
          )}
          {zipNote && <p id="org-zip-note" className="hub-note" role="status">{zipNote}</p>}
        </section>
      )}

      {canManage && (
        <section className="cal-box" aria-labelledby="org-privacy">
          <h2 id="org-privacy">Who can see your group</h2>
          <p className="cal-sub" style={{ marginBottom: '0.75rem' }}>
            {org.hide_from_public
              ? 'Only people with a VWB account can see your group, its resources and its events. Nothing shows to the public or on the website.'
              : 'Your group, its resources and its public events can be seen by anyone, including on the website.'}
          </p>
          <button type="button" className="btn btn-outline btn-full" onClick={togglePrivacy} disabled={savingPrivacy} style={{ minHeight: '44px' }}>
            {savingPrivacy ? 'Saving...' : org.hide_from_public ? 'Show my group to the public' : 'Only show my group to people with an account'}
          </button>
          {privacyNote && <p className="hub-note" role="status">{privacyNote}</p>}
        </section>
      )}

      {canManage && contactEmail && (
        <section className="cal-box" aria-labelledby="org-email">
          <h2 id="org-email">Your contact email</h2>
          <p className="cal-sub" style={{ marginBottom: '0.75rem' }}>
            {org.show_contact_email
              ? 'Your email button shows on this page for anyone who can see your group.'
              : 'Your email is private. Nobody can see it, not even VWB admins. You can choose to show an Email button.'}
          </p>
          <button type="button" className="btn btn-outline btn-full" onClick={toggleContactEmail} disabled={savingEmail} style={{ minHeight: '44px' }}>
            {savingEmail ? 'Saving...' : org.show_contact_email ? 'Hide my email' : 'Show an Email button'}
          </button>
          {emailNote && <p className="hub-note" role="status">{emailNote}</p>}
        </section>
      )}
    </div>
  )
}
