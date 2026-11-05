import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT, getLang } from '../utils/lang'

// Puts a name in bold inside a translated sentence: 'Merged into {name}'.
function withBold(s, name) {
  const [a, b = ''] = s.split('{name}')
  return <>{a}<b>{name}</b>{b}</>
}

// Hope Ambassadors and VWB admins: listings that were merged with Mark as duplicate (Oct 30).
// Opens on Find resources from My Tools > Merged listings (?merges=1).
// Undo works any time, not just during the 10-second toast. It uses undo_resource_duplicate().
// The list comes from list_resource_merges() (vwb-resource-merge-list.sql).
// onChanged runs after an undo so the page reloads its listings.

export default function ResourceMergesReview({ onChanged, onClose }) {
  const t = useT()
  const loc = getLang() === 'es' ? 'es' : undefined
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
      setPast({ error: err.code === 'PGRST202' ? t('This needs a quick database update first (vwb-merge-history-and-cottage-links.sql).') : t("We couldn't load undone merges. Try again.") })
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
        ? t('This needs a quick database update first (vwb-resource-merge-list.sql).')
        : t("We couldn't load merged listings. Try again."))
      setRows([])
      return
    }
    setRows(data || [])
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const timer = setTimeout(() => boxRef.current && boxRef.current.scrollIntoView({ block: 'start' }), 300)
    return () => clearTimeout(timer)
  }, [])

  async function undo(r) {
    setBusy(true); setNote(''); setError('')
    const { error: err } = await supabase.rpc('undo_resource_duplicate', { p_duplicate: r.duplicate_id })
    setBusy(false)
    setAsking(null)
    if (err) {
      console.error('Failed to undo merge:', err)
      setError(err.message && err.message.length < 160 ? err.message : t("We couldn't undo that. Try again."))
      return
    }
    setNote(t('Undone. {name} is back as its own listing.', { name: r.duplicate_name }))
    await load()
    if (onChanged) onChanged()
  }

  return (
    <section className="sr-review" ref={boxRef} aria-labelledby="rm-review-h">
      <div className="sr-head">
        <h2 id="rm-review-h">{t('Merged listings')}{rows && rows.length ? ' (' + rows.length + ')' : ''}</h2>
        {onClose && <button type="button" className="sr-close" onClick={onClose} aria-label={t('Close merged listings')}>&#10005;</button>}
      </div>
      <p className="sr-note">{t('Listings marked as a copy of another one. Undo a mistake here. Only Hope Ambassadors and VWB admins see this.')}</p>
      <div className="sr-tabs" role="tablist" aria-label={t('Which merges')}>
        <button type="button" role="tab" aria-selected={tab === 'now'} className={'sr-tab' + (tab === 'now' ? ' on' : '')} onClick={() => setTab('now')}>{t('Still merged')}</button>
        <button type="button" role="tab" aria-selected={tab === 'past'} className={'sr-tab' + (tab === 'past' ? ' on' : '')} onClick={() => setTab('past')}>{t('Undone')}{Array.isArray(past) && past.length ? ' (' + past.length + ')' : ''}</button>
      </div>
      {tab === 'past' && <>
        {past === null && <p role="status">{t('Loading...')}</p>}
        {past && past.error && <p className="sr-error" role="alert">{past.error}</p>}
        {Array.isArray(past) && past.length === 0 && <p className="sr-note">{t('No undone merges.')}</p>}
        {Array.isArray(past) && past.map((r) => (
          <article key={r.merge_id} className="sr-card">
            <h3>{r.duplicate_name}</h3>
            <p>{withBold(t('Was merged into {name}. It is its own listing again.'), r.kept_name)}</p>
            <p className="sr-meta">{t('Merged by {name}', { name: r.merged_by_name })}, {new Date(r.merged_at).toLocaleDateString(loc)}</p>
            <p className="sr-meta">{t('Undone by {name}', { name: r.undone_by_name })}, {new Date(r.undone_at).toLocaleDateString(loc)}</p>
          </article>
        ))}
      </>}
      {tab === 'now' && <>
      {rows === null && <p role="status">{t('Loading...')}</p>}
      {error && <p className="sr-error" role="alert">{error}</p>}
      {note && <p className="sr-note" role="status">{note}</p>}
      {rows && rows.length === 0 && !error && <p className="sr-note">{t('Nothing to undo right now.')}</p>}
      {rows && rows.map((r) => (
        <article key={r.merge_id} className="sr-card">
          <h3>{r.duplicate_name}</h3>
          <p>{withBold(t('Merged into {name}'), r.kept_name)}</p>
          <p className="sr-meta">{t('By {name}', { name: r.merged_by_name })}, {new Date(r.merged_at).toLocaleDateString(loc)}</p>
          {!r.still_merged
            ? <p className="sr-meta">{t("This listing was changed since, so it can't be undone here.")}</p>
            : asking === r.merge_id
              ? <div className="sr-confirm">
                  <p>{withBold(t('Bring back {name} as its own listing?'), r.duplicate_name)} {t('Reviews and votes that moved go back to it. Anything filled in on {kept} goes back too, unless someone changed it since.', { kept: r.kept_name })}</p>
                  <div className="sr-actions">
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => undo(r)}>{busy ? t('Undoing...') : t('Yes, undo it')}</button>
                    <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setAsking(null)}>{t('Keep it merged')}</button>
                  </div>
                </div>
              : <div className="sr-actions">
                  <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setAsking(r.merge_id); setNote('') }}>{t('Undo this merge')}</button>
                </div>}
        </article>
      ))}
      </>}
    </section>
  )
}
