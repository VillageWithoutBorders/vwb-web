import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { fetchCalendarEvents, filterByDistance, savePlace, startingOrigin, memberArea, dayLabel } from '../utils/calendar'
import { CalendarLocationBar, CalendarEventCard } from '../components/CalendarParts'
import { CATEGORIES, CAT_ICONS } from '../utils/resourceCategories'

// Community: what's happening and who's organizing near you, then a way
// to find help, then a way to start something. The place comes from the
// same saved choice the Calendar uses, and is never guessed.

const SOON_COUNT = 5
const ORG_COUNT = 6

function needsVolunteers(ev) {
  if (!ev.signup_enabled || ev.is_signed_up || ev.status === 'cancelled') return false
  return ev.signup_limit == null || ev.signup_count < ev.signup_limit
}

function OrgCard({ org }) {
  const where = [org.home_place, org.miles != null ? (org.miles < 1 ? 'nearby' : Math.round(org.miles) + ' mi away') : null].filter(Boolean).join(' · ')
  return (
    <Link className="cal-card hub-org" to={'/orgs/' + org.id}>
      <span className="cal-card-title">{org.name}</span>
      {org.description && <span className="hub-org-desc">{org.description}</span>}
      {org.next_event_title ? (
        <span className="hub-org-next">Next: {org.next_event_title}, {dayLabel(org.next_event_starts_at)}</span>
      ) : (
        <span className="cal-card-meta">No events posted yet</span>
      )}
      {where && <span className="cal-card-meta">{where}</span>}
    </Link>
  )
}

