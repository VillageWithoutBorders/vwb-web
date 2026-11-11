import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { askConfirm } from './AdminDialog'
import { useT, t as tr, getLang } from '../utils/lang'

// Round F part 1 (Nov 11): roles on an event page (vwb-event-plans.sql). Each role says
// what you'll do, what to bring, and what's good to know, with time slots to take.
// You can hand off a slot you can't make, and leave a note for the next person.
// Events without roles show the plain shifts list instead (fallback).
function clock(iso) {
  return new Date(iso).toLocaleTimeString(getLang() === 'es' ? 'es-US' : 'en-US', { hour: 'numeric', minute: '2-digit' })
}
function when(s) {
  if (!s.starts_at) return ''
  const day = new Date(s.starts_at).toLocaleDateString(getLang() === 'es' ? 'es-US' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return day + ', ' + clock(s.starts_at) + (s.ends_at ? ' ' + tr('to') + ' ' + clock(s.ends_at) : '')
}

export default function EventRoles({ eventId, token, user, past, cancelled, onSignIn, onChanged, onLoaded, fallback }) {
  const t = useT()
  const [d, setD] = useState(null)
  const [notes, setNotes] = useState([])
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState('')
  const [noteFor, setNoteFor] = useState(null) // slot id with the note box open
  const [noteText, setNoteText] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_event_roles', { p_event: Number(eventId), p_token: token || null })
    if (error) { if (error.code !== 'PGRST202') console.error('list_event_roles', error); setD({ roles: [] }); return }
    setD(data || { roles: [] })
    const n = (data?.roles || []).reduce((a, r) => a + (r.slots || []).length, 0) + (data?.other || []).length
    if ((data?.roles || []).length && onLoaded) onLoaded(n)
    if (user && (data?.roles || []).length) {
      const { data: hn } = await supabase.rpc('my_handoff_notes', { p_event: Number(eventId) })
      setNotes(hn || [])
    }
  }, [eventId, token, user]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  if (!d) return null
  if (!(d.roles || []).length) return fallback || null

  async function take(s, label) {
    setBusy(s.id); setMsg('')
    const { data, error } = await supabase.rpc('take_event_shift', { p_shift: s.id, p_token: token || null })
    setBusy(null)
    if (error) { setMsg(error.message || tr('Something went wrong. Try again.')); return }
    setMsg(data === 'full' ? tr('Sorry, that slot just filled up.') : tr('You took "{shift}". Thank you!', { shift: label }))
    await load(); if (onChanged) onChanged()
  }
  async function handOff(s, label) {
    if (!(await askConfirm(tr("Hand off this slot? You leave it and the organizers are told it's open."), { yes: tr('Hand it off'), no: tr('Keep it') }))) return
    setBusy(s.id); setMsg('')
    const { error } = await supabase.rpc('hand_off_event_shift', { p_shift: s.id, p_note: noteFor === s.id ? noteText : null })
    setBusy(null)
    if (error) { setMsg(tr('Could not change it. Try again.')); return }
    setMsg(tr('You handed off "{shift}". Thank you for letting us know.', { shift: label }))
    setNoteFor(null); setNoteText('')
    await load(); if (onChanged) onChanged()
  }
  async function saveNote(s) {
    setBusy(s.id)
    const { error } = await supabase.rpc('set_shift_handoff_note', { p_shift: s.id, p_note: noteText })
    setBusy(null)
    if (error) { setMsg(tr("We couldn't save that. Try again.")); return }
    setNoteFor(null); setNoteText(''); setMsg(tr('Note saved for the next person.'))
    await load()
  }

  function slot(s, label) {
    const left = s.capacity - s.taken
    const full = left <= 0
    return (
      <li key={s.id} className={'role-slot' + (s.mine ? ' is-mine' : '')}>
        <div className="role-slot-top">
          <span className="role-slot-when">{when(s) || t('Any time')}</span>
          <span className={'role-slot-left' + (full ? ' is-full' : '')}>{full ? t('Full') : left === 1 ? t('1 spot left') : t('{n} spots left', { n: left })}</span>
        </div>
        {s.mine && s.handoff_note && <p className="role-note"><b>{t('Your note for the next person:')}</b> {s.handoff_note}</p>}
        {!past && !cancelled && (
          !user ? (
            !full && <button type="button" className="btn btn-primary" onClick={onSignIn}>{t('Sign up to take this')}</button>
          ) : s.mine ? (
            <div className="role-slot-btns">
              <span className="role-in">{t('You are in')}</span>
              <button type="button" className="btn btn-outline" disabled={busy === s.id} onClick={() => { setNoteFor(noteFor === s.id ? null : s.id); setNoteText(s.handoff_note || '') }}>{t('Note for the next person')}</button>
              <button type="button" className="btn btn-outline" disabled={busy === s.id} onClick={() => handOff(s, label)}>{t("I can't make it")}</button>
            </div>
          ) : !full && (
            <button type="button" className="btn btn-primary" disabled={busy === s.id} onClick={() => take(s, label)}>{busy === s.id ? t('Saving...') : t('Take this slot')}</button>
          )
        )}
        {noteFor === s.id && (
          <div className="role-note-edit">
            <label htmlFor={'note-' + s.id}>{t('Note for whoever comes next')}</label>
            <textarea id={'note-' + s.id} rows={2} maxLength={500} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={t('For example: The banner is in the blue bin.')} />
            <button type="button" className="btn btn-primary" disabled={busy === s.id} onClick={() => saveNote(s)}>{t('Save note')}</button>
          </div>
        )}
      </li>
    )
  }

  return (
    <section className="cal-box roles" aria-labelledby="roles-h">
      <h2 id="roles-h">{t('Roles and time slots')}</h2>
      {!user && !past && !cancelled && <p className="cal-sub">{t('Taking a slot needs a free Village Without Borders account, so organizers know who is coming.')}</p>}
      {notes.length > 0 && notes.map((n, i) => (
        <p key={i} className="role-note role-note-in" role="status"><b>{t('Note from the person before you ({role}):', { role: n.role_name })}</b> {n.note}</p>
      ))}
      {msg && <p role="status" className="rsvp-msg">{msg}</p>}
      {d.roles.map((r) => (
        <article key={r.id} className="role">
          <h3>{r.name}</h3>
          {r.what && <p><b>{t("What you'll do")}:</b> {r.what}</p>}
          {r.bring && <p><b>{t('Bring')}:</b> {r.bring}</p>}
          {r.good_to_know && <p><b>{t('Good to know')}:</b> {r.good_to_know}</p>}
          <ul className="role-slots">{(r.slots || []).map((s) => slot(s, r.name))}</ul>
        </article>
      ))}
      {(d.other || []).length > 0 && (
        <article className="role">
          <h3>{t('Other shifts')}</h3>
          <ul className="role-slots">{d.other.map((s) => slot(s, s.label))}</ul>
        </article>
      )}
    </section>
  )
}

