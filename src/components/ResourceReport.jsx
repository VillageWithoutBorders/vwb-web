import { useEffect, useRef, useState } from 'react'
import { REPORT_KINDS, reportResource, requestAreaChange, resourceAreas, friendlyError } from '../utils/resourceReports'
import { searchPlaces } from '../utils/places'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const choiceBtn = (on) => ({
  display: 'block', width: '100%', minHeight: 56, textAlign: 'left', padding: '0.65rem 0.9rem',
  borderRadius: 12, border: on ? '2px solid var(--accent)' : '1px solid var(--border-strong)',
  background: on ? 'var(--green-light)' : 'var(--surface-2)', color: 'var(--text)', font: 'inherit', cursor: 'pointer',
})

// "Something wrong?" for one resource.
// canChangeAreas: the person runs the org that shares this resource, so they
// also get "Change where we serve".
export default function ResourceReport({ resource, canChangeAreas, onClose, onSent }) {
  const [kind, setKind] = useState(null)
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState('')
  const [done, setDone] = useState('')
  const boxRef = useRef(null)

  // Area change
  const [areas, setAreas] = useState(null)
  const [drop, setDrop] = useState([])
  const [add, setAdd] = useState([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    boxRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !boxRef.current) return
      const f = boxRef.current.querySelectorAll(FOCUSABLE)
      if (!f.length) return
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (kind !== 'area_change' || areas) return
    resourceAreas(resource.id).then(({ data, error }) => {
      if (error) setNote("We couldn't load where this serves. You can still add areas.")
      setAreas(data)
    })
  }, [kind, areas, resource.id])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    let gone = false
    const t = setTimeout(async () => {
      const { data, error } = await searchPlaces(q)
      if (gone) return
      if (error) { setNote("Search isn't working right now. Try again in a moment."); return }
      setResults(data)
    }, 250)
    return () => { gone = true; clearTimeout(t) }
  }, [query])

  const needsDetails = kind === 'something_else'
  const canSend = kind && !sending && (!needsDetails || details.trim()) && (kind !== 'area_change' || add.length + drop.length > 0)

  async function send() {
    if (!canSend) return
    setSending(true); setNote('')
    if (kind === 'area_change') {
      const { error } = await requestAreaChange(resource.id, add.map((a) => a.id), drop, details.trim())
      setSending(false)
      if (error) { setNote(friendlyError(error, "We couldn't send that. Try again.")); return }
      setDone('Thank you. A Hope Ambassador will check this. Until then, the listing keeps its current areas.')
      if (onSent) onSent(false)
      return
    }
    const { message, error } = await reportResource(resource.id, kind, details.trim())
    setSending(false)
    if (error) { setNote(friendlyError(error, "We couldn't send your report. Try again.")); return }
    setDone(message || 'Thank you. A Hope Ambassador will look at this.')
    if (onSent) onSent(kind === 'safety')
  }

  const kinds = canChangeAreas
    ? [...REPORT_KINDS, { key: 'area_change', label: 'Change where we serve', hint: 'Add or remove counties. A Hope Ambassador checks it first.' }]
    : REPORT_KINDS

  return (
    <div className="fh-shade" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={boxRef} tabIndex={-1} className="fh-sheet" role="dialog" aria-modal="true" aria-labelledby="rr-h">
        <h2 id="rr-h">Something wrong?</h2>
        <p style={{ margin: '0 0 0.75rem', color: 'var(--text-secondary)', fontSize: '1rem', overflowWrap: 'anywhere' }}>{resource.name}</p>

        {done ? (
          <>
            <p role="status" style={{ fontSize: '1rem', lineHeight: 1.5, color: 'var(--text)', margin: '0 0 1rem' }}>{done}</p>
            <button type="button" className="btn btn-primary btn-full" style={{ minHeight: 48 }} onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <div role="group" aria-label="What is wrong?" style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {kinds.map((k) => (
                <button key={k.key} type="button" aria-pressed={kind === k.key} onClick={() => { setKind(k.key); setNote('') }} style={choiceBtn(kind === k.key)}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: '1rem' }}>{k.label}</span>
                  <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.15rem' }}>{k.hint}</span>
                </button>
              ))}
            </div>

            {kind === 'safety' && (
              <p role="note" style={{ margin: '0 0 0.75rem', padding: '0.6rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '0.95rem', lineHeight: 1.45 }}>
                If someone is in danger right now, call 911 first.
              </p>
            )}

            {kind === 'area_change' && (
              <div style={{ marginBottom: '0.75rem' }}>
                <p style={{ margin: '0 0 0.4rem', fontWeight: 600 }}>Where it serves now</p>
                {areas === null && <p style={{ margin: 0, color: 'var(--text-muted)' }}>Loading...</p>}
                {areas && areas.length === 0 && <p style={{ margin: 0, color: 'var(--text-muted)' }}>No areas checked yet.</p>}
                {areas && areas.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
                    {areas.map((a) => (
                      <li key={a.id}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minHeight: 44, cursor: 'pointer' }}>
                          <input type="checkbox" checked={drop.includes(a.id)} style={{ width: 22, height: 22 }}
                            onChange={(e) => setDrop((d) => e.target.checked ? [...d, a.id] : d.filter((x) => x !== a.id))} />
                          <span>Stop serving {a.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <label htmlFor="rr-add" style={{ display: 'block', fontWeight: 600, margin: '0.75rem 0 0.3rem' }}>Add a county</label>
                <input id="rr-add" type="search" inputMode="search" autoComplete="off" value={query} placeholder="For example: Walker"
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, fontSize: '16px', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)' }} />
                {query.trim().length >= 2 && results.length > 0 && (
                  <ul aria-label="Matching counties" style={{ listStyle: 'none', margin: '0.4rem 0 0', padding: 0, display: 'grid', gap: '0.4rem' }}>
                    {results.filter((p) => !add.some((a) => a.id === p.id)).map((p) => (
                      <li key={p.id}>
                        <button type="button" style={choiceBtn(false)} onClick={() => { setAdd((x) => [...x, { id: p.id, label: p.label }]); setQuery(''); setResults([]) }}>{p.label}</button>
                      </li>
                    ))}
                  </ul>
                )}
                {add.length > 0 && (
                  <ul aria-label="Counties to add" style={{ listStyle: 'none', margin: '0.6rem 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {add.map((a) => (
                      <li key={a.id} style={{ display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 0.25rem 0 0.8rem', borderRadius: 22, border: '2px solid var(--accent)', background: 'var(--green-light)' }}>
                        <span>Add {a.label}</span>
                        <button type="button" aria-label={'Do not add ' + a.label} onClick={() => setAdd((x) => x.filter((y) => y.id !== a.id))}
                          style={{ minWidth: 44, minHeight: 44, border: 'none', background: 'none', color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer' }}><span aria-hidden="true">&#10005;</span></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {kind && (
              <>
                <label htmlFor="rr-details" style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem' }}>
                  {needsDetails ? 'What is wrong? (needed)' : 'Tell us more (if you want)'}
                </label>
                <textarea id="rr-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3}
                  style={{ display: 'block', width: '100%', boxSizing: 'border-box', fontSize: '16px', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)', resize: 'vertical', marginBottom: '0.75rem' }} />
              </>
            )}

            <p role="status" style={{ margin: '0 0 0.5rem', minHeight: '1.2em', color: 'var(--danger)', fontSize: '0.95rem' }}>{note}</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-outline" style={{ minHeight: 48, flex: 1 }} onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" style={{ minHeight: 48, flex: 2 }} disabled={!canSend} onClick={send}>
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
