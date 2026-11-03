import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

// Hope Ambassadors and VWB admins: listings that were merged with Mark as duplicate (Oct 30).
// Opens on Find resources from My Tools > Merged listings (?merges=1).
// Undo works any time, not just during the 10-second toast. It uses undo_resource_duplicate().
// The list comes from list_resource_merges() (vwb-resource-merge-list.sql).
// onChanged runs after an undo so the page reloads its listings.

export default function ResourceMergesReview({ onChanged, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [asking, setAsking] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  // Nov 1 (Jade): two tabs. Still merged (can undo) and Undone (a record).
  const [tab, setTab] = useState('now')
  const [past, setPast] = useState(null)
  const boxRef = useRef(null)

  async function loadPast() {
    const { data, error: err } = await supabase.rpc('list_past_resource_merges')
    if (err) {
      console.error('Failed to load undone merges:', err)
      setPast({ error: err.code === 'PGRST202' ? 'This needs a quick database update first (vwb-merge-history-and-cottage-links.sql).' : "We couldn't load undone merges. Try again." })
      return
    }
    setPast(data || [])
  }

  async function load() {
    setError('')
    loadPast()
    const { data, error: err } = await supabase.rpc('list_resource_merges')
    if (err) {
      console.error('Failed to load merged listings:', err)
      setError(err.code === 'PGRST202'
        ? 'This needs a quick database update first (vwb-resource-merge-list.sql).'
        : "We couldn't load merged listings. Try again.")
      setRows([])
      return
    }
    setRows(data || [])
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const t = setTimeout(() => boxRef.current && boxRef.current.scrollIntoView({ block: 'start' }), 300)
    return () => clearTimeout(t)
  }, [])

  async function undo(r) {
    setBusy(true); setNote(''); setError('')
    const { error: err } = await supabase.rpc('undo_resource_duplicate', { p_duplicate: r.duplicate_id })
    setBusy(false)
    setAsking(null)
    if (err) {
      console.error('Failed to undo merge:', err)
      setError(err.message && err.message.length < 160 ? err.message : "We couldn't undo that. Try again.")
      return
    }
    setNote('Undone. ' + r.duplicate_name + ' is back as its own listing.')
    await load()
    if (onChanged) onChanged()
  }

  return (
    <section className="sr-review" ref={boxRef} aria-labelledby="rm-review-h">
      <div className="sr-head">
        <h2 id="rm-review-h">Merged listings{rows && rows.length ? ' (' + rows.length + ')' : ''}</h2>
        {onClose && <button type="button" className="sr-close" onClick={onClose} aria-label="Close merged listings">&#10005;</button>}
      </div>
      <p className="sr-note">Listings marked as a copy of another one. Undo a mistake here. Only Hope Ambassadors and VWB admins see this.</p>
      <div className="sr-tabs" role="tablist" aria-label="Which merges">
        <button type="button" role="tab" aria-selected={tab === 'now'} className={'sr-tab' + (tab === 'now' ? ' on' : '')} onClick={() => setTab('now')}>Still merged</button>
        <button type="button" role="tab" aria-selected={tab === 'past'} className={'sr-tab' + (tab === 'past' ? ' on' : '')} onClick={() => setTab('past')}>Undone{Array.isArray(past) && past.length ? ' (' + past.length + ')' : ''}</button>
      </div>
      {tab === 'past' && <>
        {past === null && <p role="status">Loading...</p>}
        {past && past.error && <p className="sr-error" role="alert">{past.error}</p>}
        {Array.isArray(past) && past.length === 0 && <p className="sr-note">No undone merges.</p>}
        {Array.isArray(past) && past.map((r) => (
          <article key={r.merge_id} className="sr-card">
            <h3>{r.duplicate_name}</h3>
            <p>Was merged into <b>{r.kept_name}</b>. It is its own listing again.</p>
            <p className="sr-meta">Merged by {r.merged_by_name}, {new Date(r.merged_at).toLocaleDateString()}</p>
            <p className="sr-meta">Undone by {r.undone_by_name}, {new Date(r.undone_at).toLocaleDateString()}</p>
          </article>
        ))}
      </>}
      {tab === 'now' && <>
      {rows === null && <p role="status">Loading...</p>}
      {error && <p className="sr-error" role="alert">{error}</p>}
      {note && <p className="sr-note" role="status">{note}</p>}
      {rows && rows.length === 0 && !error && <p className="sr-note">Nothing to undo right now.</p>}
      {rows && rows.map((r) => (
        <article key={r.merge_id} className="sr-card">
          <h3>{r.duplicate_name}</h3>
          <p>Merged into <b>{r.kept_name}</b></p>
          <p className="sr-meta">By {r.merged_by_name}, {new Date(r.merged_at).toLocaleDateString()}</p>
          {!r.still_merged
            ? <p className="sr-meta">This listing was changed since, so it can't be undone here.</p>
            : asking === r.merge_id
              ? <div className="sr-confirm">
                  <p>Bring back <b>{r.duplicate_name}</b> as its own listing? Reviews and votes that moved go back to it. Anything filled in on {r.kept_name} goes back too, unless someone changed it since.</p>
                  <div className="sr-actions">
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => undo(r)}>{busy ? 'Undoing...' : 'Yes, undo it'}</button>
                    <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setAsking(null)}>Keep it merged</button>
                  </div>
                </div>
              : <div className="sr-actions">
                  <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setAsking(r.merge_id); setNote('') }}>Undo this merge</button>
                </div>}
        </article>
      ))}
      </>}
    </section>
  )
}