// Round F part 1: tasks given to me on this event's checklist.
export function EventMyTasks({ eventId }) {
  const t = useT()
  const [tasks, setTasks] = useState(null)
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_event_tasks', { p_event: Number(eventId) })
    if (error) { if (error.code !== 'PGRST202') console.error('list_event_tasks', error); setTasks([]); return }
    setTasks((data || []).filter((x) => x.mine))
  }, [eventId])
  useEffect(() => { load() }, [load])
  if (!tasks || !tasks.length) return null
  async function tick(x) {
    const { error } = await supabase.rpc('set_event_task_done', { p_task: x.id, p_done: !x.done })
    if (error) { console.error('set_event_task_done', error); return }
    load()
  }
  return (
    <section className="cal-box" aria-labelledby="mytasks-h">
      <h2 id="mytasks-h">{t('Your tasks for this event')}</h2>
      <ul className="task-list">
        {tasks.map((x) => (
          <li key={x.id}>
            <label className={'cal-choice' + (x.done ? ' is-on' : '')}>
              <input type="checkbox" checked={x.done} onChange={() => tick(x)} />
              <span>{x.task}{x.due_on && <small>{t('By {day}', { day: new Date(x.due_on + 'T12:00:00').toLocaleDateString(getLang() === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' }) })}</small>}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
