import { supabase } from '../../supabaseClient'

export default function MessageOptionsMenu({ message, onClose, currentUserId, conversationId }) {
  if (!message) return null

  const isMe = message.sender_id === currentUserId

  async function deleteForMe() {
    await supabase.from('message_deletions').upsert({ message_id: message.id, user_id: currentUserId }, { onConflict: 'message_id,user_id' })
    onClose()
  }

  async function deleteForEveryone() {
    if (!confirm('Delete this message for everyone? This cannot be undone.')) return
    await supabase.from('chat_messages').update({ deleted_at: new Date().toISOString() }).eq('id', message.id)
    onClose()
  }

  const overlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }
  const menu = { position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)', background: '#2a2a2a', border: '1px solid #444', borderRadius: '12px', minWidth: '200px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: 101 }
  const btn = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#ddd', padding: '0.75rem 1rem', cursor: 'pointer', fontSize: '0.9rem', borderBottom: '1px solid #333' }

  return (
    <>
      <div style={overlay} onClick={onClose} />
      <div style={menu}>
        <button style={btn} onClick={deleteForMe}>Delete for me</button>
        {isMe && <button style={{ ...btn, color: '#ff6666' }} onClick={deleteForEveryone}>Delete for everyone</button>}
        <button style={{ ...btn, borderBottom: 'none', color: '#aaa' }} onClick={onClose}>Cancel</button>
      </div>
    </>
  )
}
