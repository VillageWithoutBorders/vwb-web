import { useEffect, useRef, useState } from 'react'
import { searchPlaces, getMyPlaces, saveMyPlaces, getVisitorArea, setVisitorArea } from '../utils/places'

const MAX_AREAS = 5

const rowBtn = {
  display: 'block', width: '100%', minHeight: 44, textAlign: 'left', padding: '0.55rem 0.8rem',
  borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)',
  font: 'inherit', fontSize: '1rem', cursor: 'pointer',
}

// "Your area": the county (or counties) a person lives in.
//   mode="member"  saved to their account, up to 5, only they can see it
//   mode="visitor" one area, kept on this device only, never saved by VWB
export default function AreaPicker({ mode = 'member', onChange, heading = 'Your area' }) {
  const visitor = mode === 'visitor'
  const [areas, setAreas] = useState(() => {
    if (mode !== 'visitor') return []
    const v = getVisitorArea()
    return v ? [v] : []
  })
  const [loaded, setLoaded] = useState(visitor)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [nearby, setNearby] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const searchSeq = useRef(0)

  useEffect(() => {
    if (visitor) return
    let gone = false
    getMyPlaces().then(({ data, error }) => {
      if (gone) return
      if (error) setNote("We couldn't load your area. Try again in a moment.")
      setAreas(data.map((p) => ({ id: p.id, label: p.label })))
      setLoaded(true)
    })
    return () => { gone = true }
  }, [visitor])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const seq = ++searchSeq.current
    const t = setTimeout(async () => {
      const { data, error } = await searchPlaces(q)
      if (seq !== searchSeq.current) return
      if (error) { setNote("Search isn't working right now. Try again in a moment."); return }
      setResults(data)
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  async function commit(next) {
    if (visitor) {
      const one = next.length ? next[next.length - 1] : null
      setVisitorArea(one)
      setAreas(one ? [one] : [])
      setNote(one ? 'Showing help for ' + one.label + '.' : '')
      if (onChange) onChange(one)
      return true
    }
    setBusy(true); setNote('')
    const { error } = await saveMyPlaces(next.map((a) => a.id))
    setBusy(false)
    if (error) {
      setNote(error.message && error.code === 'P0001' ? error.message : "We couldn't save that. Try again.")
      return false
    }
    setAreas(next)
    setNote('Saved.')
    if (onChange) onChange(next)
    return true
  }

  async function add(place) {
    if (areas.some((a) => a.id === place.id)) { setNote(place.label + ' is already on your list.'); return }
    if (!visitor && areas.length >= MAX_AREAS) { setNote('You can choose up to 5 areas. Remove one first.'); return }
    const ok = await commit([...areas, { id: place.id, label: place.label }])
    if (ok) { setQuery(''); setResults([]); setNearby(null) }
  }

  async function remove(id) {
    await commit(areas.filter((a) => a.id !== id))
  }

  const list = (items, labelId) => (
    <ul aria-labelledby={labelId} style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0, display: 'grid', gap: '0.5rem' }}>
      {items.map((p) => (
        <li key={p.id}>
          <button type="button" style={rowBtn} disabled={busy} onClick={() => add(p)}>{p.label}</button>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="profile-details" style={{ marginBottom: '1rem' }}>
      <div className="detail-section-header" id="area-h">{heading}</div>
      <div style={{ padding: '0.5rem 1rem 0.75rem' }}>
        <p style={{ margin: '0 0 0.75rem', color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.45 }}>
          {visitor
            ? 'Choose your county, or your town if it is listed, to see help that serves you. This stays on your phone. We never save it.'
            : 'Choose the county you live in, or your town if it is listed. Some programs only serve certain towns. Find Help uses it to show programs that serve you. Only you can see this.'}
        </p>

        {loaded && areas.length > 0 && (
          <ul aria-label={visitor ? 'Your area' : 'Your areas'} style={{ listStyle: 'none', margin: '0 0 0.75rem', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {areas.map((a) => (
              <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', minHeight: 44, padding: '0 0.25rem 0 0.8rem',
                borderRadius: 22, background: 'var(--green-light)', border: '2px solid var(--accent)', color: 'var(--text)', fontSize: '1rem', maxWidth: '100%' }}>
                <span style={{ overflowWrap: 'anywhere' }}>{a.label}</span>
                <button type="button" onClick={() => remove(a.id)} disabled={busy} aria-label={'Remove ' + a.label}
                  style={{ minWidth: 44, minHeight: 44, border: 'none', background: 'none', color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer' }}>
                  <span aria-hidden="true">&#10005;</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {loaded && (visitor || areas.length < MAX_AREAS) && (
          <>
            <label htmlFor="area-search" style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem' }}>
              {areas.length ? (visitor ? 'Change your county or town' : 'Add another county or town') : 'Type your county or town'}
            </label>
            <input id="area-search" type="search" inputMode="search" enterKeyHint="search" autoComplete="off" spellCheck={false}
              value={query} onChange={(e) => { setQuery(e.target.value); setNote('') }} placeholder="For example: Catoosa"
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, fontSize: '16px', padding: '0.55rem 0.75rem',
                borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)' }} />
            {query.trim().length >= 2 && results.length > 0 && (<><span id="area-results" className="sr-only">Matching places</span>{list(results, 'area-results')}</>)}
            {query.trim().length >= 2 && results.length === 0 && (
              <p style={{ margin: '0.5rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No matches yet. Keep typing, or check the spelling.</p>
            )}

            {nearby && (
              <>
                <p id="area-nearby" style={{ margin: '0.75rem 0 0', fontWeight: 600 }}>Is it one of these?</p>
                {list(nearby, 'area-nearby')}
              </>
            )}
          </>
        )}

        <p role="status" style={{ margin: '0.6rem 0 0', minHeight: '1.2em', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{note}</p>
      </div>
    </div>
  )
}
