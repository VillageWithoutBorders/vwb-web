import { useState, useEffect, useRef } from 'react'
import { useBlockedBy } from '../utils/blockedBy'
import { NEW_ACCOUNT_NOTE, isNewAccountBlock } from '../utils/newAccount'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import GroupedSkillChips from '../components/GroupedSkillChips'
import { loadSkillCategories } from '../utils/skillGroups'
import AvatarDisplay, { UserName } from '../components/AvatarDisplay'
import { createNotification } from '../utils/notificationHelpers'
import { useMenuPosition } from '../utils/useMenuPosition'
import { submitUserReport } from '../utils/submitUserReport'
import { useGoBack } from '../components/BackLink'
import Icon from '../components/Icon'
import ResponseCamp from '../components/ResponseCamp'
import EventUpdates from '../components/EventUpdates'
import { askConfirm, tell } from '../components/AdminDialog'

const STATUS_CONFIG = {
  safe:        { label: 'Safe',         color: 'var(--accent)', bg: 'var(--success-bg)', icon: 'check' },
  need_help:   { label: 'Needs Help',   color: 'var(--danger)', bg: 'var(--danger-bg)', icon: 'cat-emergency' },
  evacuated:   { label: 'Evacuated',    color: 'var(--info)', bg: 'var(--info-bg)', icon: 'car' },
  sheltering:  { label: 'Sheltering',   color: 'var(--warn)', bg: 'var(--warn-bg)', icon: 'house' },
  no_contact:  { label: 'No Contact',   color: 'var(--danger)', bg: '#4a1a1a', icon: 'question' },
}

const RESOURCE_CATEGORIES = ['Water', 'Food', 'Shelter', 'Tools', 'Transportation', 'Medical', 'Clothing', 'Power/Fuel', 'Tarps/Building', 'Hygiene', 'Other']

const menuBtnStyle = { display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.6rem 0.75rem', background: 'none', border: 'none', color: 'var(--text-soft)', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left' }

