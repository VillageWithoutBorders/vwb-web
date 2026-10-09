import { useState, useEffect } from 'react'
import { useBlockedBy } from '../utils/blockedBy'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUnreadCount } from '../context/UnreadCountContext'
import { supabase } from '../supabaseClient'
import { MUTE_OPTIONS } from '../utils/muteOptions'
import { createNotification } from '../utils/notificationHelpers'
import { getBlockedUserIds } from '../utils/blockedUsers'
import { useMenuPosition } from '../utils/useMenuPosition'
import AvatarDisplay, { UserName } from '../components/AvatarDisplay'
import MessageRequests from '../components/MessageRequests'
import NewMessage from '../components/NewMessage'
import { decryptFromSender, getDeviceId, flushOutbox, getQueuedMessages } from '../lib/e2ee'

const DISAPPEAR_STEPS = [
  { label: 'Off', mins: 0 },
  { label: '1 hr', mins: 60 },
  { label: '24 hr', mins: 1440 },
  { label: '7 days', mins: 10080 },
  { label: '30 days', mins: 43200 },
]

// embedded: shown inside the Messages hub (ConnectHub), which supplies the page
// title and the links to Villages, Cottage Chats, and Connections.
export default function Messages({ embedded = false }) {
  const { user } = useAuth()
  const { refreshUnread } = useUnreadCount()
  const navigate = useNavigate()
  const blockedBy = useBlockedBy()
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
  const [hidePushDetails, setHidePushDetails] = useState(true)
  const [defaultHelpMsg, setDefaultHelpMsg] = useState('I can help!')
  const [editingHelpMsg, setEditingHelpMsg] = useState(false)
  const [blockedUsers, setBlockedUsers] = useState([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [deleteMode, setDeleteMode] = useState('me')
  const [openMenu, setOpenMenu] = useState(null)
  const [showMuteMenu, setShowMuteMenu] = useState(null)
  const { menuRef: optionsMenuRef, menuStyle: optionsMenuStyle, openMenu: positionOptionsMenu } = useMenuPosition('right')
  const [convoSettings, setConvoSettings] = useState({})
  const [showArchived, setShowArchived] = useState(false)
  // Campfire shows as a pinned card at the top of the list for Hope
  // Ambassadors and admins, so it lives with the rest of their messages
  // instead of only on the Home screen.
  // Everyone gets the Village Square card. The database decides which boards they can read.
  const hasCampfire = !!user
  const [campfire, setCampfire] = useState(null)

  // Phase 3: Help offers state
  const [pendingOffers, setPendingOffers] = useState([])
  const [processingOffer, setProcessingOffer] = useState(null)
  const [myOutgoingOffers, setMyOutgoingOffers] = useState([])

  useEffect(() => { loadAll() }, [location.key])

  async function loadAll() {
    setLoading(true)
    // Anyone blocked in either direction is filtered out of conversations and
    // offers below, so a block actually hides someone instead of just being
    // recorded with no effect.
    const blockedIds = await getBlockedUserIds(user.id)
    await Promise.all([loadConversations(blockedIds), loadFolders(), loadAssignments(), loadBlocked(), loadPrefs(), loadConvoSettings(), loadPendingOffers(blockedIds), loadMyOutgoingOffers(blockedIds), loadCampfire()])
    setLoading(false)
  }

  // =============================================
  // Phase 3: Pending offers FOR the requester (Accept/Decline)
  // =============================================

  async function loadPendingOffers(blockedIds = new Set()) {
    const { data: myRequests, error: reqErr } = await supabase
      .from('help_requests')
      .select('id, skill_needed, description, max_helpers')
      .eq('requester_id', user.id)
      .in('status', ['open', 'in_progress'])
    if (reqErr) console.error('Failed to load your requests:', reqErr)

    if (!myRequests || myRequests.length === 0) {
      setPendingOffers([])
      return
    }

    const requestIds = myRequests.map(r => r.id)

    const { data: rawMatches, error: matchesErr } = await supabase
      .from('skill_matches')
      .select('id, request_id, helper_id, created_at')
      .in('request_id', requestIds)
      .is('accepted', null)
    if (matchesErr) console.error('Failed to load pending matches:', matchesErr)

    const matches = (rawMatches || []).filter(m => !blockedIds.has(m.helper_id))

    if (!matches || matches.length === 0) {
      setPendingOffers([])
      return
    }

    const { data: acceptedMatches, error: acceptedErr } = await supabase
      .from('skill_matches')
      .select('request_id')
      .in('request_id', requestIds)
      .eq('accepted', true)
    if (acceptedErr) console.error('Failed to load accepted match counts:', acceptedErr)

    const acceptedCounts = {}
    if (acceptedMatches) {
      for (const m of acceptedMatches) {
        acceptedCounts[m.request_id] = (acceptedCounts[m.request_id] || 0) + 1
      }
    }

    const enriched = await Promise.all(matches.map(async (match) => {
      const { data: helperProfile, error: profErr } = await supabase
        .from('helper_profiles_public')
        .select('display_name, is_hope_ambassador, created_at, avatar_url')
        .eq('user_id', match.helper_id)
        .maybeSingle()
      if (profErr) console.error('Failed to load helper profile:', profErr)

      const { data: vcRow, error: vouchErr } = await supabase
        .from('vouch_counts')
        .select('vouch_count')
        .eq('user_id', match.helper_id)
        .maybeSingle()
      const vouchCount = Number(vcRow?.vouch_count || 0)
      if (vouchErr) console.error('Failed to load vouch count:', vouchErr)

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

    const { error: acceptErr } = await supabase
      .from('skill_matches')
      .update({ accepted: true })
      .eq('id', offer.id)

    if (acceptErr) {
      console.error('Failed to accept offer:', acceptErr)
      alert('Could not accept this offer. Try again.')
      setProcessingOffer(null)
      return
    }

    // Reuse any existing conversation with this helper, regardless of which
    // request started it, so messages with the same neighbor group into one
    // thread instead of splitting per request.
    const { data: existingConvo, error: existingErr } = await supabase
      .from('conversations')
      .select('id')
      .or('and(helper_id.eq.' + offer.helper_id + ',requester_id.eq.' + user.id + '),and(helper_id.eq.' + user.id + ',requester_id.eq.' + offer.helper_id + ')')
      .maybeSingle()
    if (existingErr) console.error('Failed to check for an existing conversation:', existingErr)

    let convo = existingConvo
    if (!convo) {
      const { data: newConvo, error: convoErr } = await supabase
        .from('conversations')
        .insert({
          request_id: offer.request_id,
          helper_id: offer.helper_id,
          requester_id: user.id,
        })
        .select()
        .single()
      if (convoErr) console.error('Failed to create conversation for accepted offer:', convoErr)
      convo = newConvo
    } else {
      // Point the reused conversation at this newest request so its banner
      // reflects what you're currently talking about, not whatever started the thread.
      const { error: updErr } = await supabase
        .from('conversations')
        .update({ request_id: offer.request_id })
        .eq('id', convo.id)
      if (updErr) console.error('Failed to update conversation context:', updErr)
    }

    // No "has been accepted" message is posted into the chat any more (it
    // was stored as plain text). Conversation.jsx's banner shows the
    // acceptance instead, straight from skill_matches.

    createNotification({
      userId: offer.helper_id,
      type: 'offer_accepted',
      title: 'Your offer was accepted!',
      body: `You've been accepted to help with: ${offer.skill_needed}`,
      link: convo ? '/conversation/' + convo.id : '/tasks',
    })

    const newAcceptedCount = offer.accepted_count + 1
    if (offer.max_helpers !== null && newAcceptedCount >= offer.max_helpers) {
      const { error: statusErr } = await supabase
        .from('help_requests')
        .update({ status: 'in_progress' })
        .eq('id', offer.request_id)
      if (statusErr) console.error('Failed to mark request in_progress:', statusErr)
    }

    setProcessingOffer(null)
    await loadPendingOffers()
    // Open the chat right away so the two of you can plan.
    if (convo) { navigate('/conversation/' + convo.id); return }
    alert('You accepted this offer, but the chat could not be opened. Find it under Messages in a moment.')
    await loadConversations()
  }

  async function declineOffer(offer) {
    setProcessingOffer(offer.id)

    const { data: deleted, error: declineErr } = await supabase
      .from('skill_matches')
      .delete()
      .eq('id', offer.id)
      .select('id')
    // The database can refuse a delete without an error. Treat "nothing removed" as a failure.
    const error = declineErr || (!deleted || deleted.length === 0 ? { message: 'No offer was removed.' } : null)

    if (error) {
      console.error('Failed to decline offer:', error)
      alert('Could not decline this offer. Try again.')
      setProcessingOffer(null)
      return
    }

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

  async function loadMyOutgoingOffers(blockedIds = new Set()) {
    const { data: matches, error: matchesErr } = await supabase
      .from('skill_matches')
      .select('id, request_id, created_at')
      .eq('helper_id', user.id)
      .is('accepted', null)
    if (matchesErr) console.error('Failed to load your outgoing offers:', matchesErr)

    if (!matches || matches.length === 0) {
      setMyOutgoingOffers([])
      return
    }

    const requestIds = matches.map(m => m.request_id)
    const { data: requests, error: reqErr } = await supabase
      .from('help_requests')
      .select('id, skill_needed, requester_id')
      .in('id', requestIds)
    if (reqErr) console.error('Failed to load requests for outgoing offers:', reqErr)

    const enriched = await Promise.all(matches.map(async (match) => {
      const req = requests?.find(r => r.id === match.request_id)
      if (!req || blockedIds.has(req.requester_id)) return null
      const { data: p, error: profErr } = await supabase
        .from('helper_profiles_public')
        .select('display_name')
        .eq('user_id', req.requester_id)
        .maybeSingle()
      if (profErr) console.error('Failed to load requester profile:', profErr)
      return {
        ...match,
        skill_needed: req.skill_needed,
        requester_name: p?.display_name || 'A neighbor',
      }
    }))

    setMyOutgoingOffers(enriched.filter(Boolean))
  }

  async function withdrawOffer(matchId) {
    const { error } = await supabase.rpc('withdraw_offer', { p_match_id: matchId })
    if (error) {
      console.error('Failed to withdraw offer:', error)
      alert(error.code === '55000' || error.code === 'P0002' ? error.message : 'Could not withdraw your offer. Try again.')
    }
    await loadMyOutgoingOffers()
  }

  // =============================================
  // Existing functions (unchanged)
  // =============================================

  async function loadPrefs() {
    const { data, error } = await supabase.from('helper_profiles').select('disappear_default_mins, read_receipts_enabled, safety_checkins_enabled, default_help_message, hide_push_details').eq('user_id', user.id).maybeSingle()
    if (error) { console.error('Failed to load message preferences:', error); return }
    if (data) {
      setDisappearDefault(data.disappear_default_mins || 0)
      setReadReceipts(data.read_receipts_enabled !== false)
      setSafetyCheckins(data.safety_checkins_enabled !== false)
      setHidePushDetails(data.hide_push_details !== false)
      setDefaultHelpMsg(data.default_help_message || 'I can help!')
    }
  }

  async function savePref(col, val) {
    const { error } = await supabase.from('helper_profiles').update({ [col]: val }).eq('user_id', user.id)
    if (error) { console.error(`Failed to save ${col}:`, error); return false }
    return true
  }

  async function saveDisappearPref(mins) {
    const previous = disappearDefault
    setDisappearDefault(mins)
    const ok = await savePref('disappear_default_mins', mins)
    if (!ok) { setDisappearDefault(previous); alert('Could not save this setting. Try again.') }
  }

  async function toggleReadReceipts() {
    const v = !readReceipts
    setReadReceipts(v)
    const ok = await savePref('read_receipts_enabled', v)
    if (!ok) { setReadReceipts(!v); alert('Could not save this setting. Try again.') }
  }

  async function toggleHidePushDetails() {
    const v = !hidePushDetails
    setHidePushDetails(v)
    const ok = await savePref('hide_push_details', v)
    if (!ok) { setHidePushDetails(!v); alert('Could not save this setting. Try again.') }
  }

  async function toggleSafetyCheckins() {
    const v = !safetyCheckins
    setSafetyCheckins(v)
    const ok = await savePref('safety_checkins_enabled', v)
    if (!ok) { setSafetyCheckins(!v); alert('Could not save this setting. Try again.') }
  }

  async function saveHelpMsg() {
    const trimmed = defaultHelpMsg.trim() || 'I can help!'
    const previous = defaultHelpMsg
    setDefaultHelpMsg(trimmed)
    setEditingHelpMsg(false)
    const ok = await savePref('default_help_message', trimmed)
    if (!ok) { setDefaultHelpMsg(previous); setEditingHelpMsg(true); alert('Could not save your message. Try again.') }
  }

  function getSliderIndex() {
    const idx = DISAPPEAR_STEPS.findIndex(s => s.mins === disappearDefault)
    return idx >= 0 ? idx : 0
  }

  async function loadConvoSettings() {
    const { data, error } = await supabase.from('conversation_user_settings').select('*').eq('user_id', user.id)
    if (error) { console.error('Failed to load conversation settings:', error); return }
    if (data) {
      const map = {}
      data.forEach(s => { map[s.conversation_id] = s })
      setConvoSettings(map)
    }
  }

  async function upsertConvoSetting(convoId, updates) {
    const existing = convoSettings[convoId]
    let error
    if (existing) {
      ({ error } = await supabase.from('conversation_user_settings').update(updates).eq('id', existing.id))
    } else {
      ({ error } = await supabase.from('conversation_user_settings').insert({ user_id: user.id, conversation_id: convoId, ...updates }))
    }
    if (error) {
      console.error('Failed to save conversation setting:', error)
      alert('Could not save that. Try again.')
      return false
    }
    await loadConvoSettings()
    return true
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

  // Newest Campfire message on the shared board. Campfire.jsx saves
  // 'vwb_campfire_last_read' while it's open, so anything newer from
  // someone else shows as unread here.
  async function loadCampfire() {
    if (!hasCampfire) { setCampfire(null); return }
    const { data: last, error } = await supabase.from('campfire_messages').select('id, user_id, body, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) { console.error('Failed to load Village Square preview:', error); setCampfire({ last: null, name: null, unread: false }); return }
    if (!last) { setCampfire({ last: null, name: null, unread: false }); return }
    if (last.body === '') last.body = '\uD83D\uDD12 New scrambled message'
    let name = 'You'
    if (last.user_id !== user.id) {
      const { data: p, error: pErr } = await supabase.from('helper_profiles_public').select('display_name').eq('user_id', last.user_id).maybeSingle()
      if (pErr) console.error('Failed to load Village Square sender name:', pErr)
      name = p?.display_name || 'Neighbor'
    }
    let lastRead = null
    try { lastRead = localStorage.getItem('vwb_campfire_last_read') } catch {}
    const unread = last.user_id !== user.id && (!lastRead || new Date(last.created_at) > new Date(lastRead))
    setCampfire({ last, name, unread })
  }

  // Mark as unread is saved as your own flag, not by moving your "last
  // read" time back. That way the other person's read receipt never
  // changes because you wanted a reminder. Opening the chat clears it.
  async function markUnread(convoId) {
    setOpenMenu(null)
    if (await upsertConvoSetting(convoId, { marked_unread: true })) refreshUnread()
  }

  async function markRead(convo) {
    setOpenMenu(null)
    const readCol = convo.helper_id === user.id ? 'last_read_helper' : 'last_read_requester'
    const { error } = await supabase.from('conversations').update({ [readCol]: new Date().toISOString() }).eq('id', convo.id)
    if (error) { console.error('Failed to mark conversation read:', error); alert('Could not mark that as read. Try again.'); return }
    setConvos(prev => prev.map(cv => cv.id === convo.id ? { ...cv, hasUnread: false } : cv))
    if (convoSettings[convo.id]?.marked_unread) await upsertConvoSetting(convo.id, { marked_unread: false })
    refreshUnread()
  }

  async function toggleFollowUp(convoId) {
    setOpenMenu(null)
    const current = convoSettings[convoId]?.follow_up || false
    await upsertConvoSetting(convoId, { follow_up: !current })
  }

  function isUnread(c) {
    return !!(c.hasUnread || convoSettings[c.id]?.marked_unread)
  }

  function openConvo(c) {
    setConvos(prev => prev.map(cv => cv.id === c.id ? { ...cv, hasUnread: false } : cv))
    setConvoSettings(prev => prev[c.id]?.marked_unread ? { ...prev, [c.id]: { ...prev[c.id], marked_unread: false } } : prev)
    navigate('/conversation/' + c.id)
  }

  async function loadBlocked() {
    const { data, error } = await supabase.from('blocks').select('id, blocked_id').eq('blocker_id', user.id)
    if (error) { console.error('Failed to load blocked users:', error); return }
    if (data && data.length > 0) {
      const names = await Promise.all(data.map(async (b) => {
        const { data: p, error: profErr } = await supabase.from('helper_profiles_public').select('display_name').eq('user_id', b.blocked_id).maybeSingle()
        if (profErr) console.error('Failed to load blocked user profile:', profErr)
        return { ...b, name: p?.display_name || 'Unknown' }
      }))
      setBlockedUsers(names)
    } else { setBlockedUsers([]) }
  }

  async function unblockUser(blockId) {
    const { error } = await supabase.from('blocks').delete().eq('id', blockId)
    if (error) { console.error('Failed to unblock user:', error); alert('Could not unblock this user. Try again.'); return }
    await loadBlocked()
  }

  async function loadFolders() {
    const { data, error } = await supabase.from('message_folders').select('*').eq('user_id', user.id).order('sort_order', { ascending: true })
    if (error) { console.error('Failed to load folders:', error); return }
    if (data) setFolders(data)
  }

  async function loadAssignments() {
    const { data, error } = await supabase.from('conversation_folder_assignments').select('conversation_id, folder_id').eq('user_id', user.id)
    if (error) { console.error('Failed to load folder assignments:', error); return }
    if (data) {
      const map = {}
      data.forEach(a => { if (!map[a.conversation_id]) map[a.conversation_id] = []; map[a.conversation_id].push(a.folder_id) })
      setAssignments(map)
    }
  }

  async function loadConversations(blockedIds = new Set()) {
    // Send anything waiting in this device's outbox first (see e2ee.js),
    // so the list below reflects it.
    await flushOutbox(user.id)
    const waiting = await getQueuedMessages(user.id)
    const { data, error } = await supabase.from('conversations').select('id, request_id, helper_id, requester_id, created_at, disappear_after_mins, last_read_helper, last_read_requester, help_requests (skill_needed, neighborhood, urgency)').order('created_at', { ascending: false })
    if (error) { console.error('Failed to load conversations:', error); return }
    if (data) {
      const visible = data.filter(c => {
        const otherId = c.helper_id === user.id ? c.requester_id : c.helper_id
        return !blockedIds.has(otherId)
      })
      // Fetched once, not per conversation -- decrypting a preview below
      // needs this device's own id, which never changes mid-load.
      const deviceId = await getDeviceId()
      const withNames = await Promise.all(visible.map(async (c) => {
        const otherId = c.helper_id === user.id ? c.requester_id : c.helper_id
        const { data: p, error: profErr } = await supabase.from('helper_profiles_public').select('display_name, avatar_url').eq('user_id', otherId).maybeSingle()
        if (profErr) console.error('Failed to load conversation partner profile:', profErr)
        // Newest messages first. A message is gone for this person if it was deleted for everyone
        // or if they deleted it for themselves. If the chat has messages but none are left for
        // this person, the whole conversation is hidden from their list. A new message brings it back.
        const { data: recent, error: msgErr } = await supabase.from('chat_messages').select('id, body, sender_id, created_at, deleted_at').eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(30)
        if (msgErr) console.error('Failed to load last message:', msgErr)
        let lastMsg = null
        if (recent && recent.length > 0) {
          const { data: mine, error: delErr } = await supabase.from('message_deletions').select('message_id').eq('user_id', user.id).in('message_id', recent.map(m => m.id))
          if (delErr) console.error('Failed to load my deleted messages:', delErr)
          const goneForMe = new Set((mine || []).map(d => d.message_id))
          lastMsg = recent.find(m => !m.deleted_at && !goneForMe.has(m.id)) || null
          if (!lastMsg) return null
        }
        // An empty body means it's encrypted -- look up this device's copy
        // and decrypt it client-side for the preview snippet. Falls back to
        // a placeholder rather than showing nothing if this device has no
        // copy of it (e.g. it was added after that message was sent).
        let lastMessageText = lastMsg?.body || null
        if (lastMsg && !lastMsg.body) {
          if (deviceId) {
            const { data: copy, error: copyErr } = await supabase.from('encrypted_message_copies').select('ciphertext, nonce').eq('message_id', lastMsg.id).eq('user_id', user.id).eq('device_id', deviceId).order('version', { ascending: false }).limit(1).maybeSingle()
            if (copyErr) console.error('Failed to load encrypted preview:', copyErr)
            if (copy) lastMessageText = await decryptFromSender(copy.ciphertext, copy.nonce, lastMsg.sender_id)
          }
          if (!lastMessageText) lastMessageText = '[Encrypted message]'
        }
        const lastRead = c.helper_id === user.id ? c.last_read_helper : c.last_read_requester
        const hasUnread = lastMsg && (!lastRead || new Date(lastMsg.created_at) > new Date(lastRead))
        // A message still waiting on this device is always the newest one.
        const queued = waiting.filter(q => q.conversationId === c.id).pop()
        if (queued) return { ...c, otherId, otherName: p?.display_name || 'Neighbor', otherAvatar: p?.avatar_url || null, lastMessage: 'Waiting to send: ' + queued.text, lastMessageAt: queued.createdAt, hasUnread }
        return { ...c, otherId, otherName: p?.display_name || 'Neighbor', otherAvatar: p?.avatar_url || null, lastMessage: lastMessageText, lastMessageAt: lastMsg?.created_at || c.created_at, hasUnread }
      }))
      const shown = withNames.filter(Boolean)
      shown.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
      setConvos(shown)
    }
  }

  async function createFolder() {
    const name = newFolderName.trim()
    if (!name) return
    const { error } = await supabase.from('message_folders').insert({ user_id: user.id, name, sort_order: folders.length })
    if (error) { console.error('Failed to create folder:', error); alert('Could not create that folder. Try again.'); return }
    setNewFolderName('')
    await loadFolders()
  }

  async function deleteFolder(folderId) {
    const { error: assignErr } = await supabase.from('conversation_folder_assignments').delete().eq('folder_id', folderId).eq('user_id', user.id)
    if (assignErr) console.error('Failed to clear folder assignments:', assignErr)
    const { error: folderErr } = await supabase.from('message_folders').delete().eq('id', folderId).eq('user_id', user.id)
    if (folderErr) { console.error('Failed to delete folder:', folderErr); alert('Could not delete this folder. Try again.'); return }
    if (activeFolder === folderId) setActiveFolder('all')
    await loadFolders()
    await loadAssignments()
  }

  async function assignToFolder(convoId, folderId) {
    if (folderId === 'remove') {
      const { error } = await supabase.from('conversation_folder_assignments').delete().eq('conversation_id', convoId).eq('user_id', user.id)
      if (error) { console.error('Failed to remove folder assignment:', error); alert('Could not update this conversation. Try again.'); return }
    } else {
      const { error: delErr } = await supabase.from('conversation_folder_assignments').delete().eq('conversation_id', convoId).eq('user_id', user.id)
      if (delErr) console.error('Failed to clear previous folder assignment:', delErr)
      const { error: insErr } = await supabase.from('conversation_folder_assignments').insert({ user_id: user.id, conversation_id: convoId, folder_id: folderId })
      if (insErr) { console.error('Failed to assign folder:', insErr); alert('Could not move this conversation. Try again.'); return }
    }
    setAssigningConvo(null)
    setOpenMenu(null)
    await loadAssignments()
  }

  async function deleteConversation(convoId) {
    if (deleteMode === 'me') {
      const { data: msgs, error: msgsErr } = await supabase.from('chat_messages').select('id').eq('conversation_id', convoId)
      if (msgsErr) { console.error('Failed to load messages to delete:', msgsErr); alert('Could not delete this conversation. Try again.'); return }
      if (msgs && msgs.length > 0) {
        const inserts = msgs.map(m => ({ message_id: m.id, user_id: user.id }))
        const { error: upsertErr } = await supabase.from('message_deletions').upsert(inserts, { onConflict: 'message_id,user_id' })
        if (upsertErr) { console.error('Failed to delete conversation for you:', upsertErr); alert('Could not delete this conversation. Try again.'); return }
      }
    } else {
      const { error: updErr } = await supabase.rpc('delete_conversation_for_everyone', { p_convo: convoId })
      if (updErr) { console.error('Failed to delete conversation for everyone:', updErr); alert('Could not delete this conversation. Try again.'); return }
    }
    setShowDeleteConfirm(null)
    setOpenMenu(null)
    await loadConversations()
  }

  async function blockUser(otherId, otherName) {
    if (!confirm('Block ' + otherName + '? They will not be able to see your profile or send you messages.')) return
    const { error } = await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: otherId })
    if (error) { console.error('Failed to block user:', error); alert('Could not block this user. Try again.'); return }
    setOpenMenu(null)
    await loadBlocked()
  }

  // Opens the real report flow inside the conversation itself, rather than
  // a bare prompt() with no way to attach evidence: since messages are
  // end-to-end encrypted, a report filed from here would otherwise leave
  // admins with nothing to go on. Conversation.jsx watches for this flag.
  function reportConversation(convoId) {
    setOpenMenu(null)
    navigate('/conversation/' + convoId, { state: { openReport: true } })
  }

  let filtered = activeFolder === 'all' ? convos : activeFolder === 'unread' ? convos.filter(isUnread) : activeFolder === 'followup' ? convos.filter(c => convoSettings[c.id]?.follow_up) : activeFolder === 'archived' ? convos : convos.filter(c => (assignments[c.id] || []).includes(activeFolder))
  if (activeFolder === 'archived') {
    filtered = filtered.filter(c => convoSettings[c.id]?.archived)
  } else {
    filtered = filtered.filter(c => !convoSettings[c.id]?.archived)
  }
  const pinned = filtered.filter(c => convoSettings[c.id]?.pinned)
  const unpinned = filtered.filter(c => !convoSettings[c.id]?.pinned)
  const sorted = [...pinned, ...unpinned]
  const archivedCount = convos.filter(c => convoSettings[c.id]?.archived).length
  const followUpCount = convos.filter(c => convoSettings[c.id]?.follow_up && !convoSettings[c.id]?.archived).length
  const showCampfireCard = !embedded && hasCampfire && campfire && (activeFolder === 'all' || (activeFolder === 'unread' && campfire.unread))

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
          <button onClick={() => setShowSidebar(false)} aria-label="Close settings" style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.5rem', cursor: 'pointer' }}>&#10005;</button>
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
          <button role="switch" aria-checked={readReceipts} aria-label="Read receipts" style={toggleDot(readReceipts)} onClick={toggleReadReceipts}><span style={toggleKnob(readReceipts)} /></button>
        </div>
        <p style={{ color: '#8a8a8a', fontSize: '0.75rem', margin: '0.15rem 0 0' }}>Show when you have read a message. If you turn this off, you won't see when others read yours either.</p>

        <div style={sectionTitle}>Safety</div>
        <div style={toggleRow}>
          <span style={{ color: '#ddd', fontSize: '0.9rem' }}>Safety check-ins</span>
          <button role="switch" aria-checked={safetyCheckins} aria-label="Safety check-ins" style={toggleDot(safetyCheckins)} onClick={toggleSafetyCheckins}><span style={toggleKnob(safetyCheckins)} /></button>
        </div>
        <p style={{ color: '#8a8a8a', fontSize: '0.75rem', margin: '0.15rem 0 0' }}>Receive periodic check-in prompts during active help sessions</p>

        <div style={toggleRow}>
          <span style={{ color: '#ddd', fontSize: '0.9rem' }}>Hide details on my lock screen</span>
          <button role="switch" aria-checked={hidePushDetails} aria-label="Hide details on my lock screen" style={toggleDot(hidePushDetails)} onClick={toggleHidePushDetails}><span style={toggleKnob(hidePushDetails)} /></button>
        </div>
        <p style={{ color: '#8a8a8a', fontSize: '0.75rem', margin: '0.15rem 0 0' }}>When on, phone alerts only say you have an update. Names and group titles stay inside the app, so nobody glancing at your phone can see them.</p>

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
        <p style={{ color: '#8a8a8a', fontSize: '0.75rem', margin: '0.15rem 0 0' }}>Auto-sent when you tap "I can help" on a request</p>

        <div style={sectionTitle}>Blocked Users</div>
        {blockedUsers.length === 0 ? (
          <p style={{ color: '#8a8a8a', fontSize: '0.85rem' }}>No blocked users</p>
        ) : blockedUsers.map(b => (
          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid #2a2a2a' }}>
            <span style={{ color: '#ddd', fontSize: '0.9rem' }}>{b.name}</span>
            <span style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => navigate('/u/' + b.blocked_id, { state: { safety: 'report' } })} style={{ background: 'none', border: 'none', color: '#ff6666', cursor: 'pointer', fontSize: '0.85rem', minHeight: '44px' }}>Report</button>
              <button onClick={() => unblockUser(b.id)} style={{ background: 'none', border: 'none', color: '#4ecca3', cursor: 'pointer', fontSize: '0.85rem', minHeight: '44px' }}>Unblock</button>
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: embedded ? 'flex-end' : 'space-between', marginBottom: '0.75rem' }}>
        {!embedded && <h1 style={{ margin: 0 }}>Messages</h1>}
        <button type="button" onClick={() => setShowSidebar(true)} className="page-top-btn" aria-label="Message settings">
          <span aria-hidden="true">&#9881;&#65039;</span> Settings
        </button>
      </div>

      {!embedded && (<>
      <button type="button" className="groups-row groups-entry" onClick={() => navigate('/connections')}>
        <span className="groups-row-name"><span aria-hidden="true">&#129309;</span> Connections</span>
        <span className="groups-row-meta">Everyone you have connected with &#8250;</span>
      </button>

      <button type="button" className="groups-row groups-entry" onClick={() => navigate('/groups')}>
        <span className="groups-row-name"><span aria-hidden="true">&#128101;</span> Cottage Chats &amp; Campfires</span>
        <span className="groups-row-meta">Members-only boards &#8250;</span>
      </button>
      </>)}

      {/* ========== Help Offers for Requesters (Accept/Decline) ========== */}
      {pendingOffers.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ecca3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
            🤝 Help Offers ({pendingOffers.length})
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AvatarDisplay url={offer.avatar_url} userId={offer.helper_id} size={32} /><UserName userId={offer.helper_id} name={offer.helper_name} style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem' }} /></div>
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

              {!blockedBy.has(offer.helper_id) && (
                <button type="button" onClick={() => navigate('/u/' + offer.helper_id)} style={{ display: 'block', width: '100%', minHeight: '44px', marginBottom: '0.5rem', padding: '0.5rem', borderRadius: '8px', border: '1px solid #4ecca3', background: 'none', color: '#4ecca3', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                  View {offer.helper_name}&apos;s profile first
                </button>
              )}
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
            ⏳ Your Pending Offers ({myOutgoingOffers.length})
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

      <NewMessage />

      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.75rem', marginBottom: '0.5rem' }}>
        <button style={tabStyle(activeFolder === 'unread')} onClick={() => setActiveFolder('unread')}>Unread</button>
        <button style={{ ...tabStyle(activeFolder === 'all'), outline: dropTarget === 'all' ? '2px solid #4ecca3' : 'none' }} onClick={() => setActiveFolder('all')} onDragOver={(e) => { e.preventDefault(); setDropTarget('all') }} onDragLeave={() => setDropTarget(null)} onDrop={(e) => { e.preventDefault(); setDropTarget(null); assignToFolder(parseInt(e.dataTransfer.getData('text/plain')), 'remove'); setDraggingConvo(null) }}>All</button>
        {folders.map(f => (
          <button key={f.id} style={{ ...tabStyle(activeFolder === f.id), outline: dropTarget === f.id ? '2px solid #4ecca3' : 'none' }} onClick={() => setActiveFolder(f.id)} onDragOver={(e) => { e.preventDefault(); setDropTarget(f.id) }} onDragLeave={() => setDropTarget(null)} onDrop={(e) => { e.preventDefault(); setDropTarget(null); assignToFolder(parseInt(e.dataTransfer.getData('text/plain')), f.id); setDraggingConvo(null) }}>{f.name}</button>
        ))}
        {(followUpCount > 0 || activeFolder === 'followup') && (
          <button style={tabStyle(activeFolder === 'followup')} onClick={() => setActiveFolder('followup')}>&#128681; Follow up ({followUpCount})</button>
        )}
        {archivedCount > 0 && (
          <button style={tabStyle(activeFolder === 'archived')} onClick={() => setActiveFolder('archived')}>Archived ({archivedCount})</button>
        )}
      </div>

      {activeFolder === 'all' && <MessageRequests />}

      {loading && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>Loading...</p>}
      {!loading && sorted.length === 0 && !showCampfireCard && pendingOffers.length === 0 && myOutgoingOffers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{activeFolder === 'all' ? 'No messages yet' : activeFolder === 'archived' ? 'No archived messages' : activeFolder === 'unread' ? 'You\u2019re all caught up' : activeFolder === 'followup' ? 'Nothing to follow up on' : 'No messages in this folder'}</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{activeFolder === 'all' ? 'When you help someone or someone helps you, your conversations will show up here.' : activeFolder === 'unread' ? 'No new messages right now.' : activeFolder === 'followup' ? 'Tap \u22EF on a conversation and pick Follow up to save it here.' : 'Tap the menu on a conversation to move it here.'}</p>
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

      {!loading && showCampfireCard && (
        <div className="message-card" style={{ position: 'relative', borderLeft: '3px solid #e8833a' }}>
          <div onClick={() => navigate('/campfire')} role="button" tabIndex={0} aria-label={'Open Village Square' + (campfire.unread ? ', new messages' : '')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/campfire') } }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span aria-hidden="true" style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#3a2a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>&#128227;</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="message-card-header">
                <span className="message-card-name" style={{ fontWeight: campfire.unread ? 800 : 600 }}>
                  Village Square
                  {campfire.unread && <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#4ecca3', marginLeft: '6px' }} />}
                </span>
                {campfire.last && <span className="message-card-time" style={{ color: campfire.unread ? '#4ecca3' : undefined }}>{formatTime(campfire.last.created_at)}</span>}
              </div>
              <p className="message-card-skill">Announcements and your village chat</p>
              <p className="message-card-preview" style={{ color: campfire.unread ? '#ddd' : undefined, fontWeight: campfire.unread ? 600 : 400 }}>
                {campfire.noVillage ? 'Add your zip code to join your area\u2019s Village Square.' : campfire.last ? campfire.name + ': ' + ((campfire.last.body || '').length > 70 ? campfire.last.body.slice(0, 70) + '...' : (campfire.last.body || '')) : 'Nothing posted yet.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading && sorted.map((c) => {
        const isPinned = convoSettings[c.id]?.pinned
        const isArchived = convoSettings[c.id]?.archived
        const muted = isMuted(c.id)
        const unread = isUnread(c)
        const followUp = convoSettings[c.id]?.follow_up
        return (
        <div key={c.id} className="message-card" style={{ position: 'relative', cursor: 'grab', opacity: draggingConvo === c.id ? 0.5 : 1, borderLeft: isPinned ? '3px solid #4ecca3' : 'none' }} draggable onDragStart={(e) => { setDraggingConvo(c.id); e.dataTransfer.setData('text/plain', c.id) }} onDragEnd={() => { setDraggingConvo(null); setDropTarget(null) }}>
          <div onClick={() => openConvo(c)} role="button" tabIndex={0} aria-label={'Open conversation with ' + c.otherName + (unread ? ', unread' : '') + (followUp ? ', marked follow up' : '')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openConvo(c) } }} style={{ cursor: 'pointer', paddingRight: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AvatarDisplay url={c.otherAvatar} userId={c.otherId} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
            <div className="message-card-header">
              <span className="message-card-name" style={{ fontWeight: unread ? 800 : 600 }}>
                {isPinned && <span style={{ marginRight: '4px' }} title="Pinned">&#128204;</span>}
                {muted && <span style={{ marginRight: '4px', opacity: 0.5 }} title="Muted">&#128263;</span>}
                {followUp && <span style={{ marginRight: '4px' }} title="Follow up">&#128681;</span>}
                <UserName userId={c.otherId} name={c.otherName} />
                {unread && <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#4ecca3", marginLeft: "6px", flexShrink: 0 }} />}
              </span>
              <span className="message-card-time" style={{ color: unread ? "#4ecca3" : undefined }}>{formatTime(c.lastMessageAt)}</span>
            </div>
            {c.help_requests && (<p className="message-card-skill">{c.help_requests.skill_needed} in {c.help_requests.neighborhood}</p>)}
            {c.lastMessage && (<p className="message-card-preview" style={{ color: unread ? "#ddd" : undefined, fontWeight: unread ? 600 : 400 }}>{c.lastMessage.length > 80 ? c.lastMessage.slice(0, 80) + '...' : c.lastMessage}</p>)}
            </div>
          </div>

          <button onClick={(e) => {
              e.stopPropagation()
              const closing = openMenu === c.id
              setOpenMenu(closing ? null : c.id)
              setShowMuteMenu(null)
              if (!closing) positionOptionsMenu(e)
            }}
            aria-label={'Options for conversation with ' + c.otherName}
            style={{ position: 'absolute', bottom: '0.6rem', right: '0.6rem', background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '1.25rem', padding: '4px 6px', lineHeight: 1 }}
            title="Options">&#8943;</button>

          {openMenu === c.id && (
            <div ref={optionsMenuRef} onClick={(e) => e.stopPropagation()} style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '10px', minWidth: '180px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', overflow: 'hidden', ...optionsMenuStyle }}>
              {unread ? (
                <button style={menuBtn} onClick={() => markRead(c)}>
                  <span style={{ width: '1.2rem', textAlign: 'center' }}>&#9993;</span> Mark as read
                </button>
              ) : (
                <button style={menuBtn} onClick={() => markUnread(c.id)}>
                  <span style={{ width: '1.2rem', textAlign: 'center', color: '#4ecca3' }}>&#9679;</span> Mark as unread
                </button>
              )}
              <button style={menuBtn} onClick={() => toggleFollowUp(c.id)}>
                <span style={{ width: '1.2rem', textAlign: 'center' }}>&#128681;</span> {followUp ? 'Done following up' : 'Follow up'}
              </button>
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
              <button style={menuBtn} onClick={() => reportConversation(c.id)}>
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