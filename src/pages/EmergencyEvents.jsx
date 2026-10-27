import Icon from '../components/Icon'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { createNotification } from '../utils/notificationHelpers'
import { useGoBack } from '../components/BackLink'
import { tell } from '../components/AdminDialog'

const VERIFY_THRESHOLD = 2

export default function EmergencyEvents() {
  const { user, profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const [events, setEvents] = useState([])
  const [resolvedEvents, setResolvedEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [mySignups, setMySignups] = useState({})
  const [myUpvotes, setMyUpvotes] = useState({})
  const [tab, setTab] = useState('active')

  useEffect(() => { loadEvents() }, [])

  const [checkable, setCheckable] = useState(() => new Set())
  async function loadEvents() {
    setLoading(true)
    const { data: active, error: activeErr } = await supabase.from('emergency_events').select('*').eq('status', 'active').order('created_at', { ascending: false })
    if (activeErr) console.error('Failed to load active events:', activeErr)
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
    if (upErr) { console.error('Failed to record upvote:', upErr); tell('Could not record your vote. Try again.', { tone: 'error' }); return }
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
    if (error) { console.error('Failed to verify event:', error); tell(error.code === 'P0001' ? error.message : 'Could not verify this event. Try again.', { tone: 'error' }); return }
    await notifyAndPost(eventId)
    await loadEvents()
  }

  function timeAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime()
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 1) return 'Just now'
    if (hrs < 24) return hrs + 'h ago'
    return Math.floor(hrs / 24) + 'd ago'
  }

  const canVerify = (ev) => isAdmin || (profile?.is_hope_ambassador && checkable.has(ev.id))
  const verified = events.filter(ev => ev.verified)
  const pending = events.filter(ev => !ev.verified)

  const CLOSE_REASON_LABELS = {
    resolved: 'Resolved',
    false_alarm: 'False Alarm',
    duplicate: 'Merged',
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--gold)' }}>Emergency Response</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>Events in your area</p>
        </div>
        <button onClick={() => goBack('/')} aria-label="Back to Dashboard" style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '1.5rem', cursor: 'pointer' }}>&#8592;</button>
      </div>

      <button onClick={() => navigate('/emergency/create')} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '1rem', borderRadius: '10px', border: '2px solid var(--warn)', background: 'linear-gradient(135deg, var(--warn-bg), var(--warn-bg))', cursor: 'pointer', textAlign: 'left', marginBottom: '1.25rem' }}>
        <span style={{ fontSize: '1.75rem' }}><Icon name="cat-emergency" /></span>
        <div>
          <span style={{ display: 'block', color: 'var(--gold)', fontWeight: 700, fontSize: '0.95rem' }}>Report an emergency</span>
          <span style={{ color: 'var(--danger)', fontSize: '1rem', fontWeight: 700 }}>When many neighbors are hit at once. Someone in danger? Call 911 first.</span>
        </div>
      </button>

      <div className="tasks-tabs" style={{ marginBottom: '1rem' }}>
        <button className={'tasks-tab' + (tab === 'active' ? ' tasks-tab-active' : '')} onClick={() => setTab('active')}>
          Active {events.length > 0 && <span style={{ fontSize: '0.8125rem', opacity: 0.7 }}>({events.length})</span>}
        </button>
        <button className={'tasks-tab' + (tab === 'resolved' ? ' tasks-tab-active' : '')} onClick={() => setTab('resolved')}>
          Resolved {resolvedEvents.length > 0 && <span style={{ fontSize: '0.8125rem', opacity: 0.7 }}>({resolvedEvents.length})</span>}
        </button>
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Loading...</p>}

      {/* ========== ACTIVE TAB ========== */}
      {!loading && tab === 'active' && (
        <>
          {events.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}><Icon name="sun" /></p>
              <p style={{ fontWeight: 700 }}>No active emergencies</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>When a disaster or emergency happens, events will appear here.</p>
            </div>
          )}

          {pending.length > 0 && (
            <>
              <p style={{ color: 'var(--warn)', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>Pending verification ({pending.length})</p>
              {pending.map(ev => {
                const myRole = mySignups[ev.id]
                const voted = myUpvotes[ev.id]
                return (
                  <div key={ev.id} onClick={() => navigate('/emergency/' + ev.id)} role="button" tabIndex={0} aria-label={'Open event: ' + ev.title} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/emergency/' + ev.id) } }} style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: '12px', padding: '1rem', marginBottom: '0.75rem', cursor: 'pointer', borderLeft: '4px solid var(--warn)', opacity: 0.9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ background: 'var(--warn)', color: 'var(--on-accent)', fontSize: '0.8125rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>Unverified</span>
                        {ev.created_by === user.id && <span style={{ background: 'var(--info-bg)', color: 'var(--info)', fontSize: '0.8125rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', marginLeft: '0.35rem' }}>Your report</span>}
                        <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1.05rem' }}>{ev.title}</h3>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{timeAgo(ev.created_at)}</span>
                    </div>
                    {ev.location_name && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.25rem 0' }}>{ev.location_name}</p>}
                    {ev.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ev.description}</p>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
                      <button onClick={(e) => upvoteEvent(e, ev.id)} disabled={voted} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', borderRadius: '8px', border: voted ? '1px solid var(--accent)' : '1px solid var(--border-strong)', background: voted ? 'var(--success-bg)' : 'none', color: voted ? 'var(--accent)' : 'var(--text-secondary)', cursor: voted ? 'default' : 'pointer', fontSize: '1rem', fontWeight: 700, minHeight: 48 }}>
                        {/* Oct 27: words on the button, not just an arrow. */}
                        {voted ? 'You said you see it' : 'I see this too'}
                      </button>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{(ev.upvote_count || 0) === 1 ? '1 neighbor sees it' : (ev.upvote_count || 0) + ' neighbors see it'}</span>
                      {canVerify(ev) && !voted && (
                        <button onClick={(e) => adminVerify(e, ev.id)} style={{ marginLeft: 'auto', padding: '0.4rem 0.75rem', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer', fontSize: '0.8125rem' }}>Verify</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {verified.length > 0 && (
            <>
              {pending.length > 0 && <p style={{ color: 'var(--gold)', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '1rem', marginBottom: '0.5rem' }}>Verified emergencies ({verified.length})</p>}
              {verified.map(ev => {
                const myRole = mySignups[ev.id]
                return (
                  <div key={ev.id} onClick={() => navigate('/emergency/' + ev.id)} role="button" tabIndex={0} aria-label={'Open event: ' + ev.title} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/emergency/' + ev.id) } }} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem', marginBottom: '0.75rem', cursor: 'pointer', borderLeft: '4px solid var(--gold)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ background: 'var(--gold)', color: 'var(--on-accent)', fontSize: '0.8125rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{ev.event_type || 'Emergency'}</span>
                        <span style={{ background: 'var(--success-bg)', color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', marginLeft: '0.35rem' }}>&#10003; Verified</span>
                        {ev.created_by === user.id && <span style={{ background: 'var(--info-bg)', color: 'var(--info)', fontSize: '0.8125rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', marginLeft: '0.35rem' }}>Your report</span>}
                        <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1.1rem' }}>{ev.title}</h3>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{timeAgo(ev.created_at)}</span>
                    </div>
                    {ev.location_name && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.25rem 0' }}>{ev.location_name}</p>}
                    {ev.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ev.description}</p>}
                    {myRole && (
                      <span style={{ display: 'inline-block', marginTop: '0.5rem', background: myRole === 'responder' ? 'var(--success-bg)' : myRole === 'coordinator' ? 'var(--info-bg)' : 'var(--warn-bg)', color: myRole === 'responder' ? 'var(--accent)' : myRole === 'coordinator' ? 'var(--info)' : 'var(--warn)', fontSize: '0.8125rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
                        {myRole === 'responder' ? 'Signed up to help' : myRole === 'coordinator' ? 'Coordinator' : 'Signed up as affected'}
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
              <p style={{ fontWeight: 700 }}>No resolved events</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Closed events will be archived here.</p>
            </div>
          ) : (
            resolvedEvents.map(ev => {
              const myRole = mySignups[ev.id]
              return (
                <div key={ev.id} onClick={() => navigate('/emergency/' + ev.id)} role="button" tabIndex={0} aria-label={'Open event: ' + ev.title} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/emergency/' + ev.id) } }} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem', marginBottom: '0.75rem', cursor: 'pointer', borderLeft: '4px solid #2d6a4f', opacity: 0.8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ background: 'var(--success-bg)', color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                        {CLOSE_REASON_LABELS[ev.close_reason] || 'Closed'}
                      </span>
                      {ev.event_type && <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', marginLeft: '0.35rem' }}>{ev.event_type}</span>}
                      <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1.05rem', color: 'var(--text-soft)' }}>{ev.title}</h3>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                      {ev.resolved_at ? timeAgo(ev.resolved_at) : timeAgo(ev.created_at)}
                    </span>
                  </div>
                  {ev.location_name && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0' }}>{ev.location_name}</p>}
                  {myRole && (
                    <span style={{ display: 'inline-block', marginTop: '0.5rem', background: 'var(--surface-2)', color: 'var(--text-muted)', fontSize: '0.8125rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
                      {myRole === 'responder' ? 'You helped' : myRole === 'coordinator' ? 'You coordinated' : 'You were affected'}
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
}