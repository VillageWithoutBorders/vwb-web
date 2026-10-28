import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

// Hope Ambassadors and VWB admins: suggestions from "Suggest a resource" (Oct 25).
// Shown on Find resources. ?suggestions=1 in the address scrolls here (admin alerts link to it).
// Oct 28: "Add to the library" opens the Add Resource form filled in from the suggestion
// (onAdd). Once it is saved, the page marks the suggestion added and bumps refreshKey.

const STATUS_WORD = { new: 'New', added: 'Added to the library', done: 'Handled', dismissed: 'Not a fit' }

function safeLink(url) {
  if (!url) return null
  return /^https?:\/\//i.test(url) ? url : 'https://' + url
}

export default function ResourceSuggestionsReview({ onAdd, refreshKey = 0 }) {
  const [show, setShow] = useState('new')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const boxRef = useRef(null)
  const openedHandled = useRef(false)

  async function load(which = show) {
    setError('')
    const { data, error: err } = await supabase.rpc('list_resource_suggestions', { p_status: which === 'new' ? 'new' : null })
    if (err) { console.error('Failed to load resource suggestions:', err); setError("We couldn't load suggestions. Try again."); setRows([]); return }
    const list = which === 'new' ? (data || []) : (data || []).filter((r) => r.status !== 'new')
    // Opened from an admin alert but nothing is new: it was already handled, so show Handled.
    if (which === 'new' && !list.length && !openedHandled.current && new URLSearchParams(window.location.search).get('suggestions') === '1') {
      openedHandled.current = true
      setShow('handled')
      return
    }
    setRows(list)
  }

  useEffect(() => { load(show) }, [show, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('suggestions') !== '1') return
    const t = setTimeout(() => boxRef.current && boxRef.current.scrollIntoView({ block: 'start' }), 300)
    return () => clearTimeout(t)
  }, [])

  async function mark(r, status) {
    setBusy(r.id + status)
    const { error: err } = await supabase.rpc('set_resource_suggestion_status', { p_id: r.id, p_status: status })
    setBusy(null)
    if (err) { console.error('Failed to update suggestion:', err); setError("We couldn't save that. Try again."); return }
    await load()
  }

  return (
    <section className="sr-review" ref={boxRef} aria-labelledby="sr-review-h">
      <h2 id="sr-review-h">Suggestions from neighbors{rows && show === 'new' && rows.length ? ' (' + rows.length + ')' : ''}</h2>
      <p className="sr-note">Resources people know about, and kinds of help their area is missing. Only Hope Ambassadors and VWB admins see this.</p>
      <div className="sr-tabs" role="group" aria-label="Which suggestions">
        <button type="button" aria-pressed={show === 'new'} onClick={() => setShow('new')}>New</button>
        <button type="button" aria-pressed={show === 'handled'} onClick={() => setShow('handled')}>Handled</button>
      </div>
      {rows === null && <p role="status">Loading...</p>}
      {error && <p className="sr-error" role="alert">{error}</p>}
      {rows && rows.length === 0 && !error && <p className="sr-note">{show === 'new' ? 'No new suggestions.' : 'Nothing handled yet.'}</p>}
      {rows && rows.map((r) => {
        const link = safeLink(r.url)
        return (
          <article key={r.id} className="sr-card">
            <span className={'sr-badge' + (r.kind === 'gap' ? ' sr-badge-gap' : '')}>{r.kind === 'gap' ? 'Missing in this area' : 'Resource to add'}</span>
            <h3>{r.kind === 'gap' ? (r.category || 'A kind of help') : r.name}</h3>
            {r.kind === 'resource' && r.category && <p className="sr-meta">{r.category}</p>}
            {r.place && <p className="sr-meta">{r.place}</p>}
            {r.details && <p>{r.details}</p>}
            {(r.phone || link) && (
              <p className="sr-links">
                {r.phone && <a href={'tel:' + r.phone.replace(/[^0-9+]/g, '')}>Call {r.phone}</a>}
                {link && <a href={link} target="_blank" rel="noopener noreferrer">Website</a>}
              </p>
            )}
            {r.how_known && <p className="sr-meta">How they know: {r.how_known}</p>}
            <p className="sr-meta">From {r.suggested_by}, {new Date(r.created_at).toLocaleDateString()}{r.status !== 'new' ? '. ' + STATUS_WORD[r.status] : ''}</p>
            <div className="sr-actions">
              {r.status === 'new' ? <>
                {r.kind === 'resource' && onAdd && <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => onAdd(r)}>Add to the library</button>}
                {r.kind === 'resource' && <button type="button" className="btn btn-outline" disabled={!!busy} onClick={() => mark(r, 'added')}>Already in the library</button>}
                <button type="button" className="btn btn-outline" disabled={!!busy} onClick={() => mark(r, 'done')}>{r.kind === 'gap' ? 'Noted' : 'Handled'}</button>
                <button type="button" className="btn btn-outline" disabled={!!busy} onClick={() => mark(r, 'dismissed')}>Not a fit</button>
              </> : <>
                {/* Oct 28: a suggestion marked done before it was really added can still be added. */}
                {r.kind === 'resource' && onAdd && <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => onAdd(r)}>Add to the library</button>}
                <button type="button" className="btn btn-outline" disabled={!!busy} onClick={() => mark(r, 'new')}>Move back to New</button>
              </>}
            </div>
          </article>
        )
      })}
    </section>
  )
}
