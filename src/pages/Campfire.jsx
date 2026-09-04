import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import AvatarDisplay from '../components/AvatarDisplay'

export default function Campfire() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [names, setNames] = useState({})
  const bottomRef = useRef(null)
  const [myAvatar, setMyAvatar] = useState(null)
  const pollRef = useRef(null)

  const hasAccess = profile?.is_hope_ambassador || profile?.role === 'admin'

  useEffect(() => {
      supabase.from('helper_profiles').select('avatar_url').eq('user_id', user.id).maybeSingle().then(({ data }) => { if (data) setMyAvatar(data.avatar_url || null) })
    if (hasAccess) {
      loadMessages()
      pollRef.current = setInterval(loadMessages, 5000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [hasAccess])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages() {
    const { data } = await supabase.from('campfire_messages').select('*').order('created_at', { ascending: true }).limit(200)
    if (data) {
      setMessages(data)
      const userIds = [...new Set(data.map(m => m.user_id))]
      const unknownIds = userIds.filter(id => !names[id])
      if (unknownIds.length > 0) {
        const newNames = { ...names }
        await Promise.all(unknownIds.map(async (uid) => {
          const { data: p } = await supabase.from('helper_profiles').select('display_name, role, is_hope_ambassador, avatar_url').eq('user_id', uid).maybeSingle()
          newNames[uid] = { name: p?.display_name || 'Neighbor', role: p?.role, ambassador: p?.is_hope_ambassador, avatar: p?.avatar_url || null }
        }))
        setNames(newNames)
      }
    }
    setLoading(false)
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!newMsg.trim() || sending) return
    setSending(true)
    await supabase.from('campfire_messages').insert({ user_id: user.id, body: newMsg.trim() })
    setNewMsg('')
    await loadMessages()
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

  if (!hasAccess) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', maxWidth: '400px', margin: '0 auto' }}>
        <p style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>&#128293;</p>
        <h2 style={{ color: '#ffaa44', marginBottom: '0.5rem' }}>The Campfire</h2>
        <p style={{ color: '#aaa', marginBottom: '1.5rem' }}>This is where Hope Ambassadors and admins organize together. Become a Hope Ambassador to join the conversation.</p>
        <button onClick={() => navigate('/profile')} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer' }}>Go to Profile</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 70px)', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, padding: '0.75rem 1rem', borderBottom: '1px solid #333', background: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer' }}>&#8592;</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>&#128293;</span> The Campfire
          </h1>
          <p style={{ margin: 0, color: '#888', fontSize: '0.75rem' }}>Ambassadors and admins</p>
        </div>
      </div>

      <div className="hide-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {loading && <p style={{ textAlign: 'center', color: '#888' }}>Loading...</p>}

        {!loading && messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
            <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>&#128293;</p>
            <p>The fire is lit. Be the first to speak.</p>
          </div>
        )}

        {messages.map(msg => {
          const isMe = msg.user_id === user.id
          const info = names[msg.user_id] || { name: 'Neighbor' }
          return (
            <div key={msg.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              {!isMe && <AvatarDisplay url={info.avatar} userId={msg.user_id} size={28} />}
              <div>
              {!isMe && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.15rem' }}>
                  <span onClick={() => navigate('/u/' + msg.user_id)} style={{ fontSize: '0.75rem', fontWeight: 700, color: info.role === 'admin' ? '#66aaff' : '#4ecca3', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#444', textUnderlineOffset: '2px' }}>{info.name}</span>
                  {info.role === 'admin' && <span style={{ fontSize: '0.6rem', background: '#1a3a5a', color: '#66aaff', padding: '0 4px', borderRadius: '3px' }}>Admin</span>}
                  {info.ambassador && info.role !== 'admin' && <span style={{ fontSize: '0.6rem', background: '#1a4a3a', color: '#4ecca3', padding: '0 4px', borderRadius: '3px' }}>Ambassador</span>}
                </div>
              )}
              <div style={{ padding: '0.5rem 0.75rem', borderRadius: isMe ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem', background: isMe ? '#4ecca3' : '#2a2a2a', color: isMe ? '#1a1a1a' : '#eee', border: isMe ? 'none' : '1px solid #444' }}>
                <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.4 }}>{msg.body}</p>
                <span style={{ display: 'block', fontSize: '0.65rem', marginTop: '0.2rem', opacity: 0.6 }}>{formatTime(msg.created_at)}</span>
              </div>
              </div>
              {isMe && <AvatarDisplay url={myAvatar} userId={user.id} size={28} />}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem', borderTop: '1px solid #333', background: '#1a1a1a' }}>
        <input
          type="text"
          value={newMsg}
          onChange={e => setNewMsg(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(e) }}
          placeholder="Say something to the group..."
          disabled={sending}
          style={{ flex: 1, padding: '0.625rem 0.875rem', borderRadius: '1.5rem', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
        />
        <button
          onClick={sendMessage}
          disabled={!newMsg.trim() || sending}
          style={{ padding: '0.625rem 1.25rem', borderRadius: '1.5rem', background: '#ff8844', color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', opacity: (!newMsg.trim() || sending) ? 0.5 : 1 }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
