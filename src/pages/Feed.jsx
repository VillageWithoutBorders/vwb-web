import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { getCurrentPosition } from '../utils/location'

const URGENCY_CONFIG = {
  now:       { label: 'Right now', className: 'urgency-now' },
  today:     { label: 'Today',     className: 'urgency-today' },
  this_week: { label: 'This week', className: 'urgency-week' },
  flexible:  { label: 'Flexible',  className: 'urgency-flexible' },
}

export default function Feed() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [locationStatus, setLocationStatus] = useState('checking')
  const [userLocation, setUserLocation] = useState(null)
  const [filterSkill, setFilterSkill] = useState('all')
  const [skillCategories, setSkillCategories] = useState([])
  const [expandedId, setExpandedId] = useState(null)

  // Load skill categories for filter dropdown
  useEffect(() => {
    async function loadSkills() {
      const { data } = await supabase
        .from('skill_categories')
        .select('name')
        .order('name')
      if (data) setSkillCategories(data.map(s => s.name))
    }
    loadSkills()
  }, [])

  // Get location and fetch matching requests
  const loadFeed = useCallback(async () => {
    setLoading(true)

    // Get user's location
    const loc = await getCurrentPosition()
    setUserLocation(loc)
    setLocationStatus(loc.source === 'browser' ? 'active' : 'default')

    // Build the skill filter
    const helperSkills = filterSkill === 'all'
      ? []
      : [filterSkill]

    const radius = profile?.radius_miles || 10

    // Call the geofenced matching function
    const { data, error } = await supabase.rpc('nearby_matching_requests', {
      helper_lat: loc.lat,
      helper_lng: loc.lng,
      helper_radius: radius,
      helper_skills: helperSkills,
    })

    if (error) {
      console.error('Feed error:', error)
      // Fallback: load all open requests without geofencing
      const { data: fallback } = await supabase
        .from('open_requests_by_urgency')
        .select('*')
        .limit(50)
      setRequests(fallback || [])
    } else {
      setRequests(data || [])
    }

    setLoading(false)
  }, [profile, filterSkill])

  useEffect(() => {
    loadFeed()
  }, [loadFeed])

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  return (
    <div className="feed-page">
      <div className="feed-header">
        <h1>Nearby Requests</h1>
        <p className="feed-subtitle">
          {profile?.is_hope_ambassador
            ? 'Requests matched to your skills and area'
            : 'Help requests from your neighbors'}
        </p>
      </div>

      {/* Location status */}
      <div className={`location-banner location-${locationStatus}`}>
        <span className="location-dot" />
        {locationStatus === 'active'
          ? `Showing requests within ${profile?.radius_miles || 10} miles`
          : 'Using approximate location. Enable location for better matches.'}
      </div>

      {/* Filters */}
      <div className="feed-filters">
        <select
          className="feed-filter-select"
          value={filterSkill}
          onChange={e => setFilterSkill(e.target.value)}
          aria-label="Filter by skill"
        >
          <option value="all">All skills</option>
          {skillCategories.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <button
          className="btn btn-sm btn-outline"
          onClick={loadFeed}
          aria-label="Refresh feed"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Request cards */}
      {loading ? (
        <div className="feed-loading">
          <div className="feed-loading-spinner" />
          <p>Finding nearby requests...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="feed-empty">
          <span className="feed-empty-icon" aria-hidden="true">🌿</span>
          <h2>No requests right now</h2>
          <p>
            {filterSkill !== 'all'
              ? `No open "${filterSkill}" requests nearby. Try "All skills" or widen your radius in Profile.`
              : 'No open requests in your area right now. Check back soon.'}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/ask')}
          >
            Post a request
          </button>
        </div>
      ) : (
        <div className="feed-list">
          {requests.map(req => {
            const urg = URGENCY_CONFIG[req.urgency] || URGENCY_CONFIG.flexible
            const isExpanded = expandedId === req.id

            return (
              <div
                key={req.id}
                className={`feed-card ${isExpanded ? 'feed-card-expanded' : ''}`}
                onClick={() => setExpandedId(isExpanded ? null : req.id)}
              >
                {/* Top row: urgency + time */}
                <div className="feed-card-top">
                  <span className={`urgency-badge ${urg.className}`}>
                    {urg.label}
                  </span>
                  <span className="feed-card-time">{timeAgo(req.created_at)}</span>
                </div>

                {/* Skill + distance */}
                <div className="feed-card-meta">
                  <span className="feed-card-skill">{req.skill_needed}</span>
                  {req.distance_miles != null && (
                    <span className="feed-card-distance">
                      {req.distance_miles} mi
                    </span>
                  )}
                </div>

                {/* Requester + neighborhood */}
                <div className="feed-card-who">
                  <span className="feed-card-name">
                    {req.requester_name || 'A neighbor'}
                  </span>
                  {req.neighborhood && (
                    <span className="feed-card-hood">
                      in {req.neighborhood}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className={`feed-card-desc ${isExpanded ? '' : 'feed-card-desc-clamp'}`}>
                  {req.description}
                </p>

                {/* Expanded actions */}
                {isExpanded && (
                  <div className="feed-card-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Future: trigger match/message flow
                        navigate(`/messages?request=${req.id}`)
                      }}
                    >
                      I can help
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Floating action button */}
      <button
        className="fab"
        onClick={() => navigate('/ask')}
        aria-label="Ask for help"
      >
        +
      </button>
    </div>
  )
}
