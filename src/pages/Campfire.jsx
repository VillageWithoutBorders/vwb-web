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
  const [showSettings, setShowSettings] = useState(false)
  const [campfireMuted, setCampfireMuted] = useState(localStorage.getItem('vwb_campfire_muted') === 'true')
  const [reportingMsg, setReportingMsg] = useState(null)

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


  function toggleMute() {
    const next = !campfireMuted
    setCampfireMuted(next)
    localStorage.setItem('vwb_campfire_muted', String(next))
  }

  async function leaveCampfire() {
    if (!confirm('Leave the Campfire? You can rejoin anytime from the Community page.')) return
    navigate('/')
  }

  async function reportMessage(msg) {
    const info = names[msg.user_id] || { name: 'Unknown' }
    await supabase.from('safety_alerts').insert({
      reporter_id: user.id,
      reported_user_id: msg.user_id,
      alert_type: 'flag',
      description: 'Reported Campfire message from ' + info.name + ': "' + (msg.body.length > 100 ? msg.body.slice(0, 100) + '...' : msg.body) + '"'
    })
    setReportingMsg(null)
    alert('Report submitted. An admin will review this message.')
  }

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
        <button onClick={() => setShowSettings(true)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.3rem', padding: '0.25rem', marginLeft: 'auto' }} title='Settings'>&#9881;</button>
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

      {showSettings && <div onClick={() => setShowSettings(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} />}
      <div style={{ position: 'fixed', top: 0, right: showSettings ? 0 : '-320px', width: '300px', height: '100%', background: '#1a1a1a', borderLeft: '1px solid #333', zIndex: 1000, transition: 'right 0.3s ease', overflowY: 'auto', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Campfire Settings</h2>
          <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.5rem', cursor: 'pointer' }}>&#10005;</button>
        </div>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ecca3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>About</div>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>The Campfire is a group chat for Hope Ambassadors and admins. Conversations here are visible to all members with access.</p>

        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ecca3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>Notifications</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid #2a2a2a' }}>
          <span style={{ color: '#ddd', fontSize: '0.9rem' }}>{campfireMuted ? 'Muted' : 'Notifications on'}</span>
          <button onClick={toggleMute} style={{ width: '40px', height: '22px', borderRadius: '11px', background: campfireMuted ? '#444' : '#4ecca3', position: 'relative', cursor: 'pointer', border: 'none', padding: 0 }}>
            <span style={{ position: 'absolute', top: '2px', left: campfireMuted ? '2px' : '20px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </button>
        </div>

        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ecca3', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '1rem', marginBottom: '0.5rem' }}>Actions</div>
        <button onClick={leaveCampfire} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#ff6666', padding: '0.6rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
          &#128682; Leave Campfire
        </button>

        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ecca3', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '1rem', marginBottom: '0.5rem' }}>Members ({Object.keys(names).length})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {Object.entries(names).map(([uid, info]) => (
            <div key={uid} onClick={() => { setShowSettings(false); navigate('/u/' + uid) }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderRadius: '8px', background: '#222', cursor: 'pointer' }}>
              <AvatarDisplay url={info.avatar} userId={uid} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                  <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>{info.name}</span>
                  {info.role === 'admin' && <span style={{ fontSize: '0.6rem', background: '#1a3a5a', color: '#66aaff', padding: '0 4px', borderRadius: '3px' }}>Admin</span>}
                  {info.ambassador && info.role !== 'admin' && <span style={{ fontSize: '0.6rem', background: '#1a4a3a', color: '#4ecca3', padding: '0 4px', borderRadius: '3px' }}>Ambassador</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.7rem', color: '#888' }}>
                  {info.joined && <span>Joined {new Date(info.joined).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>}
                  <span style={{ color: info.score > 0 ? '#4ecca3' : info.score < 0 ? '#ff6666' : '#888' }}>{info.score > 0 ? '+' : ''}{info.score} rep</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
