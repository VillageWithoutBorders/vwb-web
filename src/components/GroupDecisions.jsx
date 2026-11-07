import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { askConfirm } from './AdminDialog'
import AddressHint from './AddressHint'
import { useT, getLang } from '../utils/lang'

// Deciding together (Nov 7, Jade). Any member suggests a decision, the
// group talks it over for a set time, then answers: Yes, Yes with a worry,
// or No, I can't live with this. The database closes it when time is up
// and keeps the outcome. No names show anywhere here, not even to leaders.
// Only members can see it (vwb-group-decisions.sql checks that).

const ANSWERS = [
  { k: 'agree', label: 'Yes' },
  { k: 'concerns', label: 'Yes, with a worry' },
  { k: 'block', label: "No, I can't live with this" },
]
const OUTCOME = {
  passed: 'Decided',
  not_passed: 'Not agreed',
  too_few: 'Not enough answers',
}

function day(iso) {
  return new Date(iso).toLocaleDateString(getLang() === 'es' ? 'es-US' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function GroupDecisions({ orgId }) {
  const t = useT()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  // Suggest form
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [days, setDays] = useState(7)
  const [formError, setFormError] = useState('')
  // Answer being written: { id, answer, note }
  const [draft, setDraft] = useState(null)
  const [rule, setRule] = useState('consensus')

  const load = useCallback(async () => {
    setLoadError('')
    const { data: res, error } = await supabase.rpc('group_decisions_for', { p_org: orgId })
    if (error) { console.error('Failed to load decisions:', error); setLoadError(t("We couldn't load the group's decisions. Try again.")); return }
    setData(res)
    if (res?.rule) setRule(res.rule)
  }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  if (loadError) return <section className="hub-section"><p className="hub-note" role="alert">{loadError}</p></section>
  if (!data || !data.ok) return null

  const decisions = data.decisions || []
  const openOnes = decisions.filter((d) => d.status === 'open')
  const past = decisions.filter((d) => d.status !== 'open')

  async function suggest(e) {
    e.preventDefault()
    setFormError('')
    if (title.trim().length < 3) { setFormError(t('Say what you want to decide in a few words.')); return }
    setBusy(true)
    const { error } = await supabase.rpc('propose_group_decision', { p_org: orgId, p_title: title.trim(), p_details: details.trim(), p_days: days })
    setBusy(false)
    if (error) {
      console.error('Failed to suggest a decision:', error)
      setFormError(error.message && error.message.length < 140 ? t(error.message) : t('Something went wrong. Try again.'))
      return
    }
    setOpen(false); setTitle(''); setDetails(''); setDays(7)
    setNote(t('Your suggestion is up. Everyone in the group got an alert.'))
    load()
  }

  async function sendAnswer(d) {
    if (!draft || draft.id !== d.id) return
    if (draft.answer === 'block' && draft.note.trim().length < 3) { setNote(t('Say why, so the group can work on it.')); return }
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('answer_group_decision', { p_decision: d.id, p_answer: draft.answer, p_note: draft.note.trim() })
    setBusy(false)
    if (error) {
      console.error('Failed to answer a decision:', error)
      setNote(error.message && error.message.length < 140 ? t(error.message) : t('Something went wrong. Try again.'))
      return
    }
    setDraft(null)
    setNote(t('Your answer is saved. You can change it until it closes.'))
    load()
  }

  async function withdraw(d) {
    if (!(await askConfirm(t('Take back "{title}"? It closes now and nothing is decided.', { title: d.title }), { yes: t('Take it back'), no: t('Keep it open') }))) return
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('withdraw_group_decision', { p_decision: d.id })
    setBusy(false)
    if (error) { console.error('Failed to take back a decision:', error); setNote(t('Something went wrong. Try again.')); return }
    load()
  }

  async function saveRule(next) {
    setRule(next)
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('set_org_decision_rule', { p_org: orgId, p_rule: next })
    setBusy(false)
    if (error) { console.error('Failed to save how the group decides:', error); setNote(t("We couldn't save that. Try again.")); setRule(data.rule); return }
    setNote(t('Saved. New decisions use this.'))
    load()
  }

  function counts(d) {
    return t('Yes: {a}. Yes, with a worry: {c}. No: {b}.', { a: d.yes_count || 0, c: d.worry_count || 0, b: d.block_count || 0 })
  }

  function notesList(d) {
    if (!d.notes || d.notes.length === 0) return null
    return (
      <ul className="gd-notes">
        {d.notes.map((n, i) => (
          <li key={i}><b>{n.answer === 'block' ? t("Can't live with it:") : t('A worry:')}</b> {n.note}</li>
        ))}
      </ul>
    )
  }

  const ruleText = data.rule === 'majority'
    ? t('We decide by majority. It passes when more than half of the answers are yes.')
    : t('We decide by consensus. It passes when no one says no and at least 2 people say yes.')

  return (
    <section className="hub-section gd" aria-labelledby="gd-h">
      <div className="hub-section-head"><h2 id="gd-h">{t('Deciding together')}</h2></div>
      <p className="hub-org-desc">{ruleText} {t('At least 3 people need to answer. No names are shown, not even to leaders.')}</p>

      {data.is_head && (
        <fieldset className="gd-rule" disabled={busy}>
          <legend className="cal-sub">{t('How our group decides')}</legend>
          <label className="gd-radio"><input type="radio" name="gd-rule" checked={rule === 'consensus'} onChange={() => saveRule('consensus')} /><span>{t('Consensus: no one says no')}</span></label>
          <label className="gd-radio"><input type="radio" name="gd-rule" checked={rule === 'majority'} onChange={() => saveRule('majority')} /><span>{t('Majority: more than half say yes')}</span></label>
        </fieldset>
      )}

      {note && <p className="hub-note" role="status">{note}</p>}

      {openOnes.length === 0 && !open && <p className="hub-empty">{t('Nothing to decide right now.')}</p>}

      {openOnes.map((d) => {
        const editing = draft && draft.id === d.id
        return (
          <article key={d.id} className="gd-card" aria-labelledby={'gd-t-' + d.id}>
            <h3 id={'gd-t-' + d.id} className="gd-title">{d.title}</h3>
            {d.details && <p className="gd-details">{d.details}</p>}
            <p className="gd-meta">{t('Talk it over until {day}.', { day: day(d.closes_at) })}</p>
            <p className="gd-meta">{counts(d)}</p>
            {notesList(d)}
            {d.my_answer && !editing && (
              <p className="gd-mine">{t('Your answer:')} <b>{t(ANSWERS.find((a) => a.k === d.my_answer)?.label || '')}</b>{d.my_note ? ' (' + d.my_note + ')' : ''}</p>
            )}
            <fieldset className="gd-answers" disabled={busy}>
              <legend className="sr-only">{t('Your answer')}</legend>
              {ANSWERS.map((a) => {
                const on = editing ? draft.answer === a.k : d.my_answer === a.k
                return (
                  <button key={a.k} type="button" className={'gd-answer gd-' + a.k + (on ? ' gd-on' : '')} aria-pressed={on}
                    onClick={() => setDraft({ id: d.id, answer: a.k, note: editing ? draft.note : (d.my_note || '') })}>
                    {t(a.label)}
                  </button>
                )
              })}
            </fieldset>
            {editing && (
              <div className="gd-write">
                {draft.answer !== 'agree' && (
                  <>
                    <label htmlFor={'gd-note-' + d.id} className="gd-label">{draft.answer === 'block' ? t('Why? (needed, so the group can work on it)') : t('Your worry (optional)')}</label>
                    <textarea id={'gd-note-' + d.id} rows={3} maxLength={500} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                    <p className="gd-fine">{t('Everyone in the group can read this, without your name.')}</p>
                    <AddressHint text={draft.note} />
                  </>
                )}
                <div className="gd-actions">
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => sendAnswer(d)}>{busy ? t('Saving...') : t('Save my answer')}</button>
                  <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setDraft(null)}>{t('Cancel')}</button>
                </div>
              </div>
            )}
            {d.mine && <button type="button" className="link-button gd-withdraw" disabled={busy} onClick={() => withdraw(d)}>{t('Take my suggestion back')}</button>}
          </article>
        )
      })}

      {!open ? (
        <button type="button" className="btn btn-outline btn-full gd-suggest" onClick={() => { setOpen(true); setNote('') }}>{t('Suggest a decision')}</button>
      ) : (
        <form className="gd-form" onSubmit={suggest} noValidate>
          <label htmlFor="gd-title" className="gd-label">{t('What should we decide?')}</label>
          <input id="gd-title" type="text" maxLength={120} autoComplete="off" value={title} onChange={(e) => { setTitle(e.target.value); setFormError('') }}
            placeholder={t('For example: Move pantry day to Saturday')} aria-invalid={!!formError} aria-describedby={formError ? 'gd-form-err' : undefined} />
          <label htmlFor="gd-details" className="gd-label">{t('More about it (optional)')}</label>
          <textarea id="gd-details" rows={4} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} />
          <AddressHint text={details + ' ' + title} />
          <label htmlFor="gd-days" className="gd-label">{t('How long to talk it over')}</label>
          <select id="gd-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[2, 3, 7, 14].map((n) => <option key={n} value={n}>{t('{n} days', { n })}</option>)}
          </select>
          <p className="gd-fine">{t('Everyone in the group gets an alert. Your name is not shown.')}</p>
          {formError && <p id="gd-form-err" className="form-error" role="alert">{formError}</p>}
          <div className="gd-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('Saving...') : t('Put it to the group')}</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setOpen(false); setFormError('') }}>{t('Cancel')}</button>
          </div>
        </form>
      )}

      {past.length > 0 && (
        <details className="gd-past">
          <summary>{t('Past decisions ({n})', { n: past.length })}</summary>
          {past.map((d) => (
            <article key={d.id} className="gd-card gd-closed" aria-labelledby={'gd-t-' + d.id}>
              <h3 id={'gd-t-' + d.id} className="gd-title">{d.title} <span className={'gd-badge gd-' + d.status}>{t(OUTCOME[d.status] || d.status)}</span></h3>
              {d.details && <p className="gd-details">{d.details}</p>}
              <p className="gd-meta">{t('Closed {day}.', { day: day(d.closed_at || d.closes_at) })}</p>
              <p className="gd-meta">{counts(d)}</p>
              {notesList(d)}
            </article>
          ))}
        </details>
      )}
    </section>
  )
}
