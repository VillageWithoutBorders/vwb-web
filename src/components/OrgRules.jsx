import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// The rules a Head sets for their own organization. Organizers can read them.
// The database checks who may change them, so a hidden button is never the
// only protection.

export default function OrgRules({ orgId, isHead }) {
  const [rules, setRules] = useState(null)
  const [addBy, setAddBy] = useState('organizers')
  const [see, setSee] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_org_rules', { p_org: orgId })
    if (error) { console.error('Failed to load organization rules:', error); return }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return
    setRules(row)
    setAddBy(row.add_members_by)
    setSee(!!row.members_see_list)
  }, [orgId])

  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault()
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('set_org_rules', { p_org: orgId, p_add_members_by: addBy, p_members_see_list: see })
    setBusy(false)
    if (error) {
      console.error('Failed to save organization rules:', error)
      setNote(error.message || "We couldn't save that. Try again.")
      return
    }
    setNote('Saved.')
    load()
  }

  if (!rules) return null

  const changed = addBy !== rules.add_members_by || see !== !!rules.members_see_list
  const radio = { display: 'flex', alignItems: 'flex-start', gap: '0.6rem', minHeight: 44, padding: '0.25rem 0' }
  const dot = { width: 22, height: 22, flexShrink: 0, marginTop: '0.1rem' }

  return (
    <section className="hub-section" aria-labelledby="od-rules">
      <div className="hub-section-head"><h2 id="od-rules">Our rules</h2></div>
      <p className="hub-org-desc">
        {isHead
          ? 'These are your organization\'s decisions. Each one starts on the most private choice. Change them any time.'
          : 'Your Head decides these. You can see how they are set.'}
      </p>
      <form onSubmit={save} noValidate>
        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 0.75rem' }} disabled={!isHead || busy}>
          <legend className="cal-sub">Who can add new members</legend>
          <label style={radio}>
            <input type="radio" name="od-add" checked={addBy === 'head'} onChange={() => { setAddBy('head'); setNote('') }} style={dot} />
            <span>Only the Head</span>
          </label>
          <label style={radio}>
            <input type="radio" name="od-add" checked={addBy === 'organizers'} onChange={() => { setAddBy('organizers'); setNote('') }} style={dot} />
            <span>The Head and organizers</span>
          </label>
        </fieldset>
        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 0.75rem' }} disabled={!isHead || busy}>
          <legend className="cal-sub">Who can see the list of members</legend>
          <label style={radio}>
            <input type="radio" name="od-see" checked={!see} onChange={() => { setSee(false); setNote('') }} style={dot} />
            <span>Only the Head and organizers</span>
          </label>
          <label style={radio}>
            <input type="radio" name="od-see" checked={see} onChange={() => { setSee(true); setNote('') }} style={dot} />
            <span>Everyone in the organization</span>
          </label>
        </fieldset>
        {isHead && (
          <button type="submit" className="btn btn-primary btn-full" style={{ minHeight: '48px' }} disabled={busy || !changed}>{busy ? 'Saving...' : 'Save our rules'}</button>
        )}
        {note && <p className="hub-note" role="status">{note}</p>}
      </form>
      <p className="hub-org-desc" style={{ marginTop: '0.75rem' }}>Who can see your group on the public page, and whether your contact email shows, are set on your public page.</p>
    </section>
  )
}
