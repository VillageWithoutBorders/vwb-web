import { supabase } from '../../supabaseClient'
import { askConfirm, tell } from '../AdminDialog'

export default function MessageOptionsMenu({ message, onClose, currentUserId, canEdit, onEdit }) {
  if (!message) return null

  const isMe = message.sender_id === currentUserId

  async function deleteForMe() {
    const { error } = await supabase.from('message_deletions').upsert({ message_id: message.id, user_id: currentUserId }, { onConflict: 'message_id,user_id' })
    if (error) {
      console.error('[MessageOptionsMenu] deleteForMe', error)
      tell('Could not delete this message. Please try again.', { tone: 'error' })
      return
    }
    onClose()
  }

  async function deleteForEveryone() {
    if (!(await askConfirm('Delete this message for everyone? This cannot be undone.'))) return
    const { data: done, error } = await supabase.rpc('delete_message_for_everyone', { p_message: message.id })
    if (error || done === false) {
      console.error('[MessageOptionsMenu] deleteForEveryone', error || 'nothing was changed')
      tell('Could not delete this message for everyone. Please try again.', { tone: 'error' })
      return
    }
    onClose()
  }

  const overlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }
  const menu = { position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '12px', minWidth: '200px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: 101 }
  const btn = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text)', padding: '0.75rem 1rem', cursor: 'pointer', fontSize: '0.9rem', borderBottom: '1px solid var(--border)' }

  return (
    <>
      <div style={overlay} onClick={onClose} />
      <div style={menu}>
        {isMe && canEdit && <button style={btn} onClick={onEdit}>Edit message</button>}
        <button style={btn} onClick={deleteForMe}>Delete for me</button>
        {isMe && <button style={{ ...btn, color: 'var(--danger)' }} onClick={deleteForEveryone}>Delete for everyone</button>}
        <button style={{ ...btn, borderBottom: 'none', color: 'var(--text-secondary)' }} onClick={onClose}>Cancel</button>
      </div>
    </>
  )
}
