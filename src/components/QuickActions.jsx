import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { useSimpleView } from '../utils/simpleView'
import Icon from './Icon'

// Quick Actions: four big buttons at the top of Home.
// Each person picks their own four. Saved on the account
// (helper_profiles.quick_actions) so it follows them to any phone.
// Empty means "use the defaults for my kind of account".
// The same four keys are used for the long-press app shortcuts in vite.config.js.

const QUICK_ACTIONS = [
  { key: 'find_help', label: 'Find help', icon: 'heart-hands', to: '/community/resources', desc: 'Food, housing, safety, and more near you' },
  { key: 'ask', label: 'Ask for help', icon: 'raise-hand', to: '/ask', desc: 'Ask your neighbors for a hand' },
  { key: 'my_code', label: 'Show my QR', icon: 'share', to: '/my-code', desc: 'Connect with someone in person' },
  { key: 'village', label: 'My village', icon: 'houses', to: '/village', desc: 'Your village and its chat' },
  { key: 'can_help', label: 'I can help', icon: 'heart', to: '/skillshare', desc: 'See what neighbors near you need' },
  { key: 'calendar', label: 'Today', icon: 'calendar', to: '/calendar', desc: 'Events coming up' },
  { key: 'messages', label: 'Messages', icon: 'envelope', to: '/messages', desc: 'Your conversations' },
]

const NEW_DEFAULT = ['find_help', 'ask', 'my_code', 'village']
const SETTLED_DEFAULT = ['find_help', 'ask', 'can_help', 'village']
const MAX = 4

function byKey(k) { return QUICK_ACTIONS.find((a) => a.key === k) }

export default function QuickActions() {
  const { profile, established, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const simple = useSimpleView()
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const saved = Array.isArray(profile?.quick_actions) && profile.quick_actions.length ? profile.quick_actions : null
  const keys = (saved || (established === false ? NEW_DEFAULT : SETTLED_DEFAULT)).filter(byKey)
  const actions = keys.map(byKey)

  // One gentle note once someone is settled in, if their own picks leave out "I can help".
  const showNudge = established === true && saved && !saved.includes('can_help') && !profile?.quick_actions_nudged && !editing

  async function save(next) {
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('set_quick_actions', { p_keys: next })
    if (err) { console.error('[QuickActions] save', err); setError('Could not save your buttons. Try again.'); setSaving(false); return false }
    await refreshProfile()
    setSaving(false)
    return true
  }

  async function answerNudge(yes) {
    setError('')
    if (yes) {
      const next = [...saved]
      const i = next.indexOf('my_code')
      if (next.length < MAX) next.push('can_help')
      else next[i >= 0 ? i : next.length - 1] = 'can_help'
      if (!(await save(next))) return
    }
    const { error: err } = await supabase.rpc('mark_quick_actions_nudged')
    if (err) { console.error('[QuickActions] nudge', err); setError('Could not save that. Try again.'); return }
    await refreshProfile()
  }

  function startEdit() { setPicked(keys); setError(''); setEditing(true) }

  function toggle(k) {
    setError('')
    setPicked((p) => {
      if (p.includes(k)) return p.filter((x) => x !== k)
      if (p.length >= MAX) { setError('You can pick up to 4. Take one off first.'); return p }
      return [...p, k]
    })
  }

  async function saveEdit() {
    if (!picked.length) { setError('Pick at least one.'); return }
    if (await save(picked)) setEditing(false)
  }

  async function useDefaults() {
    if (await save(null)) setEditing(false)
  }

  if (editing) {
    return (
      <section className="qa-edit" aria-labelledby="qa-edit-h">
        <h2 id="qa-edit-h" className="qa-edit-title">Pick your buttons</h2>
        <p className="qa-edit-sub">Choose up to 4. They show at the top of Home.</p>
        <div className="qa-edit-list">
          {QUICK_ACTIONS.map((a) => {
            const on = picked.includes(a.key)
            return (
              <label key={a.key} className={'qa-edit-row' + (on ? ' on' : '')}>
                <input type="checkbox" checked={on} onChange={() => toggle(a.key)} />
                <span className="qa-edit-icon" aria-hidden="true"><Icon name={a.icon} size={28} /></span>
                <span className="qa-edit-text">
                  <span className="qa-edit-label">{a.label}</span>
                  <span className="qa-edit-desc">{a.desc}</span>
                </span>
              </label>
            )
          })}
        </div>
        <p className="qa-edit-count" aria-live="polite">{picked.length} of 4 picked</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="qa-edit-buttons">
          <button type="button" className="btn btn-primary" disabled={saving} onClick={saveEdit}>{saving ? 'Saving...' : 'Save'}</button>
          <button type="button" className="btn btn-outline" disabled={saving} onClick={() => { setEditing(false); setError('') }}>Cancel</button>
        </div>
        <button type="button" className="qa-link" disabled={saving} onClick={useDefaults}>Go back to the usual buttons</button>
      </section>
    )
  }

  return (
    <section className={'qa' + (simple ? ' qa-simple' : '')} aria-label="Quick actions">
      <div className="qa-grid">
        {actions.map((a, i) => (
          <button
            key={a.key}
            type="button"
            className={'qa-btn' + (i === 0 ? ' qa-btn-main' : '')}
            onClick={() => navigate(a.to)}
          >
            <span className="qa-btn-icon" aria-hidden="true"><Icon name={a.icon} size={simple ? 40 : 32} /></span>
            <span className="qa-btn-label">{a.label}</span>
          </button>
        ))}
      </div>
      {showNudge && (
        <div className="qa-nudge" role="region" aria-label="New button idea">
          <p>You're settled in now. Want an <strong>I can help</strong> button so you can help neighbors too?</p>
          <div className="qa-edit-buttons">
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => answerNudge(true)}>Yes, add it</button>
            <button type="button" className="btn btn-outline" disabled={saving} onClick={() => answerNudge(false)}>No thanks</button>
          </div>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="button" className="qa-link" onClick={startEdit}>Change these buttons</button>
    </section>
  )
}
