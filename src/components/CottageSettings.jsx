import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { BACKGROUNDS, HAS_SEASONS, backgroundSrc, DEFAULT_WORLDS } from '../data/worldElements'
import { fromSaved, isPlainWorld } from './MapBuilder'

// Your cottage's name, who can visit it, and (in Full setup) its background (Nov 1, Jade).
// Used by Full setup (/setup) and by Edit cottage > Name and visitors.
export const VISITOR_CHOICES = [
  { k: 'connections', label: 'People I am connected with', sub: 'The people on your Connections list.' },
  { k: 'members', label: 'Anyone on VWB', sub: 'Any neighbor who is signed in.' },
  { k: 'nobody', label: 'Only me', sub: 'No visitors.' },
]

export function visitorsLine(v) {
  return v === 'members' ? 'Anyone on VWB can visit your map.'
    : v === 'nobody' ? 'Only you see your map.'
    : 'People you are connected with can visit your map.'
}

const BG_CHOICES = [
  ...(HAS_SEASONS ? [{ k: 'seasons', label: 'Change with the seasons' }] : []),
  ...BACKGROUNDS.map((b) => ({ k: b.k, label: b.label })),
]

export default function CottageSettings({ withBackground = false, saveLabel = 'Save', onSaved, onSkip, skipLabel }) {
  const { profile, refreshProfile } = useAuth()
  const [name, setName] = useState(profile?.cottage_name || '')
  const [visitors, setVisitors] = useState(profile?.cottage_visitors || 'connections')
  const [bg, setBg] = useState(() => fromSaved(profile?.village_layout, DEFAULT_WORLDS.cottage).bg)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('set_my_cottage', { p_name: name.trim(), p_visitors: visitors })
    if (error) {
      console.error('Failed to save cottage name:', error)
      setErr(error.code === 'PGRST202' ? 'This needs a database update first. Ask a VWB admin.' : error.code === '22023' ? error.message : 'Could not save. Try again in a moment.')
      setBusy(false)
      return
    }
    if (withBackground) {
      const next = { ...fromSaved(profile?.village_layout, DEFAULT_WORLDS.cottage), bg }
      const empty = isPlainWorld(next, DEFAULT_WORLDS.cottage) && next.labels === 'auto'
      const { error: bgErr } = await supabase.rpc('set_my_village_layout', { p_layout: empty ? null : next })
      if (bgErr) {
        console.error('Failed to save cottage background:', bgErr)
        setErr('Your name was saved, but not the background. Try again in a moment.')
        setBusy(false)
        return
      }
      try { localStorage.setItem('vwb_village_layout_v2', JSON.stringify(next)) } catch { /* private window */ }
    }
    if (refreshProfile) await refreshProfile()
    setBusy(false)
    if (onSaved) onSaved()
  }

  return (
    <form className="cs-form" onSubmit={save}>
      <div className="form-field">
        <label htmlFor="cs-name">Name your cottage</label>
        <input id="cs-name" type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Like Willow Rest or The Blue Door" autoComplete="off" />
        <small className="field-hint">Up to 40 letters. Leave it blank to keep "My Cottage".</small>
      </div>

      {withBackground && (
        <fieldset className="cs-fieldset">
          <legend>Pick a background</legend>
          <div className="cs-bgs">
            {BG_CHOICES.map((c) => (
              <label key={c.k} className={'cs-bg' + (bg === c.k ? ' on' : '')}>
                <input type="radio" name="cs-bg" value={c.k} checked={bg === c.k} onChange={() => setBg(c.k)} />
                <img src={backgroundSrc(c.k)} alt="" width="72" height="108" loading="lazy" />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="cs-fieldset">
        <legend>Who can visit your cottage?</legend>
        <p className="cs-note">Visitors see your map and your cottage name. Never your chats, alerts or tasks.</p>
        {VISITOR_CHOICES.map((c) => (
          <label key={c.k} className={'cs-choice' + (visitors === c.k ? ' on' : '')}>
            <input type="radio" name="cs-visitors" value={c.k} checked={visitors === c.k} onChange={() => setVisitors(c.k)} />
            <span><b>{c.label}</b><small>{c.sub}</small></span>
          </label>
        ))}
      </fieldset>

      {err && <p className="form-error" role="alert">{err}</p>}
      <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{busy ? 'Saving...' : saveLabel}</button>
      {onSkip && <button type="button" className="btn btn-outline btn-full" onClick={onSkip} disabled={busy}>{skipLabel || 'Skip'}</button>}
    </form>
  )
}
