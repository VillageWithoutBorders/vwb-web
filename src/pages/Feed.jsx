import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

const FILTERS = ['All', 'My skills', 'Urgent']

function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString)) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function urgencyLabel(urgency) {
  switch (urgency) {
    case 'now': return 'Right now'
    case 'today': return 'Today'
    case 'this_week': return 'This week'
    case 'flexible': return 'Flexible'
    default: return urgency
  }
}

function urgencyClass(urgency) {
  switch (urgency) {
    case 'now': return 'urgency-now'
    case 'today': return 'urgency-today'
    case 'this_week': return 'urgency-week'
    default: return 'urgency-flexible'
  }
}

export default function Feed() {
  const { user, profile } = useAuth()
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('All')
  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRequests()
  }, [])

  async function loadRequests() {
    setLoading(true)

    const { data, error } = await supabase
      .from('help_request_feed')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setRequests(data)
    }

    setLoading(false)
  }

  function filteredRequests() {
    switch (filter) {
      case 'My skills':
        if (!profile?.skills?.length) return requests
        return requests.filter((r) =>
          profile.skills.includes(r.skill_needed)
        )
      case 'Urgent':
        return requests.filter((r) =>
          r.urgency === 'now' || r.urgency === 'today'
        )
      default:
        return requests
    }
  }

  async function handleVolunteer(request) {
    const { error } = await supabase.from('skill_matches').insert({
      request_id: request.id,
      helper_id: user.id,
    })

    if (error) {
      alert('Something went wrong. Please try again.')
      return
    }

    // Update request status
    await supabase
      .from('help_requests')
      .update({ status: 'matched', matched_at: new Date().toISOString() })
      .eq('id', request.id)

    // Refresh the feed
    loadRequests()
    setExpandedId(null)
  }

  const visible = filteredRequests()

  return (
    <div className="feed-page">
      <div className="feed-filters" role="tablist" aria-label="Filter requests">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={`filter-chip ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="feed-empty">
          <p>Loading requests...</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="feed-empty">
          <h2>No requests nearby right now</h2>
          <p>Check back soon, or expand your travel radius.</p>
        </div>
      ) : (
        <div className="feed-list">
          {visible.map((req) => (
            <article
              key={req.id}
              className={`request-card ${expandedId === req.id ? 'expanded' : ''}`}
              onClick={() =>
                setExpandedId(expandedId === req.id ? null : req.id)
              }
              role="button"
              tabIndex={0}
              aria-expanded={expandedId === req.id}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setExpandedId(expandedId === req.id ? null : req.id)
                }
              }}
            >
              <div className="request-top">
                <div className="request-info">
                  <h3 className="request-skill">{req.skill_needed}</h3>
                  <p className="request-meta">
                    {req.requester_name || 'Neighbor'}
                    {req.neighborhood ? ` \u00b7 ${req.neighborhood}` : ''}
                  </p>
                </div>
                <span className={`urgency-badge ${urgencyClass(req.urgency)}`}>
                  {urgencyLabel(req.urgency)}
                </span>
              </div>

              {expandedId === req.id && (
                <div className="request-details">
                  {req.description && (
                    <p className="request-description">{req.description}</p>
                  )}
                  <div className="request-footer">
                    <span className="vouch-count">
                      {req.requester_vouch_count || 0} neighbor vouches
                    </span>
                    <span className="time-ago">{timeAgo(req.created_at)}</span>
                  </div>
                  <button
                    className="btn btn-primary btn-full"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleVolunteer(req)
                    }}
                  >
                    I can help
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
