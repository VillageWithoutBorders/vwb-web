import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

const STATUS_CONFIG = {
  safe:        { label: 'Safe',         color: '#4ecca3', bg: '#1a3a2a', icon: '\u2714' },
  need_help:   { label: 'Needs Help',   color: '#ff6644', bg: '#3a1a1a', icon: '\u26A0' },
  evacuated:   { label: 'Evacuated',    color: '#66aaff', bg: '#1a2a4a', icon: '\u2192' },
  sheltering:  { label: 'Sheltering',   color: '#ffaa44', bg: '#3a2a1a', icon: '\u2302' },
  no_contact:  { label: 'No Contact',   color: '#ff4444', bg: '#4a1a1a', icon: '\u2717' },
}

export default function EventDetail() {
  const { id } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [signups, setSignups] = useState([])
  const [mySignup, setMySignup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('responders')
  const [showSignupForm, setShowSignupForm] = useState(null)
  const [signupNotes, setSignupNotes] = useState('')
  const [signupAvail, setSignupAvail] = useState('')
  const [skillCats, setSkillCats] = useState([])
  const [selectedSkills, setSelectedSkills] = useState([])
  const [submitting, setSubmitting] = useState(false)

  // Check-in state
  const [checkIns, setCheckIns] = useState([])
  const [latestStatuses, setLatestStatuses] = useState({})
  const [showStatusPicker, setShowStatusPicker] = useState(false)
  const [statusNote, setStatusNote] = useState('')

  useEffect(() => { loadAll() }, [id])

  async function loadAll() {
    setLoading(true)
    const { data: ev } = await supabase.from('emergency_events').select('*').eq('id', id).single()
    if (ev) setEvent(ev)

    const { data: sups } = await supabase.from('event_signups').select('*').eq('event_id', id)
    if (sups) {
      const withNames = await Promise.all(sups.map(async (s) => {
        const { data: p } = await supabase.from('helper_profiles').select('display_name').eq('user_id', s.user_id).maybeSingle()
        return { ...s, display_name: p?.display_name || 'Neighbor' }
      }))
      setSignups(withNames)
      const mine = withNames.find(s => s.user_id === user.id)
      setMySignup(mine || null)
    }

    const { data: cats } = await supabase.from('skill_categories').select('title').order('sort_order')
    if (cats) setSkillCats(cats.map(c => c.title))

    // Load check-ins
    const { data: cins } = await supabase.from('event_check_ins').select('*').eq('event_id', id).order('created_at', { ascending: false })
    if (cins) {
      // Get display names for check-ins
      const userIds = [...new Set(cins.map(c => c.user_id))]
      const nameMap = {}
      for (const uid of userIds) {
        const { data: p } = await supabase.from('helper_profiles').select('display_name').eq('user_id', uid).maybeSingle()
        nameMap[uid] = p?.display_name || 'Neighbor'
      }
      setCheckIns(cins.map(c => ({ ...c, display_name: nameMap[c.user_id] })))

      // Build latest status per user
      const latest = {}
      cins.forEach(c => {
        if (!latest[c.user_id]) latest[c.user_id] = c
      })
      setLatestStatuses(latest)
    }

    setLoading(false)
  }

  async function submitCheckIn(status) {
    setSubmitting(true)
    await supabase.from('event_check_ins').insert({
      event_id: Number(id),
      user_id: user.id,
      status,
      note: statusNote.trim() || null,
    })
    setShowStatusPicker(false)
    setStatusNote('')
    setSubmitting(false)
    await loadAll()
  }

  async function handleSignup(role) {
    setSubmitting(true)
    await supabase.from('event_signups').insert({
      event_id: Number(id),
      user_id: user.id,
      role,
      skills: role === 'responder' ? selectedSkills : [],
      availability: signupAvail.trim() || null,
      notes: signupNotes.trim() || null,
    })
    setShowSignupForm(null)
    setSignupNotes('')
    setSignupAvail('')
    setSelectedSkills([])
    setSubmitting(false)
    await loadAll()
  }

  async function cancelSignup() {
    if (!confirm('Remove yourself from this event?')) return
    await supabase.from('event_signups').delete().eq('event_id', id).eq('user_id', user.id)
    await loadAll()
  }

  async function closeEvent() {
    if (!confirm('Close this event? It will no longer appear in the active list.')) return
    await supabase.from('emergency_events').update({ status: 'closed' }).eq('id', id)
    navigate('/emergency')
  }

  function toggleSkill(s) {
    setSelectedSkills(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function timeAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return mins + 'm ago'
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return hrs + 'h ago'
    return Math.floor(hrs / 24) + 'd ago'
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Loading...</div>
  if (!event) return <div style={{ padding: '2rem', textAlign: 'center' }}>Event not found.</div>

  const responders = signups.filter(s => s.role === 'responder' || s.role === 'coordinator')
  const affected = signups.filter(s => s.role === 'affected')
  const isCoordinator = mySignup?.role === 'coordinator' || event.created_by === user.id
  const myLatest = latestStatuses[user.id]
  const myStatusConf = myLatest ? STATUS_CONFIG[myLatest.status] : null

  // Status summary counts
  const statusCounts = {}
  Object.keys(STATUS_CONFIG).forEach(k => { statusCounts[k] = 0 })
  Object.values(latestStatuses).forEach(c => { if (statusCounts[c.status] !== undefined) statusCounts[c.status]++ })

  const tabStyle = (active) => ({ padding: '0.5rem 0.75rem', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: active ? '#ff6644' : '#2a2a2a', color: active ? '#fff' : '#aaa' })
  const chipStyle = (on) => ({ padding: '0.35rem 0.75rem', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: on ? '#4ecca3' : '#2a2a2a', color: on ? '#1a1a1a' : '#aaa', margin: '0.15rem' })

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <button onClick={() => navigate('/emergency')} style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer' }}>&#8592;</button>
        <div style={{ flex: 1 }}>
          <span style={{ background: '#ff6644', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{event.event_type}</span>
          <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.3rem' }}>{event.title}</h1>
        </div>
      </div>

      {event.location_name && <p style={{ color: '#aaa', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>{event.location_name} ({event.radius_miles} mile radius)</p>}
      {event.description && <p style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1rem', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>{event.description}</p>}

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1, textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4ecca3' }}>{responders.length}</div>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>Responders</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffaa44' }}>{affected.length}</div>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>Affected</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#66aaff' }}>{checkIns.length}</div>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>Check-ins</div>
        </div>
      </div>

      {/* My status / check-in */}
      {mySignup && (
        <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px', padding: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showStatusPicker ? '0.75rem' : 0 }}>
            <div>
              <span style={{ color: '#aaa', fontSize: '0.8rem' }}>Your status: </span>
              {myStatusConf ? (
                <span style={{ background: myStatusConf.bg, color: myStatusConf.color, fontSize: '0.8rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
                  {myStatusConf.icon} {myStatusConf.label}
                </span>
              ) : (
                <span style={{ color: '#666', fontSize: '0.8rem' }}>No check-in yet</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowStatusPicker(!showStatusPicker)} style={{ padding: '0.4rem 0.7rem', borderRadius: '6px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>
                {myStatusConf ? 'Update' : 'Check in'}
              </button>
              <button onClick={cancelSignup} style={{ background: 'none', border: 'none', color: '#ff6666', cursor: 'pointer', fontSize: '0.8rem' }}>Leave</button>
            </div>
          </div>

          {showStatusPicker && (
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
                {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'no_contact').map(([key, conf]) => (
                  <button key={key} onClick={() => !submitting && submitCheckIn(key)} disabled={submitting} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: 'none', background: conf.bg, color: conf.color, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', opacity: submitting ? 0.6 : 1 }}>
                    {conf.icon} {conf.label}
                  </button>
                ))}
              </div>
              <input type="text" placeholder="Optional note (e.g. address, what you need)" value={statusNote} onChange={e => setStatusNote(e.target.value)} style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box' }} />
            </div>
          )}
        </div>
      )}

      {/* Signup buttons */}
      {!mySignup && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={() => setShowSignupForm('responder')} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer' }}>I can help</button>
          <button onClick={() => setShowSignupForm('affected')} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', background: '#ffaa44', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer' }}>I need help</button>
        </div>
      )}

      {/* Signup form */}
      {showSignupForm && (
        <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', color: showSignupForm === 'responder' ? '#4ecca3' : '#ffaa44' }}>
            {showSignupForm === 'responder' ? 'Sign up to help' : 'Sign up as affected'}
          </h3>
          {showSignupForm === 'responder' && (
            <>
              <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>What skills can you offer?</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.75rem' }}>
                {skillCats.map(s => (
                  <button key={s} type="button" onClick={() => toggleSkill(s)} style={chipStyle(selectedSkills.includes(s))}>{s}</button>
                ))}
              </div>
              <input type="text" placeholder="When are you available?" value={signupAvail} onChange={e => setSignupAvail(e.target.value)} style={{ display: 'block', width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.9rem', marginBottom: '0.5rem', boxSizing: 'border-box' }} />
            </>
          )}
          <textarea placeholder={showSignupForm === 'responder' ? 'Anything else? (truck, chainsaw, generator, etc.)' : 'What do you need? (shelter, food, cleanup, etc.)'} value={signupNotes} onChange={e => setSignupNotes(e.target.value)} rows={3} style={{ display: 'block', width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.9rem', resize: 'vertical', marginBottom: '0.75rem', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setShowSignupForm(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#aaa', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => handleSignup(showSignupForm)} disabled={submitting} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', background: showSignupForm === 'responder' ? '#4ecca3' : '#ffaa44', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Signing up...' : 'Sign up'}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', overflowX: 'auto' }}>
        <button style={tabStyle(tab === 'responders')} onClick={() => setTab('responders')}>Responders ({responders.length})</button>
        <button style={tabStyle(tab === 'affected')} onClick={() => setTab('affected')}>Affected ({affected.length})</button>
        <button style={tabStyle(tab === 'check-ins')} onClick={() => setTab('check-ins')}>Check-ins ({checkIns.length})</button>
      </div>

      {/* Status summary bar (visible on check-ins tab or for coordinators) */}
      {(tab === 'check-ins' || isCoordinator) && Object.values(latestStatuses).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
          {Object.entries(STATUS_CONFIG).map(([key, conf]) => (
            statusCounts[key] > 0 && (
              <span key={key} style={{ background: conf.bg, color: conf.color, fontSize: '0.75rem', fontWeight: 600, padding: '3px 8px', borderRadius: '4px' }}>
                {conf.icon} {conf.label}: {statusCounts[key]}
              </span>
            )
          ))}
        </div>
      )}

      {/* Responders tab */}
      {tab === 'responders' && (
        responders.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#666', padding: '1.5rem' }}>No responders yet. Be the first to sign up.</p>
        ) : (
          responders.map(s => (
            <div key={s.id} style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700 }}>
                  {s.role === 'coordinator' && <span style={{ color: '#66aaff', marginRight: '4px' }} title="Coordinator">&#9733;</span>}
                  {s.display_name}
                </span>
                <span style={{ color: '#666', fontSize: '0.75rem' }}>{new Date(s.created_at).toLocaleDateString()}</span>
              </div>
              {s.skills && s.skills.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.4rem' }}>
                  {s.skills.map(sk => <span key={sk} style={{ background: '#2a2a2a', color: '#4ecca3', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px' }}>{sk}</span>)}
                </div>
              )}
              {s.availability && <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>Available: {s.availability}</p>}
              {s.notes && <p style={{ color: '#999', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>{s.notes}</p>}
            </div>
          ))
        )
      )}

      {/* Affected tab */}
      {tab === 'affected' && (
        affected.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#666', padding: '1.5rem' }}>No affected neighbors signed up yet.</p>
        ) : (
          affected.map(s => {
            const st = latestStatuses[s.user_id]
            const sc = st ? STATUS_CONFIG[st.status] : null
            return (
              <div key={s.id} style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>{s.display_name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {sc && (
                      <span style={{ background: sc.bg, color: sc.color, fontSize: '0.7rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }}>
                        {sc.icon} {sc.label}
                      </span>
                    )}
                    <span style={{ color: '#666', fontSize: '0.75rem' }}>{new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {s.notes && <p style={{ color: '#999', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>{s.notes}</p>}
                {st && st.note && <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.3rem 0 0', fontStyle: 'italic' }}>"{st.note}"</p>}
              </div>
            )
          })
        )
      )}

      {/* Check-ins tab */}
      {tab === 'check-ins' && (
        checkIns.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#666', padding: '1.5rem' }}>No check-ins yet. Signed-up members can update their status above.</p>
        ) : (
          checkIns.map(c => {
            const conf = STATUS_CONFIG[c.status] || STATUS_CONFIG.safe
            return (
              <div key={c.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.6rem 0', borderBottom: '1px solid #2a2a2a' }}>
                <span style={{ background: conf.bg, color: conf.color, fontSize: '1.1rem', width: '2rem', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', flexShrink: 0 }}>{conf.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.display_name}</span>
                    <span style={{ color: '#666', fontSize: '0.75rem' }}>{timeAgo(c.created_at)}</span>
                  </div>
                  <span style={{ color: conf.color, fontSize: '0.8rem', fontWeight: 600 }}>{conf.label}</span>
                  {c.note && <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.2rem 0 0' }}>{c.note}</p>}
                </div>
              </div>
            )
          })
        )
      )}

      {/* Close event */}
      {isCoordinator && event.status === 'active' && (
        <button onClick={closeEvent} style={{ display: 'block', width: '100%', marginTop: '1.5rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid #ff4444', background: 'none', color: '#ff4444', fontWeight: 600, cursor: 'pointer' }}>Close Event</button>
      )}
    </div>
  )
}