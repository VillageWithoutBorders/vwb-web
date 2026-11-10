import Icon from '../components/Icon'
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { createNotification } from '../utils/notificationHelpers'
import { tell } from '../components/AdminDialog'
import { useT } from '../utils/lang'
import { isNoSignal } from '../utils/pendingAsks'
import { useWideScreen } from '../hooks/useWideScreen'
import { useSimpleView } from '../utils/simpleView'
import EventDetail from './EventDetail'
import '../desktop-emergency.css'

const VERIFY_THRESHOLD = 2

export default function EmergencyEvents() {
  const { user, profile, isAdmin } = useAuth()
  const t = useT()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [resolvedEvents, setResolvedEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [mySignups, setMySignups] = useState({})
  const [myUpvotes, setMyUpvotes] = useState({})
  const [tab, setTab] = useState('active')
  // Nov 5: when the list can't load (often no signal), say so instead of "No active emergencies".
  const [loadFailed, setLoadFailed] = useState(false)

  // Nov 7 (Jade): on a computer (full view), Emergency works like Messages. The list is
  // on the left and the open emergency (?open=<id>) on the right; each side scrolls by
  // itself. Phones and Simple view open each emergency on its own page, as before.
  const wide = useWideScreen()
  const simple = useSimpleView()
  const split = wide && !simple
  const [params, setParams] = useSearchParams()
  const openId = params.get('open')
  function openEvent(eventId) {
    if (split) setParams({ open: eventId }, { replace: true })
    else navigate('/emergency/' + eventId)
  }
  // After the open emergency is closed or removed (it goes back to /emergency), load the list again.
  const hadOpen = useRef(false)
  useEffect(() => {
    if (hadOpen.current && !openId) loadEvents()
    hadOpen.current = !!openId
  }, [openId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadEvents() }, [])
  // Load again when the signal comes back.
  useEffect(() => {
    const up = () => loadEvents()
    window.addEventListener('online', up)
    return () => window.removeEventListener('online', up)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [checkable, setCheckable] = useState(() => new Set())
  async function loadEvents() {
    // No signal: say so right away. (Each try would otherwise wait several seconds.)
    if (navigator.onLine === false) { setLoadFailed(true); setLoading(false); return }
    setLoading(true)
    const { data: active, error: activeErr } = await supabase.from('emergency_events').select('*').eq('status', 'active').order('created_at', { ascending: false })
    if (activeErr) console.error('Failed to load active events:', activeErr)
    setLoadFailed(!!activeErr)
    if (activeErr && isNoSignal(activeErr)) { setLoading(false); return }
    if (active) setEvents(active)

    // Hope Ambassadors check emergencies in their own villages (vwb-admin-round3.sql).
    if (!isAdmin && profile?.is_hope_ambassador) {
      const { data: mine, error: mineErr } = await supabase.rpc('emergencies_i_can_check')
      if (mineErr) console.error('Failed to load emergencies you can check:', mineErr)
      setCheckable(new Set((mine || []).map(r => r.id)))
    }

    const { data: resolved, error: resolvedErr } = await supabase.from('emergency_events').select('*').eq('status', 'closed').order('resolved_at', { ascending: false })
    if (resolvedErr) console.error('Failed to load resolved events:', resolvedErr)
    if (resolved) setResolvedEvents(resolved)

    const { data: signups, error: signupsErr } = await supabase.from('event_signups').select('event_id, role').eq('user_id', user.id)
    if (signupsErr) console.error('Failed to load your signups:', signupsErr)
    if (signups) {
      const map = {}
      signups.forEach(s => { map[s.event_id] = s.role })
      setMySignups(map)
    }
    const { data: upvotes, error: upvotesErr } = await supabase.from('event_upvotes').select('event_id').eq('user_id', user.id)
    if (upvotesErr) console.error('Failed to load your upvotes:', upvotesErr)
    if (upvotes) {
      const map = {}
      upvotes.forEach(u => { map[u.event_id] = true })
      setMyUpvotes(map)
    }
    setLoading(false)
  }

  async function notifyAndPost(eventId) {
    const ev = events.find(e2 => e2.id === eventId)
    if (!ev) return
    await createNotification({
      userId: ev.created_by,
      type: 'emergency_verified',
      title: 'Emergency Verified',
      body: ev.title + ' has been verified by the community.',
      link: '/emergency/' + eventId
    })
    // No Village Square post here: the database opens the Response Camp and
    // calls covering groups (vwb-response-camps.sql), and Village Square shows
    // active emergencies in its own banner.
  }

  async function upvoteEvent(e, eventId) {
    e.stopPropagation()
    if (myUpvotes[eventId]) return
    // Capture whether this event was already verified BEFORE this vote, so
    // we only announce it once, on the vote that actually crosses the
    // threshold. Without this, every additional upvote past the threshold
    // re-posted the same "Emergency Verified" Campfire announcement and
    // re-notified the reporter, which got noisy fast on a busy event.
    const ev = events.find(e2 => e2.id === eventId)
    const wasVerified = !!ev?.verified
    const { error: upErr } = await supabase.from('event_upvotes').insert({ event_id: eventId, user_id: user.id })
    if (upErr) { console.error('Failed to record upvote:', upErr); tell(t('Could not record your vote. Try again.'), { tone: 'error' }); return }
    // Count votes straight from event_upvotes (the source of truth) instead of
    // incrementing the number in local component state. Reading a cached
    // count and writing count+1 is a classic read-then-write race: two people
    // upvoting close together can both read the same stale number and one
    // vote silently gets lost. Re-counting here narrows that window from
    // "however stale the local state is" down to the moment between this
    // count and the update below.
    const { count: newCount, error: countErr } = await supabase
      .from('event_upvotes')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
    if (countErr) { console.error('Failed to read current upvote count:', countErr); await loadEvents(); return }
    const { error: updErr } = await supabase.from('emergency_events').update({
      upvote_count: newCount,
      verified: newCount >= VERIFY_THRESHOLD ? true : undefined
    }).eq('id', eventId)
    if (updErr) console.error('Failed to update upvote count:', updErr)
    if (!wasVerified && newCount >= VERIFY_THRESHOLD && !updErr) {
      await notifyAndPost(eventId)
    }
    await loadEvents()
  }

  async function adminVerify(e, eventId) {
    e.stopPropagation()
    const { error } = await supabase.from('emergency_events').update({ verified: true }).eq('id', eventId)
    if (error) { console.error('Failed to verify event:', error); tell(error.code === 'P0001' ? error.message : t('Could not verify this event. Try again.'), { tone: 'error' }); return }
    await notifyAndPost(eventId)
    await loadEvents()
  }

  function timeAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime()
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 1) return t('Just now')
    if (hrs < 24) return t('{n}h ago', { n: hrs })
    return t('{n}d ago', { n: Math.floor(hrs / 24) })
  }

  const canVerify = (ev) => isAdmin || (profile?.is_hope_ambassador && checkable.has(ev.id))
  const verified = events.filter(ev => ev.verified)
  const pending = events.filter(ev => !ev.verified)

  const CLOSE_REASON_LABELS = {
    resolved: t('Resolved'),
    false_alarm: t('False Alarm'),
    duplicate: t('Merged'),
  }

  const list = (
    <div className={split ? 'em-left' : undefined} style={{ padding: '1rem', maxWidth: split ? 'none' : '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>{t('Emergency Response')}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>{t('Events in your area')}</p>
        </div>
      </div>

      {/* Nov 10 (Jade): the same warm bar as Emergency Response elsewhere. Every word shows
          at every text size (the old box cut off "Call 911 first"). */}
      <button type="button" className="today-slim today-slim-warn today-slim-wrap em-report-btn" onClick={() => navigate('/emergency/create')}>
        <Icon name="cat-emergency" size={28} />
        <span className="today-slim-text"><b>{t('Report an emergency')}</b><small>{t('When many neighbors are hit at once. Someone in danger? Call 911 first.')}</small></span>
        <span className="today-slim-go" aria-hidden="true">&#8250;</span>
      </button>

      <div className="tasks-tabs" style={{ marginBottom: '1rem' }}>
        <button className={'tasks-tab' + (tab === 'active' ? ' tasks-tab-active' : '')} onClick={() => setTab('active')}>
          {t('Active')} {events.length > 0 && <span style={{ fontSize: '0.8125rem', opacity: 0.7 }}>({events.length})</span>}
        </button>
        <button className={'tasks-tab' + (tab === 'resolved' ? ' tasks-tab-active' : '')} onClick={() => setTab('resolved')}>
          {t('Resolved')} {resolvedEvents.length > 0 && <span style={{ fontSize: '0.8125rem', opacity: 0.7 }}>({resolvedEvents.length})</span>}
        </button>
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>{t('Loading...')}</p>}

      {/* ========== ACTIVE TAB ========== */}
      {!loading && tab === 'active' && (
        <>
          {loadFailed && events.length === 0 && (
            <div className="ask-offline" role="status">
              <b>{t("We couldn't load emergencies right now.")}</b> {t('Check your signal. You can still report one, and it sends by itself when you have signal.')}
            </div>
          )}
          {!loadFailed && events.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}><Icon name="sun" /></p>
              <p style={{ fontWeight: 700 }}>{t('No active emergencies')}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('When a disaster or emergency happens, events will appear here.')}</p>
            </div>
          )}

          {pending.length > 0 && (
            <>
              <p style={{ color: 'var(--warn)', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>{t('Pending verification ({n})', { n: pending.length })}</p>
              {pending.map(ev => {
                const myRole = mySignups[ev.id]
                const voted = myUpvotes[ev.id]
                return (
                  <div key={ev.id} className={'em-card' + (split && openId === ev.id ? ' em-card-on' : '')} aria-current={split && openId === ev.id ? 'true' : undefined} onClick={() => openEvent(ev.id)} role="button" tabIndex={0} aria-label={t('Open event: {title}', { title: ev.title })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEvent(ev.id) } }} style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: '12px', padding: '1rem', marginBottom: '0.75rem', cursor: 'pointer', borderLeft: '4px solid var(--warn)', opacity: 0.9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ background: 'var(--warn)', color: 'var(--on-accent)', fontSize: '0.8125rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{t('Unverified')}</span>
                        {ev.created_by === user.id && <span style={{ background: 'var(--info-bg)', color: 'var(--info)', fontSize: '0.8125rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', marginLeft: '0.35rem' }}>{t('Your report')}</span>}
                        <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1.05rem' }}>{ev.title}</h3>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{timeAgo(ev.created_at)}</span>
                    </div>
                    {ev.location_name && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.25rem 0' }}>{ev.location_name}</p>}
                    {ev.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ev.description}</p>}
                    {/* Nov 10: the row wraps, so nothing runs off a small phone at big text sizes. Buttons are 44px tall. */}
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem 0.75rem', marginTop: '0.75rem' }}>
                      <button onClick={(e) => upvoteEvent(e, ev.id)} disabled={voted} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minHeight: '44px', padding: '0.4rem 0.75rem', borderRadius: '8px', border: voted ? '1px solid var(--accent)' : '1px solid var(--border-strong)', background: voted ? 'var(--success-bg)' : 'none', color: voted ? 'var(--accent)' : 'var(--text-secondary)', cursor: voted ? 'default' : 'pointer', fontSize: '1rem', fontWeight: 700, minHeight: 48 }}>
                        {/* Oct 27: words on the button, not just an arrow. */}
                        {voted ? t('You said you see it') : t('I see this too')}
                      </button>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{(ev.upvote_count || 0) === 1 ? t('1 neighbor sees it') : t('{n} neighbors see it', { n: ev.upvote_count || 0 })}</span>
                      {canVerify(ev) && !voted && (
                        <button onClick={(e) => adminVerify(e, ev.id)} style={{ marginLeft: 'auto', minHeight: '44px', padding: '0.4rem 0.75rem', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer', fontSize: '0.8125rem' }}>{t('Verify')}</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {verified.length > 0 && (
            <>
              {pending.length > 0 && <p style={{ color: 'var(--gold)', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '1rem', marginBottom: '0.5rem' }}>{t('Verified emergencies ({n})', { n: verified.length })}</p>}
              {verified.map(ev => {
                const myRole = mySignups[ev.id]
                return (
                  <div key={ev.id} className={'em-card' + (split && openId === ev.id ? ' em-card-on' : '')} aria-current={split && openId === ev.id ? 'true' : undefined} onClick={() => openEvent(ev.id)} role="button" tabIndex={0} aria-label={t('Open event: {title}', { title: ev.title })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEvent(ev.id) } }} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem', marginBottom: '0.75rem', cursor: 'pointer', borderLeft: '4px solid var(--gold)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ background: 'var(--gold)', color: 'var(--on-accent)', fontSize: '0.8125rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{ev.event_type ? t(ev.event_type) : t('Emergency')}</span>
                        <span style={{ background: 'var(--success-bg)', color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', marginLeft: '0.35rem' }}>&#10003; {t('Verified')}</span>
                        {ev.created_by === user.id && <span style={{ background: 'var(--info-bg)', color: 'var(--info)', fontSize: '0.8125rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', marginLeft: '0.35rem' }}>{t('Your report')}</span>}
                        <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1.1rem' }}>{ev.title}</h3>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{timeAgo(ev.created_at)}</span>
                    </div>
                    {ev.location_name && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.25rem 0' }}>{ev.location_name}</p>}
                    {ev.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ev.description}</p>}
                    {myRole && (
                      <span style={{ display: 'inline-block', marginTop: '0.5rem', background: myRole === 'responder' ? 'var(--success-bg)' : myRole === 'coordinator' ? 'var(--info-bg)' : 'var(--warn-bg)', color: myRole === 'responder' ? 'var(--accent)' : myRole === 'coordinator' ? 'var(--info)' : 'var(--warn)', fontSize: '0.8125rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
                        {myRole === 'responder' ? t('Signed up to help') : myRole === 'coordinator' ? t('Coordinator') : t('Signed up as affected')}
                      </span>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </>
      )}

      {/* ========== RESOLVED TAB ========== */}
      {!loading && tab === 'resolved' && (
        <>
          {resolvedEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}><Icon name="clipboard" /></p>
              <p style={{ fontWeight: 700 }}>{t('No resolved events')}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('Closed events will be archived here.')}</p>
            </div>
          ) : (
            resolvedEvents.map(ev => {
              const myRole = mySignups[ev.id]
              return (
                <div key={ev.id} className={'em-card' + (split && openId === ev.id ? ' em-card-on' : '')} aria-current={split && openId === ev.id ? 'true' : undefined} onClick={() => openEvent(ev.id)} role="button" tabIndex={0} aria-label={t('Open event: {title}', { title: ev.title })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEvent(ev.id) } }} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem', marginBottom: '0.75rem', cursor: 'pointer', borderLeft: '4px solid #2d6a4f', opacity: 0.8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ background: 'var(--success-bg)', color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                        {CLOSE_REASON_LABELS[ev.close_reason] || t('Closed')}
                      </span>
                      {ev.event_type && <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', marginLeft: '0.35rem' }}>{t(ev.event_type)}</span>}
                      <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1.05rem', color: 'var(--text-soft)' }}>{ev.title}</h3>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                      {ev.resolved_at ? timeAgo(ev.resolved_at) : timeAgo(ev.created_at)}
                    </span>
                  </div>
                  {ev.location_name && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0' }}>{ev.location_name}</p>}
                  {myRole && (
                    <span style={{ display: 'inline-block', marginTop: '0.5rem', background: 'var(--surface-2)', color: 'var(--text-muted)', fontSize: '0.8125rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
                      {myRole === 'responder' ? t('You helped') : myRole === 'coordinator' ? t('You coordinated') : t('You were affected')}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </>
      )}
    </div>
  )

  if (!split) return list
  return (
    <div className="em-split">
      {list}
      <section className="em-right" aria-label={t('Open emergency')}>
        {openId
          ? <EventDetail key={openId} id={openId} embedded />
          : (
            <div className="em-pick">
              <Icon name="cat-emergency" size={40} />
              <p>{t('Pick an emergency on the left to see it here.')}</p>
            </div>
          )}
      </section>
    </div>
  )
}