export default function EventDetail() {
  const { id } = useParams()
  const { user, profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const blockedBy = useBlockedBy()
  const [event, setEvent] = useState(null)
  const [signups, setSignups] = useState([])
  const [roleCounts, setRoleCounts] = useState([])
  const [mySignup, setMySignup] = useState(null)
  const [loading, setLoading] = useState(true)
  // The event page is the Response Camp: Updates, Who's helping, Needs and supplies, Check-ins, Camp chat.
  // ?tab= opens a tab (alerts use it); ?call= (a group asked to take it on) opens Who's helping.
  const [tab, setTab] = useState(() => {
    const q = new URLSearchParams(window.location.search)
    const t = q.get('tab')
    if (['updates', 'helping', 'needs', 'checkins', 'chat'].includes(t)) return t
    return q.get('call') ? 'helping' : 'updates'
  })
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
  const { menuRef: signupMenuRef, menuStyle: signupMenuStyle, openMenu: positionSignupMenu } = useMenuPosition('right')
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
    const { data: ev, error: evErr } = await supabase.from('emergency_events').select('*').eq('id', id).single()
    if (evErr) console.error('Failed to load event:', evErr)
    if (ev) setEvent(ev)

    const { data: sups, error: supsErr } = await supabase.from('event_signups').select('*').eq('event_id', id)
    if (supsErr) console.error('Failed to load signups:', supsErr)
    if (sups) {
      const withNames = await Promise.all(sups.map(async (s) => {
        const { data: p, error: profErr } = await supabase.from('helper_profiles_public').select('display_name, avatar_url').eq('user_id', s.user_id).maybeSingle()
        if (profErr) console.error('Failed to load profile for', s.user_id, profErr)
        return { ...s, display_name: p?.display_name || 'Neighbor', avatar_url: p?.avatar_url || null }
      }))
      setSignups(withNames)
      setMySignup(withNames.find(s => s.user_id === user.id) || null)
    }

    const { data: rc, error: rcErr } = await supabase.rpc('event_role_counts', { p_event: Number(id) })
    if (rcErr) console.error('Failed to load role counts:', rcErr)
    setRoleCounts(Array.isArray(rc) ? rc : [])

    setSkillCats(await loadSkillCategories())

    const { data: cins, error: cinsErr } = await supabase.from('event_check_ins').select('*').eq('event_id', id).order('created_at', { ascending: false })
    if (cinsErr) console.error('Failed to load check-ins:', cinsErr)
    if (cins) {
      const userIds = [...new Set(cins.map(c => c.user_id))]
      const nameMap = {}
      for (const uid of userIds) {
        const { data: p, error: profErr } = await supabase.from('helper_profiles_public').select('display_name, avatar_url').eq('user_id', uid).maybeSingle()
        if (profErr) console.error('Failed to load profile for', uid, profErr)
        nameMap[uid] = { name: p?.display_name || 'Neighbor', avatar_url: p?.avatar_url || null }
      }
      setCheckIns(cins.map(c => ({ ...c, display_name: nameMap[c.user_id]?.name || 'Neighbor', avatar_url: nameMap[c.user_id]?.avatar_url || null })))
      const latest = {}
      cins.forEach(c => { if (!latest[c.user_id]) latest[c.user_id] = c })
      setLatestStatuses(latest)
    }

    const { data: res, error: resErr } = await supabase.from('event_resources').select('*').eq('event_id', id).order('created_at', { ascending: false })
    if (resErr) console.error('Failed to load resources:', resErr)
    if (res) {
      const rUserIds = [...new Set(res.map(r => r.offered_by).concat(res.filter(r => r.claimed_by).map(r => r.claimed_by)))]
      const rNameMap = {}
      for (const uid of rUserIds) {
        if (!uid) continue
        const { data: p, error: profErr } = await supabase.from('helper_profiles_public').select('display_name, avatar_url').eq('user_id', uid).maybeSingle()
        if (profErr) console.error('Failed to load profile for', uid, profErr)
        rNameMap[uid] = p?.display_name || 'Neighbor'
      }
      setResources(res.map(r => ({ ...r, offered_by_name: rNameMap[r.offered_by] || 'Neighbor', claimed_by_name: r.claimed_by ? (rNameMap[r.claimed_by] || 'Neighbor') : null })))
    }


    // Load close votes
    const { data: cvotes, error: cvotesErr } = await supabase.from('event_close_votes').select('*').eq('event_id', id)
    if (cvotesErr) console.error('Failed to load close votes:', cvotesErr)
    if (cvotes) setCloseVotes(cvotes)
    setLoading(false)
  }

  async function submitCheckIn(status) {
    setSubmitting(true)
    const { error } = await supabase.from('event_check_ins').insert({ event_id: Number(id), user_id: user.id, status, note: statusNote.trim() || null })
    setSubmitting(false)
    if (error) { console.error('Failed to submit check-in:', error); tell('Could not submit your check-in. Try again.', { tone: 'error' }); return }
    setShowStatusPicker(false)
    setStatusNote('')
    await loadAll()
  }

  async function submitResource() {
    if (!resCategory || !resItem.trim()) return
    setSubmitting(true)
    const { error } = await supabase.from('event_resources').insert({
      event_id: Number(id),
      resource_type: showResourceForm,
      category: resCategory,
      item_name: resItem.trim(),
      quantity: resQty,
      offered_by: user.id,
      note: resNote.trim() || null,
    })
    setSubmitting(false)
    if (error) { console.error('Failed to add resource:', error); tell('Could not add this item. Try again.', { tone: 'error' }); return }
    setShowResourceForm(null)
    setResCategory('')
    setResItem('')
    setResQty(1)
    setResNote('')
    await loadAll()
  }

  async function claimResource(resId) {
    const { error } = await supabase.from('event_resources').update({ claimed_by: user.id, status: 'claimed' }).eq('id', resId)
    if (error) { console.error('Failed to claim resource:', error); tell('Could not claim this item. Try again.', { tone: 'error' }); return }
    await loadAll()
  }

  async function unclaimResource(resId) {
    const { error } = await supabase.from('event_resources').update({ claimed_by: null, status: 'available' }).eq('id', resId)
    if (error) { console.error('Failed to unclaim resource:', error); tell('Could not unclaim this item. Try again.', { tone: 'error' }); return }
    await loadAll()
  }

  async function fulfillResource(resId) {
    const { error } = await supabase.from('event_resources').update({ status: 'fulfilled' }).eq('id', resId)
    if (error) { console.error('Failed to mark resource fulfilled:', error); tell('Could not update this item. Try again.', { tone: 'error' }); return }
    await loadAll()
  }

  async function deleteResource(resId) {
    if (!(await askConfirm('Remove this item?', { yes: 'Remove', danger: true }))) return
    const { error } = await supabase.from('event_resources').delete().eq('id', resId)
    if (error) { console.error('Failed to remove resource:', error); tell('Could not remove this item. Try again.', { tone: 'error' }); return }
    await loadAll()
  }

  async function handleSignup(role) {
    setSubmitting(true)
    const { error } = await supabase.from('event_signups').insert({
      event_id: Number(id), user_id: user.id, role,
      skills: role === 'responder' ? selectedSkills : [],
      availability: signupAvail.trim() || null,
      notes: signupNotes.trim() || null,
    })
    setSubmitting(false)
    if (error) { console.error('Failed to sign up:', error); tell('Could not sign up. Try again.', { tone: 'error' }); return }
    setShowSignupForm(null)
    setSignupNotes('')
    setSignupAvail('')
    setSelectedSkills([])
    await loadAll()
  }

  async function cancelSignup() {
    if (!(await askConfirm('Take yourself off this event?', { yes: 'Take me off' }))) return
    const { error } = await supabase.from('event_signups').delete().eq('event_id', id).eq('user_id', user.id)
    if (error) { console.error('Failed to cancel signup:', error); tell('Could not remove you from this event. Try again.', { tone: 'error' }); return }
    await loadAll()
  }

  async function messageUser(userId) {
    setOpenSignupMenu(null)
    const { data: existing, error: existingErr } = await supabase.from('conversations').select('id').or('and(helper_id.eq.' + userId + ',requester_id.eq.' + user.id + '),and(helper_id.eq.' + user.id + ',requester_id.eq.' + userId + ')').maybeSingle()
    if (existingErr) { console.error('Failed to check for an existing conversation:', existingErr); tell('Something went wrong. Try again.', { tone: 'error' }); return }
    if (existing) { navigate('/conversation/' + existing.id); return }
    const { data: convo, error: convoErr } = await supabase.from('conversations').insert({ helper_id: userId, requester_id: user.id }).select().single()
    if (convoErr || !convo) { if (isNewAccountBlock(convoErr)) { tell(NEW_ACCOUNT_NOTE); return } console.error('Failed to start a conversation:', convoErr); tell('Could not start a conversation. Try again.', { tone: 'error' }); return }
    navigate('/conversation/' + convo.id)
  }

  async function reportUser(userId) {
    const { error } = await submitUserReport({ reporterId: user.id, reportedUserId: userId, source: 'event', details: 'Reported from an emergency event' })
    setOpenSignupMenu(null)
    if (error) { tell(error, { tone: 'error' }); return }
    tell('Report submitted. Thank you for keeping the community safe.')
  }

  async function blockUser(userId) {
    if (!(await askConfirm('Block this person?', { yes: 'Block', danger: true }))) return
    const { error } = await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: userId })
    setOpenSignupMenu(null)
    if (error) { console.error('Failed to block user:', error); tell('Could not block this user. Try again.', { tone: 'error' }); return }
    tell('Blocked.')
  }

  async function deleteSignup(signupId) {
    if (!(await askConfirm('Remove this person from the event?', { yes: 'Remove', danger: true }))) return
    const { error } = await supabase.from('event_signups').delete().eq('id', signupId)
    setOpenSignupMenu(null)
    if (error) { console.error('Failed to remove signup:', error); tell('Could not remove this signup. Try again.', { tone: 'error' }); return }
    await loadAll()
  }

  async function saveNotes(signupId) {
    const { error } = await supabase.from('event_signups').update({ notes: editNotesVal.trim() || null }).eq('id', signupId)
    setEditingNotes(null)
    if (error) { console.error('Failed to save notes:', error); tell('Could not save your notes. Try again.', { tone: 'error' }); return }
    await loadAll()
  }

  async function switchRole() {
    const newRole = mySignup.role === 'responder' ? 'affected' : 'responder'
    const { error } = await supabase.from('event_signups').update({ role: newRole }).eq('event_id', id).eq('user_id', user.id)
    if (error) { console.error('Failed to switch role:', error); tell('Could not switch your role. Try again.', { tone: 'error' }); return }
    await loadAll()
  }

  // Hope Ambassadors and admins can verify right here, without going back to the list.
  const [verifying, setVerifying] = useState(false)
  // Hope Ambassadors check emergencies in their own villages (vwb-admin-round3.sql).
  const [canCheck, setCanCheck] = useState(false)
  useEffect(() => {
    if (!id || !(isAdmin || profile?.is_hope_ambassador)) { setCanCheck(false); return }
    if (isAdmin) { setCanCheck(true); return }
    supabase.rpc('can_i_check_emergency', { p_event: Number(id) }).then(({ data, error }) => {
      if (error) { console.error('Failed to check if you can verify:', error); setCanCheck(false); return }
      setCanCheck(!!data)
    })
  }, [id, isAdmin, profile?.is_hope_ambassador])
  async function verifyNow() {
    setVerifying(true)
    const { error } = await supabase.from('emergency_events').update({ verified: true }).eq('id', id)
    setVerifying(false)
    if (error) { console.error('Failed to verify event:', error); tell(error.code === 'P0001' ? error.message : 'Could not verify this event. Try again.', { tone: 'error' }); return }
    if (event.created_by && event.created_by !== user.id) {
      await createNotification({ userId: event.created_by, type: 'emergency_verified', title: 'Emergency Verified', body: event.title + ' was verified. A Response Camp is open for everyone helping.', link: '/emergency/' + id })
    }
    await loadAll()
  }

  async function loadActiveEvents() {
    const { data, error } = await supabase.from('emergency_events').select('id, title, event_type').eq('status', 'active').neq('id', id).order('created_at', { ascending: false })
    if (error) console.error('Failed to load active events:', error)
    setActiveEvents(data || [])
  }

  async function handleCloseEvent() {
    if (!closeReason) return
    setClosingEvent(true)
    const isReporter = event.created_by === user.id
    const canCloseAlone = isAdmin || isReporter

    if (closeReason === 'resolved') {
      if (canCloseAlone) {
        const { error } = await supabase.from('emergency_events').update({ status: 'closed', resolved_at: new Date().toISOString(), close_reason: 'resolved' }).eq('id', id)
        setClosingEvent(false)
        if (error) { console.error('Failed to close event:', error); tell('Could not close this event. Try again.', { tone: 'error' }); return }
        navigate('/emergency')
        return
      }
      const { error: voteErr } = await supabase.from('event_close_votes').upsert({ event_id: Number(id), voter_id: user.id, close_reason: 'resolved' }, { onConflict: 'event_id,voter_id' })
      if (voteErr) { console.error('Failed to record close vote:', voteErr); tell('Could not record your vote. Try again.', { tone: 'error' }); setClosingEvent(false); return }
      const { data: votes, error: votesErr } = await supabase.from('event_close_votes').select('id').eq('event_id', id).eq('close_reason', 'resolved')
      if (votesErr) console.error('Failed to check close votes:', votesErr)
      if (votes && votes.length >= 2) {
        const { error: closeErr } = await supabase.from('emergency_events').update({ status: 'closed', resolved_at: new Date().toISOString(), close_reason: 'resolved' }).eq('id', id)
        setClosingEvent(false)
        if (closeErr) { console.error('Failed to close event:', closeErr); tell('Could not close this event. Try again.', { tone: 'error' }); return }
        navigate('/emergency')
        return
      }
      setClosingEvent(false)
      setShowCloseModal(false)
      tell('Your vote to close has been recorded. One more vote is needed.')
      await loadAll()
      return
    }

    if (closeReason === 'false_alarm') {
      if (isAdmin) {
        // Clear what hangs off the event first, so the delete is not blocked.
        for (const table of ['event_signups', 'event_check_ins', 'event_resources', 'event_close_votes']) {
          const { error: relErr } = await supabase.from(table).delete().eq('event_id', Number(id))
          if (relErr) console.error('Failed to clear ' + table + ' before removing event:', relErr)
        }
        const { error } = await supabase.from('emergency_events').delete().eq('id', id)
        setClosingEvent(false)
        if (error) { console.error('Failed to remove event:', error); tell('Could not remove this event. Try again.', { tone: 'error' }); return }
        navigate('/emergency')
        return
      }
      if (event.verified) {
        const { data: admins, error: adminsErr } = await supabase.rpc('nearest_admin', { lat: event.latitude || 0, lng: event.longitude || 0 })
        if (adminsErr) console.error('Failed to look up admins to notify:', adminsErr)
        if (admins && admins.length > 0) {
          for (const admin of admins) {
            const { error: notifErr } = await supabase.from('notifications').insert({ user_id: admin.user_id, type: 'false_alarm_request', title: 'False alarm review needed', body: 'Someone flagged "' + event.title + '" as a false alarm. Please review.', link: '/emergency/' + id, read: false })
            if (notifErr) console.error('Failed to notify admin', admin.user_id, notifErr)
          }
        }
        setClosingEvent(false)
        setShowCloseModal(false)
        tell('This emergency was already checked, so a VWB admin has to approve marking it a false alarm. They were told.')
        return
      }
      // Unverified events used to be deletable, permanently, by ANY
      // signed-up participant -- not just the person who reported it.
      // Deleting is a hard delete with no undo, so it now follows the same
      // rule as closing an event as resolved: the reporter can retract
      // their own report alone, but anyone else needs a second person to
      // agree first.
      if (isReporter) {
        const { error } = await supabase.from('emergency_events').delete().eq('id', id)
        setClosingEvent(false)
        if (error) { console.error('Failed to remove event:', error); tell('Could not remove this event. Try again.', { tone: 'error' }); return }
        navigate('/emergency')
        return
      }
      const { error: voteErr } = await supabase.from('event_close_votes').upsert({ event_id: Number(id), voter_id: user.id, close_reason: 'false_alarm' }, { onConflict: 'event_id,voter_id' })
      if (voteErr) { console.error('Failed to record close vote:', voteErr); tell('Could not record your vote. Try again.', { tone: 'error' }); setClosingEvent(false); return }
      const { data: faVotes, error: faVotesErr } = await supabase.from('event_close_votes').select('id').eq('event_id', id).eq('close_reason', 'false_alarm')
      if (faVotesErr) console.error('Failed to check close votes:', faVotesErr)
      if (faVotes && faVotes.length >= 2) {
        const { error: delErr } = await supabase.from('emergency_events').delete().eq('id', id)
        setClosingEvent(false)
        if (delErr) { console.error('Failed to remove event:', delErr); tell('Could not remove this event. Try again.', { tone: 'error' }); return }
        navigate('/emergency')
        return
      }
      setClosingEvent(false)
      setShowCloseModal(false)
      tell('Your vote to mark this a false alarm has been recorded. One more vote is needed before the event is removed.')
      await loadAll()
      return
    }

    if (closeReason === 'duplicate' && selectedDuplicate) {
      if (isAdmin) {
        const { error } = await supabase.from('event_close_votes').upsert({ event_id: Number(id), voter_id: user.id, close_reason: 'duplicate', duplicate_event_id: selectedDuplicate }, { onConflict: 'event_id,voter_id' })
        setClosingEvent(false)
        if (error) { console.error('Failed to record duplicate flag:', error); tell('Could not flag this event as a duplicate. Try again.', { tone: 'error' }); return }
        navigate('/admin')
        return
      }
      const { data: admins, error: adminsErr } = await supabase.rpc('nearest_admin', { lat: event.latitude || 0, lng: event.longitude || 0 })
      if (adminsErr) console.error('Failed to look up admins to notify:', adminsErr)
      if (admins && admins.length > 0) {
        for (const admin of admins) {
          const { error: notifErr } = await supabase.from('notifications').insert({ user_id: admin.user_id, type: 'duplicate_merge_request', title: 'Duplicate event merge request', body: '"' + event.title + '" was flagged as a duplicate. Please review and merge.', link: '/admin', read: false })
          if (notifErr) console.error('Failed to notify admin', admin.user_id, notifErr)
        }
      }
      const { error: voteErr } = await supabase.from('event_close_votes').upsert({ event_id: Number(id), voter_id: user.id, close_reason: 'duplicate', duplicate_event_id: selectedDuplicate }, { onConflict: 'event_id,voter_id' })
      setClosingEvent(false)
      if (voteErr) { console.error('Failed to record duplicate vote:', voteErr); tell('Could not flag this event as a duplicate. Try again.', { tone: 'error' }); return }
      setShowCloseModal(false)
      tell('VWB admins were told. They will look and merge it if it is the same emergency.')
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
        <button onClick={(e) => {
            e.stopPropagation()
            const closing = openSignupMenu === s.id
            setOpenSignupMenu(closing ? null : s.id)
            if (!closing) positionSignupMenu(e)
          }} aria-label={'Options for ' + (s.display_name || 'this neighbor')} style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.25rem', padding: '4px 6px' }}>&#8943;</button>
        {openSignupMenu === s.id && (
          <div ref={signupMenuRef} onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '10px', minWidth: '160px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', overflow: 'hidden', ...signupMenuStyle }}>
            {s.user_id === user.id ? (
              <>
                <button onClick={() => { setEditingNotes(s.id); setEditNotesVal(s.notes || ''); setOpenSignupMenu(null) }} style={menuBtnStyle}>
                  <span style={{ width: '1.2rem', textAlign: 'center' }}><Icon name="pencil" /></span> Edit notes
                </button>
                <button onClick={() => deleteSignup(s.id)} style={{ ...menuBtnStyle, color: 'var(--danger)' }}>
                  <span style={{ width: '1.2rem', textAlign: 'center' }}><Icon name="trash" /></span> Remove me
                </button>
              </>
            ) : (
              <>
                {s.user_id !== event.created_by && <button onClick={() => messageUser(s.user_id)} style={menuBtnStyle}>
                  <span style={{ width: '1.2rem', textAlign: 'center' }}><Icon name="envelope" /></span> Message
                </button>}
                <button onClick={() => reportUser(s.user_id)} style={menuBtnStyle}>
                  <span style={{ width: '1.2rem', textAlign: 'center', color: 'var(--danger)' }}><Icon name="flag" /></span> Report
                </button>
                <button onClick={() => blockUser(s.user_id)} style={menuBtnStyle}>
                  <span style={{ width: '1.2rem', textAlign: 'center' }}><Icon name="cross" /></span> Block user
                </button>
              </>
            )}
          </div>
        )}
        {editingNotes === s.id && (
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.35rem' }}>
            <input type="text" value={editNotesVal} onChange={(e) => setEditNotesVal(e.target.value)} style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)', fontSize: '0.85rem' }} />
            <button onClick={() => saveNotes(s.id)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer', fontSize: '0.8125rem' }}>Save</button>
            <button onClick={() => setEditingNotes(null)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8125rem' }}>Cancel</button>
          </div>
        )}
      </>
    )
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
  if (!event) return <div style={{ padding: '2rem', textAlign: 'center' }}>Event not found.</div>

  const responders = signups.filter(s => s.role === 'responder' || s.role === 'coordinator')
  const affected = signups.filter(s => s.role === 'affected')
  const isCoordinator = mySignup?.role === 'coordinator' || event.created_by === user.id
  const canSeeRoster = !!mySignup || isAdmin || event.created_by === user.id
  const countFor = (roles) => roleCounts.filter(c => roles.includes(c.role)).reduce((a, c) => a + Number(c.n), 0)
  const responderCount = canSeeRoster ? responders.length : countFor(['responder', 'coordinator'])
  const affectedCount = canSeeRoster ? affected.length : countFor(['affected'])
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

  const tabStyle = (active) => ({ padding: '0.5rem 0.75rem', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, background: active ? 'var(--danger)' : 'var(--surface-2)', color: active ? 'var(--text-strong)' : 'var(--text-secondary)' })
  const fieldStyle = { display: 'block', width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)', fontSize: '0.85rem', boxSizing: 'border-box', marginBottom: '0.5rem' }
  const resCatIcon = { 'Water': '💧', 'Food': '🍞', 'Shelter': '🏠', 'Tools': '🔧', 'Transportation': '🚗', 'Medical': '⚕', 'Clothing': '🧥', 'Power/Fuel': '⚡', 'Tarps/Building': '🏗', 'Hygiene': '🧼', 'Other': '📦' }

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <button onClick={() => goBack('/emergency')} aria-label="Back to emergency events" style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '1.5rem', cursor: 'pointer' }}>&#8592;</button>
        <div style={{ flex: 1 }}>
          <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '0.8125rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{event.event_type}</span>
          <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.3rem' }}>{event.title}</h1>
        </div>
      </div>

      {!event.verified && event.status === 'active' && canCheck && (
        <div className="ev-verify" role="region" aria-label="Verify this emergency">
          <p><b>Waiting to be checked.</b> You are a Hope Ambassador or VWB admin. If this is real, verify it to open the Response Camp and call the crews that cover this village.</p>
          <button type="button" className="btn btn-primary btn-full" onClick={verifyNow} disabled={verifying}>{verifying ? 'Verifying...' : 'Verify this emergency'}</button>
        </div>
      )}
      {event.location_name && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>{event.location_name} ({event.radius_miles} mile radius)</p>}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1, textAlign: 'center', padding: '0.6rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent)' }}>{responderCount}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Responders</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '0.6rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--warn)' }}>{affectedCount}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Affected</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '0.6rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--info)' }}>{checkIns.length}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Check-ins</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '0.6rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--danger)' }}>{needsUnfulfilled}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Needs</div>
        </div>
      </div>


      {event.verified && resources.length === 0 && (isCoordinator || event.created_by === user.id) && (
        <div style={{ background: 'linear-gradient(135deg, var(--success-bg), var(--success-bg))', border: '1px solid var(--accent)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '1rem', margin: '0 0 0.35rem' }}>Event verified!</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>Next step: add what resources are needed so responders know how to help.</p>
          <button onClick={() => { setTab('needs'); setShowResourceForm('need') }} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: 'var(--danger)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>+ Add Resources Needed</button>
        </div>
      )}

      {mySignup && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>Your status: </span>
            {myStatusConf ? (
              <span style={{ background: myStatusConf.bg, color: myStatusConf.color, fontSize: '0.8125rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
                <Icon name={myStatusConf.icon} /> {myStatusConf.label}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No check-in yet</span>
            )}
          </div>
          {showStatusPicker && (
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
                {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'no_contact').map(([key, conf]) => (
                  <button key={key} onClick={() => setSelectedStatus(key)} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: 'none', background: selectedStatus === key ? conf.color : conf.bg, color: selectedStatus === key ? 'var(--on-accent)' : conf.color, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
                    <Icon name={conf.icon} /> {conf.label}
                  </button>
                ))}
              </div>
              <input type='text' placeholder='Optional note (e.g. address, what you need)' value={statusNote} onChange={e => setStatusNote(e.target.value)} style={fieldStyle} />
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
            <button onClick={() => { if (showStatusPicker && selectedStatus) { submitCheckIn(selectedStatus) } else { setShowStatusPicker(!showStatusPicker); setSelectedStatus(null) } }} disabled={showStatusPicker && !selectedStatus} style={{ padding: '0.4rem 0.7rem', borderRadius: '6px', border: 'none', background: showStatusPicker && !selectedStatus ? '#666' : 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer', fontSize: '0.8125rem' }}>
              {myStatusConf ? 'Update' : 'Check in'}
            </button>
            {mySignup.role !== 'coordinator' && <button onClick={switchRole} style={{ background: 'none', border: 'none', color: 'var(--info)', cursor: 'pointer', fontSize: '0.8125rem' }}>{mySignup.role === 'responder' ? 'Switch to affected' : 'Switch to responder'}</button>}
            <button onClick={cancelSignup} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8125rem' }}>Leave</button>
          </div>
        </div>
      )}
      {!mySignup && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={() => setShowSignupForm('responder')} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer' }}>Offer Help</button>
          <button onClick={() => setShowSignupForm('affected')} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', background: 'var(--warn)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer' }}>I need help</button>
        </div>
      )}

      {showSignupForm && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', color: showSignupForm === 'responder' ? 'var(--accent)' : 'var(--warn)' }}>
            {showSignupForm === 'responder' ? 'Sign up to help' : 'Sign up as affected'}
          </h3>
          {showSignupForm === 'responder' && (
            <>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>What skills can you offer?</p>
              <div style={{ marginBottom: '0.75rem' }}>
                <GroupedSkillChips selected={selectedSkills} skills={skillCats} renderChip={(s) => <button key={s} type="button" className={`skill-chip ${selectedSkills.includes(s) ? 'active' : ''}`} onClick={() => toggleSkill(s)}>{s}</button>} />
              </div>
              <input type="text" placeholder="When are you available?" value={signupAvail} onChange={e => setSignupAvail(e.target.value)} style={fieldStyle} />
            </>
          )}
          <textarea placeholder={showSignupForm === 'responder' ? 'Anything else? (truck, chainsaw, generator, etc.)' : 'What do you need? (shelter, food, cleanup, etc.)'} value={signupNotes} onChange={e => setSignupNotes(e.target.value)} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setShowSignupForm(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => handleSignup(showSignupForm)} disabled={submitting} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', background: showSignupForm === 'responder' ? 'var(--accent)' : 'var(--warn)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Signing up...' : 'Sign up'}
            </button>
          </div>
        </div>
      )}

      <div className="camp-tabs" role="tablist" aria-label="Response Camp">
        {[
          ['updates', 'Updates'],
          ['helping', "Who's helping (" + responderCount + ')'],
          ['needs', 'Needs and supplies (' + needsUnfulfilled + ')'],
          ['checkins', 'Check-ins (' + checkIns.length + ')'],
          ['chat', 'Camp chat'],
        ].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={'camp-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'updates' && <EventUpdates eventId={id} description={event.description} closed={event.status === 'closed'} />}

      {tab === 'chat' && <ResponseCamp part="chat" eventId={id} verified={!!event.verified} closed={event.status === 'closed'} refreshKey={(mySignup?.role || 'none') + ':' + signups.length} />}

      {tab === 'helping' && <ResponseCamp part="groups" eventId={id} verified={!!event.verified} closed={event.status === 'closed'} refreshKey={(mySignup?.role || 'none') + ':' + signups.length} />}
      {tab === 'helping' && canSeeRoster && <h3 className="camp-sub">Helpers ({responders.length})</h3>}

      {(tab === 'checkins' || (isCoordinator && tab === 'helping')) && Object.values(latestStatuses).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
          {Object.entries(STATUS_CONFIG).map(([key, conf]) => (
            statusCounts[key] > 0 && <span key={key} style={{ background: conf.bg, color: conf.color, fontSize: '0.8125rem', fontWeight: 600, padding: '3px 8px', borderRadius: '4px' }}><Icon name={conf.icon} /> {conf.label}: {statusCounts[key]}</span>
          ))}
        </div>
      )}

      {!canSeeRoster && (tab === 'helping' || tab === 'checkins') && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>Names and check-ins are shared with people who sign up for this event. This keeps neighbors in need safe.</p>
      )}

      {canSeeRoster && tab === 'helping' && (
        responders.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>No responders yet. Be the first to sign up.</p> :
        responders.map(s => (
          <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AvatarDisplay url={s.avatar_url} userId={s.user_id} size={28} /><span style={{ fontWeight: 700 }}>{s.role === 'coordinator' && <span style={{ color: 'var(--info)', marginRight: '4px' }} title="Coordinator"><Icon name="star" /></span>}<UserName userId={s.user_id} name={s.display_name} /></span></div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginRight: '1.5rem' }}>{new Date(s.created_at).toLocaleDateString()}</span>
            </div>
            {s.skills && s.skills.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.4rem' }}>{s.skills.map(sk => <span key={sk} style={{ background: 'var(--surface-2)', color: 'var(--accent)', fontSize: '0.8125rem', padding: '2px 6px', borderRadius: '4px' }}>{sk}</span>)}</div>}
            {s.availability && <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', margin: '0.3rem 0 0' }}>Available: {s.availability}</p>}
            {s.notes && <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', margin: '0.3rem 0 0' }}>{s.notes}</p>}
            {renderSignupMenu(s)}
          </div>
        ))
      )}

      {canSeeRoster && tab === 'helping' && <h3 className="camp-sub">Neighbors who need help ({affected.length})</h3>}
      {canSeeRoster && tab === 'helping' && (
        affected.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>No affected neighbors signed up yet.</p> :
        affected.map(s => {
          const st = latestStatuses[s.user_id]
          const sc = st ? STATUS_CONFIG[st.status] : null
          return (
            <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <UserName userId={s.user_id} name={s.display_name} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1.5rem' }}>
                  {sc && <span style={{ background: sc.bg, color: sc.color, fontSize: '0.8125rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }}><Icon name={sc.icon} /> {sc.label}</span>}
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              {s.notes && <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', margin: '0.3rem 0 0' }}>{s.notes}</p>}
              {st && st.note && <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', margin: '0.3rem 0 0', fontStyle: 'italic' }}>"{st.note}"</p>}
              {renderSignupMenu(s)}
            </div>
          )
        })
      )}

      {tab === 'checkins' && (
        checkIns.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>No check-ins yet.</p> :
        checkIns.map(c => {
          const conf = STATUS_CONFIG[c.status] || STATUS_CONFIG.safe
          return (
            <div key={c.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ background: conf.bg, color: conf.color, fontSize: '1.1rem', width: '2rem', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', flexShrink: 0 }}><Icon name={conf.icon} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><AvatarDisplay url={c.avatar_url} userId={c.user_id} size={22} /><UserName userId={c.user_id} name={c.display_name} style={{ fontWeight: 600, fontSize: '0.9rem' }} /></div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{timeAgo(c.created_at)}</span>
                </div>
                <span style={{ color: conf.color, fontSize: '0.8125rem', fontWeight: 600 }}>{conf.label}</span>
                {c.note && <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', margin: '0.2rem 0 0' }}>{c.note}</p>}
              </div>
            </div>
          )
        })
      )}

      {tab === 'needs' && (
        <>
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={() => setShowResourceForm('need')} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: 'none', background: 'var(--danger)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>+ We Need</button>
            <button onClick={() => setShowResourceForm('offer')} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>+ I Can Provide</button>
          </div>

          {showResourceForm && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: '0 0 0.75rem', color: showResourceForm === 'need' ? 'var(--danger)' : 'var(--accent)' }}>
                {showResourceForm === 'need' ? 'What is needed?' : 'What can you provide?'}
              </h3>
              <select value={resCategory} onChange={e => setResCategory(e.target.value)} style={fieldStyle}>
                <option value="">Choose a category</option>
                {RESOURCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="text" placeholder="Item name (e.g. 5-gallon jugs, tarps, hot meals)" value={resItem} onChange={e => setResItem(e.target.value)} maxLength={120} style={fieldStyle} />
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>Quantity</label>
                  <input type="number" min={1} max={9999} value={resQty} onChange={e => setResQty(parseInt(e.target.value) || 1)} style={fieldStyle} />
                </div>
              </div>
              <input type="text" placeholder="Notes (optional)" value={resNote} onChange={e => setResNote(e.target.value)} maxLength={500} style={fieldStyle} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setShowResourceForm(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
                <button onClick={submitResource} disabled={submitting || !resCategory || !resItem.trim()} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', background: showResourceForm === 'need' ? 'var(--danger)' : 'var(--accent)', color: showResourceForm === 'need' ? 'var(--text-strong)' : 'var(--on-accent)', fontWeight: 700, cursor: 'pointer', opacity: submitting || !resCategory || !resItem.trim() ? 0.5 : 1 }}>
                  {submitting ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem', overflowX: 'auto' }}>
            {[['all','All'],['needs','Needs'],['offers','Offers'],['available','Open'],['fulfilled','Fulfilled']].map(([k,l]) => (
              <button key={k} onClick={() => setResFilter(k)} style={{ padding: '0.35rem 0.65rem', borderRadius: '16px', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, background: resFilter === k ? '#444' : 'var(--surface-2)', color: resFilter === k ? 'var(--text-strong)' : 'var(--text-muted)' }}>{l}</button>
            ))}
          </div>

          {filteredResources.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}><Icon name="box" /></p>
              <p>No resources listed yet. Add what you need or can provide.</p>
            </div>
          ) : (
            filteredResources.map(r => {
              const isNeed = r.resource_type === 'need'
              const isMine = r.offered_by === user.id
              const isClaimed = r.status === 'claimed'
              const isFulfilled = r.status === 'fulfilled'
              const claimedByMe = r.claimed_by === user.id
              const catIcon = resCatIcon[r.category] || '📦'
              return (
                <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem', opacity: isFulfilled ? 0.6 : 1, borderLeft: isNeed ? '3px solid var(--danger)' : '3px solid var(--accent)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '1.3rem' }}><Icon name={catIcon} /></span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <span style={{ background: isNeed ? 'var(--danger-bg)' : 'var(--success-bg)', color: isNeed ? 'var(--danger)' : 'var(--accent)', fontSize: '0.8125rem', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', textTransform: 'uppercase' }}>{isNeed ? 'Need' : 'Offer'}</span>
                          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{r.category}</span>
                          {isFulfilled && <span style={{ background: 'var(--success-bg)', color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600, padding: '1px 5px', borderRadius: '3px' }}>Fulfilled</span>}
                          {isClaimed && !isFulfilled && <span style={{ background: 'var(--info-bg)', color: 'var(--info)', fontSize: '0.8125rem', fontWeight: 600, padding: '1px 5px', borderRadius: '3px' }}>Claimed</span>}
                        </div>
                        <p style={{ margin: '0.2rem 0 0', fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-strong)' }}>{r.item_name} {r.quantity > 1 && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>x{r.quantity}</span>}</p>
                      </div>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{timeAgo(r.created_at)}</span>
                  </div>
                  {r.note && <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', margin: '0.35rem 0 0 1.8rem' }}>{r.note}</p>}
                  <div style={{ margin: '0.35rem 0 0 1.8rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    {isNeed ? 'Requested by' : 'Offered by'} {r.offered_by_name}
                    {isClaimed && r.claimed_by_name && <span> &middot; Claimed by {r.claimed_by_name}</span>}
                  </div>
                  {!isFulfilled && (
                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem', marginLeft: '1.8rem', flexWrap: 'wrap' }}>
                      {isNeed && !isClaimed && !claimedByMe && !isMine && (
                        <button onClick={() => claimResource(r.id)} style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer', fontSize: '0.8125rem' }}>I have this</button>
                      )}
                      {claimedByMe && (
                        <button onClick={() => unclaimResource(r.id)} style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8125rem' }}>Unclaim</button>
                      )}
                      {(isCoordinator || isMine) && isClaimed && (
                        <button onClick={() => fulfillResource(r.id)} style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: 'none', background: 'var(--info)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer', fontSize: '0.8125rem' }}>Mark fulfilled</button>
                      )}
                      {(isCoordinator || isMine) && (
                        <button onClick={() => deleteResource(r.id)} style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid var(--danger)', background: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8125rem' }}>Remove</button>
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
            <div style={{ background: 'var(--warn-bg)', border: '1px solid #5a4a2a', borderRadius: '8px', padding: '0.75rem', marginTop: '1rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--warn)', fontSize: '0.85rem', margin: 0 }}>{closeVotes.length} participant{closeVotes.length !== 1 ? 's' : ''} voted to close this event</p>
            </div>
          )}
          <button onClick={() => { setShowCloseModal(true); setCloseReason(null); setSelectedDuplicate(null); loadActiveEvents() }} style={{ display: 'block', width: '100%', marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--danger)', background: 'none', color: 'var(--danger)', fontWeight: 600, cursor: 'pointer' }}>Close Event</button>
        </>
      )}

      {showCloseModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '14px', padding: '1.5rem', maxWidth: '380px', width: '100%', border: '1px solid var(--border)' }}>
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.2rem', color: 'var(--text-strong)' }}>Close Event</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>Why is this event being closed?</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              <button onClick={() => setCloseReason('resolved')} style={{ padding: '0.75rem', borderRadius: '10px', border: closeReason === 'resolved' ? '2px solid var(--accent)' : '1px solid var(--border-strong)', background: closeReason === 'resolved' ? 'var(--success-bg)' : 'var(--surface-2)', color: 'var(--text-strong)', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--accent)' }}>Event Resolved</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: '0.15rem' }}>The emergency is over. Close response and archive.</div>
              </button>
              <button onClick={() => setCloseReason('false_alarm')} style={{ padding: '0.75rem', borderRadius: '10px', border: closeReason === 'false_alarm' ? '2px solid var(--warn)' : '1px solid var(--border-strong)', background: closeReason === 'false_alarm' ? 'var(--warn-bg)' : 'var(--surface-2)', color: 'var(--text-strong)', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--warn)' }}>False Alarm</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: '0.15rem' }}>{event.verified ? 'Verified events require admin approval.' : (event.created_by === user.id ? 'This will permanently remove your report. This can\'t be undone.' : 'This will permanently remove the event once one other participant agrees. This can\'t be undone.')}</div>
              </button>
              <button onClick={() => setCloseReason('duplicate')} style={{ padding: '0.75rem', borderRadius: '10px', border: closeReason === 'duplicate' ? '2px solid var(--info)' : '1px solid var(--border-strong)', background: closeReason === 'duplicate' ? 'var(--info-bg)' : 'var(--surface-2)', color: 'var(--text-strong)', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--info)' }}>Duplicate Event</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: '0.15rem' }}>This is the same as another event. Admin will merge.</div>
              </button>
            </div>

            {closeReason === 'duplicate' && (
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>Select the original event:</p>
                {activeEvents.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No other active events found.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '200px', overflowY: 'auto' }}>
                    {activeEvents.map(ae => (
                      <button key={ae.id} onClick={() => setSelectedDuplicate(ae.id)} style={{ padding: '0.6rem', borderRadius: '8px', border: selectedDuplicate === ae.id ? '2px solid var(--info)' : '1px solid var(--border-strong)', background: selectedDuplicate === ae.id ? 'var(--info-bg)' : 'var(--surface-2)', color: 'var(--text-strong)', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: 600 }}>{ae.title}</span>
                        {ae.event_type && <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', fontSize: '0.8125rem' }}>{ae.event_type}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowCloseModal(false)} style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleCloseEvent} disabled={closingEvent || !closeReason || (closeReason === 'duplicate' && !selectedDuplicate)} style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: 'none', background: 'var(--danger)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: closingEvent || !closeReason || (closeReason === 'duplicate' && !selectedDuplicate) ? 0.5 : 1 }}>
                {closingEvent ? 'Closing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}