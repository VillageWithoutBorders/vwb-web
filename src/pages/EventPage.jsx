import Icon from '../components/Icon'
import { useCallback, useEffect, useState } from 'react'
import EventShifts from '../components/EventShifts'
import { useBlockedBy } from '../utils/blockedBy'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import CommunityGuidelines from './CommunityGuidelines'
import { fetchCalendarEvent, fullDateTime, eventUrl, mapLink, VISIBILITY } from '../utils/calendar'
import { setReturnTo, clearReturnTo } from '../utils/returnTo'
import { startConversation } from '../utils/startConversation'
import { UserName } from '../components/AvatarDisplay'
import Linkify from '../components/Linkify'
import AddToCalendar from '../components/AddToCalendar'
import { askConfirm, tell } from '../components/AdminDialog'
import { useT, t as tr, getLang } from '../utils/lang'

// One event. Public route on purpose: this is the page people land on from
// the website calendar, a shared Facebook post, or a private invite link,
// often before they have an account. What they can see is decided by the
// database (get_calendar_event), not by this page.
export default function EventPage() {
  const t = useT()
  const { id } = useParams()
  const [params] = useSearchParams()
  const token = params.get('invite')
  const navigate = useNavigate()
  const blockedBy = useBlockedBy()
  const { user, profile, loading: authLoading, refreshProfile } = useAuth()

  const [ev, setEv] = useState(null)
  const [signupKind, setSignupKind] = useState('help')
  const [needsText, setNeedsText] = useState('')
  const [extraText, setExtraText] = useState('')
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [signups, setSignups] = useState([])
  const [hasShifts, setHasShifts] = useState(false)
  const [copied, setCopied] = useState('')
  const [invited, setInvited] = useState([])
  const [inviteSearch, setInviteSearch] = useState('')
  const [inviteResults, setInviteResults] = useState([])
  const [inviteMsg, setInviteMsg] = useState('')
  const [updates, setUpdates] = useState([])
  const [updateBody, setUpdateBody] = useState('')
  const [updateAudience, setUpdateAudience] = useState('all')
  const [updateMsg, setUpdateMsg] = useState('')
  const [updateBusy, setUpdateBusy] = useState(false)
  const [attendeeMsg, setAttendeeMsg] = useState('')
  const [organizers, setOrganizers] = useState([])
  const [organizerMsg, setOrganizerMsg] = useState('')

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
      // Its own query so the page still loads before the extra_text column exists.
      const { data: more } = await supabase.from('calendar_events').select('extra_text').eq('id', Number(id)).maybeSingle()
      setExtraText(more?.extra_text || '')
    }
    if (event) document.title = event.title + ' | Village Without Borders'
    if (event && user) {
      // Updates from the organizers. The database only returns them to the
      // organizers and the people each one was meant for.
      const { data: ups, error: upErr } = await supabase.rpc('list_calendar_event_updates', { p_event: Number(id) })
      if (upErr) console.error('list_calendar_event_updates', upErr)
      setUpdates(ups || [])
    } else {
      setUpdates([])
    }
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
    const timer = setTimeout(async () => {
      // Only people you already know on VWB, or members of this event's
      // organization. The database decides.
      const { data, error } = await supabase.rpc('search_people_for_event', { p_event: Number(id), p_query: q.replace(/[%_]/g, '') })
      if (error) { console.error('search_people_for_event', error); return }
      const taken = new Set(invited.map((p) => p.user_id))
      setInviteResults((data || []).filter((p) => !taken.has(p.user_id)))
    }, 300)
    return () => clearTimeout(timer)
  }, [inviteSearch, canInviteByName, invited, id])

  useEffect(() => {
    if (!user || !ev) { setOrganizers([]); return }
    let alive = true
    supabase.rpc('list_event_organizers', { p_event: Number(id), p_token: token || null }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('list_event_organizers', error); return }
      setOrganizers(data || [])
    })
    return () => { alive = false }
  }, [user, ev?.id, id, token]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (error) { setMessage(error.message || tr('Something went wrong. Try again.')); return }
    if (data === 'full') setMessage(tr('Sorry, every spot just filled up.'))
    else setMessage(tr("You're signed up. Thank you!"))
    setNote('')
    load()
  }

  async function cancelSignup() {
    setBusy(true)
    const { error } = await supabase.rpc('cancel_calendar_signup', { p_id: Number(id) })
    setBusy(false)
    if (error) { setMessage(tr('Could not cancel. Try again.')); return }
    setMessage(tr('Your sign-up was cancelled.'))
    load()
  }

  async function sendUpdate() {
    if (updateBusy) return
    const text = updateBody.trim()
    if (!text) { setUpdateMsg(tr('Write your update first.')); return }
    setUpdateBusy(true)
    setUpdateMsg('')
    const { data, error } = await supabase.rpc('send_calendar_event_update', { p_event: Number(id), p_body: text, p_audience: updateAudience })
    setUpdateBusy(false)
    if (error) { setUpdateMsg(error.message || tr('Could not send that. Try again.')); return }
    setUpdateMsg(data === 1 ? tr('Sent to 1 person.') : tr('Sent to {n} people.', { n: data || 0 }))
    setUpdateBody('')
    load()
  }


  async function messageOrganizer(person) {
    if (!user) return
    setOrganizerMsg('')
    const { id: convoId, error, notice } = await startConversation(user.id, person.user_id)
    if (error) { setOrganizerMsg(tr(error)); return }
    if (notice) { setOrganizerMsg(tr(notice)); return }
    navigate('/conversation/' + convoId)
  }

  async function messagePerson(person) {
    if (!user) return
    setAttendeeMsg('')
    const { id: convoId, error, notice } = await startConversation(user.id, person.user_id)
    if (error) { setAttendeeMsg(tr(error)); return }
    if (notice) { setAttendeeMsg(tr(notice)); return }
    navigate('/conversation/' + convoId)
  }

  async function inviteByName(person) {
    setInviteMsg('')
    const { error } = await supabase.rpc('invite_to_calendar_event', { p_event: Number(id), p_user: person.user_id })
    if (error) { setInviteMsg(error.message || tr('Could not send that invite. Try again.')); return }
    setInviteMsg(tr('{name} was invited. They will get an alert.', { name: person.display_name }))
    setInviteSearch('')
    setInviteResults([])
    load()
  }

  async function takeBackInvite(person) {
    if (!(await askConfirm(tr('Take back the invite for {name}? If they signed up, that is cancelled too.', { name: person.display_name })))) return
    setInviteMsg('')
    const { error } = await supabase.rpc('uninvite_from_calendar_event', { p_event: Number(id), p_user: person.user_id })
    if (error) { setInviteMsg(tr('Could not take that back. Try again.')); return }
    setInviteMsg(tr('The invite for {name} was taken back.', { name: person.display_name }))
    load()
  }

  async function setStatus(status) {
    if (status === 'cancelled') {
      const n = new Set([...signups.map((x) => x.user_id), ...invited.map((x) => x.user_id)]).size
      const who = n === 0 ? tr('People will see that it was cancelled.') : (n === 1 ? tr('1 person who signed up or was invited will get an alert.') : tr('{n} people who signed up or were invited will get an alert.', { n }))
      if (!(await askConfirm(tr('Cancel this event?') + ' ' + who, { yes: tr('Cancel the event'), no: tr('Keep it'), danger: true }))) return
    }
    const { error } = await supabase.from('calendar_events').update({ status }).eq('id', ev.id)
    if (error) { tell(tr('Could not update the event. Try again.'), { tone: 'error' }); return }
    load()
  }

  async function deleteEvent() {
    const n = new Set([...signups.map((x) => x.user_id), ...invited.map((x) => x.user_id)]).size
    const warn = n === 0
      ? tr('Delete this event for good? This cannot be undone.')
      : (n === 1 ? tr('Delete this event for good? It also removes 1 person who signed up or was invited, and nobody is told. To let them know, cancel the event instead. This cannot be undone.') : tr('Delete this event for good? It also removes {n} people who signed up or were invited, and nobody is told. To let them know, cancel the event instead. This cannot be undone.', { n }))
    if (!(await askConfirm(warn, { yes: tr('Delete for good'), no: tr('Keep it'), danger: true }))) return
    const { error } = await supabase.from('calendar_events').delete().eq('id', ev.id)
    if (error) { tell(tr('Could not delete the event. Try again.'), { tone: 'error' }); return }
    navigate('/calendar')
  }

  async function copy(text, which) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      window.prompt(tr('Copy this link:'), text)
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
      <Link to={user ? '/calendar' : '/welcome'} aria-label={user ? t('Back to the calendar') : t('Village Without Borders home')}>
        <img src="/images/vwb_header-v2.png" alt="" width="32" height="32" style={{ borderRadius: '50%' }} />
        <span>{user ? '← ' + t('Calendar') : 'Village Without Borders'}</span>
      </Link>
    </div>
  )

  if (loading || authLoading) {
    return <div>{topbar}<p className="cal-empty">{t('Loading event...')}</p></div>
  }

  if (!ev && !user && token) {
    // A private link. Nothing about the event is shown until they have an account.
    return (
      <div>
        {topbar}
        <div className="cal-page">
          <div className="cal-empty">
            <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }} aria-hidden="true"><Icon name="lock" /></p>
            <p style={{ fontWeight: 700, color: 'var(--text)' }}>{t('This is a private event')}</p>
            <p>{t('Someone invited you. To see it, create a free Village Without Borders account or log in.')}</p>
            <div className="cal-actions" style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '48px' }} onClick={goSignIn}>{t('Create a free account')}</button>
              <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '48px' }} onClick={() => { setReturnTo(window.location.pathname + window.location.search); navigate('/login') }}>{t('I already have an account')}</button>
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
            <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }} aria-hidden="true"><Icon name="lock" /></p>
            <p style={{ fontWeight: 700, color: 'var(--text)' }}>{t("This event isn't available")}</p>
            <p>{t('It may be private, it may have been removed, or the link may be old.')}</p>
            {!user && <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={goSignIn}>{t('Log in to check')}</button>}
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
  // The town shows once: not again under an address that already names it (Oct 28).
  const townInAddress = !!(ev.town && ev.address && ev.address.toLowerCase().includes(ev.town.split(',')[0].trim().toLowerCase()))

  return (
    <div>
      {/* Inside the app frame the top bar and Back are already there. */}
      {!user && topbar}
      <main className="cal-page">
        {cancelled && <p className="cal-error" role="status"><strong>{t('This event was cancelled.')}</strong></p>}

        <p className="cal-sub" style={{ margin: 0 }}>{ev.organization_name || 'Village Without Borders'}</p>
        <h1 style={{ margin: '0.25rem 0 0.75rem', fontSize: '1.6rem', lineHeight: 1.25 }}>{ev.title}</h1>

        <div className="cal-detail-row">
          <span aria-hidden="true"><Icon name="calendar" /></span>
          {cancelled ? <span>{fullDateTime(ev)}</span> : (
            <span><AddToCalendar ev={ev}>{fullDateTime(ev)}</AddToCalendar></span>
          )}
        </div>
        {ev.is_online ? (
          <div className="cal-detail-row">
            <span aria-hidden="true"><Icon name="globe" /></span>
            <span>
              {t('Online event. Anyone can join from anywhere.')}
              {ev.online_link && /^https?:\/\//i.test(ev.online_link)
                ? <><br /><a href={ev.online_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>{ev.online_link}</a></>
                : ev.hide_address ? <><br /><em style={{ color: 'var(--text-secondary)' }}>{t('The link is shared with people who sign up.')}</em></> : null}
            </span>
          </div>
        ) : (
        <div className="cal-detail-row">
          <span aria-hidden="true"><Icon name="pin" /></span>
          <span>
            {mapLink(ev) && (ev.location_name || ev.address) ? (
              <a href={mapLink(ev)} {...(mapLink(ev).startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})} style={{ color: 'var(--accent)' }}>
                {[ev.location_name, ev.address].filter(Boolean).join(', ')}
                {ev.town && !townInAddress ? <><br />{ev.town}</> : null}
              </a>
            ) : (
              <>
                {[ev.location_name, ev.address].filter(Boolean).join(', ') || null}
                {(ev.location_name || ev.address) && ev.town && !townInAddress ? <br /> : null}
                {!townInAddress && ev.town}
              </>
            )}
            {placeHidden && <><br /><em style={{ color: 'var(--text-secondary)' }}>{t('The exact address is shared with people who sign up.')}</em></>}
          </span>
        </div>
        )}
        <div className="cal-detail-row">
          <span aria-hidden="true"><Icon name="people" /></span>
          <span>{ev.all_ages ? t('All ages welcome.') : t('This event is for adults 18 and over.')}{ev.all_ages && ev.teens_can_help ? ' ' + t('Teens can help if they come with a parent or guardian.') : ''}</span>
        </div>
        {ev.visibility !== 'public' && (
          <div className="cal-detail-row"><span aria-hidden="true"><Icon name="lock" /></span><span>{t(VISIBILITY[ev.visibility].label)}. {t(VISIBILITY[ev.visibility].desc)}</span></div>
        )}

        {ev.description && <p className="cal-description"><Linkify text={ev.description} /></p>}

        {organizers.length > 0 && (
          <section className="cal-box" aria-label={t('Contact the organizers')}>
            <h2>{t('Questions? Message the organizers')}</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {organizers.map((o) => (
                <li key={o.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', minHeight: '44px' }}>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}><UserName userId={o.user_id} name={o.display_name} /></span>
                  <button type="button" className="btn btn-outline" style={{ minHeight: '44px', flex: 'none' }} onClick={() => messageOrganizer(o)}>{t('Message')}</button>
                </li>
              ))}
            </ul>
            {organizerMsg && <p className="cal-sub" role="status" style={{ marginBottom: 0 }}>{organizerMsg}</p>}
          </section>
        )}

        {extraText.trim() && (
          <section className="cal-box" aria-label={t('More from the organizers')}>
            <p style={{ margin: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}><Linkify text={extraText} /></p>
          </section>
        )}

        {!cancelled && !past && needsList.length > 0 && (
          <section className="cal-box" aria-label={t('What we still need')}>
            <h2>{t('Can you bring one of these?')}</h2>
            <ul style={{ margin: '0.25rem 0 0.5rem', paddingLeft: '1.25rem' }}>
              {needsList.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
            {ev.signup_enabled && <p className="cal-sub" style={{ marginTop: 0 }}>{t('Tell us in the box below what you can bring.')}</p>}
          </section>
        )}

        <EventShifts eventId={id} token={token} user={user} canManage={ev.can_manage} past={past} cancelled={cancelled} onSignIn={goSignIn} onChanged={load} onLoaded={(n) => setHasShifts(n > 0)} />

        {ev.signup_enabled && !cancelled && !hasShifts && (
          <section className="cal-box" aria-label={t('Sign up')}>
            <h2>{signupKind === 'attend' ? t('Let us know you are coming') : t('Sign up to help')}</h2>
            {signupKind === 'help' && ev.all_ages && ev.teens_can_help && (
              <p className="cal-sub" style={{ marginTop: 0 }}>{t('Teens: you can help here too. A parent or guardian signs up as an adult member and brings you. Accounts are for adults 18 and over.')}</p>
            )}
            {ev.signup_limit != null && (
              <p className="cal-sub" style={{ marginTop: 0 }}>{t('{n} of {total} spots filled', { n: ev.signup_count, total: ev.signup_limit })}</p>
            )}
            {message && <p role="status" style={{ color: 'var(--accent)' }}>{message}</p>}
            {past ? (
              <p className="cal-sub">{t('This event has already happened.')}</p>
            ) : full && !ev.is_signed_up ? (
              <p className="cal-sub">{t('All spots are filled.')}</p>
            ) : !user ? (
              <div className="cal-actions">
                <p className="cal-sub" style={{ marginTop: 0 }}>{t("Signing up takes a free Village Without Borders account, so organizers know who's coming.")}</p>
                <button type="button" className="btn btn-primary btn-full" onClick={goSignIn}>{t('Sign up (create an account or log in)')}</button>
              </div>
            ) : ev.is_signed_up ? (
              <div className="cal-actions">
                <p style={{ margin: 0, fontWeight: 700, color: 'var(--accent)' }}>{t("You're signed up.")}</p>
                <button type="button" className="btn btn-outline btn-full" onClick={cancelSignup} disabled={busy}>{t('Cancel my sign-up')}</button>
              </div>
            ) : (
              <div className="cal-actions">
                <div className="form-field" style={{ marginBottom: 0 }}>
                  <label htmlFor="signup-note">{signupKind === 'attend' ? (needsList.length > 0 ? t('What can you bring? How many are coming with you? (optional)') : t('How many are coming with you? Anything we should know? (optional)')) : t('Anything the organizers should know? (optional)')}</label>
                  <textarea id="signup-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={signupKind === 'attend' ? t('For example: 3 of us, 2 adults and a child') : t('For example: I can bring a truck, or I need a ride')} />
                </div>
                <button type="button" className="btn btn-primary btn-full" onClick={signUp} disabled={busy}>{busy ? (signupKind === 'attend' ? t('Saving...') : t('Signing you up...')) : (signupKind === 'attend' ? t("I'm coming") : t('Count me in'))}</button>
              </div>
            )}
          </section>
        )}

        {updates.length > 0 && (
          <section className="cal-box" aria-label={t('Updates from the organizers')}>
            <h2>{t('Updates from the organizers')}</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {updates.map((u) => (
                <li key={u.id}>
                  <div style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{u.body}</div>
                  <div className="cal-sub" style={{ margin: '0.15rem 0 0' }}>{new Date(u.created_at).toLocaleString(getLang() === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!cancelled && (
          <section className="cal-box" aria-label={t('Save or share')}>
            <h2>{t('Save or share')}</h2>
            <div className="cal-actions">
              <AddToCalendar ev={ev} asButton>{t('Add to my calendar')}</AddToCalendar>
              {ev.visibility === 'public' && (
                <button type="button" className="btn btn-outline btn-full" onClick={share}>{copied === 'share' ? t('Link copied!') : t('Share this event')}</button>
              )}
            </div>
          </section>
        )}

        {ev.can_manage && (
          <section className="cal-box" aria-label={t('Organizer tools')}>
            <h2>{t('Organizer tools')}</h2>
            <div className="cal-actions">
              {ev.visibility === 'invite' && ev.invite_token && (
                <button type="button" className="btn btn-primary btn-full" onClick={() => copy(eventUrl(ev, true), 'invite')}>
                  {copied === 'invite' ? t('Invite link copied!') : t('Copy private invite link')}
                </button>
              )}
              <button type="button" className="btn btn-outline btn-full" onClick={() => navigate('/calendar/' + ev.id + '/edit')}>{t('Edit event')}</button>
              {cancelled
                ? <button type="button" className="btn btn-outline btn-full" onClick={() => setStatus('active')}>{t('Bring event back')}</button>
                : <button type="button" className="btn btn-outline btn-full" onClick={() => setStatus('cancelled')}>{t('Cancel event')}</button>}
              <button type="button" className="link-button" style={{ color: 'var(--danger)', minHeight: '44px' }} onClick={deleteEvent}>{t('Delete event')}</button>
            </div>
            <h2 style={{ marginTop: '1rem' }}>{t('Message everyone coming')}</h2>
            {(() => {
              const everyone = new Set([...signups.map((x) => x.user_id), ...invited.map((x) => x.user_id)]).size
              const hasInvited = ev.visibility === 'invite' && invited.length > 0
              const reach = updateAudience === 'signed_up' || !hasInvited ? signups.length : everyone
              return (
                <>
                  {reach === 0 && <p className="cal-sub" style={{ marginTop: 0 }}>{ev.visibility === 'invite' ? t('Nobody to send to yet. An update goes to people who sign up or are invited.') : t('Nobody to send to yet. An update goes to people who sign up.')}</p>}
                  <div className="form-field" style={{ marginBottom: '0.5rem' }}>
                    <label htmlFor="update-body">{t('Your update (each person gets an alert)')}</label>
                    <textarea id="update-body" rows={3} maxLength={500} value={updateBody} onChange={(e) => setUpdateBody(e.target.value)} placeholder={t('For example: We moved to the pavilion. Bring a coat.')} />
                    <small>{t('{n} of {total}', { n: updateBody.length, total: 500 })}</small>
                  </div>
                  {hasInvited && (
                    <fieldset className="form-field" style={{ border: 'none', padding: 0, margin: '0 0 0.5rem' }}>
                      <legend style={{ fontWeight: 600, marginBottom: '0.3rem' }}>{t('Send it to')}</legend>
                      <label className={'cal-choice' + (updateAudience === 'all' ? ' is-on' : '')}>
                        <input type="radio" name="update-audience" checked={updateAudience === 'all'} onChange={() => setUpdateAudience('all')} />
                        <span>{t('Everyone invited or signed up ({n})', { n: everyone })}</span>
                      </label>
                      <label className={'cal-choice' + (updateAudience === 'signed_up' ? ' is-on' : '')}>
                        <input type="radio" name="update-audience" checked={updateAudience === 'signed_up'} onChange={() => setUpdateAudience('signed_up')} />
                        <span>{t('Only people who signed up ({n})', { n: signups.length })}</span>
                      </label>
                    </fieldset>
                  )}
                  <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '48px' }} disabled={updateBusy || reach === 0} onClick={sendUpdate}>
                    {updateBusy ? t('Sending...') : reach === 1 ? t('Send update to 1 person') : t('Send update to {n} people', { n: reach })}
                  </button>
                  {updateMsg && <p className="cal-sub" role="status" style={{ marginBottom: 0 }}>{updateMsg}</p>}
                </>
              )
            })()}
            {ev.visibility === 'invite' && (
              <>
                <h2 style={{ marginTop: '1rem' }}>{t('Invite people by name ({n} invited)', { n: invited.length })}</h2>
                <div className="form-field" style={{ marginBottom: '0.5rem' }}>
                  <label htmlFor="invite-search">{t('Search for someone you know on Village Without Borders')}</label>
                  <input id="invite-search" type="search" autoComplete="off" value={inviteSearch} onChange={(e) => setInviteSearch(e.target.value)} placeholder={t('Start typing a name')} />
                </div>
                {inviteMsg && <p className="cal-sub" role="status" style={{ marginTop: 0 }}>{inviteMsg}</p>}
                {inviteSearch.trim().length >= 2 && inviteResults.length === 0 && (
                  <p className="cal-sub" style={{ marginTop: 0 }}>{t('No match. You can only invite people you already know here, such as someone you have messaged, vouched for, or share a group with.')}</p>
                )}
                {inviteResults.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: '0 0 0.75rem', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {inviteResults.map((p) => (
                      <li key={p.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', minHeight: '44px' }}>
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}><UserName userId={p.user_id} name={p.display_name} /></span>
                        <button type="button" className="btn btn-primary" style={{ minHeight: '44px', flex: 'none' }} onClick={() => inviteByName(p)}>{t('Invite')}</button>
                      </li>
                    ))}
                  </ul>
                )}
                {invited.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {invited.map((p) => (
                      <li key={p.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', minHeight: '44px' }}>
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                          <UserName userId={p.user_id} name={p.display_name} />
                          {p.signed_up ? <span style={{ color: 'var(--accent)' }}> {t('(signed up)')}</span> : <span style={{ color: 'var(--text-secondary)' }}> {t('(invited)')}</span>}
                        </span>
                        <span style={{ display: 'flex', gap: '0.5rem', flex: 'none' }}>
                          {!blockedBy.has(p.user_id) && <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={() => messagePerson(p)}>{t('Message')}</button>}
                          <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={() => takeBackInvite(p)}>{t('Take back')}</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {ev.signup_enabled && (
              <>
                <h2 style={{ marginTop: '1rem' }}>{t("Who's signed up ({n})", { n: signups.length })}</h2>
                {attendeeMsg && <p className="cal-sub" role="status" style={{ marginTop: 0 }}>{attendeeMsg}</p>}
                {signups.length === 0 ? <p className="cal-sub">{t('Nobody yet.')}</p> : (
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.6 }}>
                    {signups.map((s) => (
                      <li key={s.user_id}>
                        <UserName userId={s.user_id} name={s.display_name} style={{ color: 'var(--accent)' }} />
                        {s.note ? <span style={{ color: 'var(--text-secondary)' }}>: {s.note}</span> : null}
                        {!blockedBy.has(s.user_id) && <> <button type="button" className="link-button" style={{ minHeight: '44px', color: 'var(--accent)' }} onClick={() => messagePerson(s)}>{t('Message')}</button></>}
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
