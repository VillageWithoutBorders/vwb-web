import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useChatScroll } from '../hooks/useChatScroll'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import AvatarDisplay, { UserName } from '../components/AvatarDisplay'
import { useMenuPosition } from '../utils/useMenuPosition'
import { submitUserReport } from '../utils/submitUserReport'
import { MUTE_OPTIONS } from '../utils/muteOptions'
import VillagePeople, { VillageNewMembers } from '../components/VillagePeople'

// Consecutive messages from the same person within this window are grouped
// visually (avatar/name shown once) instead of repeating them for every line,
// so a fast back-and-forth doesn't read as a long wall of near-identical rows.
const GROUP_WINDOW_MS = 5 * 60 * 1000

export default function Campfire() {
  const { user, profile, isAdmin, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [boards, setBoards] = useState([])
  const [creatingBoard, setCreatingBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [boardError, setBoardError] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [editing, setEditing] = useState(null)
  const [flashId, setFlashId] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [names, setNames] = useState({})
  const [myAvatar, setMyAvatar] = useState(null)
  const pollRef = useRef(null)
  const inputRef = useRef(null)
  const boardRef = useRef(null)
  const [showSettings, setShowSettings] = useState(false)
  const [alertMap, setAlertMap] = useState({})
  const [alertSaving, setAlertSaving] = useState(false)
  const [muteOpenFor, setMuteOpenFor] = useState(null)
  const [openMsgMenu, setOpenMsgMenu] = useState(null)
  const [showPinned, setShowPinned] = useState(true)
  const [memberSearch, setMemberSearch] = useState('')
  // Which village chats I belong to (null until loaded), the people list, and open removal requests.
  const [memberVillages, setMemberVillages] = useState(null)
  const [showPeople, setShowPeople] = useState(false)
  const [removalRequests, setRemovalRequests] = useState([])
  const [introHint, setIntroHint] = useState(false)
  const introDone = useRef(false)
  // Timestamp/menu row is hidden by default and only shown for the bubble
  // that's hovered (desktop) or tapped (mobile, via this state) — cuts the
  // amount of always-on chrome under every single message.
  const [revealedMeta, setRevealedMeta] = useState(null)
  // One shared board for every Hope Ambassador, admin, and the founder,
  // whatever village they live in.
  const { menuRef: msgMenuRef, menuStyle: msgMenuStyle, openMenu: positionMsgMenu } = useMenuPosition('right')
  // Active, verified emergencies surface as a dismissible banner instead of
  // a chat bubble, so they read as an alert you can act on rather than one
  // more message in the scrollback. Dismissals are remembered locally so a
  // banner you've already seen and acted on doesn't keep reappearing here.
  const [activeEmergencies, setActiveEmergencies] = useState([])
  const [dismissedEmergencyIds, setDismissedEmergencyIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vwb_dismissed_emergency_ids') || '[]') } catch { return [] }
  })

  // Ambassadors, admins, and the founder post in Announcements and have their own Ambassadors board.
  // Everyone signed in can open the Square. The database decides which boards each person can read.
  const isStaff = !!(profile?.is_hope_ambassador || isAdmin)
  const hasAccess = !!user
  const { containerRef, onScroll, showNew, jumpToNewest, resetScroll } = useChatScroll(messages, user?.id, hasAccess && !loading)

  useEffect(() => {
    supabase.from('helper_profiles').select('avatar_url').eq('user_id', user.id).maybeSingle().then(({ data, error }) => {
      if (error) { console.error('Failed to load your avatar:', error); return }
      if (data) setMyAvatar(data.avatar_url || null)
    })
  }, [])

  // The boards inside the Campfire: General first, then your own village,
  // then the rest, then any an admin has added.
  async function loadBoards() {
    const { data, error } = await supabase.from('campfire_boards').select('id, name, village_id, is_general, sort_order').eq('archived', false)
    if (error) { console.error('Failed to load Village Square boards:', error); return }
    setBoards(data || [])
  }
  useEffect(() => { if (hasAccess) loadBoards() }, [hasAccess])

  async function loadMemberships() {
    const { data, error } = await supabase.from('village_members').select('village_id, joined_at').eq('user_id', user.id)
    if (error) { console.error('Failed to load your village chats:', error); setMemberVillages([]); return }
    setMemberVillages(data || [])
  }
  useEffect(() => { if (hasAccess) loadMemberships() }, [hasAccess])
  const memberSet = new Set((memberVillages || []).map(m => m.village_id))

  const orderedBoards = [...boards].sort((a, b) => {
    const rank = (x) => x.is_general ? 0 : x.village_id && memberSet.has(x.village_id) ? 1 : x.village_id ? 3 : 2
    return rank(a) - rank(b) || (a.sort_order - b.sort_order) || a.name.localeCompare(b.name)
  })
  const wantedBoard = searchParams.get('board')
  const activeBoard = orderedBoards.find(b => b.id === wantedBoard) || orderedBoards[0] || null
  const activeBoardId = activeBoard?.id || null
  boardRef.current = activeBoardId
  const isVillageBoard = !!activeBoard?.village_id
  const inVillage = isVillageBoard && memberSet.has(activeBoard.village_id)

  // Open removal requests for this village chat, so members can be the second to agree.
  async function loadRemovalRequests() {
    if (!isVillageBoard || !(inVillage || isAdmin)) { setRemovalRequests([]); return }
    const { data, error } = await supabase.rpc('village_removal_requests', { p_village: activeBoard.village_id })
    if (error) { console.error('Failed to load removal requests:', error); return }
    setRemovalRequests(data || [])
  }
  useEffect(() => {
    loadRemovalRequests()
    const t = setInterval(loadRemovalRequests, 30000)
    return () => clearInterval(t)
  }, [activeBoard?.village_id, inVillage])

  function chooseBoard(id) {
    setReplyTo(null); setEditing(null); setNewMsg(''); setMessages([]); setLoading(true); resetScroll()
    setSearchParams(id === orderedBoards[0]?.id ? {} : { board: id }, { replace: true })
  }

  async function addBoard(e) {
    e.preventDefault()
    const name = newBoardName.trim()
    if (!name) return
    setBoardError('')
    const { data, error } = await supabase.from('campfire_boards').insert({ name, created_by: user.id, sort_order: 50 }).select('id').single()
    if (error) {
      console.error('Failed to add board:', error)
      setBoardError(/duplicate|unique/i.test(error.message || '') ? 'A board with that name already exists.' : 'Could not add the board. Try again.')
      return
    }
    setNewBoardName(''); setCreatingBoard(false)
    await loadBoards()
    chooseBoard(data.id)
  }

  // Everyone who has a seat at the Campfire, so the member list shows the
  // whole group and not only the people who have posted.
  useEffect(() => {
    if (!isStaff) return
    supabase.from('helper_profiles_public')
      .select('user_id, display_name, role, is_hope_ambassador, avatar_url')
      .or('is_hope_ambassador.eq.true,role.in.(admin,founder)')
      .then(({ data, error }) => {
        if (error) { console.error('Failed to load Village Square members:', error); return }
        setNames(prev => {
          const next = { ...prev }
          for (const m of data || []) next[m.user_id] = { name: m.display_name || 'Neighbor', role: m.role, ambassador: m.is_hope_ambassador, avatar: m.avatar_url || null }
          return next
        })
      })
  }, [isStaff])

  useEffect(() => {
    if (!hasAccess || !activeBoardId) return
    resetScroll()
    loadMessages()
    pollRef.current = setInterval(loadMessages, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [hasAccess, activeBoardId])

  // Scoped to the village being viewed, so an emergency in one village never
  // shows up as a banner in another village's room. Re-runs when an admin
  // switches villages.
  useEffect(() => {
    if (!hasAccess) return
    if (!isAdmin && !profile?.village_id) return
    let cancelled = false
    setActiveEmergencies([])
    function loadActiveEmergencies() {
      let q = supabase.from('emergency_events').select('id, title, location_name, event_type').eq('status', 'active').eq('verified', true)
      // Ambassadors see alerts for their own village; admins and the founder see every village.
      if (!isAdmin) q = q.eq('village_id', profile.village_id)
      q.order('created_at', { ascending: false }).then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.error('Failed to load active emergencies:', error); return }
        if (data) setActiveEmergencies(data)
      })
    }
    loadActiveEmergencies()
    const timer = setInterval(loadActiveEmergencies, 60000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [hasAccess, isAdmin, profile?.village_id])

  function dismissEmergency(id) {
    const next = [...dismissedEmergencyIds, id]
    setDismissedEmergencyIds(next)
    try { localStorage.setItem('vwb_dismissed_emergency_ids', JSON.stringify(next)) } catch {}
  }


  // Alerts are chosen board by board, the same way mute works for private messages.
  // With no saved choice, Ambassadors and admins follow their old Village Square switch,
  // and neighbors start with alerts off.
  async function loadAlertSettings() {
    const { data, error } = await supabase.from('campfire_board_user_settings').select('board_id, alerts, muted_until').eq('user_id', user.id)
    if (error) { console.error('Failed to load alert settings:', error); return }
    const map = {}
    for (const s of data || []) map[s.board_id] = s
    setAlertMap(map)
  }
  useEffect(() => { loadAlertSettings() }, [])

  const alertsOn = (b) => alertMap[b.id] ? alertMap[b.id].alerts === 'all' : (isStaff && !!profile?.campfire_notifications_enabled)
  const alertsMuted = (b) => { const s = alertMap[b.id]; return !!(s && s.muted_until && new Date(s.muted_until) > new Date()) }

  async function saveAlert(boardId, updates) {
    setAlertSaving(true)
    const { error } = await supabase.from('campfire_board_user_settings').upsert(
      { user_id: user.id, board_id: boardId, ...updates, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,board_id' }
    )
    if (error) { console.error('Failed to save alert setting:', error); alert('Could not save that. Try again.') }
    else await loadAlertSettings()
    setAlertSaving(false)
  }

  // Leave the village chat being viewed. You can join again later, but you will not see what was said while you were away.
  async function leaveVillageChat() {
    if (!activeBoard?.village_id) return
    if (!confirm('Leave ' + activeBoard.name + '? You can join again later. You will not see what was said while you were away.')) return
    const { error } = await supabase.rpc('leave_village', { p_village: activeBoard.village_id })
    if (error) { console.error('Failed to leave the village chat:', error); alert('Could not leave. Try again.'); return }
    setShowPeople(false); setShowSettings(false)
    setMessages([]); setLoading(true); resetScroll()
    setSearchParams({}, { replace: true })
    await Promise.all([refreshProfile(), loadMemberships()])
  }

  // First visit after joining (?intro=1): fill the box with a short hello that has their name,
  // and leave room after it for them to say more. Only if they have not posted here yet.
  useEffect(() => {
    if (introDone.current || searchParams.get('intro') !== '1') return
    if (loading || memberVillages === null || !activeBoard?.village_id) return
    if (!memberSet.has(activeBoard.village_id)) return
    introDone.current = true
    if (!messages.some(m => m.user_id === user.id)) {
      const name = (profile?.display_name || '').trim() || 'a neighbor'
      setNewMsg("Hi neighbors, I'm " + name + ". I'm glad to be here.\n\nA bit about me: ")
      setIntroHint(true)
      setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length) } catch {} } }, 80)
    }
    const next = new URLSearchParams(searchParams); next.delete('intro')
    setSearchParams(next, { replace: true })
  }, [searchParams, loading, memberVillages, activeBoardId, messages.length])

  async function reportMessage(msg) {
    setOpenMsgMenu(null)
    if (!confirm('Report this message to the admins?')) return
    const info = names[msg.user_id] || { name: 'Unknown' }
    // Campfire messages are deleted after 30 days, so the report keeps its own
    // copy of the words: the reported message plus the two before it for context.
    const idx = messages.findIndex(m => m.id === msg.id)
    const before = idx > 0 ? messages.slice(Math.max(0, idx - 2), idx) : []
    const line = (m, who) => '[' + new Date(m.created_at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC] ' + who + ': ' + String(m.body || '')
    const clip = (t, n) => (t.length > n ? t.slice(0, n) + '...' : t)
    const saved = [
      ...before.map(m => clip(line(m, (names[m.user_id] || { name: 'Unknown' }).name), 150)),
      'REPORTED: ' + clip(line(msg, info.name), 600),
    ].join('\n').slice(0, 1000)
    const { error } = await submitUserReport({
      reporterId: user.id,
      reportedUserId: msg.user_id,
      source: 'campfire',
      details: saved
    })
    if (error) { alert(error); return }
    alert('Report submitted. An admin will review this message.')
  }

  // Pinning: admins/founder only (matches AuthContext's isAdmin, which already
  // covers both roles). Requires the `pinned`/`pinned_by`/`pinned_at` columns
  // and the campfire_pin_update RLS policy on campfire_messages.
  async function togglePin(msg) {
    setOpenMsgMenu(null)
    const next = !msg.pinned
    const { error } = await supabase
      .from('campfire_messages')
      .update(next
        ? { pinned: true, pinned_by: user.id, pinned_at: new Date().toISOString() }
        : { pinned: false, pinned_by: null, pinned_at: null })
      .eq('id', msg.id)
    if (error) {
      console.error('Failed to update pin:', error)
      alert('Could not update the pin on this message. Try again.')
      return
    }
    await loadMessages()
  }

  async function loadMessages() {
    // Newest 200, shown oldest to newest
    const boardAtStart = activeBoardId
    const { data: newest, error } = await supabase.from('campfire_messages').select('*').eq('board_id', activeBoardId).order('created_at', { ascending: false }).limit(200)
    if (boardAtStart !== boardRef.current) return // switched boards while loading
    if (error) console.error('Failed to load Village Square messages:', error)
    const data = newest ? [...newest].reverse() : null
    if (data) {
      setMessages(data)
      // Mark caught up while this page is open (including each poll tick), so
      // the pinned Campfire card in Messages clears its unread dot and picks
      // a fresh starting point for whatever comes in after you leave.
      localStorage.setItem('vwb_campfire_last_read', new Date().toISOString())
      const userIds = [...new Set(data.map(m => m.user_id))]
      const unknownIds = userIds.filter(id => !names[id])
      if (unknownIds.length > 0) {
        const newNames = { ...names }
        await Promise.all(unknownIds.map(async (uid) => {
          const { data: p, error: profErr } = await supabase.from('helper_profiles_public').select('display_name, role, is_hope_ambassador, avatar_url').eq('user_id', uid).maybeSingle()
          if (profErr) console.error('Failed to load profile for', uid, profErr)
          newNames[uid] = { name: p?.display_name || 'Neighbor', role: p?.role, ambassador: p?.is_hope_ambassador, avatar: p?.avatar_url || null }
        }))
        setNames(newNames)
      }
    }
    setLoading(false)
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!newMsg.trim() || sending || !activeBoardId) return
    setSending(true)

    // Editing one of your own messages
    if (editing) {
      const { error } = await supabase.from('campfire_messages').update({ body: newMsg.trim() }).eq('id', editing.id)
      if (error) {
        console.error('Failed to edit Village Square message:', error)
        alert('Could not save your edit. Try again.')
        setSending(false)
        return
      }
      setEditing(null); setNewMsg('')
      await loadMessages()
      setSending(false)
      return
    }

    const row = { user_id: user.id, body: newMsg.trim(), village_id: activeBoard?.village_id || null, board_id: activeBoardId }
    if (replyTo) row.reply_to = replyTo.id
    const { data, error } = await supabase.from('campfire_messages').insert(row).select('id').single()
    if (error) {
      console.error('Failed to send Village Square message:', error)
      alert('Could not send your message. Try again.')
      setSending(false)
      return
    }
    // Fans out a notification to every Ambassador/admin who's opted in
    // (helper_profiles.campfire_notifications_enabled). Done via this RPC,
    // not a client-side loop, because RLS locks helper_profiles to your own
    // row or admin/founder, so a regular member's browser can't see who
    // else has notifications on. See notify_campfire_recipients migration.
    const { error: notifyError } = await supabase.rpc('notify_campfire_recipients', { p_message_id: data.id })
    if (notifyError) console.error('Failed to notify Village Square recipients:', notifyError)
    setNewMsg(''); setReplyTo(null); setIntroHint(false)
    await loadMessages()
    setSending(false)
  }

  function startReply(msg) {
    setOpenMsgMenu(null); setEditing(null); setReplyTo(msg)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function startEdit(msg) {
    setOpenMsgMenu(null); setReplyTo(null); setEditing(msg); setNewMsg(msg.body)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function cancelComposeMode() {
    if (editing) setNewMsg('')
    setEditing(null); setReplyTo(null)
  }

  function jumpToMessage(id) {
    const el = document.getElementById('cf-msg-' + id)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    setFlashId(id)
    setTimeout(() => setFlashId(null), 1500)
  }

  function snippet(text) {
    const t = (text || '').replace(/\s+/g, ' ').trim()
    return t.length > 90 ? t.slice(0, 90) + '...' : t
  }

  // Always a real time, never just "5m ago": today shows the time, other days
  // show the date and time. Hover or long-press shows the full date.
  function formatTime(ts) {
    const d = new Date(ts)
    const now = new Date()
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    if (d.toDateString() === now.toDateString()) return time
    const y = new Date(now); y.setDate(now.getDate() - 1)
    if (d.toDateString() === y.toDateString()) return 'Yesterday ' + time
    const opts = d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }
    return d.toLocaleDateString([], opts) + ' ' + time
  }

  if (!hasAccess) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', maxWidth: '400px', margin: '0 auto' }}>
        <p style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>&#128227;</p>
        <h2 style={{ color: '#ffaa44', marginBottom: '0.5rem' }}>Come sit by the fire</h2>
        <p style={{ color: '#aaa', marginBottom: '1.5rem' }}>The Village Square is where Hope Ambassadors and admins swap ideas and look out for each other. You're welcome here too. Apply to become a Hope Ambassador. An admin looks over each application so this stays a place people can trust, and once you're in, you'll have a seat.</p>
        <button onClick={() => navigate('/profile')} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer' }}>Apply to be a Hope Ambassador</button>
      </div>
    )
  }

  const pinnedMessages = messages.filter(m => m.pinned)
  const visibleEmergencies = activeEmergencies.filter(e => !dismissedEmergencyIds.includes(e.id))
  // The old chat-log announcement is now redundant with the banner above,
  // so it's left out of the scrollback instead of showing up twice.
  const visibleMessages = messages.filter(m => !m.body.startsWith('🚨 Emergency Verified:'))
  // Who can post on the board being viewed. The database enforces the same rule.
  const canPost = !!activeBoard && (
    activeBoard.is_general ? isStaff
      : activeBoard.village_id ? (isAdmin || memberSet.has(activeBoard.village_id))
      : isStaff
  )

  return (
    <div onClick={() => { if (openMsgMenu) setOpenMsgMenu(null) }} style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1a1a1a' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, padding: '0.75rem 1rem', borderBottom: '1px solid #333', background: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button onClick={() => navigate('/')} aria-label="Back to Dashboard" style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer' }}>&#8592;</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>&#128227;</span> The Village Square
          </h1>
          <p style={{ margin: 0, color: '#888', fontSize: '0.75rem' }}>{activeBoard ? (activeBoard.village_id ? activeBoard.name + ' village chat' : activeBoard.name + ' board') : 'Announcements and village chats'}</p>
        </div>
        <button onClick={() => navigate('/villages')} aria-label="Village map" title="Village map" style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.3rem', padding: '0.25rem', marginLeft: 'auto', minWidth: '44px', minHeight: '44px' }}>&#128506;</button>
        {isVillageBoard && (inVillage || isAdmin) && (
          <button onClick={() => setShowPeople(true)} aria-label={'People in ' + activeBoard.name + (removalRequests.some(r => r.requested_by !== user.id) ? ', a removal request needs a second member' : '')} title="People" style={{ position: 'relative', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.3rem', padding: '0.25rem', minWidth: '44px', minHeight: '44px' }}>
            &#128101;
            {removalRequests.some(r => r.requested_by !== user.id) && <span aria-hidden="true" style={{ position: 'absolute', top: '6px', right: '6px', width: '10px', height: '10px', borderRadius: '50%', background: '#ff8844' }} />}
          </button>
        )}
        <button onClick={() => setShowSettings(true)} aria-label="Village Square settings" style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.3rem', padding: '0.25rem', minWidth: '44px', minHeight: '44px' }} title='Settings'>&#9881;</button>
      </div>

      <div role="tablist" aria-label="Village Square boards" className="hide-scrollbar" style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 1rem', overflowX: 'auto', borderBottom: '1px solid #333', background: '#1a1a1a', alignItems: 'center' }}>
        {orderedBoards.map(b => (
          <button key={b.id} type="button" role="tab" aria-selected={b.id === activeBoardId} onClick={() => chooseBoard(b.id)} style={{ flexShrink: 0, minHeight: '44px', padding: '0 1rem', borderRadius: '999px', border: b.id === activeBoardId ? '1px solid #4ecca3' : '1px solid #444', background: b.id === activeBoardId ? '#1a4a3a' : '#222', color: b.id === activeBoardId ? '#4ecca3' : '#ccc', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>{b.name}</button>
        ))}
        {memberVillages !== null && (
          <button type="button" onClick={() => navigate('/find-village')} style={{ flexShrink: 0, minHeight: '44px', padding: '0 1rem', borderRadius: '999px', border: '1px dashed #4ecca3', background: 'none', color: '#4ecca3', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
            {memberSet.size > 0 ? '+ Join another village chat' : 'Find your village chat'}
          </button>
        )}
        {isAdmin && !creatingBoard && (
          <button type="button" onClick={() => { setCreatingBoard(true); setBoardError('') }} aria-label="Add a board" style={{ flexShrink: 0, minHeight: '44px', padding: '0 1rem', borderRadius: '999px', border: '1px dashed #555', background: 'none', color: '#aaa', fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ New board</button>
        )}
        {isAdmin && creatingBoard && (
          <form onSubmit={addBoard} style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
            <label htmlFor="new-board-name" className="sr-only">Board name</label>
            <input id="new-board-name" type="text" value={newBoardName} onChange={e => setNewBoardName(e.target.value)} maxLength={40} placeholder="Board name" autoFocus style={{ minHeight: '44px', width: '9rem', boxSizing: 'border-box', padding: '0 0.75rem', borderRadius: '999px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '1rem' }} />
            <button type="submit" disabled={!newBoardName.trim()} style={{ minHeight: '44px', padding: '0 1rem', borderRadius: '999px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', opacity: newBoardName.trim() ? 1 : 0.5 }}>Add</button>
            <button type="button" onClick={() => { setCreatingBoard(false); setNewBoardName(''); setBoardError('') }} style={{ minHeight: '44px', padding: '0 0.75rem', borderRadius: '999px', border: '1px solid #444', background: 'none', color: '#aaa', cursor: 'pointer' }}>Cancel</button>
          </form>
        )}
      </div>
      {boardError && <p role="alert" style={{ margin: 0, padding: '0.4rem 1rem', color: '#ff8888', fontSize: '0.8rem', background: '#241414' }}>{boardError}</p>}

      {isVillageBoard && (inVillage || isAdmin) && <VillageNewMembers villageId={activeBoard.village_id} myId={user.id} />}
      {isVillageBoard && (inVillage || isAdmin) && removalRequests.some(r => r.requested_by !== user.id) && (
        <button type="button" onClick={() => setShowPeople(true)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.6rem 1rem', minHeight: '44px', background: '#2e2a1a', border: 'none', borderBottom: '1px solid #3a3020', color: '#ffcc66', fontSize: '0.9rem', cursor: 'pointer' }}>
          &#9888; A member asked to remove someone. A second member is needed. Tap to look.
        </button>
      )}

      {visibleEmergencies.length > 0 && (
        <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderBottom: '1px solid #3a3020', background: '#2e2a1a' }}>
          {visibleEmergencies.map(ev => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', border: '2px solid #ffaa44', borderRadius: '12px', padding: '0.65rem 0.85rem', background: '#241f14' }}>
              <span style={{ fontSize: '1.5rem', lineHeight: 1, color: '#ffaa44', flexShrink: 0 }}>&#9888;</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, color: '#ffcc00', fontWeight: 700, fontSize: '0.9rem' }}>{ev.title}</p>
                <p style={{ margin: '0.1rem 0 0', color: '#cc9999', fontSize: '0.75rem' }}>{ev.location_name || 'Location not given'} &middot; Active emergency</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flexShrink: 0 }}>
                <button onClick={() => navigate('/emergency/' + ev.id)} style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: 'none', background: '#ffaa44', color: '#1a1a1a', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>Organize help</button>
                <button onClick={() => dismissEmergency(ev.id)} style={{ padding: '0.3rem 0.75rem', borderRadius: '8px', border: '1px solid #665', background: 'none', color: '#aaa', fontSize: '0.7rem', cursor: 'pointer' }}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pinnedMessages.length > 0 && (
        <div style={{ borderBottom: '1px solid #3a2a10', background: '#241c10' }}>
          <button
            onClick={() => setShowPinned(p => !p)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: 'none', border: 'none', color: '#ffaa44', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}
          >
            &#128204; {pinnedMessages.length} pinned message{pinnedMessages.length !== 1 ? 's' : ''}
            <span style={{ marginLeft: 'auto' }}>{showPinned ? '▲' : '▼'}</span>
          </button>
          {showPinned && (
            <div style={{ padding: '0 1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '35vh', overflowY: 'auto' }}>
              {pinnedMessages.map(m => (
                <div key={m.id} style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ffaa44' }}>{names[m.user_id]?.name || 'Neighbor'}</span>
                    {isAdmin && <button onClick={() => togglePin(m)} style={{ background: 'none', border: 'none', color: '#888', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}>Unpin</button>}
                  </div>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#ddd', lineHeight: 1.4 }}>{m.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div ref={containerRef} onScroll={onScroll} className="hide-scrollbar" role="log" aria-live="polite" aria-relevant="additions" aria-label="Village Square messages" style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
        {loading && <p style={{ textAlign: 'center', color: '#888' }}>Loading...</p>}

        {!loading && visibleMessages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#8a8a8a' }}>
            <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>&#128227;</p>
            {isVillageBoard
              ? <><p>Nothing here yet. Say hello to your neighbors.</p><p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>You see what is said after you joined. People who join later will not see your older messages.</p></>
              : <p>The fire is lit. Be the first to speak.</p>}
          </div>
        )}

        {visibleMessages.map((msg, idx) => {
          const isMe = msg.user_id === user.id
          const info = names[msg.user_id] || { name: 'Neighbor' }
          const prevMsg = visibleMessages[idx - 1]
          const nextMsg = visibleMessages[idx + 1]
          const isGroupStart = !prevMsg || prevMsg.user_id !== msg.user_id || (new Date(msg.created_at) - new Date(prevMsg.created_at)) > GROUP_WINDOW_MS
          const isGroupEnd = !nextMsg || nextMsg.user_id !== msg.user_id || (new Date(nextMsg.created_at) - new Date(msg.created_at)) > GROUP_WINDOW_MS
          const fullTime = new Date(msg.created_at).toLocaleString()
          // Full rounding on the outer corners; flatten the corner(s) that
          // touch a neighboring bubble from the same person so a run of
          // messages reads as one connected shape, not a repeated stack.
          const near = isGroupStart ? '1rem' : '0.25rem'
          const far = isGroupEnd ? '0.25rem' : '1rem'
          const bubbleRadius = isMe ? `1rem ${near} ${far} 1rem` : `${near} 1rem 1rem ${far}`
          return (
            <div key={msg.id} id={'cf-msg-' + msg.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%', display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: isGroupStart ? '0.75rem' : '0.15rem', borderRadius: '1rem', outline: flashId === msg.id ? '2px solid #ffaa44' : 'none', outlineOffset: '3px', transition: 'outline-color 0.3s' }}>
              {!isMe && (isGroupStart
                ? <AvatarDisplay url={info.avatar} userId={msg.user_id} size={28} />
                : <div style={{ width: '28px', flexShrink: 0 }} />)}
              <div>
              {!isMe && isGroupStart && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.15rem' }}>
                  {info.role
                    ? <UserName userId={msg.user_id} name={info.name} style={{ fontSize: '0.75rem', fontWeight: 700, color: info.role === 'founder' ? '#c77dff' : info.role === 'admin' ? '#66aaff' : '#4ecca3' }} />
                    : <UserName userId={msg.user_id} name={info.name} style={{ fontSize: '0.75rem', fontWeight: 700, color: '#888' }} />}
                  {info.role === 'founder' && <span style={{ fontSize: '0.6rem', background: '#3a1a4a', color: '#c77dff', padding: '0 4px', borderRadius: '3px' }}>Founder</span>}
                  {info.role === 'admin' && <span style={{ fontSize: '0.6rem', background: '#1a3a5a', color: '#66aaff', padding: '0 4px', borderRadius: '3px' }}>Admin</span>}
                  {info.ambassador && <span style={{ fontSize: '0.6rem', background: '#1a4a3a', color: '#4ecca3', padding: '0 4px', borderRadius: '3px' }}>Ambassador</span>}
                </div>
              )}
              <div
                className="campfire-bubble"
                onClick={(e) => {
                  e.stopPropagation()
                  setRevealedMeta(prev => prev === msg.id ? null : msg.id)
                  if (openMsgMenu && openMsgMenu !== msg.id) setOpenMsgMenu(null)
                }}
                style={{ position: 'relative', padding: '0.5rem 0.75rem', borderRadius: bubbleRadius, background: isMe ? '#4ecca3' : '#2a2a2a', color: isMe ? '#1a1a1a' : '#eee', border: isMe ? 'none' : '1px solid #444' }}
              >
                {msg.reply_to && (() => {
                  const orig = messages.find(m => m.id === msg.reply_to)
                  const origName = orig ? (orig.user_id === user.id ? 'You' : (names[orig.user_id]?.name || 'Neighbor')) : ''
                  return (
                    <button type="button" onClick={(e) => { e.stopPropagation(); if (orig) jumpToMessage(orig.id) }} aria-label={orig ? 'Replying to ' + origName + ': ' + snippet(orig.body) + '. Jump to it.' : 'Replying to an earlier message'} style={{ display: 'block', width: '100%', textAlign: 'left', margin: '0 0 0.35rem', padding: '0.25rem 0.5rem', borderRadius: '6px', border: 'none', borderLeft: '3px solid ' + (isMe ? '#1a1a1a' : '#4ecca3'), background: isMe ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)', color: 'inherit', font: 'inherit', fontSize: '0.75rem', cursor: orig ? 'pointer' : 'default', opacity: 0.9 }}>
                      {orig ? (<><strong>{origName}</strong><br />{snippet(orig.body)}</>) : <em>Earlier message</em>}
                    </button>
                  )
                })()}
                <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{msg.body}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
                  {msg.pinned && <span title="Pinned">&#128204;</span>}
                  <span style={{ fontSize: '0.7rem', opacity: 0.75 }} title={fullTime}>{formatTime(msg.created_at)}{msg.edited_at ? ' \u00b7 edited' : ''}</span>
                  {(
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const closing = openMsgMenu === msg.id
                        setOpenMsgMenu(closing ? null : msg.id)
                        if (!closing) positionMsgMenu(e, isMe ? 'right' : 'left')
                      }}
                      aria-label="Message options"
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem', padding: 0, marginLeft: 'auto', lineHeight: 1, minWidth: '44px', minHeight: '32px', margin: '-0.4rem -0.5rem -0.4rem auto' }}
                    >&#8943;</button>
                  )}
                </div>
                {openMsgMenu === msg.id && (
                  <div
                    ref={msgMenuRef}
                    onClick={e => e.stopPropagation()}
                    style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', minWidth: '140px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', ...msgMenuStyle }}
                  >
                    {canPost && (
                    <button onClick={() => startReply(msg)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#ddd', padding: '0.65rem 0.75rem', minHeight: '44px', cursor: 'pointer', fontSize: '0.85rem' }}>
                      Reply
                    </button>
                    )}
                    {isMe && (
                      <button onClick={() => startEdit(msg)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#ddd', padding: '0.65rem 0.75rem', minHeight: '44px', cursor: 'pointer', fontSize: '0.85rem' }}>
                        Edit
                      </button>
                    )}
                    {isAdmin && (
                      <button onClick={() => togglePin(msg)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#ddd', padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                        {msg.pinned ? 'Unpin' : '📌 Pin message'}
                      </button>
                    )}
                    {!isMe && (
                      <button onClick={() => reportMessage(msg)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#ff6666', padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                        Report
                      </button>
                    )}
                  </div>
                )}
              </div>
              </div>
              {isMe && (isGroupStart
                ? <AvatarDisplay url={myAvatar} userId={user.id} size={28} />
                : <div style={{ width: '28px', flexShrink: 0 }} />)}
            </div>
          )
        })}
        {showNew && (
          <button type="button" onClick={jumpToNewest} style={{ position: 'sticky', bottom: '0.5rem', alignSelf: 'center', padding: '0.4rem 0.9rem', borderRadius: '999px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>New messages &#8595;</button>
        )}
      </div>

      {(replyTo || editing) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1rem', borderTop: '1px solid #333', background: '#222' }}>
          <div style={{ flex: 1, minWidth: 0, borderLeft: '3px solid #ffaa44', paddingLeft: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ffaa44' }}>
              {editing ? 'Editing your message' : 'Replying to ' + (replyTo.user_id === user.id ? 'yourself' : (names[replyTo.user_id]?.name || 'Neighbor'))}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{snippet((editing || replyTo).body)}</div>
          </div>
          <button type="button" onClick={cancelComposeMode} aria-label={editing ? 'Cancel editing' : 'Cancel reply'} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.2rem', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}>&#10005;</button>
        </div>
      )}
      {canPost ? (
      <>
      {introHint && !editing && (
        <p style={{ margin: 0, padding: '0.5rem 1rem 0', borderTop: '1px solid #333', background: '#1a1a1a', color: '#bfe8d9', fontSize: '0.9rem', lineHeight: 1.4 }}>
          Say hello. Add what you like doing and how you would like to be involved in your community.
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', padding: '0.75rem 1rem', borderTop: introHint && !editing ? 'none' : '1px solid #333', background: '#1a1a1a' }}>
        <textarea
          ref={inputRef}
          rows={Math.min(6, Math.max(1, newMsg.split('\n').length))}
          value={newMsg}
          onChange={e => setNewMsg(e.target.value)}
          onKeyDown={e => {
            // On a phone, Enter makes a new line and the Send button sends. On a computer, Enter sends and Shift+Enter makes a new line.
            const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches
            if (e.key === 'Enter' && !e.shiftKey && !touch) sendMessage(e)
            if (e.key === 'Escape') cancelComposeMode()
          }}
          placeholder={editing ? 'Edit your message...' : 'Say something to ' + (activeBoard ? (activeBoard.village_id ? activeBoard.name : 'the ' + activeBoard.name + ' board') : 'the group') + '...'}
          aria-label={editing ? 'Edit your message' : 'Message the Village Square'}
          disabled={sending}
          style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', minHeight: '44px', maxHeight: '40vh', padding: '0.6rem 0.875rem', borderRadius: '1.25rem', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '1rem', lineHeight: 1.35, outline: 'none', resize: 'none', fontFamily: 'inherit' }}
        />
        <button
          onClick={sendMessage}
          disabled={!newMsg.trim() || sending}
          style={{ minHeight: '44px', padding: '0 1.25rem', borderRadius: '1.5rem', background: '#ff8844', color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', opacity: (!newMsg.trim() || sending) ? 0.5 : 1 }}
        >
          {editing ? 'Save' : 'Send'}
        </button>
      </div>
      </>
      ) : (
        <div style={{ borderTop: '1px solid #333', background: '#1a1a1a', padding: '0.75rem 1rem', textAlign: 'center' }}>
        {activeBoard && activeBoard.village_id && memberVillages !== null && !memberSet.has(activeBoard.village_id) && (
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '48px', marginBottom: '0.6rem' }} onClick={() => navigate('/find-village?join=' + activeBoard.village_id)}>Join this village chat</button>
        )}
        <p style={{ margin: 0, color: '#aaa', fontSize: '0.85rem' }}>
          {activeBoard && activeBoard.is_general ? 'Everyone can read Announcements. Only Ambassadors and admins can post here.' : activeBoard && activeBoard.village_id ? 'You are not in this village chat. Join it from the map to read and post.' : 'You can read this board. You cannot post here.'}
        </p>
        </div>
      )}

      {showSettings && <div onClick={() => setShowSettings(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} />}
      <div style={{ position: 'fixed', top: 0, right: showSettings ? 0 : '-320px', width: '300px', height: '100%', background: '#1a1a1a', borderLeft: '1px solid #333', zIndex: 1000, transition: 'right 0.3s ease', overflowY: 'auto', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Village Square Settings</h2>
          <button onClick={() => setShowSettings(false)} aria-label="Close Village Square settings" style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.5rem', cursor: 'pointer' }}>&#10005;</button>
        </div>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ecca3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>About</div>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>Announcements are open for every member to read, and only Ambassadors and admins can post there. Village chats are for neighbors near you. Anyone with an account can join, and there is no limit on size. You can join more than one. New members only see what is said after they join. Neither one is end-to-end encrypted, so keep sensitive details out. Admins can read both.</p>

        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ecca3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>Notifications</div>
        <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>You get one notification after a chat goes quiet, not one for every message. Choose for each chat.</p>
        {orderedBoards.map(b => {
          const on = alertsOn(b)
          const muted = on && alertsMuted(b)
          return (
            <div key={b.id} style={{ padding: '0.6rem 0', borderBottom: '1px solid #2a2a2a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#ddd', fontSize: '0.9rem' }}>{b.name}</span>
                <button type="button" role="switch" aria-checked={on} aria-label={'Notifications for ' + b.name} disabled={alertSaving} onClick={() => saveAlert(b.id, on ? { alerts: 'off' } : { alerts: 'all', muted_until: null })} style={{ width: '40px', height: '22px', borderRadius: '11px', background: on ? '#4ecca3' : '#444', border: 'none', position: 'relative', cursor: 'pointer', flexShrink: 0, padding: 0 }}>
                  <span style={{ position: 'absolute', top: '2px', left: on ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                </button>
              </div>
              {muted && (
                <p style={{ margin: '0.35rem 0 0', color: '#aaa', fontSize: '0.8rem' }}>
                  Muted{new Date(alertMap[b.id].muted_until).getFullYear() > 2090 ? ' until you turn it back on' : ' until ' + new Date(alertMap[b.id].muted_until).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.{' '}
                  <button type="button" disabled={alertSaving} onClick={() => saveAlert(b.id, { alerts: 'all', muted_until: null })} style={{ background: 'none', border: 'none', color: '#4ecca3', cursor: 'pointer', padding: '0 0.25rem', minHeight: '44px', fontSize: '0.8rem' }}>Unmute</button>
                </p>
              )}
              {on && !muted && (
                <>
                  <button type="button" aria-expanded={muteOpenFor === b.id} onClick={() => setMuteOpenFor(muteOpenFor === b.id ? null : b.id)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '0 0.25rem 0 0', minHeight: '44px', fontSize: '0.8rem' }}>&#128263; Mute &#9656;</button>
                  {muteOpenFor === b.id && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.25rem' }}>
                      {MUTE_OPTIONS.map((opt, k) => (
                        <button key={k} type="button" disabled={alertSaving} onClick={async () => { await saveAlert(b.id, { alerts: 'all', muted_until: opt.ms === null ? '2099-01-01T00:00:00Z' : new Date(Date.now() + opt.ms).toISOString() }); setMuteOpenFor(null) }} style={{ minHeight: '44px', padding: '0 0.85rem', borderRadius: '999px', border: '1px solid #444', background: '#222', color: '#ddd', cursor: 'pointer', fontSize: '0.8rem' }}>{opt.label}</button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}

        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ecca3', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '1rem', marginBottom: '0.5rem' }}>Actions</div>
        <button onClick={() => navigate('/find-village')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#4ecca3', padding: '0.6rem 0.75rem', minHeight: '44px', cursor: 'pointer', fontSize: '0.85rem' }}>
          &#127969; Find or join a village chat
        </button>
        {isVillageBoard && inVillage && (
        <button onClick={leaveVillageChat} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#ff6666', padding: '0.6rem 0.75rem', minHeight: '44px', cursor: 'pointer', fontSize: '0.85rem' }}>
          &#128682; Leave {activeBoard.name}
        </button>
        )}

        {isStaff && !isVillageBoard && (<>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ecca3', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '1rem', marginBottom: '0.5rem' }}>People here ({Object.keys(names).length})</div>
        {Object.keys(names).length > 8 && (
          <input
            type="text"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Search members..."
            aria-label="Search members"
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.75rem', marginBottom: '0.6rem', background: '#222', border: '1px solid #333', borderRadius: '8px', color: '#eee', fontSize: '0.85rem' }}
          />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {Object.entries(names)
            .filter(([, info]) => info.role)
            .filter(([, info]) => (info.name || 'Neighbor').toLowerCase().includes(memberSearch.trim().toLowerCase()))
            .sort(([, a], [, b]) => (a.name || '').localeCompare(b.name || ''))
            .map(([uid, info]) => (
            <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderRadius: '8px', background: '#222', width: '100%', boxSizing: 'border-box', textAlign: 'left' }}>
              <AvatarDisplay url={info.avatar} userId={uid} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                  <UserName userId={uid} name={info.name} style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }} />
                  {info.role === 'founder' && <span style={{ fontSize: '0.6rem', background: '#3a1a4a', color: '#c77dff', padding: '0 4px', borderRadius: '3px' }}>Founder</span>}
                  {info.role === 'admin' && <span style={{ fontSize: '0.6rem', background: '#1a3a5a', color: '#66aaff', padding: '0 4px', borderRadius: '3px' }}>Admin</span>}
                  {info.ambassador && <span style={{ fontSize: '0.6rem', background: '#1a4a3a', color: '#4ecca3', padding: '0 4px', borderRadius: '3px' }}>Ambassador</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.7rem', color: '#888' }}>
                  {info.joined && <span>Joined {new Date(info.joined).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>}
                </div>
              </div>
            </div>
          ))}
          {memberSearch.trim() && Object.entries(names).filter(([, info]) => (info.name || 'Neighbor').toLowerCase().includes(memberSearch.trim().toLowerCase())).length === 0 && (
            <p style={{ color: '#8a8a8a', fontSize: '0.8rem', textAlign: 'center', padding: '0.75rem 0' }}>No members match "{memberSearch.trim()}".</p>
          )}
        </div>
        </>)}
      </div>
      {showPeople && isVillageBoard && (
        <VillagePeople
          villageId={activeBoard.village_id}
          villageName={activeBoard.name}
          myId={user.id}
          isAdmin={isAdmin}
          requests={removalRequests}
          onRequestsChange={loadRemovalRequests}
          onClose={() => setShowPeople(false)}
          onLeave={inVillage ? leaveVillageChat : null}
        />
      )}
    </div>
  )
}