export default function Community() {
  const { profile, isAdmin, organizations } = useAuth()
  const navigate = useNavigate()

  const [origin, setOrigin] = useState(() => startingOrigin(profile))
  const [miles, setMiles] = useState(25)
  const [changingPlace, setChangingPlace] = useState(false)

  const [events, setEvents] = useState([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [eventsError, setEventsError] = useState(false)

  const [orgs, setOrgs] = useState([])
  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [orgsError, setOrgsError] = useState(false)
  const [showAllOrgs, setShowAllOrgs] = useState(false)

  const [search, setSearch] = useState('')

  // "Bring your organization" request form
  const emptyOrgForm = { name: '', description: '', email: '', website: '', social: '' }
  const [pendingOrg, setPendingOrg] = useState(null)
  const [showOrgForm, setShowOrgForm] = useState(false)
  const [orgForm, setOrgForm] = useState(emptyOrgForm)
  const [orgSending, setOrgSending] = useState(false)
  const [orgError, setOrgError] = useState('')
  const [orgSent, setOrgSent] = useState(false)

  const managedOrgs = organizations.filter((o) => o.role === 'admin' || o.role === 'organizer')
  const canPost = isAdmin || managedOrgs.length > 0

  // The profile can arrive after the page first draws.
  useEffect(() => {
    if (!origin && profile) {
      const start = startingOrigin(profile)
      if (start) setOrigin(start)
    }
  }, [profile]) // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    let alive = true
    fetchCalendarEvents().then(({ events: evs, error }) => {
      if (!alive) return
      setEvents(evs)
      setEventsError(!!error)
      setLoadingEvents(false)
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    setLoadingOrgs(true)
    supabase
      .rpc('nearby_organizations', { p_lat: origin?.lat ?? null, p_lng: origin?.lng ?? null, p_miles: miles })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('Failed to load nearby organizations:', error)
        setOrgs(data || [])
        setOrgsError(!!error)
        setLoadingOrgs(false)
      })
    return () => { alive = false }
  }, [origin?.lat, origin?.lng, miles])

  const soon = useMemo(() => {
    const now = Date.now()
    const upcoming = filterByDistance(events, origin, miles)
      .filter((ev) => ev.status !== 'cancelled' && new Date(ev.ends_at || ev.starts_at).getTime() >= now)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    // Events that still need hands come first, then everything else, by date.
    const help = upcoming.filter(needsVolunteers)
    const rest = upcoming.filter((ev) => !needsVolunteers(ev))
    return [...help, ...rest].slice(0, SOON_COUNT)
  }, [events, origin, miles])

  const orgsWithoutHome = managedOrgs.filter((m) => {
    const o = orgs.find((x) => x.id === m.id)
    return o && !o.home_zip
  })

  function changeOrigin(o) {
    setOrigin(o)
    savePlace(o)
    setChangingPlace(false)
  }

  function runSearch(e) {
    e.preventDefault()
    const q = search.trim()
    navigate('/community/resources' + (q ? '?q=' + encodeURIComponent(q) : ''))
  }

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

  const shownOrgs = showAllOrgs ? orgs : orgs.slice(0, ORG_COUNT)

  return (
    <div className="cal-page hub-page">
      <div className="cal-head">
        <div>
          <h1>Community</h1>
          <p className="cal-sub">What's happening and who's organizing near you</p>
        </div>
      </div>

      {/* Your area */}
      {origin && !changingPlace ? (
        <div className="hub-place">
          <p role="status">Near <strong>{origin.name}</strong>, within {miles} miles</p>
          <button type="button" className="btn btn-outline" onClick={() => setChangingPlace(true)}>Change</button>
        </div>
      ) : (
        <>
          <CalendarLocationBar origin={origin} onOriginChange={changeOrigin} miles={miles} onMilesChange={setMiles} homeArea={memberArea(profile)} />
          {origin && changingPlace && (
            <button type="button" className="hub-link-btn" onClick={() => setChangingPlace(false)}>Done</button>
          )}
        </>
      )}

      {/* 1. Happening soon */}
      <section className="hub-section" aria-labelledby="hub-soon">
        <div className="hub-section-head">
          <h2 id="hub-soon">Happening soon</h2>
          <Link to="/calendar" className="hub-more">Full calendar</Link>
        </div>
        {loadingEvents && <p className="cal-empty">Loading events...</p>}
        {!loadingEvents && eventsError && <p className="cal-error">We couldn't load events right now. Check your connection and try again.</p>}
        {!loadingEvents && !eventsError && soon.length === 0 && (
          <p className="hub-empty">Nothing on the calendar nearby yet.{origin ? ' Try a wider distance.' : ''}</p>
        )}
        {!loadingEvents && !eventsError && soon.map((ev) => (
          <div key={ev.id}>
            <p className="hub-day">{dayLabel(ev.starts_at)}</p>
            <CalendarEventCard ev={ev} />
          </div>
        ))}
      </section>

      {/* 2. Who's organizing nearby */}
      <section className="hub-section" aria-labelledby="hub-orgs">
        <div className="hub-section-head">
          <h2 id="hub-orgs">Who's organizing nearby</h2>
        </div>
        {loadingOrgs && <p className="cal-empty">Loading groups...</p>}
        {!loadingOrgs && orgsError && <p className="cal-error">We couldn't load local groups right now. Try again in a bit.</p>}
        {!loadingOrgs && !orgsError && orgs.length === 0 && (
          <p className="hub-empty">No groups have posted near here yet. Know one that should be here? Invite them below.</p>
        )}
        {!loadingOrgs && !orgsError && shownOrgs.map((org) => <OrgCard key={org.id} org={org} />)}
        {!loadingOrgs && orgs.length > ORG_COUNT && (
          <button type="button" className="btn btn-outline btn-full" onClick={() => setShowAllOrgs((v) => !v)}>
            {showAllOrgs ? 'Show fewer' : 'Show all ' + orgs.length + ' groups'}
          </button>
        )}
      </section>

      {/* 3. Find help */}
      <section className="hub-section" aria-labelledby="hub-help">
        <div className="hub-section-head">
          <h2 id="hub-help">Find help</h2>
          <Link to="/community/resources" className="hub-more">All resources</Link>
        </div>
        <form className="hub-search" role="search" onSubmit={runSearch}>
          <label htmlFor="hub-search" className="sr-only">Search resources</label>
          <input id="hub-search" type="search" inputMode="search" enterKeyHint="search" placeholder="What do you need? (food, rent, rides...)" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="submit" className="btn btn-primary">Search</button>
        </form>
        <div className="hub-tiles">
          {CATEGORIES.map((cat) => (
            <Link key={cat} className="hub-tile" to={'/community/resources?cat=' + encodeURIComponent(cat)}>
              <span className="hub-tile-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: CAT_ICONS[cat] || '&#128204;' }} />
              <span>{cat}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* 4. Start something */}
      <section className="hub-section" aria-labelledby="hub-start">
        <div className="hub-section-head">
          <h2 id="hub-start">Start something</h2>
        </div>
        {orgsWithoutHome.map((o) => (
          <Link key={o.id} className="cal-card hub-nudge" to={'/orgs/' + o.id}>
            <span className="cal-card-title">Add a home area for {o.name}</span>
            <span className="cal-card-meta">So neighbors can find your group even before you post.</span>
          </Link>
        ))}
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

            <label htmlFor="org-name">Organization name (required)</label>
            <input id="org-name" type="text" autoComplete="organization" maxLength={120} required aria-invalid={orgError && !orgForm.name.trim() ? 'true' : undefined} value={orgForm.name} onChange={setOrgField('name')} />

            <label htmlFor="org-desc">What does your group do?</label>
            <textarea id="org-desc" rows={3} maxLength={1000} value={orgForm.description} onChange={setOrgField('description')} />

            <label htmlFor="org-email">Contact email</label>
            <input id="org-email" type="email" inputMode="email" autoComplete="email" maxLength={200} value={orgForm.email} onChange={setOrgField('email')} />

            <label htmlFor="org-website">Website</label>
            <input id="org-website" type="url" inputMode="url" autoComplete="url" placeholder="https://" maxLength={300} value={orgForm.website} onChange={setOrgField('website')} />

            <label htmlFor="org-social">One social media link</label>
            <input id="org-social" type="url" inputMode="url" placeholder="https://" maxLength={300} value={orgForm.social} onChange={setOrgField('social')} />

            {orgError && <p className="cal-error" role="alert">{orgError}</p>}

            <button type="submit" className="btn btn-primary btn-full" disabled={orgSending}>{orgSending ? 'Sending...' : 'Send request'}</button>
            <button type="button" className="btn btn-outline btn-full" onClick={() => { setShowOrgForm(false); setOrgError('') }}>Cancel</button>
          </form>
        )}
        <div className="cal-actions">
          {canPost && (
            <Link className="btn btn-primary btn-full" to="/calendar/new">Post an event</Link>
          )}
          <Link className="btn btn-outline btn-full" to="/groups">Start a group with neighbors</Link>
          {managedOrgs.length === 0 && !pendingOrg && !showOrgForm && (
            <button type="button" className="btn btn-outline btn-full" onClick={() => setShowOrgForm(true)}>Bring your organization to VWB</button>
          )}
        </div>
      </section>
    </div>
  )
}
