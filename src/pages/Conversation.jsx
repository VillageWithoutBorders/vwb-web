import MessageOptionsMenu from '../components/popup/MessageOptionsMenu'
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useChatScroll } from '../hooks/useChatScroll'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { createNotification } from '../utils/notificationHelpers'
import { useUnreadCount } from '../context/UnreadCountContext'
import AvatarDisplay from '../components/AvatarDisplay'
import { submitUserReport } from '../utils/submitUserReport'
import { encryptForConversation, decryptFromSender, getDeviceId } from '../lib/e2ee'

// Consecutive messages from the same person within this window are grouped
// visually (avatar shown once, tighter spacing) instead of repeating the
// avatar for every line - same convention as the Campfire group chat, so a
// quick back-and-forth doesn't take up more room than it needs to.
const GROUP_WINDOW_MS = 5 * 60 * 1000

// Since messages are end-to-end encrypted, Village Without Borders can no
// longer read a reported conversation at the database level -- only the
// two people in it can. So a report here works the way Signal's own
// reports do: the reporter attaches their own already-decrypted copy of
// the recent messages, straight from what's on their screen right now.
const REASONS = [
  'Harassing me or making me feel unsafe',
  'Threatening or unsafe behavior',
  'Pretending to be someone else',
  'Asking for money or private information',
  'Something else',
]

