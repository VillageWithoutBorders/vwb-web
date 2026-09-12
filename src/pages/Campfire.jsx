import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import AvatarDisplay from '../components/AvatarDisplay'
import { useMenuPosition } from '../utils/useMenuPosition'

// Consecutive messages from the same person within this window are grouped
// visually (avatar/name shown once) instead of repeating them for every line,
// so a fast back-and-forth doesn't read as a long wall of near-identical rows.
const GROUP_WINDOW_MS = 5 * 60 * 1000

export default function Campfire() {
  const { user, profile, isAdmin } = useAuth()
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
  const [openMsgMenu, setOpenMsgMenu] = useState(null)
  const [showPinned, setShowPinned] = useState(true)
  const [memberSearch, setMemberSearch] = useState('')
  const { menuRef: msgMenuRef, menuStyle: msgMenuStyle, openMenu: positionMsgMenu } = useMenuPosition('right')

  const hasAccess = profile?.is_hope_ambassador || isAdmin

  useEffect(() => {
      supabase.from('helper_profiles').select('avatar_url').eq('user_id', user.id).maybeSingle().then(({ data, error }) => {
        if (error) { console.error('Failed to load your avatar:', error); return }
        if (data) setMyAvatar(data.avatar_url || null)
      })
    if (hasAccess) {
      loadMessages()
      pollRef.current = setInterval(loadMessages, 5000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [hasAccess])

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    bottomRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' })
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
    setOpenMsgMenu(null)
    if (!confirm('Report this message to the admins?')) return
    const info = names[msg.user_id] || { name: 'Unknown' }
    const { error } = await supabase.from('safety_alerts').insert({
      reporter_id: user.id,
      reported_user_id: msg.user_id,
      alert_type: 'flag',
      description: 'Reported Campfire message from ' + info.name + ': "' + (msg.body.length > 100 ? msg.body.slice(0, 100) + '...' : msg.body) + '"'
    })
    if (error) {
      console.error('Failed to submit report:', error)
      alert('Could not submit your report. Try again.')
      return
    }
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
    const { data, error } = await supabase.from('campfire_messages').select('*').order('created_at', { ascending: true }).limit(200)
    if (error) console.error('Failed to load Campfire messages:', error)
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
    if (!newMsg.trim() || sending) return
    setSending(true)
    const { error } = await supabase.from('campfire_messages').insert({ user_id: user.id, body: newMsg.trim() })
    if (error) {
      console.error('Failed to send Campfire message:', error)
      alert('Could not send your message. Try again.')
      setSending(false)
      return
    }
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
        <h2 style={{ color: '#ffaa44', marginBottom: '0.5rem' }}>Come sit by the fire</h2>
        <p style={{ color: '#aaa', marginBottom: '1.5rem' }}>The Campfire is where Hope Ambassadors and admins swap ideas and look out for each other. You're welcome here too. Become a Hope Ambassador, share whatever skills or time you have to give, and you'll have a seat.</p>
        <button onClick={() => navigate('/profile')} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer' }}>Become a Hope Ambassador</button>
      </div>
    )
  }

  const pinnedMessages = messages.filter(m => m.pinned)

  return (
    <div onClick={() => { if (openMsgMenu) setOpenMsgMenu(null) }} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 70px)', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, padding: '0.75rem 1rem', borderBottom: '1px solid #333', background: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button onClick={() => navigate('/')} aria-label="Back to Dashboard" style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer' }}>&#8592;</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>&#128293;</span> The Campfire
          </h1>
          <p style={{ margin: 0, color: '#888', fontSize: '0.75rem' }}>Ambassadors and admins</p>
        </div>
        <button onClick={() => setShowSettings(true)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.3rem', padding: '0.25rem', marginLeft: 'auto' }} title='Settings'>&#9881;</button>
      </div>

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

      <div className="hide-scrollbar" role="log" aria-live="polite" aria-relevant="additions" aria-label="Campfire messages" style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
        {loading && <p style={{ textAlign: 'center', color: '#888' }}>Loading...</p>}

        {!loading && messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
            <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>&#128293;</p>
            <p>The fire is lit. Be the first to speak.</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMe = msg.user_id === user.id
          const info = names[msg.user_id] || { name: 'Neighbor' }
          const prevMsg = messages[idx - 1]
          const isGroupStart = !prevMsg || prevMsg.user_id !== msg.user_id || (new Date(msg.created_at) - new Date(prevMsg.created_at)) > GROUP_WINDOW_MS
          const fullTime = new Date(msg.created_at).toLocaleString()
          return (
            <div key={msg.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%', display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: isGroupStart ? '0.75rem' : '0.15rem' }}>
              {!isMe && (isGroupStart
                ? <AvatarDisplay url={info.avatar} userId={msg.user_id} size={28} />
                : <div style={{ width: '28px', flexShrink: 0 }} />)}
              <div>
              {!isMe && isGroupStart && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.15rem' }}>
                  <span onClick={() => navigate('/u/' + msg.user_id)} style={{ fontSize: '0.75rem', fontWeight: 700, color: info.role === 'founder' ? '#c77dff' : info.role === 'admin' ? '#66aaff' : '#4ecca3', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#444', textUnderlineOffset: '2px' }}>{info.name}</span>
                  {info.role === 'founder' && <span style={{ fontSize: '0.6rem', background: '#3a1a4a', color: '#c77dff', padding: '0 4px', borderRadius: '3px' }}>Founder</span>}
                  {info.role === 'admin' && <span style={{ fontSize: '0.6rem', background: '#1a3a5a', color: '#66aaff', padding: '0 4px', borderRadius: '3px' }}>Admin</span>}
                  {info.ambassador && <span style={{ fontSize: '0.6rem', background: '#1a4a3a', color: '#4ecca3', padding: '0 4px', borderRadius: '3px' }}>Ambassador</span>}
                </div>
              )}
              <div style={{ position: 'relative', padding: '0.5rem 0.75rem', borderRadius: isMe ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem', background: isMe ? '#4ecca3' : '#2a2a2a', color: isMe ? '#1a1a1a' : '#eee', border: isMe ? 'none' : '1px solid #444' }}>
                <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.4 }}>{msg.body}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
                  {msg.pinned && <span title="Pinned">&#128204;</span>}
                  <span style={{ fontSize: '0.65rem', opacity: 0.6 }} title={fullTime} aria-label={fullTime}>{formatTime(msg.created_at)}</span>
                  {(isAdmin || !isMe) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const closing = openMsgMenu === msg.id
                        setOpenMsgMenu(closing ? null : msg.id)
                        if (!closing) positionMsgMenu(e, isMe ? 'right' : 'left')
                      }}
                      aria-label="Message options"
                      style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.6, cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginLeft: 'auto', lineHeight: 1 }}
                    >&#8943;</button>
                  )}
                </div>
                {openMsgMenu === msg.id && (isAdmin || !isMe) && (
                  <div
                    ref={msgMenuRef}
                    onClick={e => e.stopPropagation()}
                    style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', minWidth: '140px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', ...msgMenuStyle }}
                  >
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
        <div ref={bottomRef} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem', borderTop: '1px solid #333', background: '#1a1a1a' }}>
        <input
          type="text"
          value={newMsg}
          onChange={e => setNewMsg(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(e) }}
          placeholder="Say something to the group..."
          aria-label="Message the Campfire"
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
            .filter(([, info]) => (info.name || 'Neighbor').toLowerCase().includes(memberSearch.trim().toLowerCase()))
            .sort(([, a], [, b]) => (a.name || '').localeCompare(b.name || ''))
            .map(([uid, info]) => (
            <div key={uid} onClick={() => { setShowSettings(false); navigate('/u/' + uid) }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderRadius: '8px', background: '#222', cursor: 'pointer' }}>
              <AvatarDisplay url={info.avatar} userId={uid} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                  <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>{info.name}</span>
                  {info.role === 'founder' && <span style={{ fontSize: '0.6rem', background: '#3a1a4a', color: '#c77dff', padding: '0 4px', borderRadius: '3px' }}>Founder</span>}
                  {info.role === 'admin' && <span style={{ fontSize: '0.6rem', background: '#1a3a5a', color: '#66aaff', padding: '0 4px', borderRadius: '3px' }}>Admin</span>}
                  {info.ambassador && <span style={{ fontSize: '0.6rem', background: '#1a4a3a', color: '#4ecca3', padding: '0 4px', borderRadius: '3px' }}>Ambassador</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.7rem', color: '#888' }}>
                  {info.joined && <span>Joined {new Date(info.joined).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>}
                  <span style={{ color: info.score > 0 ? '#4ecca3' : info.score < 0 ? '#ff6666' : '#888' }}>{info.score > 0 ? '+' : ''}{info.score} rep</span>
                </div>
              </div>
            </div>
          ))}
          {memberSearch.trim() && Object.entries(names).filter(([, info]) => (info.name || 'Neighbor').toLowerCase().includes(memberSearch.trim().toLowerCase())).length === 0 && (
            <p style={{ color: '#666', fontSize: '0.8rem', textAlign: 'center', padding: '0.75rem 0' }}>No members match "{memberSearch.trim()}".</p>
          )}
        </div>
      </div>
    </div>
  )
}