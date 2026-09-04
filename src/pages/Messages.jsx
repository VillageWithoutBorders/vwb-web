import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { createNotification } from '../utils/notificationHelpers'
import AvatarDisplay from '../components/AvatarDisplay'

const DISAPPEAR_STEPS = [
  { label: 'Off', mins: 0 },
  { label: '1 hr', mins: 60 },
  { label: '24 hr', mins: 1440 },
  { label: '7 days', mins: 10080 },
  { label: '30 days', mins: 43200 },
]
const MUTE_OPTIONS = [
  { label: '1 hour', ms: 3600000 },
  { label: '8 hours', ms: 28800000 },
  { label: '24 hours', ms: 86400000 },
  { label: '7 days', ms: 604800000 },
  { label: 'Forever', ms: null },
]

export default function Messages() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [convos, setConvos] = useState([])
  const [loading, setLoading] = useState(true)
  const [folders, setFolders] = useState([])
  const [activeFolder, setActiveFolder] = useState('all')
  const [assignments, setAssignments] = useState({})
  const [draggingConvo, setDraggingConvo] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [assigningConvo, setAssigningConvo] = useState(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [disappearDefault, setDisappearDefault] = useState(0)
  const [readReceipts, setReadReceipts] = useState(true)
  const [safetyCheckins, setSafetyCheckins] = useState(true)
  const [defaultHelpMsg, setDefaultHelpMsg] = useState('I can help!')
  const [editingHelpMsg, setEditingHelpMsg] = useState(false)
  const [blockedUsers, setBlockedUsers] = useState([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [deleteMode, setDeleteMode] = useState('me')
  const [openMenu, setOpenMenu] = useState(null)
  const [showMuteMenu, setShowMuteMenu] = useState(null)
  const [convoSettings, setConvoSettings] = useState({})
  const [showArchived, setShowArchived] = useState(false)

  // Phase 3: Help offers state
  const [pendingOffers, setPendingOffers] = useState([])
  const [processingOffer, setProcessingOffer] = useState(null)
  const [myOutgoingOffers, setMyOutgoingOffers] = useState([])

  useEffect(() => { loadAll() }, [location.key])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadConversations(), loadFolders(), loadAssignments(), loadBlocked(), loadPrefs(), loadConvoSettings(), loadPendingOffers(), loadMyOutgoingOffers()])
    setLoading(false)
  }

  // =============================================
  // Phase 3: Pending offers FOR the requester (Accept/Decline)
  // =============================================

  async function loadPendingOffers() {
    const { data: myRequests } = await supabase
      .from('help_requests')
      .select('id, skill_needed, description, max_helpers')
      .eq('requester_id', user.id)
      .in('status', ['open', 'in_progress'])

    if (!myRequests || myRequests.length === 0) {
      setPendingOffers([])
      return
    }

    const requestIds = myRequests.map(r => r.id)

    const { data: matches } = await supabase
      .from('skill_matches')
      .select('id, request_id, helper_id, created_at')
      .in('request_id', requestIds)
      .is('accepted', null)

    if (!matches || matches.length === 0) {
      setPendingOffers([])
      return
    }

    const { data: acceptedMatches } = await supabase
      .from('skill_matches')
      .select('request_id')
      .in('request_id', requestIds)
      .eq('accepted', true)

    const acceptedCounts = {}
    if (acceptedMatches) {
      for (const m of acceptedMatches) {
        acceptedCounts[m.request_id] = (acceptedCounts[m.request_id] || 0) + 1
      }
    }

    const enriched = await Promise.all(matches.map(async (match) => {
      const { data: helperProfile } = await supabase
        .from('helper_profiles')
        .select('display_name, is_hope_ambassador, created_at, avatar_url')
        .eq('user_id', match.helper_id)
        .maybeSingle()

      const { count: vouchCount } = await supabase
        .from('vouches')
        .select('id', { count: 'exact', head: true })
        .eq('vouchee_id', match.helper_id)

      const request = myRequests.find(r => r.id === match.request_id)

      return {
        ...match,
        helper_name: helperProfile?.display_name || 'A neighbor',
        is_ambassador: helperProfile?.is_hope_ambassador || false,
        member_since: helperProfile?.created_at || null,
        avatar_url: helperProfile?.avatar_url || null,
        vouch_count: vouchCount || 0,
        skill_needed: request?.skill_needed || '',
        request_description: request?.description || '',
        max_helpers: request?.max_helpers,
        accepted_count: acceptedCounts[match.request_id] || 0,
      }
    }))

    setPendingOffers(enriched)
  }

  async function acceptOffer(offer) {
    setProcessingOffer(offer.id)

    await supabase
      .from('skill_matches')
      .update({ accepted: true })
      .eq('id', offer.id)

    const { data: convo } = await supabase
      .from('conversations')
      .insert({
        request_id: offer.request_id,
        helper_id: offer.helper_id,
        requester_id: user.id,
      })
      .select()
      .single()

    if (convo) {
      await supabase.from('chat_messages').insert({
        conversation_id: convo.id,
        sender_id: user.id,
        body: `${offer.helper_name} has been accepted to help with: ${offer.skill_needed}`,
      })
    }

    createNotification({
      userId: offer.helper_id,
      type: 'offer_accepted',
      title: 'Your offer was accepted!',
      body: `You've been accepted to help with: ${offer.skill_needed}`,
      link: convo ? '/conversation/' + convo.id : '/tasks',
    })

    const newAcceptedCount = offer.accepted_count + 1
    if (offer.max_helpers !== null && newAcceptedCount >= offer.max_helpers) {
      await supabase
        .from('help_requests')
        .update({ status: 'in_progress' })
        .eq('id', offer.request_id)
    }

    setProcessingOffer(null)
    await loadPendingOffers()
    await loadConversations()
  }

  async function declineOffer(offer) {
    setProcessingOffer(offer.id)

    await supabase
      .from('skill_matches')
      .delete()
      .eq('id', offer.id)

    createNotification({
      userId: offer.helper_id,
      type: 'offer_declined',
      title: 'Help update',
      body: 'The requester found help from someone else. Thank you for offering!',
      link: '/skillshare',
    })

    setProcessingOffer(null)
    await loadPendingOffers()
  }

  // =============================================
  // Phase 3: Outgoing offers BY the helper (Withdraw)
  // =============================================

  async function loadMyOutgoingOffers() {
    const { data: matches } = await supabase
      .from('skill_matches')
      .select('id, request_id, created_at')
      .eq('helper_id', user.id)
      .is('accepted', null)

    if (!matches || matches.length === 0) {
      setMyOutgoingOffers([])
      return
    }

    const requestIds = matches.map(m => m.request_id)
    const { data: requests } = await supabase
      .from('help_requests')
      .select('id, skill_needed, requester_id')
      .in('id', requestIds)

    const enriched = await Promise.all(matches.map(async (match) => {
      const req = requests?.find(r => r.id === match.request_id)
      if (!req) return null
      const { data: p } = await supabase
        .from('helper_profiles')
        .select('display_name')
        .eq('user_id', req.requester_id)
        .maybeSingle()
      return {
        ...match,
        skill_needed: req.skill_needed,
        requester_name: p?.display_name || 'A neighbor',
      }
    }))

    setMyOutgoingOffers(enriched.filter(Boolean))
  }

  async function withdrawOffer(matchId) {
    await supabase.from('skill_matches').delete().eq('id', matchId)
    await loadMyOutgoingOffers()
  }

  // =============================================
  // Existing functions (unchanged)
  // =============================================

  async function loadPrefs() {
    const { data } = await supabase.from('helper_profiles').select('disappear_default_mins, read_receipts_enabled, safety_checkins_enabled, default_help_message').eq('user_id', user.id).maybeSingle()
    if (data) {
      setDisappearDefault(data.disappear_default_mins || 0)
      setReadReceipts(data.read_receipts_enabled !== false)
      setSafetyCheckins(data.safety_checkins_enabled !== false)
      setDefaultHelpMsg(data.default_help_message || 'I can help!')
    }
  }

  async function savePref(col, val) {
    await supabase.from('helper_profiles').update({ [col]: val }).eq('user_id', user.id)
  }

  async function saveDisappearPref(mins) {
    setDisappearDefault(mins)
    await savePref('disappear_default_mins', mins)
  }

  async function toggleReadReceipts() {
    const v = !readReceipts
    setReadReceipts(v)
    await savePref('read_receipts_enabled', v)
  }

  async function toggleSafetyCheckins() {
    const v = !safetyCheckins
    setSafetyCheckins(v)
    await savePref('safety_checkins_enabled', v)
  }

  async function saveHelpMsg() {
    const trimmed = defaultHelpMsg.trim() || 'I can help!'
    setDefaultHelpMsg(trimmed)
    setEditingHelpMsg(false)
    await savePref('default_help_message', trimmed)
  }

  function getSliderIndex() {
    const idx = DISAPPEAR_STEPS.findIndex(s => s.mins === disappearDefault)
    return idx >= 0 ? idx : 0
  }

  async function loadConvoSettings() {
    const { data } = await supabase.from('conversation_user_settings').select('*').eq('user_id', user.id)
    if (data) {
      const map = {}
      data.forEach(s => { map[s.conversation_id] = s })
      setConvoSettings(map)
    }
  }

  async function upsertConvoSetting(convoId, updates) {
    const existing = convoSettings[convoId]
    if (existing) {
      await supabase.from('conversation_user_settings').update(updates).eq('id', existing.id)
    } else {
      await supabase.from('conversation_user_settings').insert({ user_id: user.id, conversation_id: convoId, ...updates })
    }
    await loadConvoSettings()
  }

  async function togglePin(convoId) {
    const current = convoSettings[convoId]?.pinned || false
    await upsertConvoSetting(convoId, { pinned: !current })
    setOpenMenu(null)
  }

  async function toggleArchive(convoId) {
    const current = convoSettings[convoId]?.archived || false
    await upsertConvoSetting(convoId, { archived: !current })
    setOpenMenu(null)
  }

  async function muteConvo(convoId, ms) {
    const until = ms === null ? '2099-01-01T00:00:00Z' : new Date(Date.now() + ms).toISOString()
    await upsertConvoSetting(convoId, { muted_until: until })
    setShowMuteMenu(null)
    setOpenMenu(null)
  }

  async function unmuteConvo(convoId) {
    await upsertConvoSetting(convoId, { muted_until: null })
    setOpenMenu(null)
  }

  function isMuted(convoId) {
    const s = convoSettings[convoId]
    if (!s || !s.muted_until) return false
    return new Date(s.muted_until) > new Date()
  }

  async function loadBlocked() {
    const { data } = await supabase.from('blocks').select('id, blocked_id').eq('blocker_id', user.id)
    if (data && data.length > 0) {
      const names = await Promise.all(data.map(async (b) => {
        const { data: p } = await supabase.from('helper_profiles').select('display_name').eq('user_id', b.blocked_id).maybeSingle()
        return { ...b, name: p?.display_name || 'Unknown' }
      }))
      setBlockedUsers(names)
    } else { setBlockedUsers([]) }
  }

  async function unblockUser(blockId) {
    await supabase.from('blocks').delete().eq('id', blockId)
    await loadBlocked()
  }

  async function loadFolders() {
    const { data } = await supabase.from('message_folders').select('*').eq('user_id', user.id).order('sort_order', { ascending: true })
    if (data) setFolders(data)
  }

  async function loadAssignments() {
    const { data } = await supabase.from('conversation_folder_assignments').select('conversation_id, folder_id').eq('user_id', user.id)
    if (data) {
      const map = {}
      data.forEach(a => { if (!map[a.conversation_id]) map[a.conversation_id] = []; map[a.conversation_id].push(a.folder_id) })
      setAssignments(map)
    }
  }

  async function loadConversations() {
    const { data } = await supabase.from('conversations').select('id, request_id, helper_id, requester_id, created_at, disappear_after_mins, last_read_helper, last_read_requester, help_requests (skill_needed, neighborhood, urgency)').order('created_at', { ascending: false })
    if (data) {
      const withNames = await Promise.all(data.map(async (c) => {
        const otherId = c.helper_id === user.id ? c.requester_id : c.helper_id
        const { data: p } = await supabase.from('helper_profiles').select('display_name, avatar_url').eq('user_id', otherId).maybeSingle()
        const { data: lastMsg } = await supabase.from('chat_messages').select('body, created_at').eq('conversation_id', c.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
        const lastRead = c.helper_id === user.id ? c.last_read_helper : c.last_read_requester
        const hasUnread = lastMsg && (!lastRead || new Date(lastMsg.created_at) > new Date(lastRead))
        return { ...c, otherId, otherName: p?.display_name || 'Neighbor', otherAvatar: p?.avatar_url || null, lastMessage: lastMsg?.body || null, lastMessageAt: lastMsg?.created_at || c.created_at, hasUnread }
      }))
      withNames.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
      setConvos(withNames)
    }
  }

  async function createFolder() {
    const name = newFolderName.trim()
    if (!name) return
    await supabase.from('message_folders').insert({ user_id: user.id, name, sort_order: folders.length })
    setNewFolderName('')
    await loadFolders()
  }

  async function deleteFolder(folderId) {
    await supabase.from('conversation_folder_assignments').delete().eq('folder_id', folderId).eq('user_id', user.id)
    await supabase.from('message_folders').delete().eq('id', folderId).eq('user_id', user.id)
    if (activeFolder === folderId) setActiveFolder('all')
    await loadFolders()
    await loadAssignments()
  }

  async function assignToFolder(convoId, folderId) {
    if (folderId === 'remove') {
      await supabase.from('conversation_folder_assignments').delete().eq('conversation_id', convoId).eq('user_id', user.id)
    } else {
      await supabase.from('conversation_folder_assignments').delete().eq('conversation_id', convoId).eq('user_id', user.id)
      await supabase.from('conversation_folder_assignments').insert({ user_id: user.id, conversation_id: convoId, folder_id: folderId })
    }
    setAssigningConvo(null)
    setOpenMenu(null)
    await loadAssignments()
  }

  async function deleteConversation(convoId) {
    if (deleteMode === 'me') {
      const { data: msgs } = await supabase.from('chat_messages').select('id').eq('conversation_id', convoId)
      if (msgs) {
        const inserts = msgs.map(m => ({ message_id: m.id, user_id: user.id }))
        await supabase.from('message_deletions').upsert(inserts, { onConflict: 'message_id,user_id' })
      }
    } else {
      await supabase.from('chat_messages').update({ deleted_at: new Date().toISOString() }).eq('conversation_id', convoId)
    }
    setShowDeleteConfirm(null)
    setOpenMenu(null)
    await loadConversations()
  }

  async function blockUser(otherId, otherName) {
    if (!confirm('Block ' + otherName + '? They will not be able to see your profile or send you messages.')) return
    await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: otherId })
    setOpenMenu(null)
    await loadBlocked()
  }

  async function reportConversation(convoId, otherId) {
    const reason = prompt('Why are you reporting this conversation? (optional)')
    await supabase.from('safety_alerts').insert({ reporter_id: user.id, reported_user_id: otherId, alert_type: 'flag', description: reason || 'Reported from messages' })
    setOpenMenu(null)
    alert('Report submitted. Thank you for helping keep our community safe.')
  }

  let filtered = activeFolder === 'all' ? convos : activeFolder === 'unread' ? convos.filter(c => c.hasUnread) : activeFolder === 'archived' ? convos : convos.filter(c => (assignments[c.id] || []).includes(activeFolder))
  if (activeFolder === 'archived') {
    filtered = filtered.filter(c => convoSettings[c.id]?.archived)
  } else {
    filtered = filtered.filter(c => !convoSettings[c.id]?.archived)
  }
  const pinned = filtered.filter(c => convoSettings[c.id]?.pinned)
  const unpinned = filtered.filter(c => !convoSettings[c.id]?.pinned)
  const sorted = [...pinned, ...unpinned]
  const archivedCount = convos.filter(c => convoSettings[c.id]?.archived).length

  function formatTime(ts) {
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const tabStyle = (active) => ({ padding: '0.5rem 1rem', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', background: active ? '#4ecca3' : '#2a2a2a', color: active ? '#1a1a1a' : '#aaa' })
  const sidebarStyle = { position: 'fixed', top: 0, right: showSidebar ? 0 : '-320px', width: '300px', height: '100%', background: '#1a1a1a', borderLeft: '1px solid #333', zIndex: 1000, transition: 'right 0.3s ease', overflowY: 'auto', padding: '1.25rem' }
  const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: showSidebar ? 'block' : 'none' }
  const sectionTitle = { fontSize: '0.8rem', fontWeight: 700, color: '#4ecca3', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '1.5rem', marginBottom: '0.5rem' }
  const menuBtn = { display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#ddd', padding: '0.6rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }
  const toggleRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid #2a2a2a' }
  const toggleDot = (on) => ({ width: '40px', height: '22px', borderRadius: '11px', background: on ? '#4ecca3' : '#444', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', border: 'none', padding: 0, flexShrink: 0 })
  const toggleKnob = (on) => ({ position: 'absolute', top: '2px', left: on ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' })

  const offerCardStyle = {
    background: '#1a2e26',
    border: '1px solid #2d6a4f',
    borderRadius: '12px',
    padding: '1rem',
    marginBottom: '0.75rem',
  }
  const offerBtnAccept = {
    padding: '0.5rem 1.25rem',
    borderRadius: '8px',
    border: 'none',
    background: '#4ecca3',
    color: '#1a1a1a',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '0.85rem',
  }
  const offerBtnDecline = {
    padding: '0.5rem 1.25rem',
    borderRadius: '8px',
    border: '1px solid #666',
    background: 'none',
    color: '#aaa',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.85rem',
  }

  return (
    <div className="messages-page" onClick={() => { if (openMenu) setOpenMenu(null); if (showMuteMenu) setShowMuteMenu(null) }}>
      <div style={overlayStyle} onClick={() => setShowSidebar(false)} />
      <div style={sidebarStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Settings</h2>
          <button onClick={() => setShowSidebar(false)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.5rem', cursor: 'pointer' }}>&#10005;</button>
        </div>

        <div style={sectionTitle}>Folders</div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input type="text" placeholder="New folder name" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createFolder()} maxLength={30} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.85rem' }} />
          <button onClick={createFolder} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Add</button>
        </div>
        {folders.map(f => (
          <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid #2a2a2a' }}>
            <span style={{ color: '#ddd', fontSize: '0.9rem' }}>{f.name}</span>
            <button onClick={() => { if (confirm('Delete folder "' + f.name + '"? Conversations will move back to All.')) deleteFolder(f.id) }} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '0.85rem' }}>Delete</button>
          </div>
        ))}

        <div style={sectionTitle}>Disappearing Messages</div>
        <p style={{ color: '#888', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>New conversations will auto-delete messages after the chosen time.</p>
        <div style={{ padding: '0 0.25rem' }}>
          <input type="range" min={0} max={DISAPPEAR_STEPS.length - 1} step={1} value={getSliderIndex()} onChange={e => saveDisappearPref(DISAPPEAR_STEPS[parseInt(e.target.value)].mins)} style={{ width: '100%', accentColor: '#4ecca3', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
            {DISAPPEAR_STEPS.map((s, i) => (
              <span key={i} style={{ fontSize: '0.65rem', color: getSliderIndex() === i ? '#4ecca3' : '#666', fontWeight: getSliderIndex() === i ? 700 : 400, textAlign: 'center', flex: 1 }}>{s.label}</span>
            ))}
          </div>
        </div>

        <div style={sectionTitle}>Privacy</div>
        <div style={toggleRow}>
          <span style={{ color: '#ddd', fontSize: '0.9rem' }}>Read receipts</span>
          <button style={toggleDot(readReceipts)} onClick={toggleReadReceipts}><span style={toggleKnob(readReceipts)} /></button>
        </div>
        <p style={{ color: '#666', fontSize: '0.75rem', margin: '0.15rem 0 0' }}>Let others see when you have read their messages</p>

        <div style={sectionTitle}>Safety</div>
        <div style={toggleRow}>
          <span style={{ color: '#ddd', fontSize: '0.9rem' }}>Safety check-ins</span>
          <button style={toggleDot(safetyCheckins)} onClick={toggleSafetyCheckins}><span style={toggleKnob(safetyCheckins)} /></button>
        </div>
        <p style={{ color: '#666', fontSize: '0.75rem', margin: '0.15rem 0 0' }}>Receive periodic check-in prompts during active help sessions</p>

        <div style={sectionTitle}>Default greeting</div>
        {editingHelpMsg ? (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input type="text" value={defaultHelpMsg} onChange={e => setDefaultHelpMsg(e.target.value)} maxLength={200} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.85rem' }} />
            <button onClick={saveHelpMsg} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Save</button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0' }}>
            <span style={{ color: '#ddd', fontSize: '0.9rem', fontStyle: 'italic' }}>"{defaultHelpMsg}"</span>
            <button onClick={() => setEditingHelpMsg(true)} style={{ background: 'none', border: 'none', color: '#4ecca3', cursor: 'pointer', fontSize: '0.85rem' }}>Edit</button>
          </div>
        )}
        <p style={{ color: '#666', fontSize: '0.75rem', margin: '0.15rem 0 0' }}>Auto-sent when you tap "I can help" on a request</p>

        <div style={sectionTitle}>Blocked Users</div>
        {blockedUsers.length === 0 ? (
          <p style={{ color: '#666', fontSize: '0.85rem' }}>No blocked users</p>
        ) : blockedUsers.map(b => (
          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid #2a2a2a' }}>
            <span style={{ color: '#ddd', fontSize: '0.9rem' }}>{b.name}</span>
            <button onClick={() => unblockUser(b.id)} style={{ background: 'none', border: 'none', color: '#4ecca3', cursor: 'pointer', fontSize: '0.85rem' }}>Unblock</button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h1 style={{ margin: 0 }}>Messages</h1>
        <button onClick={() => setShowSidebar(true)} style={{ background: 'none', border: 'none', color: '#4ecca3', cursor: 'pointer', fontSize: '1.4rem', padding: '0.25rem' }} title="Settings">&#9881;</button>
      </div>

      {/* ========== Help Offers for Requesters (Accept/Decline) ========== */}
      {pendingOffers.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ecca3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
            ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Help Offers ({pendingOffers.length})
          </div>
          {pendingOffers.map(offer => (
            <div key={offer.id} style={offerCardStyle}>
              <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '0.5rem' }}>
                For your request: <span style={{ color: '#4ecca3', fontWeight: 600 }}>{offer.skill_needed}</span>
                {offer.max_helpers !== null && (
                  <span style={{ marginLeft: '0.5rem', color: '#888' }}>
                    ({offer.accepted_count}/{offer.max_helpers} accepted)
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AvatarDisplay url={offer.avatar_url} userId={offer.helper_id} size={32} /><span onClick={(e) => { e.stopPropagation(); navigate('/u/' + offer.helper_id) }} style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#444', textUnderlineOffset: '2px' }}>{offer.helper_name}</span></div>
                {offer.is_ambassador && (
                  <span style={{ background: '#1a4a3a', color: '#4ecca3', fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }}>
                    Hope Ambassador
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: '#999', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                {offer.vouch_count > 0 && (
                  <span>&#x1F91D; {offer.vouch_count} vouch{offer.vouch_count !== 1 ? 'es' : ''}</span>
                )}
                {offer.member_since && (
                  <span>Member since {new Date(offer.member_since).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  style={offerBtnAccept}
                  disabled={processingOffer === offer.id}
                  onClick={() => acceptOffer(offer)}
                >
                  {processingOffer === offer.id ? 'Accepting...' : 'Accept'}
                </button>
                <button
                  style={offerBtnDecline}
                  disabled={processingOffer === offer.id}
                  onClick={() => declineOffer(offer)}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========== Your Pending Offers (helper side) ========== */}
      {myOutgoingOffers.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#b8860b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
            ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ Your Pending Offers ({myOutgoingOffers.length})
          </div>
          {myOutgoingOffers.map(offer => (
            <div key={offer.id} style={{ background: '#2a2518', border: '1px solid #5a4a2a', borderRadius: '12px', padding: '0.85rem 1rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>{offer.skill_needed}</div>
                <div style={{ color: '#999', fontSize: '0.8rem' }}>
                  For {offer.requester_name} &middot; Waiting for response
                </div>
              </div>
              <button
                onClick={() => { if (confirm('Withdraw your offer to help?')) withdrawOffer(offer.id) }}
                style={{ padding: '0.4rem 0.85rem', borderRadius: '8px', border: '1px solid #666', background: 'none', color: '#aaa', fontSize: '0.8rem', cursor: 'pointer' }}
              >
                Withdraw
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.75rem', marginBottom: '0.5rem' }}>
        <button style={tabStyle(activeFolder === 'unread')} onClick={() => setActiveFolder('unread')}>Unread</button>
        <button style={{ ...tabStyle(activeFolder === 'all'), outline: dropTarget === 'all' ? '2px solid #4ecca3' : 'none' }} onClick={() => setActiveFolder('all')} onDragOver={(e) => { e.preventDefault(); setDropTarget('all') }} onDragLeave={() => setDropTarget(null)} onDrop={(e) => { e.preventDefault(); setDropTarget(null); assignToFolder(parseInt(e.dataTransfer.getData('text/plain')), 'remove'); setDraggingConvo(null) }}>All</button>
        {folders.map(f => (
          <button key={f.id} style={{ ...tabStyle(activeFolder === f.id), outline: dropTarget === f.id ? '2px solid #4ecca3' : 'none' }} onClick={() => setActiveFolder(f.id)} onDragOver={(e) => { e.preventDefault(); setDropTarget(f.id) }} onDragLeave={() => setDropTarget(null)} onDrop={(e) => { e.preventDefault(); setDropTarget(null); assignToFolder(parseInt(e.dataTransfer.getData('text/plain')), f.id); setDraggingConvo(null) }}>{f.name}</button>
        ))}
        {archivedCount > 0 && (
          <button style={tabStyle(activeFolder === 'archived')} onClick={() => setActiveFolder('archived')}>Archived ({archivedCount})</button>
        )}
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>Loading...</p>}
      {!loading && sorted.length === 0 && pendingOffers.length === 0 && myOutgoingOffers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{activeFolder === 'all' ? 'No messages yet' : activeFolder === 'archived' ? 'No archived messages' : 'No messages in this folder'}</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{activeFolder === 'all' ? 'When you help someone or someone helps you, your conversations will show up here.' : 'Tap the menu on a conversation to move it here.'}</p>
        </div>
      )}

      {showDeleteConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#222', borderRadius: '12px', padding: '1.5rem', maxWidth: '320px', width: '90%' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: '#ff6666' }}>Delete Conversation</h3>
            <p style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '1rem' }}>This cannot be undone. These messages will be lost forever.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              <button onClick={() => setDeleteMode('me')} style={{ ...tabStyle(deleteMode === 'me'), borderRadius: '8px', textAlign: 'left' }}>Delete just for me</button>
              <button onClick={() => setDeleteMode('everyone')} style={{ ...tabStyle(deleteMode === 'everyone'), borderRadius: '8px', textAlign: 'left' }}>Delete for everyone</button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#aaa', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => deleteConversation(showDeleteConfirm)} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', background: '#ff4444', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {!loading && sorted.map((c) => {
        const isPinned = convoSettings[c.id]?.pinned
        const isArchived = convoSettings[c.id]?.archived
        const muted = isMuted(c.id)
        return (
        <div key={c.id} className="message-card" style={{ position: 'relative', cursor: 'grab', opacity: draggingConvo === c.id ? 0.5 : 1, borderLeft: isPinned ? '3px solid #4ecca3' : 'none' }} draggable onDragStart={(e) => { setDraggingConvo(c.id); e.dataTransfer.setData('text/plain', c.id) }} onDragEnd={() => { setDraggingConvo(null); setDropTarget(null) }}>
          <div onClick={() => { setConvos(prev => prev.map(cv => cv.id === c.id ? { ...cv, hasUnread: false } : cv)); navigate('/conversation/' + c.id) }} style={{ cursor: 'pointer', paddingRight: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AvatarDisplay url={c.otherAvatar} userId={c.otherId} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
            <div className="message-card-header">
              <span className="message-card-name" style={{ fontWeight: c.hasUnread ? 800 : 600 }}>
                {isPinned && <span style={{ marginRight: '4px' }} title="Pinned">&#128204;</span>}
                {muted && <span style={{ marginRight: '4px', opacity: 0.5 }} title="Muted">&#128263;</span>}
                <span onClick={(e) => { e.stopPropagation(); navigate('/u/' + c.otherId) }} style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#444', textUnderlineOffset: '2px' }}>{c.otherName}</span>
                {c.hasUnread && <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#4ecca3", marginLeft: "6px", flexShrink: 0 }} />}
              </span>
              <span className="message-card-time" style={{ color: c.hasUnread ? "#4ecca3" : undefined }}>{formatTime(c.lastMessageAt)}</span>
            </div>
            {c.help_requests && (<p className="message-card-skill">{c.help_requests.skill_needed} in {c.help_requests.neighborhood}</p>)}
            {c.lastMessage && (<p className="message-card-preview" style={{ color: c.hasUnread ? "#ddd" : undefined, fontWeight: c.hasUnread ? 600 : 400 }}>{c.lastMessage.length > 80 ? c.lastMessage.slice(0, 80) + '...' : c.lastMessage}</p>)}
            </div>
          </div>

          <button onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === c.id ? null : c.id); setShowMuteMenu(null) }}
            style={{ position: 'absolute', bottom: '0.6rem', right: '0.6rem', background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '1.25rem', padding: '4px 6px', lineHeight: 1 }}
            title="Options">&#8943;</button>

          {openMenu === c.id && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', right: '0.5rem', top: '100%', marginTop: '4px', background: '#2a2a2a', border: '1px solid #444', borderRadius: '10px', zIndex: 10, minWidth: '180px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
              <button style={menuBtn} onClick={() => togglePin(c.id)}>
                <span style={{ width: '1.2rem', textAlign: 'center' }}>&#128204;</span> {isPinned ? 'Unpin' : 'Pin to top'}
              </button>
              <button style={menuBtn} onClick={() => toggleArchive(c.id)}>
                <span style={{ width: '1.2rem', textAlign: 'center' }}>&#128230;</span> {isArchived ? 'Unarchive' : 'Archive'}
              </button>
              {muted ? (
                <button style={menuBtn} onClick={() => unmuteConvo(c.id)}>
                  <span style={{ width: '1.2rem', textAlign: 'center' }}>&#128264;</span> Unmute
                </button>
              ) : (
                <button style={menuBtn} onClick={(e) => { e.stopPropagation(); setShowMuteMenu(showMuteMenu === c.id ? null : c.id) }}>
                  <span style={{ width: '1.2rem', textAlign: 'center' }}>&#128263;</span> Mute &#9656;
                </button>
              )}
              {showMuteMenu === c.id && (
                <div style={{ borderTop: '1px solid #444', background: '#333' }}>
                  {MUTE_OPTIONS.map((opt, i) => (
                    <button key={i} style={{ ...menuBtn, paddingLeft: '2.5rem', fontSize: '0.8rem' }} onClick={() => muteConvo(c.id, opt.ms)}>{opt.label}</button>
                  ))}
                </div>
              )}
              {folders.length > 0 && (
                <button style={menuBtn} onClick={() => setAssigningConvo(assigningConvo === c.id ? null : c.id)}>
                  <span style={{ width: '1.2rem', textAlign: 'center' }}>&#128193;</span> Move to folder
                </button>
              )}
              <button style={menuBtn} onClick={() => reportConversation(c.id, c.otherId)}>
                <span style={{ width: '1.2rem', textAlign: 'center', color: '#ff4444' }}>&#9873;</span> Report
              </button>
              <button style={menuBtn} onClick={() => blockUser(c.otherId, c.otherName)}>
                <span style={{ width: '1.2rem', textAlign: 'center' }}>&#128683;</span> Block user
              </button>
              <button style={menuBtn} onClick={() => { setOpenMenu(null); setShowDeleteConfirm(c.id) }}>
                <span style={{ width: '1.2rem', textAlign: 'center' }}>&#128465;</span> Delete
              </button>
            </div>
          )}

          {assigningConvo === c.id && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', padding: '0.5rem 0 0.25rem', borderTop: '1px solid #333', marginTop: '0.5rem' }}>
              {folders.map(f => (<button key={f.id} onClick={() => assignToFolder(c.id, f.id)} style={{ ...tabStyle((assignments[c.id] || []).includes(f.id)), fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>{f.name}</button>))}
              {assignments[c.id] && assignments[c.id].length > 0 && (<button onClick={() => assignToFolder(c.id, 'remove')} style={{ ...tabStyle(false), fontSize: '0.8rem', padding: '0.35rem 0.75rem', color: '#ff6666' }}>Remove</button>)}
            </div>
          )}
        </div>
      )})}
    </div>
  )
}
