import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { orgWords } from '../utils/roleWords'

// The rules a Head sets for their own organization. Organizers can read them.
// The database checks who may change them, so a hidden button is never the
// only protection.
// Organizations (not groups) also pick their own titles for their two
// leader steps here. Empty means Head and Organizer.

// Same check the database makes, so people see the problem right away.
function titleProblem(t) {
  const v = t.trim()
  if (!v) return ''
  if (v.length < 2 || v.length > 24) return 'A title needs 2 to 24 letters.'
  if (!/^[A-Za-z][A-Za-z' -]*$/.test(v)) return 'Use letters and spaces only.'
  if (/(admin|vwb|founder|ambassador|staff)/i.test(v)) return 'That word belongs to VWB. Pick another title.'
  return ''
}

export default function OrgRules({ orgId, isHead, org, onTitles }) {
  const [rules, setRules] = useState(null)
  const [addBy, setAddBy] = useState('organizers')
  const [see, setSee] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [headT, setHeadT] = useState('')
  const [orgT, setOrgT] = useState('')
  const [tBusy, setTBusy] = useState(false)
  const [tNote, setTNote] = useState('')
  const isGroup = org?.kind === 'group'
  const W = orgWords(org)

  useEffect(() => {
    setHeadT(org?.head_title || '')
    setOrgT(org?.organizer_title || '')
  }, [org?.head_title, org?.organizer_title])

  async function saveTitles(e) {
    e.preventDefault()
    const problem = titleProblem(headT) || titleProblem(orgT)
    if (problem) { setTNote(problem); return }
    if ((headT.trim() || 'Head').toLowerCase() === (orgT.trim() || 'Organizer').toLowerCase()) { setTNote('The two titles need to be different.'); return }
    setTBusy(true); setTNote('')
    const { error } = await supabase.rpc('set_org_titles', { p_org: orgId, p_head: headT.trim(), p_organizer: orgT.trim() })
    setTBusy(false)
    if (error) {
      console.error('Failed to save organization titles:', error)
      setTNote(error.message && error.message.length < 140 ? error.message : "We couldn't save that. Try again.")
      return
    }
    setTNote('Saved. Your new titles show across your pages.')
    if (onTitles) onTitles()
  }

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
          : 'Your ' + W.head + ' decides these. You can see how they are set.'}
      </p>
      <form onSubmit={save} noValidate>
        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 0.75rem' }} disabled={!isHead || busy}>
          <legend className="cal-sub">Who can add new members</legend>
          <label style={radio}>
            <input type="radio" name="od-add" checked={addBy === 'head'} onChange={() => { setAddBy('head'); setNote('') }} style={dot} />
            <span>Only the {W.head}</span>
          </label>
          <label style={radio}>
            <input type="radio" name="od-add" checked={addBy === 'organizers'} onChange={() => { setAddBy('organizers'); setNote('') }} style={dot} />
            <span>The {W.leadsLower}</span>
          </label>
        </fieldset>
        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 0.75rem' }} disabled={!isHead || busy}>
          <legend className="cal-sub">Who can see the list of members</legend>
          <label style={radio}>
            <input type="radio" name="od-see" checked={!see} onChange={() => { setSee(false); setNote('') }} style={dot} />
            <span>Only the {W.leadsLower}</span>
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
      {!isGroup && org && (
        <form onSubmit={saveTitles} noValidate style={{ marginTop: '1rem' }}>
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }} disabled={!isHead || tBusy}>
            <legend className="cal-sub">Our titles</legend>
            <p className="hub-org-desc">Call your leaders what your organization calls them. Leave a box empty to use Head and Organizer. VWB still treats them as Keeper and Helper for safety.</p>
            <label className="admin-dialog-label" htmlFor="or-head">Title for the people who lead (Head)</label>
            <input id="or-head" type="text" autoComplete="off" maxLength={24} placeholder="Head" value={headT}
              onChange={(e) => { setHeadT(e.target.value); setTNote('') }}
              aria-invalid={!!titleProblem(headT)} aria-describedby="or-t-note" style={{ width: '100%', minHeight: 44, fontSize: '1rem', boxSizing: 'border-box', marginBottom: '0.75rem' }} />
            <label className="admin-dialog-label" htmlFor="or-org">Title for the people who help lead (Organizer)</label>
            <input id="or-org" type="text" autoComplete="off" maxLength={24} placeholder="Organizer" value={orgT}
              onChange={(e) => { setOrgT(e.target.value); setTNote('') }}
              aria-invalid={!!titleProblem(orgT)} aria-describedby="or-t-note" style={{ width: '100%', minHeight: 44, fontSize: '1rem', boxSizing: 'border-box', marginBottom: '0.75rem' }} />
          </fieldset>
          {isHead && (
            <button type="submit" className="btn btn-primary btn-full" style={{ minHeight: '48px' }}
              disabled={tBusy || (headT.trim() === (org.head_title || '') && orgT.trim() === (org.organizer_title || ''))}>{tBusy ? 'Saving...' : 'Save our titles'}</button>
          )}
          <p id="or-t-note" className="hub-note" role="status">{tNote || titleProblem(headT) || titleProblem(orgT)}</p>
        </form>
      )}
      <p className="hub-org-desc" style={{ marginTop: '0.75rem' }}>Who can see your group on the public page, and whether your contact email shows, are set on your public page.</p>
    </section>
  )
}