export default function Conversation() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { refreshUnread } = useUnreadCount()
  const [convo, setConvo] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [otherName, setOtherName] = useState('Neighbor')
  const [otherAvatar, setOtherAvatar] = useState(null)
  const [otherUserId, setOtherUserId] = useState(null)
  const [myAvatar, setMyAvatar] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [request, setRequest] = useState(null)
  const [reportDialog, setReportDialog] = useState(null) // 'report' | 'reported' | null
  const [reportReason, setReportReason] = useState('')
  const [reportDetails, setReportDetails] = useState('')
  const [includeEvidence, setIncludeEvidence] = useState(true)
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState('')
    const pollRef = useRef(null)
    const convoRef = useRef(null)
  const [selectedMessage, setSelectedMessage] = useState(null)

    useEffect(() => {
        loadConversation()
        return () => {
            if (pollRef.current) clearInterval(pollRef.current)
            // Mark as read no matter how the user leaves
            const c = convoRef.current
            if (c) {
                const readCol = c.helper_id === user.id ? 'last_read_helper' : 'last_read_requester'
                supabase.from('conversations').update({ [readCol]: new Date().toISOString() }).eq('id', c.id).then(({ error }) => {
                    if (error) console.error('Failed to mark conversation read on exit:', error)
                    refreshUnread()
                })
            }
        }
    }, [id])

  const { containerRef, onScroll, showNew, jumpToNewest } = useChatScroll(messages, user?.id, !loading)

  // Messages.jsx's inbox-list "Report" action sends people here instead of
  // handling it inline, since a report needs somewhere to pull evidence
  // from now that messages are encrypted. Clear the flag right after so it
  // doesn't re-open on a later re-render or a back/forward nav.
  useEffect(() => {
    if (location.state?.openReport) {
      setReportDialog('report')
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state])

  async function loadConversation() {
    setLoading(true)
    const { data: c, error: convoErr } = await supabase
      .from('conversations').select('*').eq('id', id).single()
    if (convoErr) console.error('Failed to load conversation:', convoErr)
    if (!c) { setLoading(false); return }
      setConvo(c)
    convoRef.current = c
    const readCol = c.helper_id === user.id ? "last_read_helper" : "last_read_requester"
    supabase.from("conversations").update({ [readCol]: new Date().toISOString() }).eq("id", c.id).then(({ error }) => {
      if (error) console.error('Failed to mark conversation read:', error)
      refreshUnread()
    })
    const otherId = c.helper_id === user.id ? c.requester_id : c.helper_id

    const { data: otherProfile, error: otherErr } = await supabase.from('helper_profiles_public').select('display_name, avatar_url').eq('user_id', otherId).maybeSingle()
    if (otherErr) console.error("Failed to load the other participant's profile:", otherErr)
    setOtherUserId(otherId)
    if (otherProfile) { setOtherName(otherProfile.display_name || 'Neighbor'); setOtherAvatar(otherProfile.avatar_url || null) }
    const { data: myProfile, error: myErr } = await supabase.from('helper_profiles').select('avatar_url').eq('user_id', user.id).maybeSingle()
    if (myErr) console.error('Failed to load your profile:', myErr)
    if (myProfile) setMyAvatar(myProfile.avatar_url || null)

    if (c.request_id) {
      const { data: req, error: reqErr } = await supabase
        .from('help_requests').select('skill_needed, description, urgency').eq('id', c.request_id).single()
      if (reqErr) console.error('Failed to load request details:', reqErr)
      if (req) setRequest(req)
    }

    await loadMessages()
    setLoading(false)
    pollRef.current = setInterval(loadMessages, 5000)
  }

  // Messages are stored encrypted: chat_messages.body is left empty once
  // encryption succeeds, and the readable text lives in per-device rows in
  // encrypted_message_copies instead. A non-empty body means either an old
  // message from before encryption went live, or a message sent when the
  // recipient hadn't published a device key yet (sendMessage falls back to
  // plaintext in that case) -- either way it's shown as-is. Everything else
  // is decrypted client-side, in one batched lookup rather than one query
  // per message.
  async function loadMessages() {
    const { data, error } = await supabase
      .from('chat_messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true })
    if (error) { console.error('Failed to load messages:', error); return }
    if (!data) return

    const deviceId = await getDeviceId()
    const encryptedIds = data.filter(m => !m.body).map(m => m.id)
    const copiesByMessage = {}
    if (deviceId && encryptedIds.length > 0) {
      const { data: copies, error: copiesErr } = await supabase
        .from('encrypted_message_copies')
        .select('message_id, ciphertext, nonce')
        .in('message_id', encryptedIds)
        .eq('user_id', user.id)
        .eq('device_id', deviceId)
      if (copiesErr) console.error('Failed to load encrypted message copies:', copiesErr)
      if (copies) copies.forEach(c => { copiesByMessage[c.message_id] = c })
    }

    const withPlaintext = await Promise.all(data.map(async (msg) => {
      if (msg.body) return { ...msg, displayBody: msg.body }
      const copy = copiesByMessage[msg.id]
      if (!copy) return { ...msg, displayBody: '[Unable to decrypt this message]' }
      const plaintext = await decryptFromSender(copy.ciphertext, copy.nonce, msg.sender_id)
      return { ...msg, displayBody: plaintext ?? '[Unable to decrypt this message]' }
    }))
    setMessages(withPlaintext)
  }

  // Encrypts the message for every device of the recipient (and every
  // device of ours, so we can still read it back later -- see e2ee.js)
  // before it ever reaches the server. If that comes back empty --
  // libsodium isn't installed, or the recipient has never published a
  // device key -- the message is sent as plain text instead, the same
  // way it always worked, rather than silently failing to send.
  async function sendMessage(e) {
    e.preventDefault()
    if (!newMsg.trim() || sending) return
    setSending(true)
    const plaintext = newMsg.trim()
    const recipientId = convo.helper_id === user.id ? convo.requester_id : convo.helper_id
    const copies = await encryptForConversation(plaintext, user.id, recipientId)
    const { data: inserted, error } = await supabase.from('chat_messages').insert({
      conversation_id: Number(id),
      sender_id: user.id,
      body: copies.length > 0 ? '' : plaintext,
    }).select().single()
    if (!error && inserted) {
      if (copies.length > 0) {
        const rows = copies.map(c => ({ message_id: inserted.id, user_id: c.userId, device_id: c.deviceId, ciphertext: c.ciphertext, nonce: c.nonce }))
        const { error: copyErr } = await supabase.from('encrypted_message_copies').insert(rows)
        if (copyErr) console.error('Failed to store encrypted message copies:', copyErr)
      }
      createNotification({ userId: recipientId, type: 'message', title: 'New message from ' + (convo.helper_id === user.id ? 'your helper' : 'your neighbor'), body: 'You have a new message.', link: '/conversation/' + id })
      setNewMsg('')
      await loadMessages()
    } else {
      console.error('Failed to send message:', error)
      alert('Could not send your message. Try again.')
    }
    setSending(false)
  }

  function formatTime(ts) {
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  function closeReportDialog() {
    setReportDialog(null)
    setReportReason('')
    setReportDetails('')
    setReportError('')
    setIncludeEvidence(true)
  }

  // Pulls the last handful of messages straight from what's already
  // decrypted on screen -- nothing is re-fetched or re-decrypted for this.
  function buildEvidenceExcerpt() {
    return messages.slice(-10).map(m => {
      const who = m.sender_id === user.id ? 'Me' : otherName
      const text = m.deleted_at ? '[deleted]' : (m.displayBody ?? m.body ?? '')
      return who + ': ' + text
    }).join('\n')
  }

  async function submitConversationReport() {
    if (!reportReason) { setReportError('Pick the closest reason.'); return }
    setReportBusy(true)
    setReportError('')
    let details = reportDetails.trim()
    if (includeEvidence) {
      const excerpt = buildEvidenceExcerpt()
      if (excerpt) details = (details ? details + '\n\n' : '') + '--- Recent messages, attached by the reporter ---\n' + excerpt
    }
    const { error } = await submitUserReport({ reporterId: user.id, reportedUserId: otherUserId, source: 'conversation', reason: reportReason, details })
    setReportBusy(false)
    if (error) { setReportError('Could not send your report. Try again.'); return }
    setReportDialog('reported')
  }

  if (loading) {
    return (
      <div className="conversation-page">
        <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    )
  }

  if (!convo) {
    return (
      <div className="conversation-page">
        <p style={{ textAlign: 'center', padding: '2rem' }}>Conversation not found.</p>
        <button className="btn btn-outline btn-full" onClick={() => navigate(-1)}>Back to Tasks</button>
      </div>
    )
  }

  const urgencyLabel = request?.urgency === 'now' ? 'Right now'
    : request?.urgency === 'today' ? 'Today'
    : request?.urgency === 'this_week' ? 'This week'
    : 'Flexible'

  return (
    <div className="conversation-page">
      <div className="convo-header">
        <button className="convo-back" onClick={async () => { if (convo) { const readCol = convo.helper_id === user.id ? "last_read_helper" : "last_read_requester"; const { error } = await supabase.from("conversations").update({ [readCol]: new Date().toISOString() }).eq("id", convo.id); if (error) console.error('Failed to mark conversation read:', error); refreshUnread() } navigate(-1) }} aria-label="Back">
          &#8592;
        </button>
        <AvatarDisplay url={otherAvatar} userId={otherUserId} size={36} />
        <div className="convo-header-info">
          <h1>{otherName}</h1>
          {request && <p className="convo-context">{request.skill_needed}</p>}
        </div>
        <button onClick={() => setShowSettings(true)} aria-label="Chat settings" style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.3rem', padding: '0.25rem', marginLeft: 'auto' }} title='Settings'>&#9881;</button>




      </div>

      {request && (
        <div className="convo-request-banner">
          <span className={'urgency-badge urgency-' + request.urgency}>{urgencyLabel}</span>
          <span className="convo-request-skill">{request.skill_needed}</span>
          <p className="convo-request-desc">{request.description}</p>
        </div>
      )}

      <div className="convo-messages" ref={containerRef} onScroll={onScroll}>
        {messages.length === 0 && (
          <p className="convo-empty">No messages yet. Say hello!</p>
        )}
        {messages.map((msg, idx) => {
  const isMe = msg.sender_id === user.id
  const prevMsg = messages[idx - 1]
  const isGroupStart = !prevMsg || prevMsg.sender_id !== msg.sender_id || (new Date(msg.created_at) - new Date(prevMsg.created_at)) > GROUP_WINDOW_MS
  return (
    <div key={msg.id} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem', justifyContent: isMe ? 'flex-end' : 'flex-start', marginTop: isGroupStart ? '0.5rem' : '0.15rem' }}>
      {!isMe && (isGroupStart
        ? <AvatarDisplay url={otherAvatar} userId={otherUserId} size={24} />
        : <div style={{ width: '24px', flexShrink: 0 }} />)}
      <div className={'chat-bubble ' + (isMe ? 'mine' : 'theirs')} onClick={() => setSelectedMessage(msg)} role="button" tabIndex={0} aria-label="Message actions" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedMessage(msg) } }}>
        <p className="chat-body">{msg.displayBody ?? msg.body}</p>
        <span className="chat-time">{formatTime(msg.created_at)}</span>
      </div>
      {isMe && (isGroupStart
        ? <AvatarDisplay url={myAvatar} userId={user.id} size={24} />
        : <div style={{ width: '24px', flexShrink: 0 }} />)}
    </div>
  )
})}
        {showNew && (
          <button type="button" onClick={jumpToNewest} style={{ position: 'sticky', bottom: '0.5rem', alignSelf: 'center', padding: '0.4rem 0.9rem', borderRadius: '999px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>New messages &#8595;</button>
        )}
      </div>

      <div className="convo-input-bar">
        <input
          type="text"
          value={newMsg}
          onChange={(e) => setNewMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(e) }}
          placeholder="Type a message..."
          className="convo-input"
          disabled={sending}
        />
        <button
          className="convo-send"
          onClick={sendMessage}
          disabled={!newMsg.trim() || sending}
          aria-label="Send"
        >
          Send
        </button>
      </div>
      {selectedMessage && (
        <MessageOptionsMenu
          message={selectedMessage}
          currentUserId={user.id}
          conversationId={id}
          onClose={() => { setSelectedMessage(null); loadMessages() }}
        />
      )}

      {showSettings && <div onClick={() => setShowSettings(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} />}
      <div style={{ position: 'fixed', top: 0, right: showSettings ? 0 : '-320px', width: '300px', height: '100%', background: '#1a1a1a', borderLeft: '1px solid #333', zIndex: 1000, transition: 'right 0.3s ease', overflowY: 'auto', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Chat Settings</h2>
          <button onClick={() => setShowSettings(false)} aria-label="Close chat settings" style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.5rem', cursor: 'pointer' }}>&#10005;</button>
        </div>

        <button type="button" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#222', borderRadius: '10px', marginBottom: '1.25rem', cursor: 'pointer', border: 'none', width: '100%', textAlign: 'left' }} onClick={() => { setShowSettings(false); navigate('/u/' + otherUserId) }}>
          <AvatarDisplay url={otherAvatar} userId={otherUserId} size={44} />
          <div>
            <div style={{ fontWeight: 700, color: '#fff' }}>{otherName}</div>
            <div style={{ color: '#4ecca3', fontSize: '0.8rem' }}>View profile</div>
          </div>
        </button>

        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ecca3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>Actions</div>

        <button onClick={() => { setShowSettings(false); navigate('/u/' + otherUserId) }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#ddd', padding: '0.6rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
          <span style={{ width: '1.2rem', textAlign: 'center' }}>&#128100;</span> View Profile
        </button>
        <button onClick={async () => {
          if (!confirm('Block ' + otherName + '?')) return
          const { error } = await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: otherUserId })
          setShowSettings(false)
          if (error) { console.error('Failed to block user:', error); alert('Could not block this user. Try again.'); return }
          alert('User blocked.')
        }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#ddd', padding: '0.6rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
          <span style={{ width: '1.2rem', textAlign: 'center' }}>&#128683;</span> Block User
        </button>
        <button onClick={() => { setShowSettings(false); setReportDialog('report') }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#ff6666', padding: '0.6rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
          <span style={{ width: '1.2rem', textAlign: 'center' }}>&#9873;</span> Report User
        </button>
      </div>

      {reportDialog && (
        <>
          <div onClick={closeReportDialog} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100 }} />
          <div role="dialog" aria-modal="true" aria-labelledby="report-title" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#1e1e1e', border: '1px solid #333', borderRadius: '16px', padding: '1.25rem', zIndex: 1101, width: 'min(360px, calc(100vw - 2rem))', maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            {reportDialog === 'report' && (
              <>
                <h2 id="report-title" style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#fff' }}>Report {otherName}</h2>
                <p style={{ margin: '0 0 0.75rem', color: '#bbb', fontSize: '0.9rem', lineHeight: 1.5 }}>Only admins see your report. Messages here are end-to-end encrypted, so admins cannot read this conversation themselves -- if you want them to see what was said, attach it below.</p>
                <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
                  <legend style={{ color: '#ddd', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>What happened?</legend>
                  {REASONS.map((r) => (
                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', minHeight: '40px', color: '#eee', fontSize: '0.9rem', cursor: 'pointer' }}>
                      <input type="radio" name="report-reason" value={r} checked={reportReason === r} onChange={() => { setReportReason(r); setReportError('') }} style={{ width: '18px', height: '18px', accentColor: '#4ecca3' }} />
                      {r}
                    </label>
                  ))}
                </fieldset>
                <label htmlFor="report-details" style={{ display: 'block', color: '#ddd', fontSize: '0.85rem', fontWeight: 600, margin: '0.75rem 0 0.3rem' }}>Anything else we should know? (optional)</label>
                <textarea id="report-details" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} maxLength={500} rows={3} style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: '8px', border: '1px solid #444', background: '#111', color: '#eee', fontSize: '0.9rem', resize: 'vertical' }} />
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.75rem', color: '#ddd', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeEvidence} onChange={(e) => setIncludeEvidence(e.target.checked)} style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: '#4ecca3', flexShrink: 0 }} />
                  <span>Attach the last few messages from this conversation, so an admin has something to go on</span>
                </label>
                {reportError && <p role="alert" style={{ margin: '0.6rem 0 0', color: '#ff8080', fontSize: '0.85rem' }}>{reportError}</p>}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button type="button" onClick={closeReportDialog} style={{ flex: 1, padding: '0.7rem', minHeight: '44px', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#aaa', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>Cancel</button>
                  <button type="button" onClick={submitConversationReport} disabled={reportBusy} style={{ flex: 1, padding: '0.7rem', minHeight: '44px', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>{reportBusy ? 'Sending...' : 'Send report'}</button>
                </div>
              </>
            )}

            {reportDialog === 'reported' && (
              <>
                <h2 id="report-title" style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#fff' }}>Thank you</h2>
                <p style={{ margin: '0 0 1rem', color: '#bbb', fontSize: '0.9rem', lineHeight: 1.5 }}>An admin will look at this.</p>
                <button type="button" onClick={closeReportDialog} style={{ width: '100%', padding: '0.7rem', minHeight: '44px', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#aaa', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>Done</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}