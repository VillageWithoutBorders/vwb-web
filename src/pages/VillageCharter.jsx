import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import BackLink from '../components/BackLink'
import Icon from '../components/Icon'

// A village's own charter (vwb-village-charter.sql): where the name comes
// from, what neighbors here care about, and house rules. The VWB Community
// Guidelines always come first and are linked below it.
//
// Anyone signed in can read it. The Keeper or a Helper writes a change;
// another leader says yes before it goes live (a village with one leader
// goes live right away). Every change is in the role log.

const LIMITS = { story: 600, cares: 600, rules: 1200 }

const WORDS = {
  notleader: 'Only the Keeper and Helpers of this village can change its charter.',
  already: 'A change is already waiting for a yes. Answer that one first.',
  toolong: 'One of the parts is too long. Make it a little shorter.',
  gone: 'That change was already answered.',
  yours: 'You wrote this change, so another leader needs to say yes.',
  notyours: 'Only the person who wrote it can take it back.',
}

function Part({ title, text, empty }) {
  return (
    <section className="ch-part">
      <h2>{title}</h2>
      {text ? <p className="ch-text">{text}</p> : <p className="ch-empty">{empty}</p>}
    </section>
  )
}

export default function VillageCharter() {
  const { id } = useParams()
  const [name, setName] = useState('')
  const [c, setC] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState(false)
  const [story, setStory] = useState('')
  const [cares, setCares] = useState('')
  const [rules, setRules] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  async function load() {
    const { data, error: err } = await supabase.rpc('village_charter_get', { p_village: id })
    if (err) { console.error('village_charter_get failed:', err); setLoadError('We could not load the charter. Check your connection and try again.'); return }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) { setLoadError('We could not find this village. It may have closed.'); return }
    setC(row)
  }

  useEffect(() => {
    load()
    supabase.rpc('village_network').then(({ data, error: err }) => {
      if (err) { console.error('village_network failed:', err); return }
      const v = (data || []).find((x) => x.id === id)
      if (v) setName(v.name)
    })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit() {
    setError(''); setNote('')
    setStory(c?.story || ''); setCares(c?.cares || ''); setRules(c?.house_rules || '')
    setEditing(true)
  }

  async function save(e) {
    e.preventDefault()
    if (busy) return
    setError(''); setNote('')
    setBusy(true)
    const { data, error: err } = await supabase.rpc('village_charter_propose', { p_village: id, p_story: story, p_cares: cares, p_rules: rules })
    setBusy(false)
    if (err) { console.error('village_charter_propose failed:', err); setError('Could not save that. Try again.'); return }
    if (data !== 'live' && data !== 'waiting') { setError(WORDS[data] || 'Could not save that. Try again.'); return }
    setEditing(false)
    setNote(data === 'live' ? 'The new charter is live.' : 'Saved. Another leader of this village will be asked to say yes before it goes live.')
    load()
  }

  async function decide(yes) {
    if (busy || !c?.waiting_id) return
    setBusy(true); setError(''); setNote('')
    const { data, error: err } = await supabase.rpc('village_charter_decide', { p_change: c.waiting_id, p_yes: yes })
    setBusy(false)
    if (err) { console.error('village_charter_decide failed:', err); setError('Could not save your answer. Try again.'); return }
    if (data !== 'approved' && data !== 'declined') { setError(WORDS[data] || 'Could not save your answer. Try again.'); load(); return }
    setNote(yes ? 'Thank you. The new charter is live.' : 'Thank you. The change was not used. Talk it over in the village chat if you like.')
    load()
  }

  async function withdraw() {
    if (busy || !c?.waiting_id) return
    setBusy(true); setError(''); setNote('')
    const { data, error: err } = await supabase.rpc('village_charter_withdraw', { p_change: c.waiting_id })
    setBusy(false)
    if (err) { console.error('village_charter_withdraw failed:', err); setError('Could not take it back. Try again.'); return }
    if (data !== 'withdrawn') { setError(WORDS[data] || 'Could not take it back. Try again.'); load(); return }
    setNote('You took the change back.')
    load()
  }

  const hasCharter = !!(c && (c.story || c.cares || c.house_rules))
  const left = (s, max) => max - s.length

  return (
    <div className="cal-page ch-page">
      <BackLink fallback={'/village/' + id} fallbackLabel="Back to the village" />
      <h1 className="ch-title"><span aria-hidden="true"><Icon name="scroll" size={32} /></span> {name ? name + ' charter' : 'Village charter'}</h1>

      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {!c && !loadError && <p className="cal-empty">Loading...</p>}
      {note && <p className="form-success" role="status">{note}</p>}
      {error && !editing && <p className="form-error" role="alert">{error}</p>}

      {c && !editing && (
        <>
          {!hasCharter && (
            <p className="cal-sub">{c.i_lead
              ? 'This village has no charter yet. As a leader here, you can write the first one.'
              : 'This village has no charter yet. Its Keeper and Helpers can write one.'}</p>
          )}
          {hasCharter && (
            <>
              <Part title="Our story" text={c.story} empty="Not written yet." />
              <Part title="What we care about" text={c.cares} empty="Not written yet." />
              <Part title="Our house rules" text={c.house_rules} empty="Not written yet." />
              {c.updated_at && <p className="ch-note">Last changed {new Date(c.updated_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}. Every change is in the village's role log.</p>}
            </>
          )}

          {c.i_lead && c.waiting_id && (
            <section className="cal-box ch-waiting" aria-labelledby="ch-wait">
              <h2 id="ch-wait">A change is waiting</h2>
              <p className="cal-sub">{c.waiting_by_me ? 'You wrote this. Another leader needs to say yes.' : (c.waiting_by_name || 'A leader') + ' wrote this change. Read it and say yes or no.'}</p>
              <Part title="Our story" text={c.waiting_story} empty="Left empty." />
              <Part title="What we care about" text={c.waiting_cares} empty="Left empty." />
              <Part title="Our house rules" text={c.waiting_rules} empty="Left empty." />
              {c.waiting_by_me
                ? <button type="button" className="btn btn-outline btn-full" disabled={busy} onClick={withdraw}>Take it back</button>
                : <>
                    <button type="button" className="btn btn-primary btn-full" disabled={busy} onClick={() => decide(true)}>Yes, make it live</button>
                    <button type="button" className="btn btn-outline btn-full ch-gap" disabled={busy} onClick={() => decide(false)}>No, not this one</button>
                  </>}
            </section>
          )}

          {c.i_lead && !c.waiting_id && (
            <button type="button" className="btn btn-primary btn-full ch-gap" onClick={startEdit}>{hasCharter ? 'Change the charter' : 'Write the charter'}</button>
          )}
        </>
      )}

      {c && editing && (
        <form className="ch-form" onSubmit={save} noValidate>
          <p className="cal-sub">{c.one_leader
            ? 'You are the only leader here, so this goes live when you save. It is written in the role log.'
            : 'Another leader of this village will be asked to say yes before this goes live.'} Anyone on VWB can read it. Keep addresses and private details out.</p>

          <label htmlFor="ch-story">Our story</label>
          <p className="ch-help" id="ch-story-help">Where does the village name come from? What is this place like?</p>
          <textarea id="ch-story" rows={4} maxLength={LIMITS.story} value={story} onChange={(e) => setStory(e.target.value)} aria-describedby="ch-story-help ch-story-left" />
          <p className="ch-left" id="ch-story-left">{left(story, LIMITS.story)} letters left</p>

          <label htmlFor="ch-cares">What we care about</label>
          <p className="ch-help" id="ch-cares-help">What do neighbors here want to do together?</p>
          <textarea id="ch-cares" rows={4} maxLength={LIMITS.cares} value={cares} onChange={(e) => setCares(e.target.value)} aria-describedby="ch-cares-help ch-cares-left" />
          <p className="ch-left" id="ch-cares-left">{left(cares, LIMITS.cares)} letters left</p>

          <label htmlFor="ch-rules">Our house rules</label>
          <p className="ch-help" id="ch-rules-help">A few rules for this village, on top of the Community Guidelines. One per line works well.</p>
          <textarea id="ch-rules" rows={6} maxLength={LIMITS.rules} value={rules} onChange={(e) => setRules(e.target.value)} aria-describedby="ch-rules-help ch-rules-left" />
          <p className="ch-left" id="ch-rules-left">{left(rules, LIMITS.rules)} letters left</p>

          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{busy ? 'Saving...' : c.one_leader ? 'Save and make it live' : 'Save and ask for a yes'}</button>
          <button type="button" className="btn btn-outline btn-full ch-gap" disabled={busy} onClick={() => { setEditing(false); setError('') }}>Cancel</button>
        </form>
      )}

      <section className="cal-box ch-guidelines" aria-labelledby="ch-g">
        <h2 id="ch-g">Every village follows the Community Guidelines first</h2>
        <div className="vs-item"><b>We look after each other.</b><small>Help is given freely, and anyone can ask for it.</small></div>
        <div className="vs-item"><b>We keep private things private.</b><small>Keep addresses and private details out of the village chat.</small></div>
        <div className="vs-item"><b>Safety is in your hands.</b><small>You can block, report, and vouch for people.</small></div>
        <Link className="btn btn-outline btn-full" to="/terms">Read the full Community Guidelines</Link>
      </section>
    </div>
  )
}
