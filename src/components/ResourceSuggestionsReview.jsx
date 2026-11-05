import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT, getLang } from '../utils/lang'

// Hope Ambassadors and VWB admins: suggestions from "Suggest a resource" (Oct 25).
// Shown on Find resources. ?suggestions=1 in the address scrolls here (admin alerts link to it).
// Oct 28: "Add to the library" opens the Add Resource form filled in from the suggestion
// (onAdd). Once it is saved, the page marks the suggestion added and bumps refreshKey.

const STATUS_WORD = { new: 'New', added: 'Added to the library', done: 'Handled', dismissed: 'Not a fit' }

function safeLink(url) {
  if (!url) return null
  return /^https?:\/\//i.test(url) ? url : 'https://' + url
}

export default function ResourceSuggestionsReview({ onAdd, refreshKey = 0, onClose }) {
  const t = useT()
  const loc = getLang() === 'es' ? 'es' : undefined
  const [show, setShow] = useState('new')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const boxRef = useRef(null)
  const openedHandled = useRef(false)

  async function load(which = show) {
    setError('')
    const { data, error: err } = await supabase.rpc('list_resource_suggestions', { p_status: which === 'new' ? 'new' : null })
    if (err) { console.error('Failed to load resource suggestions:', err); setError(t("We couldn't load suggestions. Try again.")); setRows([]); return }
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
    const timer = setTimeout(() => boxRef.current && boxRef.current.scrollIntoView({ block: 'start' }), 300)
    return () => clearTimeout(timer)
  }, [])

  async function mark(r, status) {
    setBusy(r.id + status)
    const { error: err } = await supabase.rpc('set_resource_suggestion_status', { p_id: r.id, p_status: status })
    setBusy(null)
    if (err) { console.error('Failed to update suggestion:', err); setError(t("We couldn't save that. Try again.")); return }
    await load()
  }

  return (
    <section className="sr-review" ref={boxRef} aria-labelledby="sr-review-h">
      <div className="sr-head">
        <h2 id="sr-review-h">{t('Suggestions from neighbors')}{rows && show === 'new' && rows.length ? ' (' + rows.length + ')' : ''}</h2>
        {onClose && <button type="button" className="sr-close" onClick={onClose} aria-label={t('Close suggestions')}>&#10005;</button>}
      </div>
      <p className="sr-note">{t('Resources people know about, and kinds of help their area is missing. Only Hope Ambassadors and VWB admins see this.')}</p>
      <div className="sr-tabs" role="group" aria-label={t('Which suggestions')}>
        <button type="button" aria-pressed={show === 'new'} onClick={() => setShow('new')}>{t('New')}</button>
        <button type="button" aria-pressed={show === 'handled'} onClick={() => setShow('handled')}>{t('Handled')}</button>
      </div>
      {rows === null && <p role="status">{t('Loading...')}</p>}
      {error && <p className="sr-error" role="alert">{error}</p>}
      {rows && rows.length === 0 && !error && <p className="sr-note">{show === 'new' ? t('No new suggestions.') : t('Nothing handled yet.')}</p>}
      {rows && rows.map((r) => {
        const link = safeLink(r.url)
        return (
          <article key={r.id} className="sr-card">
            <span className={'sr-badge' + (r.kind === 'gap' ? ' sr-badge-gap' : '')}>{r.kind === 'gap' ? t('Missing in this area') : t('Resource to add')}</span>
            <h3>{r.kind === 'gap' ? (r.category || t('A kind of help')) : r.name}</h3>
            {r.kind === 'resource' && r.category && <p className="sr-meta">{r.category}</p>}
            {r.place && <p className="sr-meta">{r.place}</p>}
            {r.details && <p>{r.details}</p>}
            {(r.phone || link) && (
              <p className="sr-links">
                {r.phone && <a href={'tel:' + r.phone.replace(/[^0-9+]/g, '')}>{t('Call {phone}', { phone: r.phone })}</a>}
                {link && <a href={link} target="_blank" rel="noopener noreferrer">{t('Website')}</a>}
              </p>
            )}
            {r.how_known && <p className="sr-meta">{t('How they know:')} {r.how_known}</p>}
            <p className="sr-meta">{t('From {name}', { name: r.suggested_by })}, {new Date(r.created_at).toLocaleDateString(loc)}{r.status !== 'new' ? '. ' + t(STATUS_WORD[r.status]) : ''}</p>
            <div className="sr-actions">
              {r.status === 'new' ? <>
                {r.kind === 'resource' && onAdd && <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => onAdd(r)}>{t('Add to the library')}</button>}
                {r.kind === 'resource' && <button type="button" className="btn btn-outline" disabled={!!busy} onClick={() => mark(r, 'added')}>{t('Already in the library')}</button>}
                <button type="button" className="btn btn-outline" disabled={!!busy} onClick={() => mark(r, 'done')}>{r.kind === 'gap' ? t('Noted') : t('Handled')}</button>
                <button type="button" className="btn btn-outline" disabled={!!busy} onClick={() => mark(r, 'dismissed')}>{t('Not a fit')}</button>
              </> : <>
                {/* Oct 28: a suggestion marked done before it was really added can still be added. */}
                {r.kind === 'resource' && onAdd && <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => onAdd(r)}>{t('Add to the library')}</button>}
                <button type="button" className="btn btn-outline" disabled={!!busy} onClick={() => mark(r, 'new')}>{t('Move back to New')}</button>
              </>}
            </div>
          </article>
        )
      })}
    </section>
  )
}
