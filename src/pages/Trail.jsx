import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import BackLink from '../components/BackLink'
import Icon from '../components/Icon'

// Your trail (vwb-roads-and-trail.sql): your own story in VWB, in order.
// Only you can see it. It never shows where anyone else lives.

const ROLE_WORD = {
  'village:keeper': 'Keeper', 'village:helper': 'Helper',
  'group:admin': 'Keeper', 'group:organizer': 'Helper',
  'org:admin': 'Head', 'org:organizer': 'Organizer',
}

function stop(r) {
  switch (r.kind) {
    case 'arrived': return { icon: 'sprout', text: r.label }
    case 'village': return { icon: 'houses', text: 'You joined ' + r.label }
    case 'org': return { icon: 'people', text: 'You joined ' + r.label }
    case 'group': return { icon: 'tent', text: 'You joined the emergency crew ' + r.label }
    case 'role': return { icon: 'key', text: 'You became ' + (ROLE_WORD[r.extra] || 'a leader') + ' of ' + r.label }
    case 'met_first': return { icon: 'handshake', text: r.label }
    case 'vouch_first': return { icon: 'star', text: r.label }
    default: return { icon: 'pin', text: r.label }
  }
}

function day(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function Trail() {
  const [rows, setRows] = useState(null)
  const [totals, setTotals] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    supabase.rpc('my_trail').then(({ data, error: err }) => {
      if (!alive) return
      if (err) { console.error('my_trail failed:', err); setError('We could not load your trail. Check your connection and try again.'); setRows([]); return }
      setRows(data || [])
    })
    supabase.rpc('my_trail_totals').then(({ data, error: err }) => {
      if (!alive) return
      if (err) { console.error('my_trail_totals failed:', err); return }
      setTotals((Array.isArray(data) ? data[0] : data) || null)
    })
    return () => { alive = false }
  }, [])

  const facts = totals ? [
    { n: totals.villages, one: 'village', many: 'villages' },
    { n: totals.places, one: 'group or crew', many: 'groups and crews' },
    { n: totals.met, one: 'neighbor met in person', many: 'neighbors met in person' },
    { n: totals.tasks, one: 'task finished together', many: 'tasks finished together' },
    { n: totals.vouches, one: 'vouch for you', many: 'vouches for you' },
  ] : []

  return (
    <div className="cal-page tr-page">
      <BackLink fallback="/me" fallbackLabel="Your corner" />
      <h1 className="tr-title">My trail</h1>
      <p className="cal-sub">The path you have walked in Village Without Borders. Only you can see this.</p>

      {totals && (
        <ul className="tr-facts" aria-label="Your totals">
          {facts.map((f) => (
            <li key={f.one}><b>{f.n}</b> <span>{f.n === 1 ? f.one : f.many}</span></li>
          ))}
        </ul>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {rows === null && <p className="cal-empty">Loading...</p>}

      {rows && rows.length > 0 && (
        <ol className="tr-path">
          {rows.map((r, i) => {
            const s = stop(r)
            const inner = <>
              <span className="tr-dot" aria-hidden="true"><Icon name={s.icon} size={26} /></span>
              <span className="tr-text"><b>{s.text}</b><small>{day(r.at)}</small></span>
            </>
            return (
              <li key={i} className="tr-stop">
                {r.link ? <Link to={r.link} className="tr-link">{inner}</Link> : <div className="tr-link">{inner}</div>}
              </li>
            )
          })}
          <li className="tr-stop tr-next">
            <Link to="/my-code" className="tr-link">
              <span className="tr-dot" aria-hidden="true"><Icon name="compass" size={26} /></span>
              <span className="tr-text"><b>Where to next?</b><small>Meet a neighbor and share your QR code.</small></span>
            </Link>
          </li>
        </ol>
      )}
    </div>
  )
}
