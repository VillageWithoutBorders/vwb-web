import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// The Updates tab on an emergency event: short updates from coordinators.
// Everyone signed in reads them. Everyone signed up to the event gets an alert.

function when(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function EventUpdates({ eventId, description, closed }) {
  const [rows, setRows] = useState(null)
  const [canPost, setCanPost] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const [u, c] = await Promise.all([
      supabase.rpc('event_updates', { p_event: Number(eventId) }),
      supabase.rpc('can_i_post_event_update', { p_event: Number(eventId) }),
    ])
    if (u.error) { console.error('Failed to load updates:', u.error); setRows([]) } else setRows(u.data || [])
    if (c.error) console.error('Failed to check who can post updates:', c.error)
    setCanPost(!!c.data)
  }
  useEffect(() => { load() }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function post(e) {
    e.preventDefault()
    if (!text.trim()) { setMsg('Write the update first.'); return }
    setBusy(true); setMsg('')
    const { data, error } = await supabase.rpc('post_event_update', { p_event: Number(eventId), p_body: text.trim() })
    setBusy(false)
    if (error) { console.error('Failed to post update:', error); setMsg("We couldn't post that. Try again."); return }
    if (data === 'posted') { setText(''); setMsg('Posted. Everyone signed up was told.'); load(); return }
    setMsg(data === 'closed' ? 'This emergency is closed.' : data === 'notallowed' ? 'Only coordinators, Ambassadors, and admins post updates.' : "We couldn't post that.")
  }

  async function remove(id) {
    if (!confirm('Delete this update?')) return
    const { data, error } = await supabase.rpc('delete_event_update', { p_id: id })
    if (error || data !== 'deleted') { console.error('Failed to delete update:', error || data); setMsg("We couldn't delete that."); return }
    load()
  }

  return (
    <div className="eu">
      {description && <p className="eu-what">{description}</p>}

      {canPost && !closed && (
        <form className="eu-form" onSubmit={post}>
          <label htmlFor="eu-text" className="eu-label">Post an update</label>
          <textarea id="eu-text" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Shelter open at the church on Main St. Bring water if you can." />
          <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{busy ? 'Posting...' : 'Post update'}</button>
        </form>
      )}
      {msg && <p className="eu-note" role="status">{msg}</p>}

      {rows === null ? <p className="eu-note" role="status">Loading...</p>
        : rows.length === 0 ? <p className="eu-note">No updates yet. Coordinators post them here.</p>
        : (
          <ul className="eu-list">
            {rows.map((r) => (
              <li key={r.id} className="eu-item">
                <p className="eu-body">{r.body}</p>
                <p className="eu-meta">{r.author_name} · {when(r.created_at)}
                  {r.mine && <button type="button" className="eu-del" onClick={() => remove(r.id)}>Delete</button>}
                </p>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
