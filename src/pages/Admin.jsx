import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import AvatarDisplay from '../components/AvatarDisplay'
import { resetAccountToBase } from '../utils/resetAccount'

// Logs every Supabase error to the console with context so failures never vanish silently.
// Pass a userMessage to also alert the person and let the caller bail out; omit it for
// background reads where a console log is enough. Returns true if there was an error.
function reportError(context, error, userMessage) {
  if (!error) return false
  console.error(`[Admin:${context}]`, error)
  if (userMessage) alert(userMessage)
  return true
}

export default function Admin() {
  const { user, profile, isAdmin, isFounder } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('emergencies')
  const [loading, setLoading] = useState(true)
  const [pendingEvents, setPendingEvents] = useState([])
  const [alerts, setAlerts] = useState([])
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState({})
  const [approvals, setApprovals] = useState([])
  const [adminApplications, setAdminApplications] = useState([])
  const [organizations, setOrganizations] = useState([])
  const [showNewOrgForm, setShowNewOrgForm] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgDesc, setNewOrgDesc] = useState('')
  const [newOrgEmail, setNewOrgEmail] = useState('')
  const [newOrgWebsite, setNewOrgWebsite] = useState('')
  const [newOrgSocial, setNewOrgSocial] = useState('')
  const [memberSearchQuery, setMemberSearchQuery] = useState({})
  const [memberSearchResults, setMemberSearchResults] = useState({})

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadPending(), loadAlerts(), loadUsers(), loadStats(), loadApprovals(), loadAdminApplications(), loadOrganizations()])
    setLoading(false)
  }

  async function loadAdminApplications() {
    const { data, error } = await supabase.from('admin_applications').select('*').eq('status', 'pending').order('created_at', { ascending: false })
    reportError('loadAdminApplications', error)
    if (!data || data.length === 0) { setAdminApplications([]); return }
    const enriched = await Promise.all(data.map(async (a) => {
      const { data: prof, error: profErr } = await supabase.from('helper_profiles').select('display_name, avatar_url').eq('user_id', a.user_id).maybeSingle()
      reportError('loadAdminApplications:profile', profErr)
      let invitedByName = null
      if (a.invited_by) {
        const { data: inviter, error: invErr } = await supabase.from('helper_profiles').select('display_name').eq('user_id', a.invited_by).maybeSingle()
        reportError('loadAdminApplications:inviter', invErr)
        invitedByName = inviter?.display_name || 'an admin'
      }
      return { ...a, applicant_name: prof?.display_name || 'Unnamed', applicant_avatar: prof?.avatar_url || null, invited_by_name: invitedByName }
    }))
    setAdminApplications(enriched)
  }

  async function loadOrganizations() {
    const { data, error } = await supabase.from('organizations').select('*').order('created_at', { ascending: false })
    reportError('loadOrganizations', error)
    if (!data) { setOrganizations([]); return }
    const withMembers = await Promise.all(data.map(async (org) => {
      const { data: members, error: memErr } = await supabase.from('organization_members').select('id, user_id, role').eq('organization_id', org.id)
      reportError('loadOrganizations:members', memErr)
      const enrichedMembers = await Promise.all((members || []).map(async (m) => {
        const { data: prof, error: profErr } = await supabase.from('helper_profiles').select('display_name, avatar_url').eq('user_id', m.user_id).maybeSingle()
        reportError('loadOrganizations:memberProfile', profErr)
        return { ...m, display_name: prof?.display_name || 'Unnamed' }
      }))
      return { ...org, members: enrichedMembers }
    }))
    setOrganizations(withMembers)
  }

  async function createOrganization() {
    if (!newOrgName.trim()) { alert('Organization name is required.'); return }
    const social_links = newOrgSocial.trim() ? { primary: newOrgSocial.trim() } : {}
    const { error } = await supabase.from('organizations').insert({
      name: newOrgName.trim(),
      description: newOrgDesc.trim() || null,
      contact_email: newOrgEmail.trim() || null,
      website_url: newOrgWebsite.trim() || null,
      social_links,
    })
    if (reportError('createOrganization', error, 'Could not create this organization. Try again.')) return
    setNewOrgName(''); setNewOrgDesc(''); setNewOrgEmail(''); setNewOrgWebsite(''); setNewOrgSocial('')
    setShowNewOrgForm(false)
    await loadOrganizations()
  }

  async function toggleOrgApproved(org) {
    const { error } = await supabase.from('organizations').update({ approved: !org.approved }).eq('id', org.id)
    if (reportError('toggleOrgApproved', error, 'Could not update this organization. Try again.')) return
    await loadOrganizations()
  }

  async function searchMembersToAdd(orgId) {
    const query = (memberSearchQuery[orgId] || '').trim()
    if (!query) { setMemberSearchResults(prev => ({ ...prev, [orgId]: [] })); return }
    const { data, error } = await supabase.from('helper_profiles').select('user_id, display_name').ilike('display_name', '%' + query + '%').limit(5)
    reportError('searchMembersToAdd', error)
    setMemberSearchResults(prev => ({ ...prev, [orgId]: data || [] }))
  }

  async function addOrgMember(orgId, userId) {
    const { error } = await supabase.from('organization_members').insert({ organization_id: orgId, user_id: userId })
    if (reportError('addOrgMember', error, 'Could not add this member. They may already be in this organization.')) return
    setMemberSearchResults(prev => ({ ...prev, [orgId]: [] }))
    setMemberSearchQuery(prev => ({ ...prev, [orgId]: '' }))
    await loadOrganizations()
  }

  async function removeOrgMember(memberRowId, orgId) {
    if (!confirm('Remove this member from the organization?')) return
    const { error } = await supabase.from('organization_members').delete().eq('id', memberRowId)
    if (reportError('removeOrgMember', error, 'Could not remove this member. Try again.')) return
    await loadOrganizations()
  }

  async function loadPending() {
    const { data, error } = await supabase.from('emergency_events').select('*').eq('verified', false).eq('status', 'active').order('created_at', { ascending: false })
    reportError('loadPending', error)
    if (data) setPendingEvents(data)
  }

  async function loadAlerts() {
    const { data, error } = await supabase.from('safety_alerts').select('*').order('created_at', { ascending: false }).limit(50)
    reportError('loadAlerts', error)
    if (data) {
      const withNames = await Promise.all(data.map(async (a) => {
        const { data: reporter, error: repErr } = await supabase.from('helper_profiles').select('display_name').eq('user_id', a.reporter_id).maybeSingle()
        reportError('loadAlerts:reporter', repErr)
        const { data: reported, error: repdErr } = a.reported_user_id ? await supabase.from('helper_profiles').select('display_name').eq('user_id', a.reported_user_id).maybeSingle() : { data: null, error: null }
        reportError('loadAlerts:reported', repdErr)
        return { ...a, reporter_name: reporter?.display_name || 'Unknown', reported_name: reported?.display_name || 'Unknown' }
      }))
      setAlerts(withNames)
    }
  }

  async function loadUsers() {
    const { data, error } = await supabase.from('helper_profiles').select('user_id, display_name, avatar_url, is_hope_ambassador, is_available, created_at').order('created_at', { ascending: false })
    reportError('loadUsers', error)
    if (data) {
      const withVouches = await Promise.all(data.map(async (u) => {
        const { count, error: countErr } = await supabase.from('vouches').select('id', { count: 'exact', head: true }).eq('vouchee_id', u.user_id)
        reportError('loadUsers:vouchCount', countErr)
        const { data: prof, error: profErr } = await supabase.from('helper_profiles').select('role').eq('user_id', u.user_id).maybeSingle()
        reportError('loadUsers:role', profErr)
        const { data: app, error: appErr } = await supabase.from('admin_applications').select('status').eq('user_id', u.user_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        reportError('loadUsers:appStatus', appErr)
        return { ...u, vouch_count: count || 0, role: prof?.role || 'member', admin_app_status: app?.status || null }
      }))
      setUsers(withVouches)
    }
  }

  async function loadStats() {
    const { count: userCount, error: e1 } = await supabase.from('helper_profiles').select('id', { count: 'exact', head: true })
    const { count: ambassadorCount, error: e2 } = await supabase.from('helper_profiles').select('id', { count: 'exact', head: true }).eq('is_hope_ambassador', true)
    const { count: requestCount, error: e3 } = await supabase.from('help_requests').select('id', { count: 'exact', head: true })
    const { count: matchCount, error: e4 } = await supabase.from('skill_matches').select('id', { count: 'exact', head: true })
    const { count: eventCount, error: e5 } = await supabase.from('emergency_events').select('id', { count: 'exact', head: true }).eq('status', 'active')
    const { count: alertCount, error: e6 } = await supabase.from('safety_alerts').select('id', { count: 'exact', head: true })
    ;[e1, e2, e3, e4, e5, e6].forEach((e, i) => reportError('loadStats:' + i, e))
    setStats({ users: userCount || 0, ambassadors: ambassadorCount || 0, requests: requestCount || 0, matches: matchCount || 0, events: eventCount || 0, alerts: alertCount || 0 })
  }

  async function loadApprovals() {
    const { data: notifs, error } = await supabase.from('notifications').select('*').in('type', ['false_alarm_request', 'duplicate_merge_request']).eq('read', false).order('created_at', { ascending: false })
    reportError('loadApprovals', error)
    if (!notifs || notifs.length === 0) { setApprovals([]); return }
    const enriched = await Promise.all(notifs.map(async (n) => {
      const eventId = n.type === 'false_alarm_request' ? n.link?.replace('/emergency/', '') : null
      let event = null
      let duplicateEvent = null
      let targetEvent = null
      if (n.type === 'false_alarm_request' && eventId) {
        const { data, error: e1 } = await supabase.from('emergency_events').select('*').eq('id', Number(eventId)).maybeSingle()
        reportError('loadApprovals:event', e1)
        event = data
      }
      if (n.type === 'duplicate_merge_request') {
        const { data: votes, error: e2 } = await supabase.from('event_close_votes').select('*').eq('close_reason', 'duplicate').order('created_at', { ascending: false }).limit(10)
        reportError('loadApprovals:votes', e2)
        const vote = votes?.find(v => {
          return n.body?.includes('"') && n.created_at && Math.abs(new Date(v.created_at) - new Date(n.created_at)) < 60000
        }) || votes?.[0]
        if (vote) {
          const { data: dup, error: e3 } = await supabase.from('emergency_events').select('*').eq('id', vote.event_id).maybeSingle()
          reportError('loadApprovals:dup', e3)
          const { data: tgt, error: e4 } = await supabase.from('emergency_events').select('*').eq('id', vote.duplicate_event_id).maybeSingle()
          reportError('loadApprovals:tgt', e4)
          duplicateEvent = dup
          targetEvent = tgt
        }
      }
      return { ...n, event, duplicateEvent, targetEvent }
    }))
    setApprovals(enriched)
  }

  async function verifyEvent(eventId) {
    const { error } = await supabase.from('emergency_events').update({ verified: true }).eq('id', eventId)
    if (reportError('verifyEvent', error, 'Could not verify this event. Try again.')) return
    await loadPending()
  }

  async function rejectEvent(eventId) {
    if (!confirm('Reject and close this event report?')) return
    const { error } = await supabase.from('emergency_events').update({ status: 'closed' }).eq('id', eventId)
    if (reportError('rejectEvent', error, 'Could not reject this event. Try again.')) return
    await loadPending()
  }

  async function approveFalseAlarm(notif) {
    if (!confirm('Delete this event as a false alarm?')) return
    const eventId = notif.link?.replace('/emergency/', '')
    if (eventId) {
      const { error: e1 } = await supabase.from('event_signups').delete().eq('event_id', Number(eventId))
      reportError('approveFalseAlarm:signups', e1)
      const { error: e2 } = await supabase.from('event_check_ins').delete().eq('event_id', Number(eventId))
      reportError('approveFalseAlarm:checkins', e2)
      const { error: e3 } = await supabase.from('event_resources').delete().eq('event_id', Number(eventId))
      reportError('approveFalseAlarm:resources', e3)
      const { error: e4 } = await supabase.from('event_close_votes').delete().eq('event_id', Number(eventId))
      reportError('approveFalseAlarm:closevotes', e4)
      const { error: e5 } = await supabase.from('emergency_events').delete().eq('id', Number(eventId))
      if (reportError('approveFalseAlarm:event', e5, 'Could not delete the event. Try again.')) return
    }
    const { error: e6 } = await supabase.from('notifications').update({ read: true }).eq('id', notif.id)
    reportError('approveFalseAlarm:notif', e6)
    await loadApprovals()
  }

  async function rejectFalseAlarm(notif) {
    const { error: e1 } = await supabase.from('notifications').update({ read: true }).eq('id', notif.id)
    reportError('rejectFalseAlarm:notif', e1)
    const eventId = notif.link?.replace('/emergency/', '')
    if (eventId) {
      const { error: e2 } = await supabase.from('event_close_votes').delete().eq('event_id', Number(eventId)).eq('close_reason', 'false_alarm')
      reportError('rejectFalseAlarm:closevotes', e2)
    }
    await loadApprovals()
  }

  async function approveDuplicateMerge(notif) {
    if (!notif.duplicateEvent || !notif.targetEvent) { alert('Could not find both events. They may have already been resolved.'); return }
    if (!confirm('Merge "' + notif.duplicateEvent.title + '" into "' + notif.targetEvent.title + '"?')) return
    const dupId = notif.duplicateEvent.id
    const tgtId = notif.targetEvent.id
    const { error: e1 } = await supabase.from('event_signups').update({ event_id: tgtId }).eq('event_id', dupId)
    reportError('approveDuplicateMerge:signups', e1)
    const { error: e2 } = await supabase.from('event_check_ins').update({ event_id: tgtId }).eq('event_id', dupId)
    reportError('approveDuplicateMerge:checkins', e2)
    const { error: e3 } = await supabase.from('event_resources').update({ event_id: tgtId }).eq('event_id', dupId)
    reportError('approveDuplicateMerge:resources', e3)
    const { error: e4 } = await supabase.from('emergency_events').update({ status: 'closed', resolved_at: new Date().toISOString(), close_reason: 'duplicate', merged_into_event_id: tgtId }).eq('id', dupId)
    if (reportError('approveDuplicateMerge:event', e4, 'Could not merge the events. Try again.')) return
    const { error: e5 } = await supabase.from('notifications').update({ read: true }).eq('id', notif.id)
    reportError('approveDuplicateMerge:notif', e5)
    const { error: e6 } = await supabase.from('event_close_votes').delete().eq('event_id', dupId)
    reportError('approveDuplicateMerge:closevotes', e6)
    await loadApprovals()
    await loadPending()
  }

  async function rejectDuplicateMerge(notif) {
    const { error: e1 } = await supabase.from('notifications').update({ read: true }).eq('id', notif.id)
    reportError('rejectDuplicateMerge:notif', e1)
    if (notif.duplicateEvent) {
      const { error: e2 } = await supabase.from('event_close_votes').delete().eq('event_id', notif.duplicateEvent.id).eq('close_reason', 'duplicate')
      reportError('rejectDuplicateMerge:closevotes', e2)
    }
    await loadApprovals()
  }
  async function promoteUser(userId, toRole) {
    if (toRole === 'ambassador') {
      const { error } = await supabase.from('helper_profiles').update({ is_hope_ambassador: true }).eq('user_id', userId)
      if (reportError('promoteUser:ambassador', error, 'Could not update this user. Try again.')) return
      await loadUsers()
    } else if (toRole === 'admin') {
      if (!confirm('Send admin invitation to this user? They will see it on their profile.')) return
      const { data: existing, error: existErr } = await supabase.from('admin_applications').select('id, status').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (reportError('promoteUser:checkExisting', existErr, 'Could not check this user. Try again.')) return
      if (existing && existing.status === 'invited') { alert("This user already has an invitation waiting, they haven't responded yet."); return }
      if (existing && existing.status === 'pending') { alert('This user already accepted an invitation. Go to the Approvals tab to finish granting them access.'); setTab('approvals'); return }
      const { error: insErr } = await supabase.from('admin_applications').insert({ user_id: userId, region: 'Invited by admin', reason: 'Admin invitation', status: 'invited', invited_by: user.id })
      if (reportError('promoteUser:insertInvite', insErr, 'Could not send the invitation. Try again.')) return
      const { error: notifErr } = await supabase.from('notifications').insert({ user_id: userId, type: 'admin_invite', title: 'You have been invited to become an Admin', body: 'Check your profile to accept or decline.', link: '/profile', read: false })
      reportError('promoteUser:notify', notifErr)
      await loadUsers()
    }
  }
  async function approveAdminApplication(app) {
    if (!confirm('Grant admin access to ' + (app.applicant_name || 'this user') + '?')) return
    const { error: roleErr } = await supabase.from('helper_profiles').update({ role: 'admin' }).eq('user_id', app.user_id)
    if (reportError('approveAdminApplication:role', roleErr, 'Could not grant admin access. Try again.')) return
    const { error: statusErr } = await supabase.from('admin_applications').update({ status: 'approved' }).eq('id', app.id)
    reportError('approveAdminApplication:status', statusErr)
    const { error: notifErr } = await supabase.from('notifications').insert({ user_id: app.user_id, type: 'admin_invite_approved', title: 'You are now an Admin', body: 'Your admin access has been confirmed. Find the Admin Panel from your profile.', link: '/admin', read: false })
    reportError('approveAdminApplication:notify', notifErr)
    await loadAdminApplications()
    await loadUsers()
  }
  async function declineAdminApplication(app) {
    if (!confirm('Decline this admin request?')) return
    const { error } = await supabase.from('admin_applications').update({ status: 'declined' }).eq('id', app.id)
    if (reportError('declineAdminApplication', error, 'Could not decline this request. Try again.')) return
    const { error: notifErr } = await supabase.from('notifications').insert({ user_id: app.user_id, type: 'admin_invite_declined', title: 'Your admin request was not approved', body: '', link: '/profile', read: false })
    reportError('declineAdminApplication:notify', notifErr)
    await loadAdminApplications()
  }
  async function demoteUser(userId) {
    if (!confirm('Remove admin role from this user?')) return
    const { error } = await supabase.from('helper_profiles').update({ role: 'member' }).eq('user_id', userId)
    if (reportError('demoteUser', error, 'Could not remove admin access. Try again.')) return
    await loadUsers()
  }
  // Resets any non-founder user's account back to a plain Neighbor: clears
  // Ambassador status/details and any admin coverage area, and drops their
  // role to member. Shares its logic with Profile's own self-service reset.
  async function resetUserToBase(u) {
    if (!confirm('Reset ' + (u.display_name || 'this user') + ' back to a plain Neighbor account? This clears their Ambassador status, skills, and admin settings.')) return
    const { error } = await resetAccountToBase(u.user_id, { currentRole: u.role })
    if (reportError('resetUserToBase', error, 'Could not reset this user. Try again.')) return
    await loadUsers()
  }
  async function messageUser(userId) {
    const { data: convos, error: convoErr } = await supabase.from('conversations').select('id, helper_id, requester_id').or('helper_id.eq.' + userId + ',requester_id.eq.' + userId)
    reportError('messageUser:lookup', convoErr)
    const existing = (convos || []).find(c => (c.helper_id === user.id || c.requester_id === user.id) && (c.helper_id === userId || c.requester_id === userId))
    if (existing) { navigate('/conversation/' + existing.id); return }
    const { data: newConvo, error: createErr } = await supabase.from('conversations').insert({ helper_id: user.id, requester_id: userId }).select().single()
    if (reportError('messageUser:create', createErr, 'Could not start a conversation. Try again.')) return
    navigate('/conversation/' + newConvo.id)
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>&#128274;</p>
        <p style={{ fontWeight: 700 }}>Admin access only</p>
        <button onClick={() => navigate('/profile')} style={{ marginTop: '1rem', padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer' }}>Back to Profile</button>
      </div>
    )
  }

  function timeAgo(ts) {
    const d = new Date(ts)
    const diff = Date.now() - d.getTime()
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 1) return 'Just now'
    if (hrs < 24) return hrs + 'h ago'
    return Math.floor(hrs / 24) + 'd ago'
  }

  const tabStyle = (active) => ({ padding: '0.5rem 0.85rem', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', background: active ? '#4ecca3' : '#2a2a2a', color: active ? '#1a1a1a' : '#aaa' })
  const cardStyle = { background: '#1e1e1e', border: '1px solid #333', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem' }

  const falseAlarms = approvals.filter(a => a.type === 'false_alarm_request')
  const duplicates = approvals.filter(a => a.type === 'duplicate_merge_request')

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <button onClick={() => navigate('/profile')} style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer' }}>&#8592;</button>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#4ecca3', flex: 1 }}>Admin Panel</h1>
        <button onClick={() => navigate('/admin/report')} style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #4ecca3', background: 'none', color: '#4ecca3', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem', display: isFounder ? 'inline-block' : 'none' }}>Grant Report</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4ecca3' }}>{stats.users}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Users</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4ecca3' }}>{stats.ambassadors}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Ambassadors</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4ecca3' }}>{stats.requests}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Requests</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#66aaff' }}>{stats.matches}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Matches</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ff6644' }}>{stats.events}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Events</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: stats.alerts > 0 ? '#ff4444' : '#888' }}>{stats.alerts}</div>
          <div style={{ fontSize: '0.7rem', color: '#888' }}>Reports</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginBottom: '1rem' }}>
        <button style={tabStyle(tab === 'approvals')} onClick={() => setTab('approvals')}>Approvals {(approvals.length + adminApplications.length) > 0 && <span style={{ marginLeft: '0.3rem', background: '#ff4444', color: '#fff', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '8px' }}>{approvals.length + adminApplications.length}</span>}</button>
        <button style={tabStyle(tab === 'emergencies')} onClick={() => setTab('emergencies')}>Emergencies ({pendingEvents.length})</button>
        <button style={tabStyle(tab === 'users')} onClick={() => setTab('users')}>Users ({users.length})</button>
        <button style={tabStyle(tab === 'reports')} onClick={() => setTab('reports')}>Reports ({alerts.length})</button>
        <button style={tabStyle(tab === 'organizations')} onClick={() => setTab('organizations')}>Organizations ({organizations.length})</button>
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>Loading...</p>}

      {!loading && tab === 'approvals' && (
        <>
          {approvals.length === 0 && adminApplications.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>No pending approvals</p>
          ) : (
            <>
              {isFounder && adminApplications.length > 0 && (
                <>
                  <h3 style={{ fontSize: '0.85rem', color: '#4ecca3', margin: '0.5rem 0' }}>Admin Access Requests</h3>
                  {adminApplications.map(a => (
                    <div key={a.id} style={{ ...cardStyle, borderLeft: '3px solid #4ecca3' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                          <AvatarDisplay url={a.applicant_avatar} userId={a.user_id} size={32} />
                          <div>
                            <span style={{ background: '#1a4a3a', color: '#4ecca3', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>ADMIN REQUEST</span>
                            <h4 style={{ margin: '0.4rem 0 0.2rem', fontSize: '0.95rem', color: '#eee' }}>{a.applicant_name}</h4>
                          </div>
                        </div>
                        <span style={{ color: '#888', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}</span>
                      </div>
                      {a.invited_by_name ? (
                        <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.2rem 0' }}>Accepted the invitation sent by {a.invited_by_name}</p>
                      ) : (
                        <>
                          {a.region && <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.2rem 0' }}>Region: {a.region}</p>}
                          {a.reason && <p style={{ color: '#999', fontSize: '0.8rem', margin: '0.2rem 0' }}>{a.reason}</p>}
                        </>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button onClick={() => approveAdminApplication(a)} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Grant Admin Access</button>
                        <button onClick={() => declineAdminApplication(a)} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid #666', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.85rem' }}>Decline</button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {falseAlarms.length > 0 && (
                <>
                  <h3 style={{ fontSize: '0.85rem', color: '#ffaa44', margin: '0.5rem 0' }}>False Alarm Reports</h3>
                  {falseAlarms.map(n => (
                    <div key={n.id} style={{ ...cardStyle, borderLeft: '3px solid #ffaa44' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ background: '#3a2a1a', color: '#ffaa44', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>FALSE ALARM</span>
                          <h4 style={{ margin: '0.4rem 0 0.2rem', fontSize: '0.95rem', color: '#eee' }}>{n.event?.title || 'Unknown event'}</h4>
                        </div>
                        <span style={{ color: '#888', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</span>
                      </div>
                      {n.event?.location_name && <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.2rem 0' }}>{n.event.location_name}</p>}
                      {n.event?.description && <p style={{ color: '#999', fontSize: '0.8rem', margin: '0.2rem 0' }}>{n.event.description}</p>}
                      <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.3rem 0' }}>Signups: {n.event?.signup_count || 0} | Verified: {n.event?.verified ? 'Yes' : 'No'}</p>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button onClick={() => approveFalseAlarm(n)} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', background: '#ffaa44', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Confirm False Alarm</button>
                        <button onClick={() => rejectFalseAlarm(n)} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid #666', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.85rem' }}>Keep Event</button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {duplicates.length > 0 && (
                <>
                  <h3 style={{ fontSize: '0.85rem', color: '#66aaff', margin: '0.75rem 0 0.5rem' }}>Duplicate Merge Requests</h3>
                  {duplicates.map(n => (
                    <div key={n.id} style={{ ...cardStyle, borderLeft: '3px solid #66aaff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{ background: '#1a2a3a', color: '#66aaff', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>DUPLICATE</span>
                        <span style={{ color: '#888', fontSize: '0.7rem' }}>{timeAgo(n.created_at)}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.5rem', margin: '0.5rem 0', alignItems: 'center' }}>
                        <div style={{ background: '#2a1a1a', borderRadius: '8px', padding: '0.5rem', border: '1px solid #ff6644' }}>
                          <p style={{ fontSize: '0.7rem', color: '#ff6644', margin: '0 0 0.2rem', fontWeight: 600 }}>Remove</p>
                          <p style={{ fontSize: '0.85rem', color: '#eee', margin: 0, fontWeight: 600 }}>{n.duplicateEvent?.title || 'Unknown'}</p>
                          {n.duplicateEvent?.location_name && <p style={{ fontSize: '0.7rem', color: '#aaa', margin: '0.2rem 0 0' }}>{n.duplicateEvent.location_name}</p>}
                        </div>
                        <span style={{ color: '#666', fontSize: '1.2rem' }}>&#8594;</span>
                        <div style={{ background: '#1a2a1a', borderRadius: '8px', padding: '0.5rem', border: '1px solid #4ecca3' }}>
                          <p style={{ fontSize: '0.7rem', color: '#4ecca3', margin: '0 0 0.2rem', fontWeight: 600 }}>Keep</p>
                          <p style={{ fontSize: '0.85rem', color: '#eee', margin: 0, fontWeight: 600 }}>{n.targetEvent?.title || 'Unknown'}</p>
                          {n.targetEvent?.location_name && <p style={{ fontSize: '0.7rem', color: '#aaa', margin: '0.2rem 0 0' }}>{n.targetEvent.location_name}</p>}
                        </div>
                      </div>
                      <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.2rem 0' }}>Signups and resources from the duplicate will be moved to the kept event.</p>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button onClick={() => approveDuplicateMerge(n)} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', background: '#66aaff', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Merge Events</button>
                        <button onClick={() => rejectDuplicateMerge(n)} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid #666', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.85rem' }}>Dismiss</button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </>
      )}

      {!loading && tab === 'emergencies' && (
        <>
          {pendingEvents.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>No pending emergency reports</p>
          ) : pendingEvents.map(ev => (
            <div key={ev.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ background: '#ffaa44', color: '#1a1a1a', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>PENDING</span>
                  <h3 style={{ margin: '0.4rem 0 0.2rem', fontSize: '1rem' }}>{ev.title}</h3>
                </div>
                <span style={{ color: '#888', fontSize: '0.75rem' }}>{timeAgo(ev.created_at)}</span>
              </div>
              {ev.location_name && <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.2rem 0' }}>{ev.location_name}</p>}
              {ev.description && <p style={{ color: '#999', fontSize: '0.8rem', margin: '0.2rem 0' }}>{ev.description}</p>}
              <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.4rem 0' }}>Upvotes: {ev.upvote_count || 0} / 2 needed</p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button onClick={() => verifyEvent(ev.id)} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Approve</button>
                <button onClick={() => rejectEvent(ev.id)} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid #ff4444', background: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '0.85rem' }}>Reject</button>
              </div>
            </div>
          ))}
        </>
      )}

      {!loading && tab === 'users' && (
        <>
          {users.map(u => (
            <div key={u.user_id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AvatarDisplay url={u.avatar_url} userId={u.user_id} size={32} />
                  <div>
                    <span onClick={() => navigate('/u/' + u.user_id)} style={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#444', textUnderlineOffset: '2px' }}>{u.display_name || 'Unnamed'}</span>
                    {u.role === 'founder' && <span style={{ marginLeft: '0.4rem', background: '#3a1a4a', color: '#c77dff', fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: '4px' }}>Founder</span>}
                    {u.role === 'admin' && <span style={{ marginLeft: '0.4rem', background: '#1a3a5a', color: '#66aaff', fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: '4px' }}>Admin</span>}
                    {u.is_hope_ambassador && <span style={{ marginLeft: '0.4rem', background: '#1a4a3a', color: '#4ecca3', fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: '4px' }}>Ambassador</span>}
                  </div>
                </div>
                <span style={{ color: '#888', fontSize: '0.7rem' }}>{u.vouch_count} vouches</span>
              </div>
              <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.3rem 0 0' }}>Joined {new Date(u.created_at).toLocaleDateString()}</p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                {!u.is_hope_ambassador && (
                  <button onClick={() => promoteUser(u.user_id, 'ambassador')} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: 'none', background: '#2d5a45', color: '#4ecca3', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>Make Ambassador</button>
                )}
                {isFounder && u.role !== 'admin' && u.role !== 'founder' && u.is_hope_ambassador && u.user_id !== user.id && (
                  u.admin_app_status === 'invited' ? (
                    <span style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', background: '#1a3a5a', color: '#66aaff', fontSize: '0.75rem', fontWeight: 600 }}>Invite Sent</span>
                  ) : u.admin_app_status === 'pending' ? (
                    <button onClick={() => setTab('approvals')} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: 'none', background: '#4ecca3', color: '#1a1a1a', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>Review in Approvals</button>
                  ) : (
                    <button onClick={() => promoteUser(u.user_id, 'admin')} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: 'none', background: '#1a3a5a', color: '#66aaff', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>{u.admin_app_status === 'declined' ? 'Invite Admin Again' : 'Invite Admin'}</button>
                  )
                )}
                {(u.role === 'admin' || u.role === 'founder') && u.user_id !== user.id && (
                  <button onClick={() => demoteUser(u.user_id)} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #ff4444', background: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '0.75rem' }}>Remove Admin</button>
                )}
                {u.role !== 'founder' && u.user_id !== user.id && (u.is_hope_ambassador || u.role === 'admin') && (
                  <button onClick={() => resetUserToBase(u)} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #666', background: 'none', color: '#999', cursor: 'pointer', fontSize: '0.75rem' }}>Reset to Neighbor</button>
                )}
                <button onClick={() => messageUser(u.user_id)} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #444', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.75rem' }}>Message</button>
              </div>
            </div>
          ))}
        </>
      )}

      {!loading && tab === 'reports' && (
        <>
          {alerts.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>No safety reports</p>
          ) : alerts.map(a => (
            <div key={a.id} style={{ ...cardStyle, borderLeft: '3px solid #ff4444' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ background: '#3a1a1a', color: '#ff6666', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{a.alert_type}</span>
                <span style={{ color: '#888', fontSize: '0.75rem' }}>{timeAgo(a.created_at)}</span>
              </div>
              <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0.4rem 0 0.2rem' }}>
                <span style={{ color: '#aaa' }}>Reported by:</span> {a.reporter_name}
                {a.reported_user_id && <span style={{ color: '#aaa' }}> about </span>}
                {a.reported_user_id && a.reported_name}
              </p>
              {a.description && <p style={{ color: '#999', fontSize: '0.85rem', margin: '0.2rem 0' }}>{a.description}</p>}
            </div>
          ))}
        </>
      )}

      {!loading && tab === 'organizations' && (
        <>
          <button onClick={() => setShowNewOrgForm(v => !v)} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px dashed #4ecca3', background: 'none', color: '#4ecca3', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{showNewOrgForm ? 'Cancel' : '+ New Organization'}</button>

          {showNewOrgForm && (
            <div style={{ ...cardStyle, marginBottom: '0.75rem' }}>
              <input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="Organization name *" style={{ width: '100%', padding: '0.5rem', marginBottom: '0.4rem', borderRadius: '6px', border: '1px solid #444', background: '#111', color: '#eee', fontSize: '0.85rem' }} />
              <textarea value={newOrgDesc} onChange={(e) => setNewOrgDesc(e.target.value)} placeholder="Short description" style={{ width: '100%', padding: '0.5rem', marginBottom: '0.4rem', borderRadius: '6px', border: '1px solid #444', background: '#111', color: '#eee', fontSize: '0.85rem', minHeight: '3rem' }} />
              <input value={newOrgEmail} onChange={(e) => setNewOrgEmail(e.target.value)} placeholder="Contact email" style={{ width: '100%', padding: '0.5rem', marginBottom: '0.4rem', borderRadius: '6px', border: '1px solid #444', background: '#111', color: '#eee', fontSize: '0.85rem' }} />
              <input value={newOrgWebsite} onChange={(e) => setNewOrgWebsite(e.target.value)} placeholder="Website URL" style={{ width: '100%', padding: '0.5rem', marginBottom: '0.4rem', borderRadius: '6px', border: '1px solid #444', background: '#111', color: '#eee', fontSize: '0.85rem' }} />
              <input value={newOrgSocial} onChange={(e) => setNewOrgSocial(e.target.value)} placeholder="Social media link (optional)" style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#111', color: '#eee', fontSize: '0.85rem' }} />
              <button onClick={createOrganization} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Create Organization</button>
            </div>
          )}

          {organizations.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>No organizations yet</p>
          ) : organizations.map(org => (
            <div key={org.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ background: org.approved ? '#1a4a3a' : '#3a2a1a', color: org.approved ? '#4ecca3' : '#ffaa44', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>{org.approved ? 'APPROVED' : 'PENDING APPROVAL'}</span>
                  <h4 style={{ margin: '0.4rem 0 0.2rem', fontSize: '0.95rem', color: '#eee' }}>{org.name}</h4>
                </div>
                <button onClick={() => toggleOrgApproved(org)} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', background: org.approved ? 'none' : '#4ecca3', color: org.approved ? '#ff4444' : '#1a1a1a', border: org.approved ? '1px solid #ff4444' : 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{org.approved ? 'Unapprove' : 'Approve'}</button>
              </div>
              {org.description && <p style={{ color: '#999', fontSize: '0.8rem', margin: '0.3rem 0' }}>{org.description}</p>}
              {(org.contact_email || org.website_url) && (
                <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.2rem 0' }}>
                  {org.contact_email}{org.contact_email && org.website_url ? ' \u00b7 ' : ''}{org.website_url}
                </p>
              )}

              <p style={{ color: '#4ecca3', fontSize: '0.75rem', fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Members ({org.members.length})</p>
              {org.members.length === 0 && <p style={{ color: '#666', fontSize: '0.75rem', margin: '0 0 0.4rem' }}>No members yet</p>}
              {org.members.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0' }}>
                  <span style={{ fontSize: '0.8rem', color: '#ccc' }}>{m.display_name}</span>
                  <button onClick={() => removeOrgMember(m.id, org.id)} style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #666', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.7rem' }}>Remove</button>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                <input
                  value={memberSearchQuery[org.id] || ''}
                  onChange={(e) => setMemberSearchQuery(prev => ({ ...prev, [org.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') searchMembersToAdd(org.id) }}
                  placeholder="Search user by name to add"
                  style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: '1px solid #444', background: '#111', color: '#eee', fontSize: '0.8rem' }}
                />
                <button onClick={() => searchMembersToAdd(org.id)} style={{ padding: '0.4rem 0.7rem', borderRadius: '6px', border: '1px solid #4ecca3', background: 'none', color: '#4ecca3', cursor: 'pointer', fontSize: '0.75rem' }}>Search</button>
              </div>
              {(memberSearchResults[org.id] || []).length > 0 && (
                <div style={{ marginTop: '0.4rem' }}>
                  {memberSearchResults[org.id].map(u => (
                    <button key={u.user_id} onClick={() => addOrgMember(org.id, u.user_id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.35rem 0.5rem', borderRadius: '6px', border: 'none', background: '#2a2a2a', color: '#eee', cursor: 'pointer', fontSize: '0.8rem', marginBottom: '0.2rem' }}>+ Add {u.display_name || 'Unnamed'}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}