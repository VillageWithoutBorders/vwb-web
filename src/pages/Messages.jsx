import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

export default function Messages() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [convos, setConvos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadConversations() }, [])

  async function loadConversations() {
    setLoading(true)
    const { data } = await supabase
      .from('conversations')
      .select('id, request_id, helper_id, requester_id, created_at, help_requests (skill_needed, neighborhood, urgency)')
      .order('created_at', { ascending: false })

    if (data) {
      const withNames = await Promise.all(data.map(async (c) => {
        const otherId = c.helper_id === user.id ? c.requester_id : c.helper_id
        const { data: p } = await supabase
          .from('helper_profiles').select('display_name').eq('user_id', otherId).maybeSingle()
        const { data: lastMsg } = await supabase
          .from('chat_messages').select('body, created_at').eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        return { ...c, otherName: p?.display_name || 'Neighbor', lastMessage: lastMsg?.body || null, lastMessageAt: lastMsg?.created_at || c.created_at }
      }))
      withNames.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
      setConvos(withNames)
    }
    setLoading(false)
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

  return (
    <div className="messages-page">
      <h1>Messages</h1>
      {loading && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>Loading...</p>}
      {!loading && convos.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>No messages yet</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>When you help someone or someone helps you, your conversations will show up here.</p>
        </div>
      )}
      {!loading && convos.map((c) => (
        <div key={c.id} className="message-card" onClick={() => navigate('/conversation/' + c.id)}>
          <div className="message-card-header">
            <span className="message-card-name">{c.otherName}</span>
            <span className="message-card-time">{formatTime(c.lastMessageAt)}</span>
          </div>
          {c.help_requests && (
            <p className="message-card-skill">{c.help_requests.skill_needed} in {c.help_requests.neighborhood}</p>
          )}
          {c.lastMessage && (
            <p className="message-card-preview">{c.lastMessage.length > 80 ? c.lastMessage.slice(0, 80) + '...' : c.lastMessage}</p>
          )}
        </div>
      ))}
    </div>
  )
}
