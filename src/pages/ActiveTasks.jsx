import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import VouchButton from '../components/VouchButton'

const STATUS_FLOW = {
  pending:     { label: 'Offered',     className: 'status-pending' },
  accepted:    { label: 'Accepted',    className: 'status-accepted' },
  in_progress: { label: 'In Progress', className: 'status-progress' },
  completed:   { label: 'Completed',   className: 'status-completed' },
  declined:    { label: 'Declined',    className: 'status-declined' },
}

export default function ActiveTasks() {
  const { user } = useAuth()
  const [tab, setTab] = useState('helping')
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.id) loadMatches()
  }, [user?.id, tab])

  async function loadMatches() {
    setLoading(true)
    const { data, error } = await supabase
      .from('skill_matches')
      .select('id, status, helper_id, requester_confirmed, helper_confirmed, completed_at, created_at, updated_at, help_requests (id, neighborhood, skill_needed, description, urgency, status, requester_id)')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Load matches error:', error)
      setMatches([])
    } else {
      const filtered = (data || []).filter(m => {
        if (tab === 'helping') return m.helper_id === user.id
        return m.help_requests?.requester_id === user.id
      })
      setMatches(filtered)
    }
    setLoading(false)
  }

  async function updateMatchStatus(matchId, newStatus) {
    const { error } = await supabase
      .from('skill_matches')
      .update({ status: newStatus })
      .eq('id', matchId)
    if (error) { console.error('Status update error:', error); return }

    const match = matches.find(m => m.id === matchId)
    if (newStatus === 'accepted' && match?.help_requests?.id) {
      await supabase.from('help_requests').update({ status: 'matched' }).eq('id', match.help_requests.id)
    }
    if (newStatus === 'in_progress' && match?.help_requests?.id) {
      await supabase.from('help_requests').update({ status: 'in_progress' }).eq('id', match.help_requests.id)
    }
    loadMatches()
  }

  async function confirmCompletion(matchId) {
    const match = matches.find(m => m.id === matchId)
    if (!match) return
    const isHelper = match.helper_id === user.id
    const field = isHelper ? 'helper_confirmed' : 'requester_confirmed'
    const updates = { [field]: true }
    const otherConfirmed = isHelper ? match.requester_confirmed : match.helper_confirmed

    if (otherConfirmed) {
      updates.status = 'completed'
      updates.completed_at = new Date().toISOString()
    }

    const { error } = await supabase.from('skill_matches').update(updates).eq('id', matchId)
    if (error) { console.error('Confirm error:', error); return }

    if (otherConfirmed && match.help_requests?.id) {
      await supabase.from('help_requests').update({ status: 'completed' }).eq('id', match.help_requests.id)
    }
    loadMatches()
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

  const isHelper = tab === 'helping'

  return (
    <div className="tasks-page">
      <div className="tasks-header"><h1>Active Tasks</h1></div>
      <div className="tasks-tabs">
        <button className={'tasks-tab' + (tab === 'helping' ? ' tasks-tab-active' : '')} onClick={() => setTab('helping')}>Helping others</button>
        <button className={'tasks-tab' + (tab === 'requests' ? ' tasks-tab-active' : '')} onClick={() => setTab('requests')}>My requests</button>
      </div>

      {loading ? (
        <div className="feed-loading"><div className="feed-loading-spinner" /><p>Loading tasks...</p></div>
      ) : matches.length === 0 ? (
        <div className="feed-empty">
          <span className="feed-empty-icon">{isHelper ? '\uD83E\uDD32' : '\uD83D\uDCCB'}</span>
          <h2>{isHelper ? 'No active help tasks' : 'No one has responded yet'}</h2>
          <p>{isHelper ? 'Check the SkillShare feed for requests near you.' : 'Your requests are visible to nearby helpers. Hang tight.'}</p>
        </div>
      ) : (
        <div className="tasks-list">
          {matches.map(match => {
            const req = match.help_requests
            if (!req) return null
            const status = STATUS_FLOW[match.status] || STATUS_FLOW.pending
            const isCompleted = match.status === 'completed'
            const isPending = match.status === 'pending'
            const isAccepted = match.status === 'accepted'
            const isInProgress = match.status === 'in_progress'
            const myConfirmed = isHelper ? match.helper_confirmed : match.requester_confirmed
            const otherConfirmed = isHelper ? match.requester_confirmed : match.helper_confirmed
            const otherUserId = isHelper ? req.requester_id : match.helper_id

            return (
              <div key={match.id} className={'task-card task-card-' + match.status}>
                <div className="task-card-top">
                  <span className={'task-status-badge ' + status.className}>{status.label}</span>
                  <span className="feed-card-time">{timeAgo(match.created_at)}</span>
                </div>
                <div className="task-card-skill">{req.skill_needed}</div>
                {req.neighborhood && <div className="task-card-hood">in {req.neighborhood}</div>}
                <p className="task-card-desc">{req.description}</p>

                {isInProgress && (
                  <div className="task-confirm-section">
                    <div className="task-confirm-status"><span className={'task-confirm-dot' + (myConfirmed ? ' confirmed' : '')} /><span>{myConfirmed ? 'You confirmed' : "You haven't confirmed"}</span></div>
                    <div className="task-confirm-status"><span className={'task-confirm-dot' + (otherConfirmed ? ' confirmed' : '')} /><span>{otherConfirmed ? (isHelper ? 'Requester' : 'Helper') + ' confirmed' : 'Waiting on ' + (isHelper ? 'requester' : 'helper')}</span></div>
                  </div>
                )}

                {isCompleted && <div className="task-completed-banner">Task completed {match.completed_at ? timeAgo(match.completed_at) : ''}</div>}

                <div className="task-card-actions">
                  {!isHelper && isPending && (
                    <><button className="btn btn-primary btn-sm" onClick={() => updateMatchStatus(match.id, 'accepted')}>Accept help</button><button className="btn btn-outline btn-sm" onClick={() => updateMatchStatus(match.id, 'declined')}>Decline</button></>
                  )}
                  {isAccepted && <button className="btn btn-primary btn-sm" onClick={() => updateMatchStatus(match.id, 'in_progress')}>Mark in progress</button>}
                  {isInProgress && !myConfirmed && <button className="btn btn-primary btn-sm" onClick={() => confirmCompletion(match.id)}>Confirm done</button>}
                  {isCompleted && otherUserId && <VouchButton userId={otherUserId} size="md" showCount={true} />}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
