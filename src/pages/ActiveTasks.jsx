import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import MyOffers from '../components/MyOffers'
import HelpSwitch from '../components/HelpSwitch'
import { acceptHelpOffer, declineHelpOffer } from '../utils/helpOffers'
import { getBlockedUserIds } from '../utils/blockedUsers'
import { supabase } from '../supabaseClient'
import { helperNote } from '../utils/forSomeone'
import { createNotification } from '../utils/notificationHelpers'
import VouchButton from '../components/VouchButton'
import AvatarDisplay, { UserName } from '../components/AvatarDisplay'
import Icon from '../components/Icon'
import { askConfirm, tell } from '../components/AdminDialog'

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
  const { user, profile, organizations } = useAuth()
  const navigate = useNavigate()
  // /tasks?tab=archived opens the Archived tab (Home and Profile link here).
  const [searchParams, setSearchParams] = useSearchParams()
  // Mine has four tabs: Requests (nobody has taken them yet), Offers, Active, Archived.
  // /tasks?tab=requests|offers|active|archived opens one directly.
  const [tab, setTabState] = useState(() => {
    const t = searchParams.get('tab')
    return ['requests', 'offers', 'active', 'archived'].includes(t) ? t : 'active'
  })
  function setTab(t) {
    setTabState(t)
    const next = new URLSearchParams(searchParams)
    next.set('tab', t)
    setSearchParams(next, { replace: true })
  }
  const [myRequests, setMyRequests] = useState([])
  const [helpingWith, setHelpingWith] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteNote, setDeleteNote] = useState('')
  // "How did it go?" after a task is finished
  const [myFeedback, setMyFeedback] = useState({})
  const [feedbackReady, setFeedbackReady] = useState(false)
  const [notice, setNotice] = useState('')
  // Taking an open request back to the group
  const [narrowing, setNarrowing] = useState(null)
  // "Still need help?" alert opens /tasks?tab=requests&still=ID
  const stillId = searchParams.get('still')
  const [stillBusy, setStillBusy] = useState(false)
  const [stillNote, setStillNote] = useState('')
  const [narrowOrg, setNarrowOrg] = useState('')
  const [narrowNetwork, setNarrowNetwork] = useState(false)
  const [narrowHours, setNarrowHours] = useState('24')
  const [narrowBusy, setNarrowBusy] = useState(false)
  const [narrowNote, setNarrowNote] = useState('')
  const refreshing = useRef(false)
  const prevBoth = useRef(null)
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

  // If the other person answers while this page is open, move the task on
  // its own. Checks again when you come back to the tab, and every 20 seconds
  // while you are looking at it.
  useEffect(() => {
    if (!user?.id) return undefined
    const check = () => { if (document.visibilityState === 'visible') loadTasks(true) }
    const timer = setInterval(check, 20000)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTasks(quiet = false) {
    if (quiet && refreshing.current) return
    refreshing.current = true
    if (!quiet) setLoading(true)
    try {
      const [reqs, helping] = await Promise.all([loadMyRequests(), loadHelpingWith(), loadMyFeedback()])
      const doneIds = [
        ...(reqs || []).flatMap(r => r.matches).filter(m => m.helper_completed && m.requester_completed).map(m => m.id),
        ...(helping || []).filter(h => h.isDone).map(h => h.id),
      ]
      const both = await refreshRated([...new Set(doneIds)])
      // Tell the person when a task has just moved because both have answered.
      if (both && prevBoth.current) {
        const moved = [...both].some(id => !prevBoth.current.has(id))
        if (moved) setNotice('A task moved to Archived because you both answered. You can still vouch for them there.')
      }
      if (both) prevBoth.current = new Set([...(prevBoth.current || []), ...both])
    } finally {
      if (!quiet) setLoading(false)
      refreshing.current = false
    }
  }

  // =============================================
  // Load requests I created + their accepted helpers
  // =============================================
  async function loadMyRequests() {
    const { data: requests, error: reqErr } = await supabase
      .from('help_requests')
      .select('id, skill_needed, description, urgency, neighborhood, status, max_helpers, archived_at, created_at, audience, opens_to_all_at, for_name, expires_at')
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

    // Neighbors who offered to help and are waiting for your yes or no.
    const [{ data: pendingRows, error: pendingErr }, blockedIds] = await Promise.all([
      supabase.from('skill_matches').select('id, request_id, helper_id, created_at').in('request_id', requestIds).is('accepted', null),
      getBlockedUserIds(user.id),
    ])
    if (pendingErr) console.error('Failed to load offers to help:', pendingErr)
    const pending = (pendingRows || []).filter(m => !blockedIds.has(m.helper_id))

    // Enrich helpers with names
    const helperIds = [...new Set([...(matches || []), ...pending].map(m => m.helper_id))]
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

      const reqPending = pending
        .filter(m => m.request_id === req.id)
        .map(m => ({ ...m, helper_name: helperProfiles[m.helper_id]?.display_name || 'A neighbor', is_ambassador: helperProfiles[m.helper_id]?.is_hope_ambassador || false }))

      return { ...req, matches: reqMatches, pending: reqPending, allDone }
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
      .select('id, skill_needed, description, urgency, neighborhood, status, requester_id, archived_at, created_at, for_name')
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
    if (!ids.length) return new Set()
    const { data, error } = await supabase.rpc('both_rated_matches', { p_match_ids: ids })
    if (error) {
      console.error('Failed to check who has answered:', error)
      setRatedReady(false)
      return null
    }
    setRatedReady(true)
    setBothRated(prev => {
      const next = { ...prev }
      for (const id of ids) next[id] = false
      for (const row of data || []) next[row.match_id] = true
      return next
    })
    return new Set((data || []).map(row => row.match_id))
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
      tell(error.code === '55000' ? error.message : 'Could not save this. Try again.', { tone: 'error' })
      return
    }
    setMyFeedback(prev => ({ ...prev, [matchId]: outcome }))
    setFeedbackFor(null)
    setFeedbackNote('')
    const both = await refreshRated([matchId])
    if (both && both.has(matchId)) {
      if (prevBoth.current) prevBoth.current.add(matchId)
      setNotice('Thank you. You both answered, so this task moved to Archived. You can still vouch for them there.')
    }
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
      tell(error.code === '55000' ? error.message : 'Could not do that. Try again.', { tone: 'error' })
      return
    }
    const wasRequester = ending.isRequester
    setEnding(null)
    tell(wasRequester
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
      tell('Could not save this. Try again.', { tone: 'error' })
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
    if (!(await askConfirm('Archive this request? It will move to your Archived tab.'))) return
    const { error } = await supabase
      .from('help_requests')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', requestId)
    if (error) { console.error('Failed to archive request:', error); tell('Could not archive this request. Try again.', { tone: 'error' }); return }
    await loadTasks()
  }

  // "Still need help?" answers. The database checks it is your request.
  function clearStill() {
    const next = new URLSearchParams(searchParams)
    next.delete('still')
    setSearchParams(next, { replace: true })
  }
  async function keepOpen(requestId) {
    if (stillBusy) return
    setStillBusy(true); setStillNote('')
    const { data, error } = await supabase.rpc('keep_my_help_request_open', { p_id: requestId })
    setStillBusy(false)
    if (error) {
      console.error('Failed to keep request open:', error)
      setStillNote(error.message && error.message.length < 140 ? error.message : 'Could not keep it open. Try again.')
      return
    }
    clearStill()
    setNotice('Your request stays open until ' + shortWhen(data) + '.')
    await loadTasks(true)
  }
  async function closeIt(requestId) {
    if (stillBusy) return
    setStillBusy(true); setStillNote('')
    const { error } = await supabase.rpc('close_my_help_request', { p_id: requestId })
    setStillBusy(false)
    if (error) {
      console.error('Failed to close request:', error)
      setStillNote(error.message && error.message.length < 140 ? error.message : 'Could not close it. Try again.')
      return
    }
    clearStill()
    setNotice('Closed. It is in your Archived tab.')
    await loadTasks(true)
  }

  // Open a group-only request to everyone nearby right now.
  async function openToEveryone(requestId) {
    const { error } = await supabase.rpc('open_request_to_everyone', { p_request: requestId })
    if (error) { console.error('Failed to open request:', error); tell('Could not open this request. Try again.', { tone: 'error' }); return }
    await loadTasks()
  }

  // The reverse: pull an open request back to the group for a while.
  async function narrowToGroup(requestId) {
    if (!narrowOrg || narrowBusy) return
    setNarrowBusy(true); setNarrowNote('')
    const { error } = await supabase.rpc('narrow_request_to_group', {
      p_request: requestId, p_org: narrowOrg, p_network: narrowNetwork, p_hours: Number(narrowHours),
    })
    setNarrowBusy(false)
    if (error) {
      console.error('Failed to take request back to the group:', error)
      setNarrowNote(error.message && error.message.length < 140 ? error.message : 'Could not do that. Try again.')
      return
    }
    setNarrowing(null)
    setNotice('Done. Only your group can see this request for now. Neighbors who already said yes keep their spot.')
    await loadTasks(true)
  }

  // Delete for good. Only the person who posted it. The database refuses if a
  // helper already finished the task, and says to archive it instead.
  async function deleteRequestForGood(requestId) {
    setDeleteBusy(true); setDeleteNote('')
    const { error } = await supabase.rpc('delete_my_help_request', { p_request_id: requestId })
    setDeleteBusy(false)
    if (error) {
      console.error('Failed to delete request:', error)
      setDeleteNote(error.message && error.message.length < 160 ? error.message : 'Could not delete this request. Try again.')
      return
    }
    setDeletingId(null)
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
    if (existingErr) { console.error('Failed to check for an existing conversation:', existingErr); tell('Something went wrong. Try again.', { tone: 'error' }); return }

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
      if (newErr || !newConvo) { console.error('Failed to start a conversation:', newErr); tell('Could not start a conversation. Try again.', { tone: 'error' }); return }
      navigate('/conversation/' + newConvo.id)
    }
  }

  // "Thu 4:30 PM", for closing times.
  function shortWhen(ts) {
    return ts ? new Date(ts).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''
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
  // Say yes or no to a neighbor who offered to help
  // =============================================
  const [offerBusy, setOfferBusy] = useState(null)
  async function sayYes(req, m) {
    setOfferBusy(m.id)
    const { ok, convoId } = await acceptHelpOffer({ id: m.id, helper_id: m.helper_id, request_id: req.id, skill_needed: req.skill_needed, max_helpers: req.max_helpers, accepted_count: req.matches.length }, user.id)
    setOfferBusy(null)
    if (!ok) { tell('Could not say yes just now. Try again.', { tone: 'error' }); return }
    // Open the chat so the two of you can plan.
    if (convoId) { navigate('/conversation/' + convoId); return }
    setNotice(m.helper_name + ' is helping now. Find your chat under Messages in a moment.')
    loadTasks()
  }
  async function sayNotNow(m) {
    setOfferBusy(m.id)
    const ok = await declineHelpOffer(m)
    setOfferBusy(null)
    if (!ok) { tell('Could not save that. Try again.', { tone: 'error' }); return }
    loadTasks()
  }

  // =============================================
  // Filter by Active vs Archived
  // =============================================
  // A finished task stays under Active until BOTH people have said how it went.
  // (If the database check is not available, it moves once you have answered.)
  // The moment both have answered, it moves to Archived for both of you, in
  // either order. The vouch button stays on the task in the Archived tab.
  const holdOpen = (matchId) => {
    if (!feedbackReady) return false
    return ratedReady ? !bothRated[matchId] : !myFeedback[matchId]
  }
  const stillNeedsAnswer = (r) => r.matches.some(m => m.helper_completed && m.requester_completed && holdOpen(m.id))

  const activeRequests = myRequests.filter(r => !r.archived_at && (r.status !== 'completed' || stillNeedsAnswer(r)))
  const activeHelping = helpingWith.filter(h => !h.request?.archived_at && (!h.isDone || holdOpen(h.id)))

  const archivedRequests = myRequests.filter(r => r.archived_at || (r.status === 'completed' && !stillNeedsAnswer(r)))

  // Requests tab: still waiting for a helper. Active tab: someone said yes.
  // (r.matches only holds helpers who were accepted.)
  const openRequests = activeRequests.filter(r => r.matches.length === 0)
  const takenRequests = activeRequests.filter(r => r.matches.length > 0)
  // Something is waiting on you: they marked it done and you have not, or it is done and you have not said how it went.
  const waitsOnMe = (m, iAmRequester) => {
    const mine = iAmRequester ? m.requester_completed : m.helper_completed
    const theirs = iAmRequester ? m.helper_completed : m.requester_completed
    if (m.helper_completed && m.requester_completed) return feedbackReady && !myFeedback[m.id]
    return !mine && theirs
  }
  const requestsWaiting = openRequests.filter(r => (r.pending || []).length > 0).length
  const activeWaiting = takenRequests.filter(r => r.matches.some(m => waitsOnMe(m, true))).length +
    activeHelping.filter(h => waitsOnMe(h, false)).length
  const archivedHelping = helpingWith.filter(h => h.request?.archived_at || (h.isDone && !holdOpen(h.id)))

  // The form that opens when you tap "Step back" or "End their help".
  function renderEndForm(matchId, isRequester, otherName) {
    if (!ending || ending.matchId !== matchId) return null
    const reasons = END_REASONS[isRequester ? 'requester' : 'helper']
    return (
      <div style={{ marginTop: '0.6rem', padding: '0.75rem', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px' }}>
        <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
          {isRequester ? 'End ' + otherName + "'s help?" : 'Step back from this task?'}
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', margin: '0 0 0.5rem' }}>
          {isRequester
            ? 'Your request goes back on the feed if it still needs helpers. They are told you closed it out, but not why.'
            : 'The request goes back on the feed so someone else can offer. They are told you can no longer help, but not why.'}
        </p>
        <div role="radiogroup" aria-label="Reason" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {reasons.map(r => (
            <label key={r.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text)', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="radio" name={'end-reason-' + matchId} value={r.value} checked={endReason === r.value} onChange={() => setEndReason(r.value)} />
              {r.label}
            </label>
          ))}
        </div>
        {ADMIN_SEES.includes(endReason) && (
          <p style={{ color: 'var(--warn)', fontSize: '0.8125rem', margin: '0.5rem 0 0' }}>An admin will be told, so they can look into it.</p>
        )}
        <textarea
          value={endNote}
          onChange={e => setEndNote(e.target.value)}
          maxLength={500}
          placeholder="Anything else you want to share? (optional, only admins see it)"
          aria-label="Anything else you want to share"
          style={{ width: '100%', marginTop: '0.6rem', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'var(--surface-sunk)', color: 'var(--text)', fontSize: '0.85rem', minHeight: '3.5rem', boxSizing: 'border-box' }}
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
    const box = { marginTop: '0.6rem', padding: '0.75rem', background: 'var(--success-bg)', border: '1px solid #2d6a4f', borderRadius: '8px' }
    const title = { color: 'var(--text)', fontWeight: 600, fontSize: '0.9rem' }
    const small = { color: 'var(--text-secondary)', fontSize: '0.8125rem', margin: '0.25rem 0 0.5rem' }
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
        <div style={{ ...box, background: 'var(--warn-bg)', border: '1px solid #6b4f2d' }}>
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
            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'var(--surface-sunk)', color: 'var(--text)', fontSize: '0.85rem', minHeight: '4rem', boxSizing: 'border-box' }}
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

  // showActive: the task buttons for live tasks (mark done, step back, and so on).
  const showActive = tab !== 'archived'
  const currentRequests = tab === 'requests' ? openRequests : tab === 'active' ? takenRequests : tab === 'archived' ? archivedRequests : []
  const currentHelping = tab === 'active' ? activeHelping : tab === 'archived' ? archivedHelping : []
  const isEmpty = currentRequests.length === 0 && currentHelping.length === 0
  const counts = {
    requests: openRequests.length,
    active: takenRequests.length + activeHelping.length,
    archived: archivedRequests.length + archivedHelping.length,
  }
  const EMPTY = {
    requests: ['No open requests', 'When you ask for help, your request waits here until a neighbor says yes.', 'Ask for help', '/ask'],
    active: ['No tasks in progress', 'When someone takes your request, or you help a neighbor, it shows here.', 'See who needs help', '/skillshare'],
    archived: ['Nothing archived yet', 'Finished tasks move here once you have both said how it went.', null, null],
  }
  const MINE_TABS = [
    { id: 'requests', label: 'Requests', icon: '\u{1F198}' },
    { id: 'offers', label: 'Offers', icon: '\u{1F49A}' },
    { id: 'active', label: 'Active', icon: '\u{1F91D}' },
    { id: 'archived', label: 'Archived', icon: '\u{1F4E6}' },
  ]

  // =============================================
  // Render
  // =============================================
  return (
    <div className="tasks-page">
      <div className="tasks-header"><h1>Help</h1></div>
      <HelpSwitch />
      {/* Was a floating button that covered task buttons on phones (Oct 22); now it sits in the page. */}
      <button type="button" className="btn btn-primary btn-full mine-new" onClick={() => navigate(tab === 'offers' ? '/post-offer' : '/ask')}>
        <span aria-hidden="true">+</span> {tab === 'offers' ? 'Offer something' : 'Ask for help'}
      </button>

      <div className="home-tasks-tabs mine-tabs" role="tablist" aria-label="My help">
        {MINE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={'mine-' + t.id}
            aria-selected={tab === t.id}
            className={'home-tasks-tab' + (tab === t.id ? ' on' : '')}
            onClick={() => setTab(t.id)}
          >
            <span aria-hidden="true"><Icon name={t.icon} /></span> {t.label}
            {counts[t.id] > 0 && <span className="home-tasks-count">{counts[t.id]}</span>}
            {((t.id === 'active' && activeWaiting > 0) || (t.id === 'requests' && requestsWaiting > 0)) && <span className="home-tasks-dot" aria-label="Something is waiting on you" />}
          </button>
        ))}
      </div>

      {tab !== 'offers' && stillId && !loading && (() => {
        const sr = myRequests.find((r) => String(r.id) === stillId)
        if (!sr) return null
        const done = sr.archived_at || sr.status !== 'open'
        return (
          <div role="region" aria-label="Still need help?" style={{ margin: '0 0 1rem', padding: '0.85rem', border: '2px solid var(--accent)', borderRadius: '8px', background: 'var(--surface)' }}>
            {done ? (
              <>
                <p style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Your request for {sr.skill_needed} is already closed.</p>
                <button type="button" className="btn btn-outline btn-full" style={{ minHeight: 48 }} onClick={clearStill}>OK</button>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 0.25rem', fontSize: '1.0625rem', fontWeight: 700 }}>Still need help?</p>
                <p style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>
                  Your request for {sr.skill_needed}{sr.for_name ? ' (for ' + sr.for_name + ')' : ''}
                  {sr.expires_at ? ' closes ' + shortWhen(sr.expires_at) + '.' : ' is still open.'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-primary btn-full" style={{ minHeight: 48 }} disabled={stillBusy} onClick={() => keepOpen(sr.id)}>
                    {stillBusy ? 'Saving...' : 'Keep it open'}
                  </button>
                  <button type="button" className="btn btn-outline btn-full" style={{ minHeight: 48 }} disabled={stillBusy} onClick={() => closeIt(sr.id)}>
                    Close it
                  </button>
                </div>
                {stillNote && <p role="alert" style={{ margin: '0.5rem 0 0', color: 'var(--danger)' }}>{stillNote}</p>}
              </>
            )}
          </div>
        )
      })()}

      {notice && (
        <p role="status" style={{ margin: '0 0 1rem', padding: '0.75rem', background: 'var(--success-bg)', border: '1px solid #2d6a4f', borderRadius: '8px', color: 'var(--accent)' }}>
          {notice} <button type="button" onClick={() => setNotice('')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', textDecoration: 'underline', minHeight: 44, cursor: 'pointer', font: 'inherit' }}>Dismiss</button>
        </p>
      )}

      {tab === 'offers' ? (
        <div role="tabpanel" aria-labelledby="mine-offers">
          <MyOffers />
          <p className="home-tasks-empty" style={{ margin: '0.25rem 0 0.75rem' }}>Offers are skills, time, or things you can share. Neighbors who are interested send you a message request.</p>
        </div>
      ) : loading ? (
        <div className="feed-loading"><div className="feed-loading-spinner" /><p>Loading tasks...</p></div>
      ) : isEmpty ? (
        <div className="feed-empty">
          <span className="feed-empty-icon"></span>
          <h2>{EMPTY[tab][0]}</h2>
          <p>{EMPTY[tab][1]}</p>
          {EMPTY[tab][2] && (
            <button className="btn btn-primary" style={{ minHeight: '44px' }} onClick={() => navigate(EMPTY[tab][3])}>{EMPTY[tab][2]}</button>
          )}
        </div>
      ) : (
        <div className="tasks-list">

          {/* ========== Requests I Made ========== */}
          {currentRequests.length > 0 && (
            <>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem', marginTop: '0.25rem' }}>
                Your Requests
              </div>
              {currentRequests.map(req => (
                <div key={req.id} className="task-card" style={{ borderLeft: '3px solid #2d6a4f' }}>
                  <div className="task-card-top">
                    <span className={'urgency-badge urgency-' + req.urgency}>{URGENCY_LABELS[req.urgency] || 'Flexible'}</span>
                    <span className="feed-card-time">{timeAgo(req.created_at)}</span>
                  </div>

                  <div className="task-card-skill">{req.skill_needed}</div>
                  {req.for_name && <div className="for-line">For {req.for_name}. Helpers talk with you.</div>}
                  {req.expires_at && req.matches.length === 0 && (
                    req.archived_at
                      ? (new Date(req.archived_at) >= new Date(req.expires_at) && <div className="task-card-hood">Closed on its own. No one answered in time.</div>)
                      : req.status === 'open' && <div className="task-card-hood">Open until {shortWhen(req.expires_at)}</div>
                  )}
                  {req.neighborhood && <div className="task-card-hood">in {req.neighborhood}</div>}
                  <p className="task-card-desc">{req.description}</p>
                  {req.audience && req.audience !== 'everyone' && !req.archived_at && (!req.opens_to_all_at || new Date(req.opens_to_all_at) > new Date()) && (
                    <div style={{ margin: '0.25rem 0 0.5rem', padding: '0.6rem 0.75rem', border: '1px solid var(--info-bg)', borderRadius: '8px' }}>
                      <p style={{ margin: '0 0 0.4rem', fontSize: '0.9rem' }}>
                        Only {req.audience === 'network' ? 'your group and its network' : 'your group'} can see this
                        {req.opens_to_all_at ? ' until ' + new Date(req.opens_to_all_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''}.
                        Then it opens to everyone nearby.
                      </p>
                      <button className="btn btn-outline btn-sm" style={{ minHeight: '44px' }} onClick={() => openToEveryone(req.id)}>Open to everyone nearby now</button>
                    </div>
                  )}

                  {/* Reverse: take an open request back to the group */}
                  {showActive && organizations.length > 0 && req.audience === 'everyone' && !req.archived_at && req.status === 'open' && (
                    narrowing === req.id ? (
                      <div style={{ margin: '0.25rem 0 0.5rem', padding: '0.6rem 0.75rem', border: '1px solid var(--info-bg)', borderRadius: '8px' }}>
                        <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Keep this with your group for a while. Neighbors who already said yes keep their spot. It opens to everyone again on its own.</p>
                        {organizations.length > 1 && (
                          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Which group?
                            <select value={narrowOrg} onChange={e => setNarrowOrg(e.target.value)} style={{ display: 'block', width: '100%', minHeight: 44, fontSize: 16, marginTop: 4 }}>
                              {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                          </label>
                        )}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: 44, fontSize: '0.9rem' }}>
                          <input type="checkbox" checked={narrowNetwork} onChange={e => setNarrowNetwork(e.target.checked)} style={{ width: 20, height: 20 }} />
                          Include my group's network
                        </label>
                        <label style={{ display: 'block', fontSize: '0.9rem', margin: '0.25rem 0 0.5rem' }}>Open to everyone again after
                          <select value={narrowHours} onChange={e => setNarrowHours(e.target.value)} style={{ display: 'block', width: '100%', minHeight: 44, fontSize: 16, marginTop: 4 }}>
                            <option value="6">6 hours</option>
                            <option value="24">1 day</option>
                            <option value="72">3 days</option>
                            <option value="168">7 days</option>
                          </select>
                        </label>
                        {narrowNote && <p role="alert" style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--warn)' }}>{narrowNote}</p>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <button className="btn btn-primary btn-sm" disabled={narrowBusy} style={{ flex: 1, minHeight: '44px' }} onClick={() => narrowToGroup(req.id)}>{narrowBusy ? 'Saving...' : 'Keep it with my group'}</button>
                          <button className="btn btn-outline btn-sm" style={{ flex: 1, minHeight: '44px' }} onClick={() => { setNarrowing(null); setNarrowNote('') }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button className="btn btn-outline btn-sm" style={{ minHeight: '44px', margin: '0.25rem 0 0.5rem' }}
                        onClick={() => { setNarrowOrg(organizations[0].id); setNarrowNetwork(false); setNarrowHours('24'); setNarrowNote(''); setNarrowing(req.id) }}>
                        Keep it with my group only
                      </button>
                    )
                  )}

                  {/* Helper count */}
                  {req.matches.length === 0 && showActive && (req.pending || []).length > 0 && (
                    <div className="offer-waits" aria-label="Neighbors who offered to help">
                      {req.pending.map(m => (
                        <div key={m.id} className="offer-wait">
                          <p className="offer-wait-text">
                            <UserName userId={m.helper_id} name={m.helper_name} style={{ fontWeight: 700, color: 'var(--text-strong)' }} /> offered to help. Say yes?
                            {m.is_ambassador && <span className="offer-wait-chip">Hope Ambassador</span>}
                          </p>
                          <button type="button" className="offer-wait-profile" onClick={() => navigate('/u/' + m.helper_id)}>See {m.helper_name}&apos;s profile first</button>
                          <div className="offer-wait-btns">
                            <button type="button" className="btn btn-primary" disabled={offerBusy === m.id} onClick={() => sayYes(req, m)}>{offerBusy === m.id ? 'Saving...' : 'Say yes'}</button>
                            <button type="button" className="btn btn-outline" disabled={offerBusy === m.id} onClick={() => sayNotNow(m)}>Not now</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>
                    {req.matches.length === 0
                      ? ((req.pending || []).length > 0 ? '' : 'Waiting for a neighbor to offer')
                      : `${req.matches.length} helper${req.matches.length !== 1 ? 's' : ''} accepted`
                    }
                    {req.max_helpers !== null && req.matches.length > 0 && (
                      <span style={{ color: 'var(--text-muted)' }}> (of {req.max_helpers})</span>
                    )}
                  </div>

                  {/* Accepted helpers list */}
                  {req.matches.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      {req.matches.map(match => {
                        const bothDone = match.helper_completed && match.requester_completed
                        return (
                          <div key={match.id} style={{ background: bothDone ? 'var(--success-bg)' : 'var(--surface-2)', border: '1px solid ' + (bothDone ? '#2d6a4f' : 'var(--border)'), borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AvatarDisplay url={match.helper_avatar} userId={match.helper_id} size={28} /><UserName userId={match.helper_id} name={match.helper_name} style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: '0.9rem' }} /></div>
                                {match.is_ambassador && (
                                  <span style={{ background: 'var(--success-bg)', color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600, padding: '1px 5px', borderRadius: '4px' }}>Hope Ambassador</span>
                                )}
                              </div>
                              {bothDone ? (
                                <span style={{ fontSize: '0.8125rem', color: 'var(--accent)', fontWeight: 600 }}><Icon name="check" /> Complete</span>
                              ) : (
                                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                                  <span className={'task-confirm-dot' + (match.helper_completed ? ' confirmed' : '')} />
                                  <span>{match.helper_completed ? 'Helper marked it done' : 'Helper is still working'}</span>
                                  <span style={{ margin: '0 0.15rem' }}>&middot;</span>
                                  <span className={'task-confirm-dot' + (match.requester_completed ? ' confirmed' : '')} />
                                  <span>{match.requester_completed ? 'You marked it done' : 'You have not marked it done'}</span>
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

                  {/* Change what you wrote, while the request is still open */}
                  {!req.archived_at && !['completed', 'cancelled', 'closed', 'archived'].includes(req.status) && (
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ marginTop: '0.25rem', marginRight: '0.5rem' }}
                      onClick={() => navigate('/ask?edit=' + req.id)}
                    >
                      Edit request
                    </button>
                  )}

                  {/* Archive: only while the task is still in Active */}
                  {showActive && !req.archived_at && (
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger)', marginTop: '0.25rem' }}
                      onClick={() => deleteRequest(req.id)}
                    >
                      Archive request
                    </button>
                  )}

                  {/* Archived: start over as a brand new request (not the same helper) */}
                  {!showActive && (
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: '0.25rem', marginRight: '0.5rem', minHeight: '44px' }}
                      onClick={() => navigate('/ask', { state: { repost: { skill_needed: req.skill_needed, description: req.description, urgency: req.urgency, neighborhood: req.neighborhood, max_helpers: req.max_helpers, for_name: req.for_name || '' } } })}
                    >
                      Ask again
                    </button>
                  )}

                  {/* Delete for good */}
                  {deletingId === req.id ? (
                    <div role="alert" style={{ marginTop: '0.5rem', padding: '0.75rem', border: '1px solid var(--danger)', borderRadius: '8px' }}>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>Delete this request for good? It can't be undone.{' '}
                        {req.matches.some(m => m.helper_completed && m.requester_completed)
                          ? 'This task is finished. Deleting it also removes the record that you helped each other, so you cannot vouch for that person on that basis later. Vouches already given stay.'
                          : 'Neighbors who said yes will be told it was removed.'}</p>
                      {deleteNote && <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--warn)' }}>{deleteNote}</p>}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <button className="btn btn-sm" disabled={deleteBusy} style={{ flex: 1, minHeight: '44px', background: 'var(--error)', color: '#fff', border: 'none' }} onClick={() => deleteRequestForGood(req.id)}>{deleteBusy ? 'Deleting...' : 'Yes, delete'}</button>
                        <button className="btn btn-outline btn-sm" style={{ flex: 1, minHeight: '44px' }} onClick={() => { setDeletingId(null); setDeleteNote('') }}>Keep it</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger)', marginTop: '0.25rem', marginLeft: '0.5rem' }}
                      onClick={() => { setDeleteNote(''); setDeletingId(req.id) }}
                    >
                      Delete request
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {/* ========== Requests I'm Helping With ========== */}
          {currentHelping.length > 0 && (
            <>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem', marginTop: currentRequests.length > 0 ? '1.25rem' : '0.25rem' }}>
                Helping Others
              </div>
              {currentHelping.map(match => {
                const req = match.request
                const bothDone = match.helper_completed && match.requester_completed
                return (
                  <div key={match.id} className="task-card" style={{ borderLeft: '3px solid var(--gold)' }}>
                    <div className="task-card-top">
                      <span className={'urgency-badge urgency-' + req.urgency}>{URGENCY_LABELS[req.urgency] || 'Flexible'}</span>
                      <span className="feed-card-time">{timeAgo(match.created_at)}</span>
                    </div>

                    <div className="task-card-skill">{req.skill_needed}</div>
                    {req.neighborhood && <div className="task-card-hood">in {req.neighborhood}</div>}
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><AvatarDisplay url={null} userId={match.request?.requester_id} size={20} /> {req.for_name ? 'For ' + req.for_name + ', posted by' : 'Requested by'} <UserName userId={match.request?.requester_id} name={match.requester_name} /></span>
                    </div>
                    {req.for_name && <span className="for-note">{helperNote(req, match.requester_name)}</span>}
                    <p className="task-card-desc">{req.description}</p>

                    {!bothDone && (
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '0.5rem 0' }}>
                        <span className={'task-confirm-dot' + (match.helper_completed ? ' confirmed' : '')} />
                        <span>{match.helper_completed ? 'You marked it done' : 'You have not marked it done'}</span>
                        <span style={{ margin: '0 0.15rem' }}>&middot;</span>
                        <span className={'task-confirm-dot' + (match.requester_completed ? ' confirmed' : '')} />
                        <span>{match.requester_completed ? 'They marked it done' : 'They have not marked it done'}</span>
                      </div>
                    )}

                    {bothDone && (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--accent)', fontWeight: 600, margin: '0.5rem 0' }}>
                        <Icon name="check" /> Complete
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