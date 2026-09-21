import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { createNotification } from '../utils/notificationHelpers'
import VouchButton from '../components/VouchButton'
import AvatarDisplay from '../components/AvatarDisplay'

// Reasons for ending a helper's part before the task is finished.
const END_REASONS = {
  requester: [
    { value: 'no_show', label: 'They did not show up' },
    { value: 'sorted_elsewhere', label: 'I found help another way' },
    { value: 'felt_off', label: 'Something felt off' },
  ],
  helper: [
    { value: 'plans_changed', label: 'My plans changed' },
    { value: 'cant_do_it', label: "I can't do this after all" },
    { value: 'felt_off', label: 'Something felt off' },
  ],
}
// These reasons also send a note to the admins.
const ADMIN_SEES = ['no_show', 'felt_off']

export default function ActiveTasks() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('active')
  const [myRequests, setMyRequests] = useState([])
  const [helpingWith, setHelpingWith] = useState([])
  const [loading, setLoading] = useState(true)
  // "How did it go?" after a task is finished
  const [myFeedback, setMyFeedback] = useState({})
  const [feedbackReady, setFeedbackReady] = useState(false)
  const [answeredNow, setAnsweredNow] = useState({})
  // Which finished tasks both people have answered (only yes or no, never what was said)
  const [bothRated, setBothRated] = useState({})
  const [ratedReady, setRatedReady] = useState(false)
  const [feedbackFor, setFeedbackFor] = useState(null)
  const [feedbackNote, setFeedbackNote] = useState('')
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  // Stepping back / ending a helper's part
  const [ending, setEnding] = useState(null)
  const [endReason, setEndReason] = useState('')
  const [endNote, setEndNote] = useState('')
  const [endBusy, setEndBusy] = useState(false)

  useEffect(() => {
    if (user?.id) loadTasks()
  }, [user?.id])

  async function loadTasks() {
    setLoading(true)
    const [reqs, helping] = await Promise.all([loadMyRequests(), loadHelpingWith(), loadMyFeedback()])
    const doneIds = [
      ...(reqs || []).flatMap(r => r.matches).filter(m => m.helper_completed && m.requester_completed).map(m => m.id),
      ...(helping || []).filter(h => h.isDone).map(h => h.id),
    ]
    await refreshRated([...new Set(doneIds)])
    setLoading(false)
  }

  // =============================================
  // Load requests I created + their accepted helpers
  // =============================================
  async function loadMyRequests() {
    const { data: requests, error: reqErr } = await supabase
      .from('help_requests')
      .select('id, skill_needed, description, urgency, neighborhood, status, max_helpers, archived_at, created_at')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false })
    if (reqErr) console.error('Failed to load your requests:', reqErr)

    if (!requests || requests.length === 0) {
      setMyRequests([])
      return []
    }

    const requestIds = requests.map(r => r.id)

    // Get all accepted matches for these requests
    const { data: matches, error: matchesErr } = await supabase
      .from('skill_matches')
      .select('id, request_id, helper_id, accepted, helper_completed, requester_completed, created_at')
      .in('request_id', requestIds)
      .eq('accepted', true)
    if (matchesErr) console.error('Failed to load accepted helpers:', matchesErr)

    // Enrich helpers with names
    const helperIds = [...new Set((matches || []).map(m => m.helper_id))]
    const helperProfiles = {}
    for (const hid of helperIds) {
      const { data: p, error: profErr } = await supabase
        .from('helper_profiles_public')
        .select('display_name, is_hope_ambassador, avatar_url')
        .eq('user_id', hid)
        .maybeSingle()
      if (profErr) console.error('Failed to load helper profile:', profErr)
      if (p) helperProfiles[hid] = p
    }

    const enriched = requests.map(req => {
      const reqMatches = (matches || [])
        .filter(m => m.request_id === req.id)
        .map(m => ({
          ...m,
          helper_name: helperProfiles[m.helper_id]?.display_name || 'A neighbor',
          is_ambassador: helperProfiles[m.helper_id]?.is_hope_ambassador || false,
          helper_avatar: helperProfiles[m.helper_id]?.avatar_url || null,
        }))

      const allDone = reqMatches.length > 0 && reqMatches.every(m => m.helper_completed && m.requester_completed)

      return { ...req, matches: reqMatches, allDone }
    })

    setMyRequests(enriched)
    return enriched
  }

  // =============================================
  // Load requests I'm helping with (accepted matches)
  // =============================================
  async function loadHelpingWith() {
    const { data: matches, error: matchesErr } = await supabase
      .from('skill_matches')
      .select('id, request_id, helper_id, accepted, helper_completed, requester_completed, created_at')
      .eq('helper_id', user.id)
      .eq('accepted', true)
    if (matchesErr) console.error('Failed to load your accepted matches:', matchesErr)

    if (!matches || matches.length === 0) {
      setHelpingWith([])
      return []
    }

    const requestIds = matches.map(m => m.request_id)
    const { data: requests, error: reqErr } = await supabase
      .from('help_requests')
      .select('id, skill_needed, description, urgency, neighborhood, status, requester_id, archived_at, created_at')
      .in('id', requestIds)
    if (reqErr) console.error('Failed to load requests you are helping with:', reqErr)

    const requesterIds = [...new Set((requests || []).map(r => r.requester_id))]
    const requesterProfiles = {}
    for (const rid of requesterIds) {
      const { data: p, error: profErr } = await supabase
        .from('helper_profiles_public')
        .select('display_name')
        .eq('user_id', rid)
        .maybeSingle()
      if (profErr) console.error('Failed to load requester profile:', profErr)
      if (p) requesterProfiles[rid] = p
    }

    const enriched = matches.map(match => {
      const req = (requests || []).find(r => r.id === match.request_id)
      if (!req) return null
      return {
        ...match,
        request: req,
        requester_name: requesterProfiles[req.requester_id]?.display_name || 'A neighbor',
        isDone: match.helper_completed && match.requester_completed,
      }
    }).filter(Boolean)

    setHelpingWith(enriched)
    return enriched
  }

  // =============================================
  // My private "how did it go" answers
  // =============================================
  async function loadMyFeedback() {
    const { data, error } = await supabase
      .from('task_feedback')
      .select('match_id, outcome')
      .eq('from_user_id', user.id)
      .eq('kind', 'finished')
    if (error) {
      console.error('Failed to load your task feedback:', error)
      setFeedbackReady(false)
      return
    }
    const map = {}
    for (const f of data || []) if (f.match_id) map[f.match_id] = f.outcome
    setMyFeedback(map)
    setFeedbackReady(true)
  }

  // Ask which of these finished tasks both people have answered.
  async function refreshRated(ids) {
    if (!ids.length) return
    const { data, error } = await supabase.rpc('both_rated_matches', { p_match_ids: ids })
    if (error) {
      console.error('Failed to check who has answered:', error)
      setRatedReady(false)
      return
    }
    setRatedReady(true)
    setBothRated(prev => {
      const next = { ...prev }
      for (const id of ids) next[id] = false
      for (const row of data || []) next[row.match_id] = true
      return next
    })
  }

  async function submitFeedback(matchId, outcome) {
    if (feedbackBusy) return
    setFeedbackBusy(true)
    const { error } = await supabase.rpc('submit_task_feedback', {
      p_match_id: matchId,
      p_outcome: outcome,
      p_note: outcome === 'went_wrong' ? (feedbackNote.trim() || null) : null,
    })
    setFeedbackBusy(false)
    if (error) {
      console.error('Failed to save task feedback:', error)
      alert(error.code === '55000' ? error.message : 'Could not save this. Try again.')
      return
    }
    setMyFeedback(prev => ({ ...prev, [matchId]: outcome }))
    setAnsweredNow(prev => ({ ...prev, [matchId]: true }))
    setFeedbackFor(null)
    setFeedbackNote('')
    await refreshRated([matchId])
  }

  // =============================================
  // Step back (helper) or end a helper's part (requester)
  // =============================================
  function openEnd(matchId, isRequester) {
    setEnding({ matchId, isRequester })
    setEndReason('')
    setEndNote('')
  }

  async function confirmEnd() {
    if (!ending || !endReason || endBusy) return
    setEndBusy(true)
    const { data: reopened, error } = await supabase.rpc('end_task_match', {
      p_match_id: ending.matchId,
      p_outcome: endReason,
      p_note: endNote.trim() || null,
    })
    setEndBusy(false)
    if (error) {
      console.error('Failed to end this helper match:', error)
      alert(error.code === '55000' ? error.message : 'Could not do that. Try again.')
      return
    }
    const wasRequester = ending.isRequester
    setEnding(null)
    alert(wasRequester
      ? (reopened ? 'Done. Your request is back on the feed.' : 'Done. Their part has been closed out.')
      : 'Done. Thank you for letting them know.')
    await loadTasks()
  }

  // =============================================
  // Mark my part complete
  // =============================================
  async function markMyPartComplete(matchId, isRequester, match) {
    const field = isRequester ? 'requester_completed' : 'helper_completed'
    const otherDone = isRequester ? match.helper_completed : match.requester_completed

    const { error: updateErr } = await supabase
      .from('skill_matches')
      .update({ [field]: true })
      .eq('id', matchId)

    if (updateErr) {
      console.error('Failed to mark your part complete:', updateErr)
      alert('Could not save this. Try again.')
      return
    }

    // Notify the other person
    const otherUserId = isRequester ? match.helper_id : match.request?.requester_id
    if (otherUserId) {
      createNotification({
        userId: otherUserId,
        type: 'task_update',
        title: otherDone ? 'Task completed!' : 'Your partner marked their part done',
        body: otherDone
          ? 'Both sides confirmed. Open Tasks to say how it went, and to vouch for them if it went well.'
          : 'Tap "Mark my part complete" when you\'re done too.',
        link: '/tasks',
      })
    }

    // If both sides are now done, check if ALL matches on this request are done
    if (otherDone) {
      const requestId = match.request_id || match.request?.id
      if (requestId) {
        const { data: allMatches, error: allErr } = await supabase
          .from('skill_matches')
          .select('id, helper_completed, requester_completed')
          .eq('request_id', requestId)
          .eq('accepted', true)
        if (allErr) console.error('Failed to check other matches on this request:', allErr)

        // This match is now done (we just set our field), so check all others
        const allComplete = (allMatches || []).every(m =>
          m.id === matchId ? true : (m.helper_completed && m.requester_completed)
        )

        if (allComplete) {
          const { error: statusErr } = await supabase
            .from('help_requests')
            .update({ status: 'completed' })
            .eq('id', requestId)
          if (statusErr) console.error('Failed to mark request completed:', statusErr)
        }
      }
    }

    await loadTasks()
  }

  // =============================================
  // Delete request (soft delete via archived_at)
  // =============================================
  async function deleteRequest(requestId) {
    if (!confirm('Archive this request? It will move to your Archived tab.')) return
    const { error } = await supabase
      .from('help_requests')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', requestId)
    if (error) { console.error('Failed to archive request:', error); alert('Could not archive this request. Try again.'); return }
    await loadTasks()
  }

  // =============================================
  // Message helper/requester
  // =============================================
  async function openConversation(requestId, helperId, requesterId) {
    // Look up any existing conversation with this person regardless of which
    // request it started from, or which of them was helper/requester that time,
    // so messages with the same neighbor stay in one thread.
    const { data: existing, error: existingErr } = await supabase
      .from('conversations')
      .select('id')
      .or('and(helper_id.eq.' + helperId + ',requester_id.eq.' + requesterId + '),and(helper_id.eq.' + requesterId + ',requester_id.eq.' + helperId + ')')
      .maybeSingle()
    if (existingErr) { console.error('Failed to check for an existing conversation:', existingErr); alert('Something went wrong. Try again.'); return }

    if (existing) {
      // Point the conversation at this request so its banner reflects what
      // you're currently talking about, not whichever request started the thread.
      const { error: updErr } = await supabase
        .from('conversations')
        .update({ request_id: requestId })
        .eq('id', existing.id)
      if (updErr) console.error('Failed to update conversation context:', updErr)
      navigate('/conversation/' + existing.id)
    } else {
      const { data: newConvo, error: newErr } = await supabase
        .from('conversations')
        .insert({ request_id: requestId, helper_id: helperId, requester_id: requesterId })
        .select()
        .single()
      if (newErr || !newConvo) { console.error('Failed to start a conversation:', newErr); alert('Could not start a conversation. Try again.'); return }
      navigate('/conversation/' + newConvo.id)
    }
  }

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return mins + 'm ago'
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return hrs + 'h ago'
    return Math.floor(hrs / 24) + 'd ago'
  }

  const URGENCY_LABELS = {
    now: 'Right now',
    today: 'Today',
    this_week: 'This week',
    flexible: 'Flexible',
  }

  // =============================================
  // Filter by Active vs Archived
  // =============================================
  // A finished task stays under Active until BOTH people have said how it went.
  // (If the database check is not available, it moves once you have answered.)
  // After you answer, it stays on screen for the rest of the visit so you can vouch.
  const holdOpen = (matchId) => {
    if (!feedbackReady) return false
    if (answeredNow[matchId]) return true
    return ratedReady ? !bothRated[matchId] : !myFeedback[matchId]
  }
  const stillNeedsAnswer = (r) => r.matches.some(m => m.helper_completed && m.requester_completed && holdOpen(m.id))

  const activeRequests = myRequests.filter(r => !r.archived_at && (r.status !== 'completed' || stillNeedsAnswer(r)))
  const activeHelping = helpingWith.filter(h => !h.request?.archived_at && (!h.isDone || holdOpen(h.id)))

  const archivedRequests = myRequests.filter(r => r.archived_at || (r.status === 'completed' && !stillNeedsAnswer(r)))
  const archivedHelping = helpingWith.filter(h => h.request?.archived_at || (h.isDone && !holdOpen(h.id)))

  // The form that opens when you tap "Step back" or "End their help".
  function renderEndForm(matchId, isRequester, otherName) {
    if (!ending || ending.matchId !== matchId) return null
    const reasons = END_REASONS[isRequester ? 'requester' : 'helper']
    return (
      <div style={{ marginTop: '0.6rem', padding: '0.75rem', background: '#1d1d1d', border: '1px solid #444', borderRadius: '8px' }}>
        <div style={{ color: '#eee', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
          {isRequester ? 'End ' + otherName + "'s help?" : 'Step back from this task?'}
        </div>
        <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>
          {isRequester
            ? 'Your request goes back on the feed if it still needs helpers. They are told you closed it out, but not why.'
            : 'The request goes back on the feed so someone else can offer. They are told you can no longer help, but not why.'}
        </p>
        <div role="radiogroup" aria-label="Reason" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {reasons.map(r => (
            <label key={r.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ddd', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="radio" name={'end-reason-' + matchId} value={r.value} checked={endReason === r.value} onChange={() => setEndReason(r.value)} />
              {r.label}
            </label>
          ))}
        </div>
        {ADMIN_SEES.includes(endReason) && (
          <p style={{ color: '#ffaa44', fontSize: '0.78rem', margin: '0.5rem 0 0' }}>An admin will be told, so they can look into it.</p>
        )}
        <textarea
          value={endNote}
          onChange={e => setEndNote(e.target.value)}
          maxLength={500}
          placeholder="Anything else you want to share? (optional, only admins see it)"
          aria-label="Anything else you want to share"
          style={{ width: '100%', marginTop: '0.6rem', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#111', color: '#eee', fontSize: '0.85rem', minHeight: '3.5rem', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" disabled={!endReason || endBusy} onClick={confirmEnd}>
            {endBusy ? 'Saving...' : isRequester ? 'End their help' : 'Step back'}
          </button>
          <button className="btn btn-outline btn-sm" disabled={endBusy} onClick={() => setEnding(null)}>Cancel</button>
        </div>
      </div>
    )
  }

  // Shown on a finished task: ask how it went, then offer the vouch.
  function renderFinishedPanel(matchId, otherUserId, otherName) {
    if (!feedbackReady) {
      return <div style={{ marginTop: '0.5rem' }}><VouchButton userId={otherUserId} size="sm" showCount={true} /></div>
    }
    const answer = myFeedback[matchId]
    const box = { marginTop: '0.6rem', padding: '0.75rem', background: '#1a2e26', border: '1px solid #2d6a4f', borderRadius: '8px' }
    const title = { color: '#eee', fontWeight: 600, fontSize: '0.9rem' }
    const small = { color: '#aaa', fontSize: '0.8rem', margin: '0.25rem 0 0.5rem' }
    const waiting = ratedReady && !bothRated[matchId]
      ? <p style={{ ...small, marginBottom: 0, fontStyle: 'italic' }}>Waiting for {otherName} to answer. This task moves to Archived once you have both answered.</p>
      : null

    if (answer === 'went_well') {
      return (
        <div style={box}>
          <div style={title}>Thank you. We are glad it went well.</div>
          <p style={small}>A vouch tells other neighbors they can trust {otherName}.</p>
          <VouchButton userId={otherUserId} size="sm" showCount={true} />
          {waiting}
        </div>
      )
    }
    if (answer === 'went_wrong') {
      return (
        <div style={{ ...box, background: '#2a2320', border: '1px solid #6b4f2d' }}>
          <div style={title}>Thank you for telling us.</div>
          <p style={{ ...small, marginBottom: waiting ? '0.5rem' : 0 }}>An admin will take a look. Only admins see what you shared.</p>
          {waiting}
        </div>
      )
    }
    if (feedbackFor === matchId) {
      return (
        <div style={box}>
          <div style={title}>What happened?</div>
          <p style={small}>Only admins see this. {otherName} is not told.</p>
          <textarea
            value={feedbackNote}
            onChange={e => setFeedbackNote(e.target.value)}
            maxLength={500}
            placeholder="Tell us in your own words (optional)"
            aria-label="What happened"
            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#111', color: '#eee', fontSize: '0.85rem', minHeight: '4rem', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" disabled={feedbackBusy} onClick={() => submitFeedback(matchId, 'went_wrong')}>
              {feedbackBusy ? 'Saving...' : 'Send to the admins'}
            </button>
            <button className="btn btn-outline btn-sm" disabled={feedbackBusy} onClick={() => { setFeedbackFor(null); setFeedbackNote('') }}>Back</button>
          </div>
        </div>
      )
    }
    return (
      <div style={box}>
        <div style={title}>How did it go with {otherName}?</div>
        <p style={small}>This is private. Only admins can see your answer.</p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" disabled={feedbackBusy} onClick={() => submitFeedback(matchId, 'went_well')}>It went well</button>
          <button className="btn btn-outline btn-sm" disabled={feedbackBusy} onClick={() => { setFeedbackFor(matchId); setFeedbackNote('') }}>Something went wrong</button>
        </div>
      </div>
    )
  }

  const showActive = tab === 'active'
  const currentRequests = showActive ? activeRequests : archivedRequests
  const currentHelping = showActive ? activeHelping : archivedHelping
  const isEmpty = currentRequests.length === 0 && currentHelping.length === 0

  // =============================================
  // Render
  // =============================================
  return (
    <div className="tasks-page">
      <div className="tasks-header"><h1>Tasks</h1></div>

      <div className="tasks-tabs" style={{ marginBottom: '1rem' }}>
        <button className={'tasks-tab' + (tab === 'active' ? ' tasks-tab-active' : '')} onClick={() => setTab('active')}>
          Active
        </button>
        <button className={'tasks-tab' + (tab === 'archived' ? ' tasks-tab-active' : '')} onClick={() => setTab('archived')}>
          Archived
          {(archivedRequests.length + archivedHelping.length) > 0 && (
            <span style={{ marginLeft: '0.35rem', fontSize: '0.75rem', opacity: 0.7 }}>
              ({archivedRequests.length + archivedHelping.length})
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="feed-loading"><div className="feed-loading-spinner" /><p>Loading tasks...</p></div>
      ) : isEmpty ? (
        <div className="feed-empty">
          <span className="feed-empty-icon"></span>
          <h2>{showActive ? 'No active tasks' : 'Nothing archived yet'}</h2>
          <p>{showActive ? 'Check the SkillShare feed for requests near you, or post your own.' : 'Completed and archived tasks will show up here.'}</p>
          {showActive && (
            <button className="btn btn-primary" onClick={() => navigate('/skillshare')}>Go to SkillShare</button>
          )}
        </div>
      ) : (
        <div className="tasks-list">

          {/* ========== Requests I Made ========== */}
          {currentRequests.length > 0 && (
            <>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ecca3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem', marginTop: '0.25rem' }}>
                Your Requests
              </div>
              {currentRequests.map(req => (
                <div key={req.id} className="task-card" style={{ borderLeft: '3px solid #2d6a4f' }}>
                  <div className="task-card-top">
                    <span className={'urgency-badge urgency-' + req.urgency}>{URGENCY_LABELS[req.urgency] || 'Flexible'}</span>
                    <span className="feed-card-time">{timeAgo(req.created_at)}</span>
                  </div>

                  <div className="task-card-skill">{req.skill_needed}</div>
                  {req.neighborhood && <div className="task-card-hood">in {req.neighborhood}</div>}
                  <p className="task-card-desc">{req.description}</p>

                  {/* Helper count */}
                  <div style={{ fontSize: '0.8rem', color: '#aaa', margin: '0.5rem 0' }}>
                    {req.matches.length === 0
                      ? 'No helpers accepted yet'
                      : `${req.matches.length} helper${req.matches.length !== 1 ? 's' : ''} accepted`
                    }
                    {req.max_helpers !== null && req.matches.length > 0 && (
                      <span style={{ color: '#888' }}> (of {req.max_helpers})</span>
                    )}
                  </div>

                  {/* Accepted helpers list */}
                  {req.matches.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      {req.matches.map(match => {
                        const bothDone = match.helper_completed && match.requester_completed
                        return (
                          <div key={match.id} style={{ background: bothDone ? '#1a2e26' : '#222', border: '1px solid ' + (bothDone ? '#2d6a4f' : '#333'), borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AvatarDisplay url={match.helper_avatar} userId={match.helper_id} size={28} /><span style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>{match.helper_name}</span></div>
                                {match.is_ambassador && (
                                  <span style={{ background: '#1a4a3a', color: '#4ecca3', fontSize: '0.6rem', fontWeight: 600, padding: '1px 5px', borderRadius: '4px' }}>HA</span>
                                )}
                              </div>
                              {bothDone ? (
                                <span style={{ fontSize: '0.75rem', color: '#4ecca3', fontWeight: 600 }}>✅ Complete</span>
                              ) : (
                                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.7rem', color: '#999' }}>
                                  <span className={'task-confirm-dot' + (match.helper_completed ? ' confirmed' : '')} />
                                  <span>{match.helper_completed ? 'Helper done' : 'Helper working'}</span>
                                  <span style={{ margin: '0 0.15rem' }}>&middot;</span>
                                  <span className={'task-confirm-dot' + (match.requester_completed ? ' confirmed' : '')} />
                                  <span>{match.requester_completed ? 'You confirmed' : 'You pending'}</span>
                                </div>
                              )}
                            </div>

                            {!bothDone && (
                              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                {!match.requester_completed && (
                                  <button className="btn btn-primary btn-sm" onClick={() => markMyPartComplete(match.id, true, match)}>
                                    Mark my part complete
                                  </button>
                                )}
                                <button className="btn btn-outline btn-sm" onClick={() => openConversation(req.id, match.helper_id, user.id)}>
                                  Message
                                </button>
                                <button className="btn btn-outline btn-sm" onClick={() => openEnd(match.id, true)}>
                                  End their help
                                </button>
                              </div>
                            )}

                            {!bothDone && renderEndForm(match.id, true, match.helper_name)}

                            {bothDone && renderFinishedPanel(match.id, match.helper_id, match.helper_name)}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Delete / archive request */}
                  {!req.archived_at && (
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ color: '#ff6666', borderColor: '#ff6666', marginTop: '0.25rem' }}
                      onClick={() => deleteRequest(req.id)}
                    >
                      Archive request
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {/* ========== Requests I'm Helping With ========== */}
          {currentHelping.length > 0 && (
            <>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#b8860b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem', marginTop: currentRequests.length > 0 ? '1.25rem' : '0.25rem' }}>
                Helping Others
              </div>
              {currentHelping.map(match => {
                const req = match.request
                const bothDone = match.helper_completed && match.requester_completed
                return (
                  <div key={match.id} className="task-card" style={{ borderLeft: '3px solid #b8860b' }}>
                    <div className="task-card-top">
                      <span className={'urgency-badge urgency-' + req.urgency}>{URGENCY_LABELS[req.urgency] || 'Flexible'}</span>
                      <span className="feed-card-time">{timeAgo(match.created_at)}</span>
                    </div>

                    <div className="task-card-skill">{req.skill_needed}</div>
                    {req.neighborhood && <div className="task-card-hood">in {req.neighborhood}</div>}
                    <div style={{ fontSize: '0.8rem', color: '#999', marginBottom: '0.25rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><AvatarDisplay url={null} userId={match.request?.requester_id} size={20} /> Requested by {match.requester_name}</span>
                    </div>
                    <p className="task-card-desc">{req.description}</p>

                    {!bothDone && (
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.75rem', color: '#999', margin: '0.5rem 0' }}>
                        <span className={'task-confirm-dot' + (match.helper_completed ? ' confirmed' : '')} />
                        <span>{match.helper_completed ? 'You confirmed' : 'You pending'}</span>
                        <span style={{ margin: '0 0.15rem' }}>&middot;</span>
                        <span className={'task-confirm-dot' + (match.requester_completed ? ' confirmed' : '')} />
                        <span>{match.requester_completed ? 'Requester done' : 'Requester pending'}</span>
                      </div>
                    )}

                    {bothDone && (
                      <div style={{ fontSize: '0.8rem', color: '#4ecca3', fontWeight: 600, margin: '0.5rem 0' }}>
                        ✅ Complete
                      </div>
                    )}

                    <div className="task-card-actions">
                      {!bothDone && !match.helper_completed && (
                        <button className="btn btn-primary btn-sm" onClick={() => markMyPartComplete(match.id, false, match)}>
                          Mark my part complete
                        </button>
                      )}
                      {!bothDone && (
                        <button className="btn btn-outline btn-sm" onClick={() => openConversation(req.id, user.id, req.requester_id)}>
                          Message
                        </button>
                      )}
                      {!bothDone && (
                        <button className="btn btn-outline btn-sm" onClick={() => openEnd(match.id, false)}>
                          Step back
                        </button>
                      )}
                    </div>

                    {!bothDone && renderEndForm(match.id, false, match.requester_name)}

                    {bothDone && renderFinishedPanel(match.id, req.requester_id, match.requester_name)}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}