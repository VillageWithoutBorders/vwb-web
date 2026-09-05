import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import AvatarDisplay from '../components/AvatarDisplay'
import { createNotification } from '../utils/notificationHelpers'

const STATUS_CONFIG = {
  safe:        { label: 'Safe',         color: '#4ecca3', bg: '#1a3a2a', icon: '\u2714' },
  need_help:   { label: 'Needs Help',   color: '#ff6644', bg: '#3a1a1a', icon: '\u26A0' },
  evacuated:   { label: 'Evacuated',    color: '#66aaff', bg: '#1a2a4a', icon: '\u2192' },
  sheltering:  { label: 'Sheltering',   color: '#ffaa44', bg: '#3a2a1a', icon: '\u2302' },
  no_contact:  { label: 'No Contact',   color: '#ff4444', bg: '#4a1a1a', icon: '\u2717' },
}

const RESOURCE_CATEGORIES = ['Water', 'Food', 'Shelter', 'Tools', 'Transportation', 'Medical', 'Clothing', 'Power/Fuel', 'Tarps/Building', 'Hygiene', 'Other']

const menuBtnStyle = { display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.6rem 0.75rem', background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left' }

export default function EventDetail() {
  const { id } = useParams()
  const { user, profile, isAdmin } = useAuth()
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
  const [checkIns, setCheckIns] = useState([])
  const [latestStatuses, setLatestStatuses] = useState({})
  const [showStatusPicker, setShowStatusPicker] = useState(false)
  const [statusNote, setStatusNote] = useState('')
  const [resources, setResources] = useState([])
  const [showResourceForm, setShowResourceForm] = useState(null)
  const [resCategory, setResCategory] = useState('')
  const [resItem, setResItem] = useState('')
  const [resQty, setResQty] = useState(1)
  const [resNote, setResNote] = useState('')
  const [resFilter, setResFilter] = useState('all')
  const [openSignupMenu, setOpenSignupMenu] = useState(null)
  const [editingNotes, setEditingNotes] = useState(null)
  const [editNotesVal, setEditNotesVal] = useState('')

  // Close event flow
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closeReason, setCloseReason] = useState(null)
  const [closeVotes, setCloseVotes] = useState([])
  const [activeEvents, setActiveEvents] = useState([])
  const [selectedDuplicate, setSelectedDuplicate] = useState(null)
  const [closingEvent, setClosingEvent] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState(null)

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
      setMySignup(withNames.find(s => s.user_id === user.id) || null)
    }

    const { data: cats } = await supabase.from('skill_categories').select('title').order('title')
    if (cats) setSkillCats(cats.map(c => c.title))

    const { data: cins } = await supabase.from('event_check_ins').select('*').eq('event_id', id).order('created_at', { ascending: false })
    if (cins) {
      const userIds = [...new Set(cins.map(c => c.user_id))]
      const nameMap = {}
      for (const uid of userIds) {
        const { data: p } = await supabase.from('helper_profiles').select('display_name').eq('user_id', uid).maybeSingle()
        nameMap[uid] = p?.display_name || 'Neighbor'
      }
      setCheckIns(cins.map(c => ({ ...c, display_name: nameMap[c.user_id] })))
      const latest = {}
      cins.forEach(c => { if (!latest[c.user_id]) latest[c.user_id] = c })
      setLatestStatuses(latest)
    }

    const { data: res } = await supabase.from('event_resources').select('*').eq('event_id', id).order('created_at', { ascending: false })
    if (res) {
      const rUserIds = [...new Set(res.map(r => r.offered_by).concat(res.filter(r => r.claimed_by).map(r => r.claimed_by)))]
      const rNameMap = {}
      for (const uid of rUserIds) {
        if (!uid) continue
        const { data: p } = await supabase.from('helper_profiles').select('display_name').eq('user_id', uid).maybeSingle()
        rNameMap[uid] = p?.display_name || 'Neighbor'
      }
      setResources(res.map(r => ({ ...r, offered_by_name: rNameMap[r.offered_by] || 'Neighbor', claimed_by_name: r.claimed_by ? (rNameMap[r.claimed_by] || 'Neighbor') : null })))
    }


    // Load close votes
    const { data: cvotes } = await supabase.from('event_close_votes').select('*').eq('event_id', id)
    if (cvotes) setCloseVotes(cvotes)
    setLoading(false)
  }

  async function submitCheckIn(status) {
    setSubmitting(true)
    await supabase.from('event_check_ins').insert({ event_id: Number(id), user_id: user.id, status, note: statusNote.trim() || null })
    setShowStatusPicker(false)
    setStatusNote('')
    setSubmitting(false)
    await loadAll()
  }

  async function submitResource() {
    if (!resCategory || !resItem.trim()) return
    setSubmitting(true)
    await supabase.from('event_resources').insert({
      event_id: Number(id),
      resource_type: showResourceForm,
      category: resCategory,
      item_name: resItem.trim(),
      quantity: resQty,
      offered_by: user.id,
      note: resNote.trim() || null,
    })
    setShowResourceForm(null)
    setResCategory('')
    setResItem('')
    setResQty(1)
    setResNote('')
    setSubmitting(false)
    await loadAll()
  }

  async function claimResource(resId) {
    await supabase.from('event_resources').update({ claimed_by: user.id, status: 'claimed' }).eq('id', resId)
    await loadAll()
  }

  async function unclaimResource(resId) {
    await supabase.from('event_resources').update({ claimed_by: null, status: 'available' }).eq('id', resId)
    await loadAll()
  }

  async function fulfillResource(resId) {
    await supabase.from('event_resources').update({ status: 'fulfilled' }).eq('id', resId)
    await loadAll()
  }

  async function deleteResource(resId) {
    if (!confirm('Remove this item?')) return
    await supabase.from('event_resources').delete().eq('id', resId)
    await loadAll()
  }

  async function handleSignup(role) {
    setSubmitting(true)
    await supabase.from('event_signups').insert({
      event_id: Number(id), user_id: user.id, role,
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

  async function messageUser(userId) {
    setOpenSignupMenu(null)
    const { data: existing } = await supabase.from('conversations').select('id').or('and(helper_id.eq.' + userId + ',requester_id.eq.' + user.id + '),and(helper_id.eq.' + user.id + ',requester_id.eq.' + userId + ')').maybeSingle()
    if (existing) { navigate('/conversation/' + existing.id); return }
    const { data: convo } = await supabase.from('conversations').insert({ helper_id: userId, requester_id: user.id }).select().single()
    if (convo) navigate('/conversation/' + convo.id)
  }

  async function reportUser(userId) {
    await supabase.from('safety_alerts').insert({ reporter_id: user.id, reported_user_id: userId, alert_type: 'flag', description: 'Reported from emergency event' })
    setOpenSignupMenu(null)
    alert('Report submitted. Thank you for keeping the community safe.')
  }

  async function blockUser(userId) {
    if (!confirm('Block this user?')) return
    await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: userId })
    setOpenSignupMenu(null)
    alert('User blocked.')
  }

  async function deleteSignup(signupId) {
    if (!confirm('Remove this signup?')) return
    await supabase.from('event_signups').delete().eq('id', signupId)
    setOpenSignupMenu(null)
    await loadAll()
  }

  async function saveNotes(signupId) {
    await supabase.from('event_signups').update({ notes: editNotesVal.trim() || null }).eq('id', signupId)
    setEditingNotes(null)
    await loadAll()
  }

  async function switchRole() {
    const newRole = mySignup.role === 'responder' ? 'affected' : 'responder'
    await supabase.from('event_signups').update({ role: newRole }).eq('event_id', id).eq('user_id', user.id)
    await loadAll()
  }

  async function loadActiveEvents() {
    const { data } = await supabase.from('emergency_events').select('id, title, event_type').eq('status', 'active').neq('id', id).order('created_at', { ascending: false })
    setActiveEvents(data || [])
  }

  async function handleCloseEvent() {
    if (!closeReason) return
    setClosingEvent(true)
    const isReporter = event.created_by === user.id
    const canCloseAlone = isAdmin || isReporter

    if (closeReason === 'resolved') {
      if (canCloseAlone) {
        await supabase.from('emergency_events').update({ status: 'closed', resolved_at: new Date().toISOString(), close_reason: 'resolved' }).eq('id', id)
        setClosingEvent(false)
        navigate('/emergency')
        return
      }
      await supabase.from('event_close_votes').upsert({ event_id: Number(id), voter_id: user.id, close_reason: 'resolved' }, { onConflict: 'event_id,voter_id' })
      const { data: votes } = await supabase.from('event_close_votes').select('id').eq('event_id', id)
      if (votes && votes.length >= 2) {
        await supabase.from('emergency_events').update({ status: 'closed', resolved_at: new Date().toISOString(), close_reason: 'resolved' }).eq('id', id)
        setClosingEvent(false)
        navigate('/emergency')
        return
      }
      setClosingEvent(false)
      setShowCloseModal(false)
      alert('Your vote to close has been recorded. One more vote is needed.')
      await loadAll()
      return
    }

    if (closeReason === 'false_alarm') {
      if (isAdmin) {
        await supabase.from('emergency_events').delete().eq('id', id)
        setClosingEvent(false)
        navigate('/emergency')
        return
      }
      if (event.verified) {
        const { data: admins } = await supabase.rpc('nearest_admin', { lat: event.latitude || 0, lng: event.longitude || 0 })
        if (admins && admins.length > 0) {
          for (const admin of admins) {
            await supabase.from('notifications').insert({ user_id: admin.user_id, type: 'false_alarm_request', title: 'False alarm review needed', body: 'Someone flagged "' + event.title + '" as a false alarm. Please review.', link: '/emergency/' + id, read: false })
          }
        }
        setClosingEvent(false)
        setShowCloseModal(false)
        alert('This verified event requires admin approval to mark as false alarm. Admins have been notified.')
        return
      }
      await supabase.from('emergency_events').delete().eq('id', id)
      setClosingEvent(false)
      navigate('/emergency')
      return
    }

    if (closeReason === 'duplicate' && selectedDuplicate) {
      if (isAdmin) {
        await supabase.from('event_close_votes').upsert({ event_id: Number(id), voter_id: user.id, close_reason: 'duplicate', duplicate_event_id: selectedDuplicate }, { onConflict: 'event_id,voter_id' })
        setClosingEvent(false)
        navigate('/admin')
        return
      }
      const { data: admins } = await supabase.rpc('nearest_admin', { lat: event.latitude || 0, lng: event.longitude || 0 })
      if (admins && admins.length > 0) {
        for (const admin of admins) {
          await supabase.from('notifications').insert({ user_id: admin.user_id, type: 'duplicate_merge_request', title: 'Duplicate event merge request', body: '"' + event.title + '" was flagged as a duplicate. Please review and merge.', link: '/admin', read: false })
        }
      }
      await supabase.from('event_close_votes').upsert({ event_id: Number(id), voter_id: user.id, close_reason: 'duplicate', duplicate_event_id: selectedDuplicate }, { onConflict: 'event_id,voter_id' })
      setClosingEvent(false)
      setShowCloseModal(false)
      alert('Admins have been notified to review and merge this event.')
      return
    }

    setClosingEvent(false)
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

  function renderSignupMenu(s) {
    return (
      <>
        <button onClick={(e) => { e.stopPropagation(); setOpenSignupMenu(openSignupMenu === s.id ? null : s.id) }} style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '1.25rem', padding: '4px 6px' }}>&#8943;</button>
        {openSignupMenu === s.id && (
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', right: '0.5rem', top: '2rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '10px', zIndex: 10, minWidth: '160px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
            {s.user_id === user.id ? (
              <>
                <button onClick={() => { setEditingNotes(s.id); setEditNotesVal(s.notes || ''); setOpenSignupMenu(null) }} style={menuBtnStyle}>
                  <span style={{ width: '1.2rem', textAlign: 'center' }}>&#9998;</span> Edit notes
                </button>
                <button onClick={() => deleteSignup(s.id)} style={{ ...menuBtnStyle, color: '#ff4444' }}>
                  <span style={{ width: '1.2rem', textAlign: 'center' }}>&#128465;</span> Remove me
                </button>
              </>
            ) : (
              <>
                {s.user_id !== event.created_by && <button onClick={() => messageUser(s.user_id)} style={menuBtnStyle}>
                  <span style={{ width: '1.2rem', textAlign: 'center' }}>&#128172;</span> Message
                </button>}
                <button onClick={() => reportUser(s.user_id)} style={menuBtnStyle}>
                  <span style={{ width: '1.2rem', textAlign: 'center', color: '#ff4444' }}>&#9873;</span> Report
                </button>
                <button onClick={() => blockUser(s.user_id)} style={menuBtnStyle}>
                  <span style={{ width: '1.2rem', textAlign: 'center' }}>&#128683;</span> Block user
                </button>
              </>
            )}
          </div>
        )}
        {editingNotes === s.id && (
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.35rem' }}>
            <input type="text" value={editNotesVal} onChange={(e) => setEditNotesVal(e.target.value)} style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.85rem' }} />
            <button onClick={() => saveNotes(s.id)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>Save</button>
            <button onClick={() => setEditingNotes(null)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #444', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
          </div>
        )}
      </>
    )
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Loading...</div>
  if (!event) return <div style={{ padding: '2rem', textAlign: 'center' }}>Event not found.</div>

  const responders = signups.filter(s => s.role === 'responder' || s.role === 'coordinator')
  const affected = signups.filter(s => s.role === 'affected')
  const isCoordinator = mySignup?.role === 'coordinator' || event.created_by === user.id
  const myLatest = latestStatuses[user.id]
  const myStatusConf = myLatest ? STATUS_CONFIG[myLatest.status] : null
  const statusCounts = {}
  Object.keys(STATUS_CONFIG).forEach(k => { statusCounts[k] = 0 })
  Object.values(latestStatuses).forEach(c => { if (statusCounts[c.status] !== undefined) statusCounts[c.status]++ })

  const needs = resources.filter(r => r.resource_type === 'need')
  const offers = resources.filter(r => r.resource_type === 'offer')
  const filteredResources = resFilter === 'all' ? resources : resFilter === 'needs' ? needs : resFilter === 'offers' ? offers : resources.filter(r => r.status === resFilter)
  const needsUnfulfilled = needs.filter(r => r.status !== 'fulfilled').length
  const offersAvailable = offers.filter(r => r.status === 'available').length

  const tabStyle = (active) => ({ padding: '0.5rem 0.75rem', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: active ? '#ff6644' : '#2a2a2a', color: active ? '#fff' : '#aaa' })
  const chipStyle = (on) => ({ padding: '0.35rem 0.75rem', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: on ? '#4ecca3' : '#2a2a2a', color: on ? '#1a1a1a' : '#aaa', margin: '0.15rem' })
  const fieldStyle = { display: 'block', width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', marginBottom: '0.5rem' }
  const resCatIcon = { 'Water': '\uD83D\uDCA7', 'Food': '\uD83C\uDF5E', 'Shelter': '\uD83C\uDFE0', 'Tools': '\uD83D\uDD27', 'Transportation': '\uD83D\uDE97', 'Medical': '\u2695', 'Clothing': '\uD83E\uDDE5', 'Power/Fuel': '\u26A1', 'Tarps/Building': '\uD83C\uDFD7', 'Hygiene': '\uD83E\uDDFC', 'Other': '\uD83D\uDCE6' }

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <button onClick={() => navigate('/emergency')} style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer' }}>&#8592;</button>
        <div style={{ flex: 1 }}>
          <span style={{ background: '#ff6644', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{event.event_type}</span>
          <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.3rem' }}>{event.title}</h1>
        </div>
      </div>

      {event.location_name && <p style={{ color: '#aaa', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>{event.location_name} ({event.radius_miles} mile radius)</p>}
      {event.description && <p style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1rem', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>{event.description}</p>}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1, textAlign: 'center', padding: '0.6rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#4ecca3' }}>{responders.length}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Responders</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '0.6rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#ffaa44' }}>{affected.length}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Affected</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '0.6rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#66aaff' }}>{checkIns.length}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Check-ins</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '0.6rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#ff6644' }}>{needsUnfulfilled}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Needs</div>
        </div>
      </div>

      {event.verified && resources.length === 0 && (isCoordinator || event.created_by === user.id) && (
        <div style={{ background: 'linear-gradient(135deg, #1a3a2a, #2a4a3a)', border: '1px solid #4ecca3', borderRadius: '10px', padding: '1rem', marginBottom: '1rem', textAlign: 'center' }}>
          <p style={{ color: '#4ecca3', fontWeight: 700, fontSize: '1rem', margin: '0 0 0.35rem' }}>Event verified!</p>
          <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>Next step: add what resources are needed so responders know how to help.</p>
          <button onClick={() => { setTab('resources'); setShowResourceForm('need') }} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: '#ff6644', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>+ Add Resources Needed</button>
        </div>
      )}

      {mySignup && (
        <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px', padding: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ color: '#aaa', fontSize: '0.8rem' }}>Your status: </span>
            {myStatusConf ? (
              <span style={{ background: myStatusConf.bg, color: myStatusConf.color, fontSize: '0.8rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
                {myStatusConf.icon} {myStatusConf.label}
              </span>
            ) : (
              <span style={{ color: '#666', fontSize: '0.8rem' }}>No check-in yet</span>
            )}
          </div>
          {showStatusPicker && (
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
                {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'no_contact').map(([key, conf]) => (
                  <button key={key} onClick={() => setSelectedStatus(key)} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: 'none', background: selectedStatus === key ? conf.color : conf.bg, color: selectedStatus === key ? '#1a1a1a' : conf.color, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
                    {conf.icon} {conf.label}
                  </button>
                ))}
              </div>
              <input type='text' placeholder='Optional note (e.g. address, what you need)' value={statusNote} onChange={e => setStatusNote(e.target.value)} style={fieldStyle} />
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
            <button onClick={() => { if (showStatusPicker && selectedStatus) { submitCheckIn(selectedStatus) } else { setShowStatusPicker(!showStatusPicker); setSelectedStatus(null) } }} disabled={showStatusPicker && !selectedStatus} style={{ padding: '0.4rem 0.7rem', borderRadius: '6px', border: 'none', background: showStatusPicker && !selectedStatus ? '#666' : '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>
              {myStatusConf ? 'Update' : 'Check in'}
            </button>
            {mySignup.role !== 'coordinator' && <button onClick={switchRole} style={{ background: 'none', border: 'none', color: '#66aaff', cursor: 'pointer', fontSize: '0.8rem' }}>{mySignup.role === 'responder' ? 'Switch to affected' : 'Switch to responder'}</button>}
            <button onClick={cancelSignup} style={{ background: 'none', border: 'none', color: '#ff6666', cursor: 'pointer', fontSize: '0.8rem' }}>Leave</button>
          </div>
        </div>
      )}
      {!mySignup && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={() => setShowSignupForm('responder')} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer' }}>I can help</button>
          <button onClick={() => setShowSignupForm('affected')} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', background: '#ffaa44', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer' }}>I need help</button>
        </div>
      )}

      {showSignupForm && (
        <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', color: showSignupForm === 'responder' ? '#4ecca3' : '#ffaa44' }}>
            {showSignupForm === 'responder' ? 'Sign up to help' : 'Sign up as affected'}
          </h3>
          {showSignupForm === 'responder' && (
            <>
              <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>What skills can you offer?</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.75rem' }}>
                {skillCats.map(s => <button key={s} type="button" onClick={() => toggleSkill(s)} style={chipStyle(selectedSkills.includes(s))}>{s}</button>)}
              </div>
              <input type="text" placeholder="When are you available?" value={signupAvail} onChange={e => setSignupAvail(e.target.value)} style={fieldStyle} />
            </>
          )}
          <textarea placeholder={showSignupForm === 'responder' ? 'Anything else? (truck, chainsaw, generator, etc.)' : 'What do you need? (shelter, food, cleanup, etc.)'} value={signupNotes} onChange={e => setSignupNotes(e.target.value)} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setShowSignupForm(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#aaa', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => handleSignup(showSignupForm)} disabled={submitting} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', background: showSignupForm === 'responder' ? '#4ecca3' : '#ffaa44', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Signing up...' : 'Sign up'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', overflowX: 'auto' }}>
        <button style={tabStyle(tab === 'responders')} onClick={() => setTab('responders')}>Responders ({responders.length})</button>
        <button style={tabStyle(tab === 'affected')} onClick={() => setTab('affected')}>Affected ({affected.length})</button>
        <button style={tabStyle(tab === 'check-ins')} onClick={() => setTab('check-ins')}>Check-ins ({checkIns.length})</button>
        <button style={tabStyle(tab === 'resources')} onClick={() => setTab('resources')}>Resources ({resources.length})</button>
      </div>

      {(tab === 'check-ins' || isCoordinator) && Object.values(latestStatuses).length > 0 && tab !== 'resources' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
          {Object.entries(STATUS_CONFIG).map(([key, conf]) => (
            statusCounts[key] > 0 && <span key={key} style={{ background: conf.bg, color: conf.color, fontSize: '0.75rem', fontWeight: 600, padding: '3px 8px', borderRadius: '4px' }}>{conf.icon} {conf.label}: {statusCounts[key]}</span>
          ))}
        </div>
      )}

      {tab === 'responders' && (
        responders.length === 0 ? <p style={{ textAlign: 'center', color: '#666', padding: '1.5rem' }}>No responders yet. Be the first to sign up.</p> :
        responders.map(s => (
          <div key={s.id} style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AvatarDisplay url={s.avatar_url} userId={s.user_id} size={28} /><span style={{ fontWeight: 700 }}>{s.role === 'coordinator' && <span style={{ color: '#66aaff', marginRight: '4px' }} title="Coordinator">&#9733;</span>}<span onClick={() => navigate('/u/' + s.user_id)} style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#444', textUnderlineOffset: '2px' }}>{s.display_name}</span></span></div>
              <span style={{ color: '#666', fontSize: '0.75rem', marginRight: '1.5rem' }}>{new Date(s.created_at).toLocaleDateString()}</span>
            </div>
            {s.skills && s.skills.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.4rem' }}>{s.skills.map(sk => <span key={sk} style={{ background: '#2a2a2a', color: '#4ecca3', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px' }}>{sk}</span>)}</div>}
            {s.availability && <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>Available: {s.availability}</p>}
            {s.notes && <p style={{ color: '#999', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>{s.notes}</p>}
            {renderSignupMenu(s)}
          </div>
        ))
      )}

      {tab === 'affected' && (
        affected.length === 0 ? <p style={{ textAlign: 'center', color: '#666', padding: '1.5rem' }}>No affected neighbors signed up yet.</p> :
        affected.map(s => {
          const st = latestStatuses[s.user_id]
          const sc = st ? STATUS_CONFIG[st.status] : null
          return (
            <div key={s.id} style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span onClick={() => navigate('/u/' + s.user_id)} style={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#444', textUnderlineOffset: '2px' }}>{s.display_name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1.5rem' }}>
                  {sc && <span style={{ background: sc.bg, color: sc.color, fontSize: '0.7rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }}>{sc.icon} {sc.label}</span>}
                  <span style={{ color: '#666', fontSize: '0.75rem' }}>{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              {s.notes && <p style={{ color: '#999', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>{s.notes}</p>}
              {st && st.note && <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.3rem 0 0', fontStyle: 'italic' }}>"{st.note}"</p>}
              {renderSignupMenu(s)}
            </div>
          )
        })
      )}

      {tab === 'check-ins' && (
        checkIns.length === 0 ? <p style={{ textAlign: 'center', color: '#666', padding: '1.5rem' }}>No check-ins yet.</p> :
        checkIns.map(c => {
          const conf = STATUS_CONFIG[c.status] || STATUS_CONFIG.safe
          return (
            <div key={c.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.6rem 0', borderBottom: '1px solid #2a2a2a' }}>
              <span style={{ background: conf.bg, color: conf.color, fontSize: '1.1rem', width: '2rem', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', flexShrink: 0 }}>{conf.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><AvatarDisplay url={null} userId={c.user_id} size={22} /><span onClick={() => navigate('/u/' + c.user_id)} style={{ fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#444', textUnderlineOffset: '2px' }}>{c.display_name}</span></div>
                  <span style={{ color: '#666', fontSize: '0.75rem' }}>{timeAgo(c.created_at)}</span>
                </div>
                <span style={{ color: conf.color, fontSize: '0.8rem', fontWeight: 600 }}>{conf.label}</span>
                {c.note && <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.2rem 0 0' }}>{c.note}</p>}
              </div>
            </div>
          )
        })
      )}

      {tab === 'resources' && (
        <>
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={() => setShowResourceForm('need')} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: 'none', background: '#ff6644', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>+ We Need</button>
            <button onClick={() => setShowResourceForm('offer')} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>+ I Can Provide</button>
          </div>

          {showResourceForm && (
            <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: '0 0 0.75rem', color: showResourceForm === 'need' ? '#ff6644' : '#4ecca3' }}>
                {showResourceForm === 'need' ? 'What is needed?' : 'What can you provide?'}
              </h3>
              <select value={resCategory} onChange={e => setResCategory(e.target.value)} style={fieldStyle}>
                <option value="">Choose a category</option>
                {RESOURCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="text" placeholder="Item name (e.g. 5-gallon jugs, tarps, hot meals)" value={resItem} onChange={e => setResItem(e.target.value)} maxLength={120} style={fieldStyle} />
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#aaa', fontSize: '0.75rem' }}>Quantity</label>
                  <input type="number" min={1} max={9999} value={resQty} onChange={e => setResQty(parseInt(e.target.value) || 1)} style={fieldStyle} />
                </div>
              </div>
              <input type="text" placeholder="Notes (optional)" value={resNote} onChange={e => setResNote(e.target.value)} maxLength={500} style={fieldStyle} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setShowResourceForm(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#aaa', cursor: 'pointer' }}>Cancel</button>
                <button onClick={submitResource} disabled={submitting || !resCategory || !resItem.trim()} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', background: showResourceForm === 'need' ? '#ff6644' : '#4ecca3', color: showResourceForm === 'need' ? '#fff' : '#1a1a1a', fontWeight: 700, cursor: 'pointer', opacity: submitting || !resCategory || !resItem.trim() ? 0.5 : 1 }}>
                  {submitting ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem', overflowX: 'auto' }}>
            {[['all','All'],['needs','Needs'],['offers','Offers'],['available','Open'],['fulfilled','Fulfilled']].map(([k,l]) => (
              <button key={k} onClick={() => setResFilter(k)} style={{ padding: '0.35rem 0.65rem', borderRadius: '16px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, background: resFilter === k ? '#444' : '#2a2a2a', color: resFilter === k ? '#fff' : '#888' }}>{l}</button>
            ))}
          </div>

          {filteredResources.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>&#128230;</p>
              <p>No resources listed yet. Add what you need or can provide.</p>
            </div>
          ) : (
            filteredResources.map(r => {
              const isNeed = r.resource_type === 'need'
              const isMine = r.offered_by === user.id
              const isClaimed = r.status === 'claimed'
              const isFulfilled = r.status === 'fulfilled'
              const claimedByMe = r.claimed_by === user.id
              const catIcon = resCatIcon[r.category] || '\uD83D\uDCE6'
              return (
                <div key={r.id} style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem', opacity: isFulfilled ? 0.6 : 1, borderLeft: isNeed ? '3px solid #ff6644' : '3px solid #4ecca3' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '1.3rem' }}>{catIcon}</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <span style={{ background: isNeed ? '#3a1a1a' : '#1a3a2a', color: isNeed ? '#ff6644' : '#4ecca3', fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', textTransform: 'uppercase' }}>{isNeed ? 'Need' : 'Offer'}</span>
                          <span style={{ fontSize: '0.7rem', color: '#888' }}>{r.category}</span>
                          {isFulfilled && <span style={{ background: '#1a3a2a', color: '#4ecca3', fontSize: '0.6rem', fontWeight: 600, padding: '1px 5px', borderRadius: '3px' }}>Fulfilled</span>}
                          {isClaimed && !isFulfilled && <span style={{ background: '#1a2a4a', color: '#66aaff', fontSize: '0.6rem', fontWeight: 600, padding: '1px 5px', borderRadius: '3px' }}>Claimed</span>}
                        </div>
                        <p style={{ margin: '0.2rem 0 0', fontWeight: 600, fontSize: '0.95rem', color: '#fff' }}>{r.item_name} {r.quantity > 1 && <span style={{ color: '#aaa', fontWeight: 400 }}>x{r.quantity}</span>}</p>
                      </div>
                    </div>
                    <span style={{ color: '#666', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{timeAgo(r.created_at)}</span>
                  </div>
                  {r.note && <p style={{ color: '#999', fontSize: '0.8rem', margin: '0.35rem 0 0 1.8rem' }}>{r.note}</p>}
                  <div style={{ margin: '0.35rem 0 0 1.8rem', fontSize: '0.75rem', color: '#888' }}>
                    {isNeed ? 'Requested by' : 'Offered by'} {r.offered_by_name}
                    {isClaimed && r.claimed_by_name && <span> &middot; Claimed by {r.claimed_by_name}</span>}
                  </div>
                  {!isFulfilled && (
                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem', marginLeft: '1.8rem', flexWrap: 'wrap' }}>
                      {isNeed && !isClaimed && !claimedByMe && !isMine && (
                        <button onClick={() => claimResource(r.id)} style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>I have this</button>
                      )}
                      {claimedByMe && (
                        <button onClick={() => unclaimResource(r.id)} style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid #666', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.8rem' }}>Unclaim</button>
                      )}
                      {(isCoordinator || isMine) && isClaimed && (
                        <button onClick={() => fulfillResource(r.id)} style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: 'none', background: '#66aaff', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>Mark fulfilled</button>
                      )}
                      {(isCoordinator || isMine) && (
                        <button onClick={() => deleteResource(r.id)} style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid #ff4444', background: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '0.8rem' }}>Remove</button>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </>
      )}

      {event.status === 'active' && (mySignup || event.created_by === user.id || isAdmin) && (
        <>
          {closeVotes.length > 0 && !closeVotes.find(v => v.voter_id === user.id) && (
            <div style={{ background: '#2a2518', border: '1px solid #5a4a2a', borderRadius: '8px', padding: '0.75rem', marginTop: '1rem', textAlign: 'center' }}>
              <p style={{ color: '#ffaa44', fontSize: '0.85rem', margin: 0 }}>{closeVotes.length} participant{closeVotes.length !== 1 ? 's' : ''} voted to close this event</p>
            </div>
          )}
          <button onClick={() => { setShowCloseModal(true); setCloseReason(null); setSelectedDuplicate(null); loadActiveEvents() }} style={{ display: 'block', width: '100%', marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid #ff4444', background: 'none', color: '#ff4444', fontWeight: 600, cursor: 'pointer' }}>Close Event</button>
        </>
      )}

      {showCloseModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#1e1e1e', borderRadius: '14px', padding: '1.5rem', maxWidth: '380px', width: '100%', border: '1px solid #333' }}>
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.2rem', color: '#fff' }}>Close Event</h2>
            <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>Why is this event being closed?</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              <button onClick={() => setCloseReason('resolved')} style={{ padding: '0.75rem', borderRadius: '10px', border: closeReason === 'resolved' ? '2px solid #4ecca3' : '1px solid #444', background: closeReason === 'resolved' ? '#1a3a2a' : '#222', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#4ecca3' }}>Event Resolved</div>
                <div style={{ color: '#aaa', fontSize: '0.8rem', marginTop: '0.15rem' }}>The emergency is over. Close response and archive.</div>
              </button>
              <button onClick={() => setCloseReason('false_alarm')} style={{ padding: '0.75rem', borderRadius: '10px', border: closeReason === 'false_alarm' ? '2px solid #ffaa44' : '1px solid #444', background: closeReason === 'false_alarm' ? '#2a2518' : '#222', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffaa44' }}>False Alarm</div>
                <div style={{ color: '#aaa', fontSize: '0.8rem', marginTop: '0.15rem' }}>{event.verified ? 'Verified events require admin approval.' : 'This event will be removed entirely.'}</div>
              </button>
              <button onClick={() => setCloseReason('duplicate')} style={{ padding: '0.75rem', borderRadius: '10px', border: closeReason === 'duplicate' ? '2px solid #66aaff' : '1px solid #444', background: closeReason === 'duplicate' ? '#1a2a4a' : '#222', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#66aaff' }}>Duplicate Event</div>
                <div style={{ color: '#aaa', fontSize: '0.8rem', marginTop: '0.15rem' }}>This is the same as another event. Admin will merge.</div>
              </button>
            </div>

            {closeReason === 'duplicate' && (
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ color: '#aaa', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Select the original event:</p>
                {activeEvents.length === 0 ? (
                  <p style={{ color: '#666', fontSize: '0.8rem' }}>No other active events found.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '200px', overflowY: 'auto' }}>
                    {activeEvents.map(ae => (
                      <button key={ae.id} onClick={() => setSelectedDuplicate(ae.id)} style={{ padding: '0.6rem', borderRadius: '8px', border: selectedDuplicate === ae.id ? '2px solid #66aaff' : '1px solid #444', background: selectedDuplicate === ae.id ? '#1a2a4a' : '#222', color: '#fff', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: 600 }}>{ae.title}</span>
                        {ae.event_type && <span style={{ color: '#888', marginLeft: '0.5rem', fontSize: '0.75rem' }}>{ae.event_type}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowCloseModal(false)} style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#aaa', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleCloseEvent} disabled={closingEvent || !closeReason || (closeReason === 'duplicate' && !selectedDuplicate)} style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: 'none', background: '#ff4444', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: closingEvent || !closeReason || (closeReason === 'duplicate' && !selectedDuplicate) ? 0.5 : 1 }}>
                {closingEvent ? 'Closing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
