import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import BackLink from '../components/BackLink'
import Icon from '../components/Icon'
import { useT, t as tr, getLang } from '../utils/lang'

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
  const t = useT()
  return (
    <section className="ch-part">
      <h2>{t(title)}</h2>
      {text ? <p className="ch-text">{text}</p> : <p className="ch-empty">{t(empty)}</p>}
    </section>
  )
}

export default function VillageCharter() {
  const t = useT()
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
    if (err) { console.error('village_charter_get failed:', err); setLoadError(tr('We could not load the charter. Check your connection and try again.')); return }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) { setLoadError(tr('We could not find this village. It may have closed.')); return }
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
    if (err) { console.error('village_charter_propose failed:', err); setError(tr('Could not save that. Try again.')); return }
    if (data !== 'live' && data !== 'waiting') { setError(tr(WORDS[data] || 'Could not save that. Try again.')); return }
    setEditing(false)
    setNote(data === 'live' ? tr('The new charter is live.') : tr('Saved. Another leader of this village will be asked to say yes before it goes live.'))
    load()
  }

  async function decide(yes) {
    if (busy || !c?.waiting_id) return
    setBusy(true); setError(''); setNote('')
    const { data, error: err } = await supabase.rpc('village_charter_decide', { p_change: c.waiting_id, p_yes: yes })
    setBusy(false)
    if (err) { console.error('village_charter_decide failed:', err); setError(tr('Could not save your answer. Try again.')); return }
    if (data !== 'approved' && data !== 'declined') { setError(tr(WORDS[data] || 'Could not save your answer. Try again.')); load(); return }
    setNote(yes ? tr('Thank you. The new charter is live.') : tr('Thank you. The change was not used. Talk it over in the village chat if you like.'))
    load()
  }

  async function withdraw() {
    if (busy || !c?.waiting_id) return
    setBusy(true); setError(''); setNote('')
    const { data, error: err } = await supabase.rpc('village_charter_withdraw', { p_change: c.waiting_id })
    setBusy(false)
    if (err) { console.error('village_charter_withdraw failed:', err); setError(tr('Could not take it back. Try again.')); return }
    if (data !== 'withdrawn') { setError(tr(WORDS[data] || 'Could not take it back. Try again.')); load(); return }
    setNote(tr('You took the change back.'))
    load()
  }

  const hasCharter = !!(c && (c.story || c.cares || c.house_rules))
  const left = (s, max) => max - s.length

  return (
    <div className="cal-page ch-page">
      <BackLink fallback={'/village/' + id} fallbackLabel={t('Back to the village')} />
      <h1 className="ch-title"><span aria-hidden="true"><Icon name="scroll" size={32} /></span> {name ? t('{name} charter', { name }) : t('Village charter')}</h1>

      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {!c && !loadError && <p className="cal-empty">{t('Loading...')}</p>}
      {note && <p className="form-success" role="status">{note}</p>}
      {error && !editing && <p className="form-error" role="alert">{error}</p>}

      {c && !editing && (
        <>
          {!hasCharter && (
            <p className="cal-sub">{c.i_lead
              ? t('This village has no charter yet. As a leader here, you can write the first one.')
              : t('This village has no charter yet. Its Keeper and Helpers can write one.')}</p>
          )}
          {hasCharter && (
            <>
              <Part title="Our story" text={c.story} empty="Not written yet." />
              <Part title="What we care about" text={c.cares} empty="Not written yet." />
              <Part title="Our house rules" text={c.house_rules} empty="Not written yet." />
              {c.updated_at && <p className="ch-note">{t("Last changed {date}. Every change is in the village's role log.", { date: new Date(c.updated_at).toLocaleDateString(getLang() === 'es' ? 'es-US' : undefined, { month: 'long', day: 'numeric', year: 'numeric' }) })}</p>}
            </>
          )}

          {c.i_lead && c.waiting_id && (
            <section className="cal-box ch-waiting" aria-labelledby="ch-wait">
              <h2 id="ch-wait">{t('A change is waiting')}</h2>
              <p className="cal-sub">{c.waiting_by_me ? t('You wrote this. Another leader needs to say yes.') : t('{name} wrote this change. Read it and say yes or no.', { name: c.waiting_by_name || t('A leader') })}</p>
              <Part title="Our story" text={c.waiting_story} empty="Left empty." />
              <Part title="What we care about" text={c.waiting_cares} empty="Left empty." />
              <Part title="Our house rules" text={c.waiting_rules} empty="Left empty." />
              {c.waiting_by_me
                ? <button type="button" className="btn btn-outline btn-full" disabled={busy} onClick={withdraw}>{t('Take it back')}</button>
                : <>
                    <button type="button" className="btn btn-primary btn-full" disabled={busy} onClick={() => decide(true)}>{t('Yes, make it live')}</button>
                    <button type="button" className="btn btn-outline btn-full ch-gap" disabled={busy} onClick={() => decide(false)}>{t('No, not this one')}</button>
                  </>}
            </section>
          )}

          {c.i_lead && !c.waiting_id && (
            <button type="button" className="btn btn-primary btn-full ch-gap" onClick={startEdit}>{hasCharter ? t('Change the charter') : t('Write the charter')}</button>
          )}
        </>
      )}

      {c && editing && (
        <form className="ch-form" onSubmit={save} noValidate>
          <p className="cal-sub">{c.one_leader
            ? t('You are the only leader here, so this goes live when you save. It is written in the role log.')
            : t('Another leader of this village will be asked to say yes before this goes live.')} {t('Anyone on VWB can read it. Keep addresses and private details out.')}</p>

          <label htmlFor="ch-story">{t('Our story')}</label>
          <p className="ch-help" id="ch-story-help">{t('Where does the village name come from? What is this place like?')}</p>
          <textarea id="ch-story" rows={4} maxLength={LIMITS.story} value={story} onChange={(e) => setStory(e.target.value)} aria-describedby="ch-story-help ch-story-left" />
          <p className="ch-left" id="ch-story-left">{t('{n} letters left', { n: left(story, LIMITS.story) })}</p>

          <label htmlFor="ch-cares">{t('What we care about')}</label>
          <p className="ch-help" id="ch-cares-help">{t('What do neighbors here want to do together?')}</p>
          <textarea id="ch-cares" rows={4} maxLength={LIMITS.cares} value={cares} onChange={(e) => setCares(e.target.value)} aria-describedby="ch-cares-help ch-cares-left" />
          <p className="ch-left" id="ch-cares-left">{t('{n} letters left', { n: left(cares, LIMITS.cares) })}</p>

          <label htmlFor="ch-rules">{t('Our house rules')}</label>
          <p className="ch-help" id="ch-rules-help">{t('A few rules for this village, on top of the Community Guidelines. One per line works well.')}</p>
          <textarea id="ch-rules" rows={6} maxLength={LIMITS.rules} value={rules} onChange={(e) => setRules(e.target.value)} aria-describedby="ch-rules-help ch-rules-left" />
          <p className="ch-left" id="ch-rules-left">{t('{n} letters left', { n: left(rules, LIMITS.rules) })}</p>

          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{busy ? t('Saving...') : c.one_leader ? t('Save and make it live') : t('Save and ask for a yes')}</button>
          <button type="button" className="btn btn-outline btn-full ch-gap" disabled={busy} onClick={() => { setEditing(false); setError('') }}>{t('Cancel')}</button>
        </form>
      )}

      <section className="cal-box ch-guidelines" aria-labelledby="ch-g">
        <h2 id="ch-g">{t('Every village follows the Community Guidelines first')}</h2>
        <div className="vs-item"><b>{t('We look after each other.')}</b><small>{t('Help is given freely, and anyone can ask for it.')}</small></div>
        <div className="vs-item"><b>{t('We keep private things private.')}</b><small>{t('Keep addresses and private details out of the village chat.')}</small></div>
        <div className="vs-item"><b>{t('Safety is in your hands.')}</b><small>{t('You can block, report, and vouch for people.')}</small></div>
        <Link className="btn btn-outline btn-full" to="/terms">{t('Read the full Community Guidelines')}</Link>
      </section>
    </div>
  )
}
