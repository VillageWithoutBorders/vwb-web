import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

export default function GrantReport() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'

  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const [startDate, setStartDate] = useState(thirtyDaysAgo)
  const [endDate, setEndDate] = useState(today)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)

  if (!isAdmin) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
        <h2>Admin access required</h2>
        <button className="btn btn-outline" onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    )
  }

  async function generateReport() {
    setLoading(true)
    const from = startDate + 'T00:00:00Z'
    const to = endDate + 'T23:59:59Z'

    // Help requests in range
    const { data: requests } = await supabase
      .from('help_requests')
      .select('id, skill_needed, urgency, status, neighborhood, max_helpers, created_at')
      .gte('created_at', from)
      .lte('created_at', to)

    // Skill matches (accepted) in range
    const { data: matches } = await supabase
      .from('skill_matches')
      .select('id, request_id, helper_id, accepted, helper_completed, requester_completed, created_at')
      .eq('accepted', true)
      .gte('created_at', from)
      .lte('created_at', to)

    // Emergency events in range
    const { data: events } = await supabase
      .from('emergency_events')
      .select('id, title, event_type, status, created_at')
      .gte('created_at', from)
      .lte('created_at', to)

    // Event signups in range
    const { data: signups } = await supabase
      .from('event_signups')
      .select('id, event_id, user_id, role, created_at')
      .gte('created_at', from)
      .lte('created_at', to)

    // Event resources in range
    const { data: resources } = await supabase
      .from('event_resources')
      .select('id, event_id, resource_type, category, status, created_at')
      .gte('created_at', from)
      .lte('created_at', to)

    // Check-ins in range
    const { data: checkIns } = await supabase
      .from('event_check_ins')
      .select('id, event_id, user_id, status, created_at')
      .gte('created_at', from)
      .lte('created_at', to)

    // Unique users (new signups in range)
    const { data: newUsers } = await supabase
      .from('profiles')
      .select('id')
      .gte('created_at', from)
      .lte('created_at', to)

    const reqs = requests || []
    const mtch = matches || []
    const evts = events || []
    const sups = signups || []
    const res = resources || []
    const cins = checkIns || []

    // Compute stats
    const categoryBreakdown = {}
    reqs.forEach(r => {
      const cat = r.skill_needed || 'Uncategorized'
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1
    })

    const urgencyBreakdown = { now: 0, today: 0, this_week: 0, flexible: 0 }
    reqs.forEach(r => { if (urgencyBreakdown[r.urgency] !== undefined) urgencyBreakdown[r.urgency]++ })

    const requestStatusBreakdown = { open: 0, matched: 0, in_progress: 0, completed: 0, cancelled: 0 }
    reqs.forEach(r => { if (requestStatusBreakdown[r.status] !== undefined) requestStatusBreakdown[r.status]++ })

    const neighborhoods = {}
    reqs.forEach(r => {
      if (r.neighborhood) neighborhoods[r.neighborhood] = (neighborhoods[r.neighborhood] || 0) + 1
    })

    const uniqueRequesters = new Set(reqs.map(r => r.requester_id)).size
    const uniqueHelpers = new Set(mtch.map(m => m.helper_id)).size
    const completedMatches = mtch.filter(m => m.helper_completed && m.requester_completed).length

    const eventTypeBreakdown = {}
    evts.forEach(e => {
      const t = e.event_type || 'Other'
      eventTypeBreakdown[t] = (eventTypeBreakdown[t] || 0) + 1
    })

    const uniqueResponders = new Set(sups.filter(s => s.role === 'responder' || s.role === 'coordinator').map(s => s.user_id)).size
    const uniqueAffected = new Set(sups.filter(s => s.role === 'affected').map(s => s.user_id)).size

    const resourceNeeds = res.filter(r => r.resource_type === 'need')
    const resourceOffers = res.filter(r => r.resource_type === 'offer')
    const needsFulfilled = resourceNeeds.filter(r => r.status === 'fulfilled').length

    const resourceCategoryBreakdown = {}
    res.forEach(r => {
      const cat = r.category || 'Other'
      resourceCategoryBreakdown[cat] = (resourceCategoryBreakdown[cat] || 0) + 1
    })

    const needsHelpCount = cins.filter(c => c.status === 'need_help').length

    setReport({
      dateRange: { from: startDate, to: endDate },
      helpRequests: {
        total: reqs.length,
        categoryBreakdown,
        urgencyBreakdown,
        statusBreakdown: requestStatusBreakdown,
        neighborhoods,
        uniqueRequesters,
      },
      matching: {
        totalMatches: mtch.length,
        completedMatches,
        uniqueHelpers,
      },
      emergencies: {
        total: evts.length,
        typeBreakdown: eventTypeBreakdown,
        totalSignups: sups.length,
        uniqueResponders,
        uniqueAffected,
        totalCheckIns: cins.length,
        needsHelpCheckIns: needsHelpCount,
      },
      resources: {
        totalNeeds: resourceNeeds.length,
        totalOffers: resourceOffers.length,
        needsFulfilled,
        categoryBreakdown: resourceCategoryBreakdown,
      },
      community: {
        newUsers: (newUsers || []).length,
        totalPeopleServed: new Set([
          ...reqs.map(r => r.requester_id),
          ...mtch.map(m => m.helper_id),
          ...sups.map(s => s.user_id),
        ].filter(Boolean)).size,
      },
    })

    setLoading(false)
  }

  function downloadCSV() {
    if (!report) return
    const r = report
    const lines = [
      ['Village Without Borders Grant Report'],
      ['Date Range', r.dateRange.from + ' to ' + r.dateRange.to],
      ['Generated', new Date().toLocaleDateString()],
      [],
      ['MUTUAL AID (SkillShare)'],
      ['Total help requests', r.helpRequests.total],
      ['Unique people requesting help', r.helpRequests.uniqueRequesters],
      ['Unique volunteers matched', r.matching.uniqueHelpers],
      ['Total volunteer matches', r.matching.totalMatches],
      ['Completed (both sides confirmed)', r.matching.completedMatches],
      [],
      ['Requests by Category'],
      ...Object.entries(r.helpRequests.categoryBreakdown).sort((a, b) => b[1] - a[1]).map(([k, v]) => ['  ' + k, v]),
      [],
      ['Requests by Urgency'],
      ['  Right now', r.helpRequests.urgencyBreakdown.now],
      ['  Today', r.helpRequests.urgencyBreakdown.today],
      ['  This week', r.helpRequests.urgencyBreakdown.this_week],
      ['  Flexible', r.helpRequests.urgencyBreakdown.flexible],
      [],
      ['Requests by Status'],
      ...Object.entries(r.helpRequests.statusBreakdown).map(([k, v]) => ['  ' + k, v]),
      [],
      ['Requests by Neighborhood'],
      ...Object.entries(r.helpRequests.neighborhoods).sort((a, b) => b[1] - a[1]).map(([k, v]) => ['  ' + k, v]),
      [],
      ['EMERGENCY RESPONSE'],
      ['Total emergency events', r.emergencies.total],
      ['Total event signups', r.emergencies.totalSignups],
      ['Unique responders', r.emergencies.uniqueResponders],
      ['Unique affected individuals', r.emergencies.uniqueAffected],
      ['Total check-ins', r.emergencies.totalCheckIns],
      ['Needs-help check-ins', r.emergencies.needsHelpCheckIns],
      [],
      ['Events by Type'],
      ...Object.entries(r.emergencies.typeBreakdown).sort((a, b) => b[1] - a[1]).map(([k, v]) => ['  ' + k, v]),
      [],
      ['RESOURCE COORDINATION'],
      ['Resource needs posted', r.resources.totalNeeds],
      ['Resource offers posted', r.resources.totalOffers],
      ['Needs fulfilled', r.resources.needsFulfilled],
      [],
      ['Resources by Category'],
      ...Object.entries(r.resources.categoryBreakdown).sort((a, b) => b[1] - a[1]).map(([k, v]) => ['  ' + k, v]),
      [],
      ['COMMUNITY'],
      ['New users joined', r.community.newUsers],
      ['Total unique people served', r.community.totalPeopleServed],
    ]

    const csv = lines.map(row => row.map(cell => '"' + String(cell ?? '').replace(/"/g, '""') + '"').join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'VWB-Report-' + startDate + '-to-' + endDate + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const cardStyle = { background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px', padding: '1rem', marginBottom: '0.75rem' }
  const statRow = { display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #2a2a2a', fontSize: '0.85rem' }
  const sectionTitle = { color: '#4ecca3', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer' }}>&#8592;</button>
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Grant Report</h1>
      </div>

      {/* Date range picker */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label style={{ color: '#aaa', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label style={{ color: '#aaa', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box' }} />
          </div>
          <button onClick={generateReport} disabled={loading} style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {loading ? 'Building...' : 'Generate'}
          </button>
        </div>
        {/* Quick range buttons */}
        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          {[
            { label: '30 days', days: 30 },
            { label: '90 days', days: 90 },
            { label: '6 months', days: 182 },
            { label: 'Year', days: 365 },
            { label: 'All time', days: null },
          ].map(q => (
            <button
              key={q.label}
              onClick={() => {
                setEndDate(today)
                setStartDate(q.days ? new Date(Date.now() - q.days * 86400000).toISOString().split('T')[0] : '2024-01-01')
              }}
              style={{ padding: '0.3rem 0.6rem', borderRadius: '16px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, background: '#2a2a2a', color: '#aaa' }}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {!report && !loading && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#666' }}>
          <p style={{ fontSize: '0.95rem' }}>Pick a date range and hit Generate to build your report.</p>
          <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Data exports as CSV for grant applications.</p>
        </div>
      )}

      {loading && (
        <div className="feed-loading"><div className="feed-loading-spinner" /><p>Pulling data...</p></div>
      )}

      {report && !loading && (
        <>
          {/* Download button */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button onClick={downloadCSV} style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px dashed #4ecca3', background: 'none', color: '#4ecca3', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
              Download CSV
            </button>
          </div>

          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
            {[
              { label: 'People served', value: report.community.totalPeopleServed, color: '#4ecca3' },
              { label: 'Help requests', value: report.helpRequests.total, color: '#66aaff' },
              { label: 'Emergencies', value: report.emergencies.total, color: '#ff6644' },
              { label: 'Volunteer matches', value: report.matching.totalMatches, color: '#ffaa44' },
              { label: 'Tasks completed', value: report.matching.completedMatches, color: '#4ecca3' },
              { label: 'New users', value: report.community.newUsers, color: '#66aaff' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', padding: '0.6rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '0.65rem', color: '#888', marginTop: '0.15rem' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Mutual Aid section */}
          <div style={cardStyle}>
            <div style={sectionTitle}>Mutual Aid (SkillShare)</div>
            {Object.entries(report.helpRequests.categoryBreakdown).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
              <div key={cat} style={statRow}>
                <span style={{ color: '#ccc' }}>{cat}</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{count}</span>
              </div>
            ))}
            {Object.keys(report.helpRequests.categoryBreakdown).length === 0 && (
              <p style={{ color: '#666', fontSize: '0.85rem', margin: '0.25rem 0' }}>No requests in this period.</p>
            )}
            <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #333' }}>
              <div style={statRow}><span style={{ color: '#aaa' }}>Unique requesters</span><span style={{ color: '#fff' }}>{report.helpRequests.uniqueRequesters}</span></div>
              <div style={statRow}><span style={{ color: '#aaa' }}>Unique volunteers</span><span style={{ color: '#fff' }}>{report.matching.uniqueHelpers}</span></div>
              <div style={{ ...statRow, borderBottom: 'none' }}><span style={{ color: '#aaa' }}>Completed tasks</span><span style={{ color: '#4ecca3', fontWeight: 600 }}>{report.matching.completedMatches}</span></div>
            </div>
          </div>

          {/* Urgency breakdown */}
          <div style={cardStyle}>
            <div style={sectionTitle}>Request Urgency</div>
            {[
              { key: 'now', label: 'Right now', color: '#ff4444' },
              { key: 'today', label: 'Today', color: '#ff6644' },
              { key: 'this_week', label: 'This week', color: '#ffaa44' },
              { key: 'flexible', label: 'Flexible', color: '#4ecca3' },
            ].map(u => (
              <div key={u.key} style={statRow}>
                <span style={{ color: u.color }}>{u.label}</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{report.helpRequests.urgencyBreakdown[u.key]}</span>
              </div>
            ))}
          </div>

          {/* Neighborhoods */}
          {Object.keys(report.helpRequests.neighborhoods).length > 0 && (
            <div style={cardStyle}>
              <div style={sectionTitle}>Neighborhoods</div>
              {Object.entries(report.helpRequests.neighborhoods).sort((a, b) => b[1] - a[1]).map(([hood, count]) => (
                <div key={hood} style={statRow}>
                  <span style={{ color: '#ccc' }}>{hood}</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Emergency section */}
          <div style={cardStyle}>
            <div style={{ ...sectionTitle, color: '#ff6644' }}>Emergency Response</div>
            <div style={statRow}><span style={{ color: '#aaa' }}>Events reported</span><span style={{ color: '#fff' }}>{report.emergencies.total}</span></div>
            <div style={statRow}><span style={{ color: '#aaa' }}>Total signups</span><span style={{ color: '#fff' }}>{report.emergencies.totalSignups}</span></div>
            <div style={statRow}><span style={{ color: '#aaa' }}>Unique responders</span><span style={{ color: '#fff' }}>{report.emergencies.uniqueResponders}</span></div>
            <div style={statRow}><span style={{ color: '#aaa' }}>Affected individuals</span><span style={{ color: '#fff' }}>{report.emergencies.uniqueAffected}</span></div>
            <div style={statRow}><span style={{ color: '#aaa' }}>Status check-ins</span><span style={{ color: '#fff' }}>{report.emergencies.totalCheckIns}</span></div>
            <div style={{ ...statRow, borderBottom: 'none' }}><span style={{ color: '#aaa' }}>Needs-help alerts</span><span style={{ color: '#ff6644', fontWeight: 600 }}>{report.emergencies.needsHelpCheckIns}</span></div>
            {Object.keys(report.emergencies.typeBreakdown).length > 0 && (
              <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #333' }}>
                {Object.entries(report.emergencies.typeBreakdown).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type} style={statRow}>
                    <span style={{ color: '#ccc' }}>{type}</span>
                    <span style={{ color: '#fff', fontWeight: 600 }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resources section */}
          {(report.resources.totalNeeds > 0 || report.resources.totalOffers > 0) && (
            <div style={cardStyle}>
              <div style={{ ...sectionTitle, color: '#ffaa44' }}>Resource Coordination</div>
              <div style={statRow}><span style={{ color: '#aaa' }}>Needs posted</span><span style={{ color: '#fff' }}>{report.resources.totalNeeds}</span></div>
              <div style={statRow}><span style={{ color: '#aaa' }}>Offers posted</span><span style={{ color: '#fff' }}>{report.resources.totalOffers}</span></div>
              <div style={{ ...statRow, borderBottom: 'none' }}><span style={{ color: '#aaa' }}>Needs fulfilled</span><span style={{ color: '#4ecca3', fontWeight: 600 }}>{report.resources.needsFulfilled}</span></div>
              {Object.keys(report.resources.categoryBreakdown).length > 0 && (
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #333' }}>
                  {Object.entries(report.resources.categoryBreakdown).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                    <div key={cat} style={statRow}>
                      <span style={{ color: '#ccc' }}>{cat}</span>
                      <span style={{ color: '#fff', fontWeight: 600 }}>{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
