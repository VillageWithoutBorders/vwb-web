import { useCallback, useEffect, useState } from 'react'
import { useBlockedBy } from '../utils/blockedBy'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import CommunityGuidelines from './CommunityGuidelines'
import { fetchCalendarEvent, fullDateTime, googleCalendarLink, androidCalendarLink, isAndroid, downloadIcs, eventUrl, VISIBILITY } from '../utils/calendar'
import { setReturnTo, clearReturnTo } from '../utils/returnTo'

// One event. Public route on purpose: this is the page people land on from
// the website calendar, a shared Facebook post, or a private invite link,
// often before they have an account. What they can see is decided by the
// database (get_calendar_event), not by this page.
export default function EventPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const token = params.get('invite')
  const navigate = useNavigate()
  const blockedBy = useBlockedBy()
  const { user, profile, loading: authLoading, refreshProfile } = useAuth()

  const [ev, setEv] = useState(null)
  const [signupKind, setSignupKind] = useState('help')
  const [needsText, setNeedsText] = useState('')
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [signups, setSignups] = useState([])
  const [copied, setCopied] = useState('')
  const [invited, setInvited] = useState([])
  const [inviteSearch, setInviteSearch] = useState('')
  const [inviteResults, setInviteResults] = useState([])
  const [inviteMsg, setInviteMsg] = useState('')

  const load = useCallback(async () => {
    if (user && token) {
      // Opening a private invite link while signed in saves the invite to
      // your account, so the event stays in your calendar afterwards.
      const { error } = await supabase.rpc('accept_calendar_invite', { p_id: Number(id), p_token: token })
      if (error) console.error('accept_calendar_invite', error)
    }
    const { event } = await fetchCalendarEvent(id, token)
    setEv(event)
    setLoading(false)
    if (event) {
      // Older events, or a database without the columns yet, use the defaults.
      const { data: extra } = await supabase.from('calendar_events').select('signup_kind, needs_text').eq('id', Number(id)).maybeSingle()
      setSignupKind(extra?.signup_kind === 'attend' ? 'attend' : 'help')
      setNeedsText(extra?.needs_text || '')
    }
    if (event) document.title = event.title + ' | Village Without Borders'
    if (event?.can_manage) {
      const { data, error } = await supabase.rpc('list_calendar_event_signups', { p_id: Number(id) })
      if (error) console.error('list_calendar_event_signups', error)
      setSignups(data || [])
      if (event.visibility === 'invite') {
        const { data: inv, error: invErr } = await supabase.rpc('list_calendar_event_invites', { p_event: Number(id) })
        if (invErr) console.error('list_calendar_event_invites', invErr)
        setInvited(inv || [])
      } else {
        setInvited([])
      }
    }
  }, [id, token, user])

  useEffect(() => {
    if (authLoading) return
    if (user) clearReturnTo()
    load()
  }, [authLoading, user, load])

  const canInviteByName = !!(ev && ev.can_manage && ev.visibility === 'invite')
  useEffect(() => {
    const q = inviteSearch.trim()
    if (!canInviteByName || q.length < 2) { setInviteResults([]); return }
    const t = setTimeout(async () => {
      // Only people you already know on VWB, or members of this event's
      // organization. The database decides.
      const { data, error } = await supabase.rpc('search_people_for_event', { p_event: Number(id), p_query: q.replace(/[%_]/g, '') })
      if (error) { console.error('search_people_for_event', error); return }
      const taken = new Set(invited.map((p) => p.user_id))
      setInviteResults((data || []).filter((p) => !taken.has(p.user_id)))
    }, 300)
    return () => clearTimeout(t)
  }, [inviteSearch, canInviteByName, invited, id])

  if (user && profile && !profile.guidelines_accepted_at) {
    return <CommunityGuidelines onAgree={refreshProfile} />
  }

  function goSignIn() {
    setReturnTo(window.location.pathname + window.location.search)
    navigate('/login?mode=signup')
  }

  async function signUp() {
    setBusy(true)
    setMessage('')
    const { data, error } = await supabase.rpc('signup_for_calendar_event', { p_id: Number(id), p_note: note, p_token: token })
    setBusy(false)
    if (error) { setMessage(error.message || 'Something went wrong. Try again.'); return }
    if (data === 'full') setMessage('Sorry, every spot just filled up.')
    else setMessage("You're signed up. Thank you!")
    setNote('')
    load()
  }

  async function cancelSignup() {
    setBusy(true)
    const { error } = await supabase.rpc('cancel_calendar_signup', { p_id: Number(id) })
    setBusy(false)
    if (error) { setMessage('Could not cancel. Try again.'); return }
    setMessage('Your sign-up was cancelled.')
    load()
  }

  async function inviteByName(person) {
    setInviteMsg('')
    const { error } = await supabase.rpc('invite_to_calendar_event', { p_event: Number(id), p_user: person.user_id })
    if (error) { setInviteMsg(error.message || 'Could not send that invite. Try again.'); return }
    setInviteMsg(person.display_name + ' was invited. They will get an alert.')
    setInviteSearch('')
    setInviteResults([])
    load()
  }

  async function takeBackInvite(person) {
    if (!window.confirm('Take back the invite for ' + person.display_name + '? If they signed up, that is cancelled too.')) return
    setInviteMsg('')
    const { error } = await supabase.rpc('uninvite_from_calendar_event', { p_event: Number(id), p_user: person.user_id })
    if (error) { setInviteMsg('Could not take that back. Try again.'); return }
    setInviteMsg('The invite for ' + person.display_name + ' was taken back.')
    load()
  }

  async function setStatus(status) {
    if (status === 'cancelled' && !window.confirm('Cancel this event? People will see that it was cancelled.')) return
    const { error } = await supabase.from('calendar_events').update({ status }).eq('id', ev.id)
    if (error) { alert('Could not update the event. Try again.'); return }
    load()
  }

  async function deleteEvent() {
    if (!window.confirm('Delete this event for good? This also removes everyone who signed up. This cannot be undone.')) return
    const { error } = await supabase.from('calendar_events').delete().eq('id', ev.id)
    if (error) { alert('Could not delete the event. Try again.'); return }
    navigate('/calendar')
  }

  async function copy(text, which) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      window.prompt('Copy this link:', text)
    }
  }

  async function share() {
    const url = eventUrl(ev, false)
    if (navigator.share) {
      try { await navigator.share({ title: ev.title, text: ev.title + ' - ' + fullDateTime(ev), url }) } catch { /* closed */ }
    } else {
      copy(url, 'share')
    }
  }

  const topbar = (
    <div className="cal-topbar">
      <Link to={user ? '/calendar' : '/welcome'} aria-label={user ? 'Back to the calendar' : 'Village Without Borders home'}>
        <img src="/images/vwb_header.png" alt="" width="32" height="32" style={{ borderRadius: '50%' }} />
        <span>{user ? '← Calendar' : 'Village Without Borders'}</span>
      </Link>
    </div>
  )

  if (loading || authLoading) {
    return <div>{topbar}<p className="cal-empty">Loading event...</p></div>
  }

  if (!ev && !user && token) {
    // A private link. Nothing about the event is shown until they have an account.
    return (
      <div>
        {topbar}
        <div className="cal-page">
          <div className="cal-empty">
            <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }} aria-hidden="true">&#128274;</p>
            <p style={{ fontWeight: 700, color: 'var(--text)' }}>This is a private event</p>
            <p>Someone invited you. To see it, create a free Village Without Borders account or log in.</p>
            <div className="cal-actions" style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '48px' }} onClick={goSignIn}>Create a free account</button>
              <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '48px' }} onClick={() => { setReturnTo(window.location.pathname + window.location.search); navigate('/login') }}>I already have an account</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!ev) {
    return (
      <div>
        {topbar}
        <div className="cal-page">
          <div className="cal-empty">
            <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }} aria-hidden="true">&#128274;</p>
            <p style={{ fontWeight: 700, color: 'var(--text)' }}>This event isn't available</p>
            <p>It may be private, it may have been removed, or the link may be old.</p>
            {!user && <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={goSignIn}>Log in to check</button>}
          </div>
        </div>
      </div>
    )
  }

  const full = ev.signup_limit != null && ev.signup_count >= ev.signup_limit
  const past = new Date(ev.ends_at || ev.starts_at) < new Date()
  const needsList = needsText.split('\n').map((n) => n.trim()).filter(Boolean).slice(0, 15)
  const cancelled = ev.status === 'cancelled'
  const placeHidden = ev.hide_address && !ev.address && !ev.location_name

  return (
    <div>
      {topbar}
      <main className="cal-page">
        {cancelled && <p className="cal-error" role="status"><strong>This event was cancelled.</strong></p>}

        <p className="cal-sub" style={{ margin: 0 }}>{ev.organization_name || 'Village Without Borders'}</p>
        <h1 style={{ margin: '0.25rem 0 0.75rem', fontSize: '1.6rem', lineHeight: 1.25 }}>{ev.title}</h1>

        <div className="cal-detail-row"><span aria-hidden="true">&#128197;</span><span>{fullDateTime(ev)}</span></div>
        {ev.is_online ? (
          <div className="cal-detail-row">
            <span aria-hidden="true">&#127760;</span>
            <span>
              Online event. Anyone can join from anywhere.
              {ev.online_link && /^https?:\/\//i.test(ev.online_link)
                ? <><br /><a href={ev.online_link} target="_blank" rel="noopener noreferrer" style={{ color: '#4ecca3', wordBreak: 'break-all' }}>{ev.online_link}</a></>
                : ev.hide_address ? <><br /><em style={{ color: 'var(--text-secondary)' }}>The link is shared with people who sign up.</em></> : null}
            </span>
          </div>
        ) : (
        <div className="cal-detail-row">
          <span aria-hidden="true">&#128205;</span>
          <span>
            {[ev.location_name, ev.address].filter(Boolean).join(', ') || null}
            {(ev.location_name || ev.address) && ev.town ? <br /> : null}
            {ev.town}
            {placeHidden && <><br /><em style={{ color: 'var(--text-secondary)' }}>The exact address is shared with people who sign up.</em></>}
          </span>
        </div>
        )}
        <div className="cal-detail-row">
          <span aria-hidden="true">&#128106;</span>
          <span>{ev.all_ages ? 'All ages welcome.' : 'This event is for adults 18 and over.'}{ev.all_ages && ev.teens_can_help ? ' Teens can help if they come with a parent or guardian.' : ''}</span>
        </div>
        {ev.visibility !== 'public' && (
          <div className="cal-detail-row"><span aria-hidden="true">&#128274;</span><span>{VISIBILITY[ev.visibility].label}. {VISIBILITY[ev.visibility].desc}</span></div>
        )}

        {ev.description && <p className="cal-description">{ev.description}</p>}

        {!cancelled && !past && needsList.length > 0 && (
          <section className="cal-box" aria-label="What we still need">
            <h2>Can you bring one of these?</h2>
            <ul style={{ margin: '0.25rem 0 0.5rem', paddingLeft: '1.25rem' }}>
              {needsList.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
            {ev.signup_enabled && <p className="cal-sub" style={{ marginTop: 0 }}>Tell us in the box below what you can bring.</p>}
          </section>
        )}

        {ev.signup_enabled && !cancelled && (
          <section className="cal-box" aria-label="Sign up">
            <h2>{signupKind === 'attend' ? 'Let us know you are coming' : 'Sign up to help'}</h2>
            {signupKind === 'help' && ev.all_ages && ev.teens_can_help && (
              <p className="cal-sub" style={{ marginTop: 0 }}>Teens: you can help here too. A parent or guardian signs up as an adult member and brings you. Accounts are for adults 18 and over.</p>
            )}
            {ev.signup_limit != null && (
              <p className="cal-sub" style={{ marginTop: 0 }}>{ev.signup_count} of {ev.signup_limit} spots filled</p>
            )}
            {message && <p role="status" style={{ color: '#7fe0bf' }}>{message}</p>}
            {past ? (
              <p className="cal-sub">This event has already happened.</p>
            ) : full && !ev.is_signed_up ? (
              <p className="cal-sub">All spots are filled.</p>
            ) : !user ? (
              <div className="cal-actions">
                <p className="cal-sub" style={{ marginTop: 0 }}>Signing up takes a free Village Without Borders account, so organizers know who's coming.</p>
                <button type="button" className="btn btn-primary btn-full" onClick={goSignIn}>Sign up (create an account or log in)</button>
              </div>
            ) : ev.is_signed_up ? (
              <div className="cal-actions">
                <p style={{ margin: 0, fontWeight: 700, color: '#7fe0bf' }}>You're signed up.</p>
                <button type="button" className="btn btn-outline btn-full" onClick={cancelSignup} disabled={busy}>Cancel my sign-up</button>
              </div>
            ) : (
              <div className="cal-actions">
                <div className="form-field" style={{ marginBottom: 0 }}>
                  <label htmlFor="signup-note">{signupKind === 'attend' ? (needsList.length > 0 ? 'What can you bring? How many are coming with you? (optional)' : 'How many are coming with you? Anything we should know? (optional)') : 'Anything the organizers should know? (optional)'}</label>
                  <textarea id="signup-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={signupKind === 'attend' ? 'For example: 3 of us, 2 adults and a child' : 'For example: I can bring a truck, or I need a ride'} />
                </div>
                <button type="button" className="btn btn-primary btn-full" onClick={signUp} disabled={busy}>{busy ? (signupKind === 'attend' ? 'Saving...' : 'Signing you up...') : (signupKind === 'attend' ? "I'm coming" : 'Count me in')}</button>
              </div>
            )}
          </section>
        )}

        {!cancelled && (
          <section className="cal-box" aria-label="Save or share">
            <h2>Save or share</h2>
            <div className="cal-actions">
              {isAndroid() ? (
                <>
                  <a className="btn btn-outline btn-full" href={androidCalendarLink(ev)}>Add to my calendar</a>
                  <button type="button" className="btn btn-outline btn-full" onClick={() => downloadIcs(ev)}>Download a calendar file</button>
                </>
              ) : (
                <>
                  <a className="btn btn-outline btn-full" href={googleCalendarLink(ev)} target="_blank" rel="noopener noreferrer">Add to Google Calendar</a>
                  <button type="button" className="btn btn-outline btn-full" onClick={() => downloadIcs(ev)}>Add to Apple or Outlook calendar</button>
                </>
              )}
              {ev.visibility === 'public' && (
                <button type="button" className="btn btn-outline btn-full" onClick={share}>{copied === 'share' ? 'Link copied!' : 'Share this event'}</button>
              )}
            </div>
          </section>
        )}

        {ev.can_manage && (
          <section className="cal-box" aria-label="Organizer tools">
            <h2>Organizer tools</h2>
            <div className="cal-actions">
              {ev.visibility === 'invite' && ev.invite_token && (
                <button type="button" className="btn btn-primary btn-full" onClick={() => copy(eventUrl(ev, true), 'invite')}>
                  {copied === 'invite' ? 'Invite link copied!' : 'Copy private invite link'}
                </button>
              )}
              <button type="button" className="btn btn-outline btn-full" onClick={() => navigate('/calendar/' + ev.id + '/edit')}>Edit event</button>
              {cancelled
                ? <button type="button" className="btn btn-outline btn-full" onClick={() => setStatus('active')}>Bring event back</button>
                : <button type="button" className="btn btn-outline btn-full" onClick={() => setStatus('cancelled')}>Cancel event</button>}
              <button type="button" className="link-button" style={{ color: '#ff9f9f', minHeight: '44px' }} onClick={deleteEvent}>Delete event</button>
            </div>
            {ev.visibility === 'invite' && (
              <>
                <h2 style={{ marginTop: '1rem' }}>Invite people by name ({invited.length} invited)</h2>
                <div className="form-field" style={{ marginBottom: '0.5rem' }}>
                  <label htmlFor="invite-search">Search for someone you know on Village Without Borders</label>
                  <input id="invite-search" type="search" autoComplete="off" value={inviteSearch} onChange={(e) => setInviteSearch(e.target.value)} placeholder="Start typing a name" />
                </div>
                {inviteMsg && <p className="cal-sub" role="status" style={{ marginTop: 0 }}>{inviteMsg}</p>}
                {inviteSearch.trim().length >= 2 && inviteResults.length === 0 && (
                  <p className="cal-sub" style={{ marginTop: 0 }}>No match. You can only invite people you already know here, such as someone you have messaged, vouched for, or share a group with.</p>
                )}
                {inviteResults.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: '0 0 0.75rem', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {inviteResults.map((p) => (
                      <li key={p.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', minHeight: '44px' }}>
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.display_name}</span>
                        <button type="button" className="btn btn-primary" style={{ minHeight: '44px', flex: 'none' }} onClick={() => inviteByName(p)}>Invite</button>
                      </li>
                    ))}
                  </ul>
                )}
                {invited.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {invited.map((p) => (
                      <li key={p.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', minHeight: '44px' }}>
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                          {p.display_name}
                          {p.signed_up ? <span style={{ color: '#7fe0bf' }}> (signed up)</span> : <span style={{ color: 'var(--text-secondary)' }}> (invited)</span>}
                        </span>
                        <button type="button" className="btn btn-outline" style={{ minHeight: '44px', flex: 'none' }} onClick={() => takeBackInvite(p)}>Take back</button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {ev.signup_enabled && (
              <>
                <h2 style={{ marginTop: '1rem' }}>Who's signed up ({signups.length})</h2>
                {signups.length === 0 ? <p className="cal-sub">Nobody yet.</p> : (
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.6 }}>
                    {signups.map((s) => (
                      <li key={s.user_id}>
                        {blockedBy.has(s.user_id) ? <span>{s.display_name}</span> : <Link to={'/u/' + s.user_id} style={{ color: '#4ecca3' }}>{s.display_name}</Link>}
                        {s.note ? <span style={{ color: 'var(--text-secondary)' }}>: {s.note}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
