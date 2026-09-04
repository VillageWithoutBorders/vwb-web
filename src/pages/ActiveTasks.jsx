import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { createNotification } from '../utils/notificationHelpers'
import VouchButton from '../components/VouchButton'
import AvatarDisplay from '../components/AvatarDisplay'

export default function ActiveTasks() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('active')
  const [myRequests, setMyRequests] = useState([])
  const [helpingWith, setHelpingWith] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.id) loadTasks()
  }, [user?.id])

  async function loadTasks() {
    setLoading(true)
    await Promise.all([loadMyRequests(), loadHelpingWith()])
    setLoading(false)
  }

  // =============================================
  // Load requests I created + their accepted helpers
  // =============================================
  async function loadMyRequests() {
    const { data: requests } = await supabase
      .from('help_requests')
      .select('id, skill_needed, description, urgency, neighborhood, status, max_helpers, archived_at, created_at')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false })

    if (!requests || requests.length === 0) {
      setMyRequests([])
      return
    }

    const requestIds = requests.map(r => r.id)

    // Get all accepted matches for these requests
    const { data: matches } = await supabase
      .from('skill_matches')
      .select('id, request_id, helper_id, accepted, helper_completed, requester_completed, created_at')
      .in('request_id', requestIds)
      .eq('accepted', true)

    // Enrich helpers with names
    const helperIds = [...new Set((matches || []).map(m => m.helper_id))]
    const helperProfiles = {}
    for (const hid of helperIds) {
      const { data: p } = await supabase
        .from('helper_profiles')
        .select('display_name, is_hope_ambassador, avatar_url')
        .eq('user_id', hid)
        .maybeSingle()
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
  }

  // =============================================
  // Load requests I'm helping with (accepted matches)
  // =============================================
  async function loadHelpingWith() {
    const { data: matches } = await supabase
      .from('skill_matches')
      .select('id, request_id, helper_id, accepted, helper_completed, requester_completed, created_at')
      .eq('helper_id', user.id)
      .eq('accepted', true)

    if (!matches || matches.length === 0) {
      setHelpingWith([])
      return
    }

    const requestIds = matches.map(m => m.request_id)
    const { data: requests } = await supabase
      .from('help_requests')
      .select('id, skill_needed, description, urgency, neighborhood, status, requester_id, archived_at, created_at')
      .in('id', requestIds)

    const requesterIds = [...new Set((requests || []).map(r => r.requester_id))]
    const requesterProfiles = {}
    for (const rid of requesterIds) {
      const { data: p } = await supabase
        .from('helper_profiles')
        .select('display_name')
        .eq('user_id', rid)
        .maybeSingle()
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
  }

  // =============================================
  // Mark my part complete
  // =============================================
  async function markMyPartComplete(matchId, isRequester, match) {
    const field = isRequester ? 'requester_completed' : 'helper_completed'
    const otherDone = isRequester ? match.helper_completed : match.requester_completed

    await supabase
      .from('skill_matches')
      .update({ [field]: true })
      .eq('id', matchId)

    // Notify the other person
    const otherUserId = isRequester ? match.helper_id : match.request?.requester_id
    if (otherUserId) {
      createNotification({
        userId: otherUserId,
        type: 'task_update',
        title: otherDone ? 'Task completed!' : 'Your partner marked their part done',
        body: otherDone
          ? 'Both sides confirmed. This task is complete!'
          : 'Tap "Mark my part complete" when you\'re done too.',
        link: '/tasks',
      })
    }

    // If both sides are now done, check if ALL matches on this request are done
    if (otherDone) {
      const requestId = match.request_id || match.request?.id
      if (requestId) {
        const { data: allMatches } = await supabase
          .from('skill_matches')
          .select('id, helper_completed, requester_completed')
          .eq('request_id', requestId)
          .eq('accepted', true)

        // This match is now done (we just set our field), so check all others
        const allComplete = (allMatches || []).every(m =>
          m.id === matchId ? true : (m.helper_completed && m.requester_completed)
        )

        if (allComplete) {
          await supabase
            .from('help_requests')
            .update({ status: 'completed' })
            .eq('id', requestId)
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
    await supabase
      .from('help_requests')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', requestId)
    await loadTasks()
  }

  // =============================================
  // Message helper/requester
  // =============================================
  async function openConversation(requestId, helperId, requesterId) {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('request_id', requestId)
      .eq('helper_id', helperId)
      .eq('requester_id', requesterId)
      .maybeSingle()

    if (existing) {
      navigate('/conversation/' + existing.id)
    } else {
      const { data: newConvo } = await supabase
        .from('conversations')
        .insert({ request_id: requestId, helper_id: helperId, requester_id: requesterId })
        .select()
        .single()
      if (newConvo) navigate('/conversation/' + newConvo.id)
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
  const activeRequests = myRequests.filter(r => !r.archived_at && r.status !== 'completed')
  const activeHelping = helpingWith.filter(h => !h.isDone && !h.request?.archived_at)

  const archivedRequests = myRequests.filter(r => r.archived_at || r.status === 'completed')
  const archivedHelping = helpingWith.filter(h => h.isDone || h.request?.archived_at)

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
          <span className="feed-empty-icon">{showActive ? 'ðŸŒ¿' : 'ðŸ“‹'}</span>
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
                ðŸ“‹ Your Requests
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
                                <span style={{ fontSize: '0.75rem', color: '#4ecca3', fontWeight: 600 }}>âœ… Complete</span>
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
                              </div>
                            )}

                            {bothDone && (
                              <div style={{ marginTop: '0.5rem' }}>
                                <VouchButton userId={match.helper_id} size="sm" showCount={true} />
                              </div>
                            )}
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
                ðŸ¤ Helping Others
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
                        âœ… Complete
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
                      {bothDone && (
                        <VouchButton userId={req.requester_id} size="md" showCount={true} />
                      )}
                    </div>
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
