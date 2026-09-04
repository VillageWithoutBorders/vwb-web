import MessageOptionsMenu from '../components/popup/MessageOptionsMenu'
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { createNotification } from '../utils/notificationHelpers'
import { useUnreadCount } from '../context/UnreadCountContext'
import AvatarDisplay from '../components/AvatarDisplay'

export default function Conversation() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
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
  const [request, setRequest] = useState(null)
  const bottomRef = useRef(null)
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
                supabase.from('conversations').update({ [readCol]: new Date().toISOString() }).eq('id', c.id).then(() => refreshUnread())
            }
        }
    }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadConversation() {
    setLoading(true)
    const { data: c } = await supabase
      .from('conversations').select('*').eq('id', id).single()
    if (!c) { setLoading(false); return }
      setConvo(c)
    convoRef.current = c
    const readCol = c.helper_id === user.id ? "last_read_helper" : "last_read_requester"
    supabase.from("conversations").update({ [readCol]: new Date().toISOString() }).eq("id", c.id).then(() => refreshUnread())
    const otherId = c.helper_id === user.id ? c.requester_id : c.helper_id

    const { data: otherProfile } = await supabase.from('helper_profiles').select('display_name, avatar_url').eq('user_id', otherId).maybeSingle()
    setOtherUserId(otherId)
    if (otherProfile) { setOtherName(otherProfile.display_name || 'Neighbor'); setOtherAvatar(otherProfile.avatar_url || null) }
    const { data: myProfile } = await supabase.from('helper_profiles').select('avatar_url').eq('user_id', user.id).maybeSingle()
    if (myProfile) setMyAvatar(myProfile.avatar_url || null)

    if (c.request_id) {
      const { data: req } = await supabase
        .from('help_requests').select('skill_needed, description, urgency').eq('id', c.request_id).single()
      if (req) setRequest(req)
    }

    await loadMessages()
    setLoading(false)
    pollRef.current = setInterval(loadMessages, 5000)
  }

  async function loadMessages() {
    const { data } = await supabase
      .from('chat_messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true })
    if (data) setMessages(data)
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!newMsg.trim() || sending) return
    setSending(true)
    const { error } = await supabase.from('chat_messages').insert({
      conversation_id: Number(id),
      sender_id: user.id,
      body: newMsg.trim(),
    })
    if (!error) { const recipientId = convo.helper_id === user.id ? convo.requester_id : convo.helper_id; createNotification({ userId: recipientId, type: 'message', title: 'New message from ' + (convo.helper_id === user.id ? 'your helper' : 'your neighbor'), body: newMsg.trim().substring(0, 100), link: '/conversation/' + id }); setNewMsg(''); await loadMessages() }
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
        <button className="convo-back" onClick={async () => { if (convo) { const readCol = convo.helper_id === user.id ? "last_read_helper" : "last_read_requester"; await supabase.from("conversations").update({ [readCol]: new Date().toISOString() }).eq("id", convo.id); refreshUnread() } navigate(-1) }} aria-label="Back">
          &#8592;
        </button>
        <AvatarDisplay url={otherAvatar} userId={otherUserId} size={36} />
        <div className="convo-header-info">
          <h1>{otherName}</h1>
          {request && <p className="convo-context">{request.skill_needed}</p>}
        </div>







      </div>

      {request && (
        <div className="convo-request-banner">
          <span className={'urgency-badge urgency-' + request.urgency}>{urgencyLabel}</span>
          <span className="convo-request-skill">{request.skill_needed}</span>
          <p className="convo-request-desc">{request.description}</p>
        </div>
      )}

      <div className="convo-messages">
        {messages.length === 0 && (
          <p className="convo-empty">No messages yet. Say hello!</p>
        )}
        {messages.map((msg) => {
  const isMe = msg.sender_id === user.id
  return (
    <div key={msg.id} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
      {!isMe && <AvatarDisplay url={otherAvatar} userId={otherUserId} size={24} />}
      <div className={'chat-bubble ' + (isMe ? 'mine' : 'theirs')} onClick={() => setSelectedMessage(msg)}>
        <p className="chat-body">{msg.body}</p>
        <span className="chat-time">{formatTime(msg.created_at)}</span>
      </div>
      {isMe && <AvatarDisplay url={myAvatar} userId={user.id} size={24} />}
    </div>
  )
})}
        <div ref={bottomRef} />
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
    </div>
  )
}
