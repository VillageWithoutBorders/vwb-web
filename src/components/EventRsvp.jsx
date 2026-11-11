import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../utils/lang'

// Round E part 4 (Nov 10): RSVP choices and reminders (vwb-event-access-rsvp.sql).
// Going and Going but may leave early hold a spot (the old sign-up). Maybe and
// Watching from home don't. Change any time. Organizers only hear about it if
// the event fills up.

const REMIND = [[null, 'No reminder'], [30, '30 minutes before'], [60, '1 hour before'], [120, '2 hours before'], [1440, 'The day before']]

export function EventReminder({ eventId, token, label }) {
  const t = useT()
  const [mins, setMins] = useState(undefined)
  const [note, setNote] = useState('')
  useEffect(() => {
    let alive = true
    supabase.rpc('my_event_rsvp', { p_event: Number(eventId) }).then(({ data, error }) => {
      if (!alive) return
      if (error) { if (error.code !== 'PGRST202') console.error('Failed to load reminder:', error); setMins('off'); return }
      const row = Array.isArray(data) ? data[0] : data
      setMins(row ? row.remind_mins : null)
    })
    return () => { alive = false }
  }, [eventId])
  if (mins === undefined || mins === 'off') return null
  async function pick(v) {
    const next = v === '' ? null : Number(v)
    setMins(next); setNote('')
    const { error } = await supabase.rpc('set_event_reminder', { p_event: Number(eventId), p_mins: next, p_token: token || null })
    if (error) { console.error('Failed to save reminder:', error); setNote(t("We couldn't save that. Try again.")); return }
    setNote(next ? t('We will remind you.') : t('No reminder.'))
  }
  return (
    <div className="form-field rsvp-remind">
      <label htmlFor={'remind-' + eventId}>{t(label || 'Remind me')}</label>
      <select id={'remind-' + eventId} value={mins == null ? '' : String(mins)} onChange={(e) => pick(e.target.value)}>
        {REMIND.map(([v, l]) => <option key={String(v)} value={v == null ? '' : String(v)}>{t(l)}</option>)}
      </select>
      {note && <p className="field-hint" role="status">{note}</p>}
    </div>
  )
}

export default function EventRsvp({ ev, token, full, hasWatch, askNote, onChanged }) {
  const t = useT()
  const [choice, setChoice] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    let alive = true
    supabase.rpc('my_event_rsvp', { p_event: Number(ev.id) }).then(({ data, error }) => {
      if (!alive) return
      const row = !error && (Array.isArray(data) ? data[0] : data)
      if (error && error.code !== 'PGRST202') console.error('Failed to load your RSVP:', error)
      setChoice(row && row.choice ? row.choice : (ev.is_signed_up ? 'going' : null))
    })
    return () => { alive = false }
  }, [ev.id, ev.is_signed_up])

  const holds = (c) => c === 'going' || c === 'leave_early'
  const options = [
    ['going', 'Going'],
    ['leave_early', 'Going, but may leave early'],
    ['maybe', 'Maybe'],
    ...(hasWatch ? [['online', 'Watching from home']] : []),
  ]

  async function pick(c) {
    if (busy || c === choice) return
    setBusy(true); setMsg('')
    if (holds(c) && !ev.is_signed_up) {
      const { data, error } = await supabase.rpc('signup_for_calendar_event', { p_id: Number(ev.id), p_note: note, p_token: token || null })
      if (error) { setBusy(false); setMsg(error.message || t('Something went wrong. Try again.')); return }
      if (data === 'full') { setBusy(false); setMsg(t('Sorry, every spot just filled up.')); onChanged(); return }
    }
    if (!holds(c) && ev.is_signed_up) {
      const { error } = await supabase.rpc('cancel_calendar_signup', { p_id: Number(ev.id) })
      if (error) { setBusy(false); setMsg(t('Could not change it. Try again.')); return }
    }
    const { error } = await supabase.rpc('set_event_rsvp', { p_event: Number(ev.id), p_choice: c, p_token: token || null })
    setBusy(false)
    if (error && error.code !== 'PGRST202') { console.error('Failed to save RSVP:', error); setMsg(t('Could not change it. Try again.')); return }
    setChoice(c); setNote('')
    setMsg(c ? t('Saved. You can change it any time.') : t('Got it. You are not coming.'))
    onChanged()
  }

  if (choice === undefined) return <p role="status">{t('Loading...')}</p>
  return (
    <div className="rsvp">
      <fieldset className="rsvp-choices">
        <legend className="sr-only">{t('Are you coming?')}</legend>
        {options.map(([k, label]) => {
          const off = holds(k) && full && !ev.is_signed_up
          return (
            <label key={k} className={'cal-choice' + (choice === k ? ' is-on' : '') + (off ? ' is-off' : '')}>
              <input type="radio" name={'rsvp-' + ev.id} checked={choice === k} disabled={busy || off} onChange={() => pick(k)} />
              <span>{t(label)}{off && <small>{t('All spots are filled.')}</small>}{k === 'online' && <small>{t('You get the link to watch.')}</small>}</span>
            </label>
          )
        })}
      </fieldset>
      {!choice && (
        <div className="form-field" style={{ marginBottom: 0 }}>
          <label htmlFor="rsvp-note">{t(askNote)}</label>
          <textarea id="rsvp-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('For example: 3 of us, 2 adults and a child')} />
        </div>
      )}
      {msg && <p role="status" className="rsvp-msg">{msg}</p>}
      {choice && <>
        <EventReminder eventId={ev.id} token={token} />
        <button type="button" className="btn btn-outline btn-full" disabled={busy} onClick={() => pick(null)}>{t("I can't come")}</button>
      </>}
    </div>
  )
}

export function EventRsvpCounts({ eventId }) {
  const t = useT()
  const [c, setC] = useState(null)
  useEffect(() => {
    let alive = true
    supabase.rpc('event_rsvp_counts', { p_event: Number(eventId) }).then(({ data, error }) => {
      if (!alive) return
      if (error) { if (error.code !== 'PGRST202') console.error('Failed to load RSVP counts:', error); return }
      setC((Array.isArray(data) ? data[0] : data) || null)
    })
    return () => { alive = false }
  }, [eventId])
  if (!c) return null
  const parts = [[c.going, 'Going'], [c.leave_early, 'May leave early'], [c.maybe, 'Maybe'], [c.online, 'Watching from home']].filter(([n]) => n > 0)
  if (!parts.length) return null
  return <p className="cal-sub rsvp-counts">{parts.map(([n, l]) => t(l) + ': ' + n).join(' · ')}</p>
}
