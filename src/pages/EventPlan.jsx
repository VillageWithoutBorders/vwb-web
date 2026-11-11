import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchCalendarEvent } from '../utils/calendar'
import BackLink from '../components/BackLink'
import { askConfirm } from '../components/AdminDialog'
import { useT, getLang } from '../utils/lang'

// Round F part 1 (Nov 11): Plan this event (vwb-event-plans.sql). For the event's
// organizers. Roles with time slots, a checklist, and the run of show (the event's
// "What happens, in order", which also shows on the public page).
// Teams with their own chats and partner groups come in part 2.

const TABS = [['roles', 'Roles'], ['tasks', 'Checklist'], ['show', 'Run of show']]

function pad(n) { return String(n).padStart(2, '0') }
function dateIn(iso) { const d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
function timeIn(iso) { const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()) }
function toIso(date, time) { if (!date || !time) return null; const d = new Date(date + 'T' + time); return isNaN(d) ? null : d.toISOString() }

function emptyRole(ev) {
  const day = ev ? dateIn(ev.starts_at) : ''
  return { id: null, name: '', what: '', bring: '', good_to_know: '', slots: [{ id: null, date: day, start: ev ? timeIn(ev.starts_at) : '', end: '', capacity: '2' }] }
}

export default function EventPlan() {
  const t = useT()
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'roles'
  const [ev, setEv] = useState(null)
  const [loading, setLoading] = useState(true)
  const [roles, setRoles] = useState([])
  const [edit, setEdit] = useState(null)
  const [tasks, setTasks] = useState([])
  const [people, setPeople] = useState([])
  const [newTask, setNewTask] = useState({ task: '', who: '', due_on: '' })
  const [show, setShow] = useState('')
  const [access, setAccess] = useState({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const loadRoles = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_event_roles', { p_event: Number(id), p_token: null })
    if (error) { console.error('list_event_roles', error); return null }
    setRoles(data?.roles || [])
    return data
  }, [id])
  const loadTasks = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_event_tasks', { p_event: Number(id) })
    if (error) { console.error('list_event_tasks', error); return }
    setTasks(data || [])
  }, [id])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { event } = await fetchCalendarEvent(id, null)
      if (!alive) return
      setEv(event); setLoading(false)
      if (!event || !event.can_manage) return
      const d = await loadRoles()
      if (d && !d.plan_on) supabase.rpc('set_event_plan_on', { p_event: Number(id), p_on: true }).then(({ error }) => { if (error) console.error('set_event_plan_on', error) })
      loadTasks()
      supabase.rpc('event_plan_people', { p_event: Number(id) }).then(({ data, error }) => { if (error) console.error('event_plan_people', error); setPeople(data || []) })
      supabase.from('calendar_events').select('access').eq('id', Number(id)).maybeSingle().then(({ data, error }) => {
        if (error) { console.error('Failed to load run of show:', error); return }
        setAccess(data?.access || {}); setShow((data?.access && data.access.order) || '')
      })
    })()
    return () => { alive = false }
  }, [id, loadRoles, loadTasks])

  if (loading) return <div className="cal-page"><p role="status">{t('Loading...')}</p></div>
  if (!ev || !ev.can_manage) {
    return <div className="cal-page"><h1>{t('Plan this event')}</h1><p>{t('Only the organizers of this event can plan it.')}</p>
      <button type="button" className="btn btn-outline" onClick={() => navigate('/events/' + id)}>{t('Back to the event')}</button></div>
  }

  const setTab = (k) => { const n = new URLSearchParams(params); n.set('tab', k); setParams(n, { replace: true }); setNote('') }

  function startEdit(r) {
    if (!r) { setEdit(emptyRole(ev)); return }
    setEdit({ id: r.id, name: r.name, what: r.what || '', bring: r.bring || '', good_to_know: r.good_to_know || '',
      slots: (r.slots || []).map((s) => ({ id: s.id, date: s.starts_at ? dateIn(s.starts_at) : dateIn(ev.starts_at), start: s.starts_at ? timeIn(s.starts_at) : '', end: s.ends_at ? timeIn(s.ends_at) : '', capacity: String(s.capacity), taken: s.taken })) })
  }
  async function saveRole(e) {
    e.preventDefault()
    if (!edit.name.trim()) { setNote(t('Give the role a name.')); return }
    const slots = edit.slots.map((s) => ({ id: s.id, starts_at: toIso(s.date, s.start), ends_at: toIso(s.date, s.end), capacity: Number(s.capacity) }))
    if (slots.some((s) => !s.capacity || s.capacity < 1)) { setNote(t('Each time slot needs how many people.')); return }
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('save_event_role', { p_event: Number(id), p_role: { id: edit.id, name: edit.name, what: edit.what, bring: edit.bring, good_to_know: edit.good_to_know, slots } })
    setBusy(false)
    if (error) { console.error('save_event_role', error); setNote(['22023', 'P0001'].includes(error.code) ? error.message : t("We couldn't save that. Try again.")); return }
    setEdit(null); loadRoles()
  }
  async function removeRole(r) {
    const taken = (r.slots || []).reduce((a, s) => a + s.taken, 0)
    if (!(await askConfirm(taken ? t('Remove "{role}"? {n} people took slots. They get an alert.', { role: r.name, n: taken }) : t('Remove "{role}"?', { role: r.name }), { yes: t('Remove'), no: t('Keep it') }))) return
    const { error } = await supabase.rpc('delete_event_role', { p_role: r.id })
    if (error) { console.error('delete_event_role', error); setNote(t("We couldn't save that. Try again.")); return }
    loadRoles()
  }
  async function addTask(e) {
    e.preventDefault()
    if (!newTask.task.trim()) return
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('save_event_task', { p_event: Number(id), p_task: { task: newTask.task, who: newTask.who || null, due_on: newTask.due_on || null } })
    setBusy(false)
    if (error) { console.error('save_event_task', error); setNote(error.code === '22023' ? error.message : t("We couldn't save that. Try again.")); return }
    setNewTask({ task: '', who: '', due_on: '' }); loadTasks()
  }
  async function tick(x) {
    const { error } = await supabase.rpc('set_event_task_done', { p_task: x.id, p_done: !x.done })
    if (error) { console.error('set_event_task_done', error); return }
    loadTasks()
  }
  async function reassign(x, who) {
    const { error } = await supabase.rpc('save_event_task', { p_event: Number(id), p_task: { id: x.id, task: x.task, who: who || null, due_on: x.due_on } })
    if (error) { console.error('save_event_task', error); setNote(t("We couldn't save that. Try again.")); return }
    loadTasks()
  }
  async function removeTask(x) {
    const { error } = await supabase.rpc('delete_event_task', { p_task: x.id })
    if (error) { console.error('delete_event_task', error); return }
    loadTasks()
  }
  async function saveShow(e) {
    e.preventDefault()
    setBusy(true); setNote('')
    const next = { ...(access || {}) }
    const clean = show.split('\n').map((l) => l.trim()).filter(Boolean).join('\n').slice(0, 1000)
    if (clean) next.order = clean; else delete next.order
    const { error } = await supabase.from('calendar_events').update({ access: Object.keys(next).length ? next : null }).eq('id', Number(id))
    setBusy(false)
    if (error) { console.error('Failed to save run of show:', error); setNote(t("We couldn't save that. Try again.")); return }
    setAccess(next); setNote(t('Saved. It shows on the event page as What happens, in order.'))
  }

  const fmtDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString(getLang() === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' })
  const openSlots = roles.reduce((a, r) => a + (r.slots || []).reduce((b, s) => b + Math.max(0, s.capacity - s.taken), 0), 0)
  const doneCount = tasks.filter((x) => x.done).length

  return (
    <div className="cal-page plan-page">
      <BackLink fallback={'/events/' + id} fallbackLabel={ev.title} />
      <h1>{t('Plan: {title}', { title: ev.title })}</h1>
      <p className="cal-sub">{t('{a} open spots in roles. {b} of {c} tasks done.', { a: openSlots, b: doneCount, c: tasks.length })}</p>
      <div role="tablist" aria-label={t('Parts of the plan')} className="hub-tabs hub-tabs-three plan-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={'plan-tab' + (tab === k ? ' is-on' : '')} onClick={() => setTab(k)}>{t(label)}</button>
        ))}
      </div>
      {note && <p className="rsvp-msg" role="status">{note}</p>}

      {tab === 'roles' && !edit && (
        <section aria-label={t('Roles')}>
          {roles.length === 0 && <p className="cal-sub">{t('No roles yet. A role is a job, like Table host or Guide, with time slots people can take.')}</p>}
          {roles.map((r) => (
            <article key={r.id} className="cal-box plan-role">
              <h2>{r.name}</h2>
              {r.what && <p><b>{t("What you'll do")}:</b> {r.what}</p>}
              <ul className="plan-slots">
                {(r.slots || []).map((s) => (
                  <li key={s.id}>{s.starts_at ? new Date(s.starts_at).toLocaleString(getLang() === 'es' ? 'es-US' : 'en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : t('Any time')}{' · '}{t('{n} of {total} filled', { n: s.taken, total: s.capacity })}{s.handoff_note ? ' · ' + t('Has a note') : ''}</li>
                ))}
              </ul>
              <div className="plan-btns">
                <button type="button" className="btn btn-outline" onClick={() => startEdit(r)}>{t('Edit')}</button>
                <button type="button" className="btn btn-outline" onClick={() => removeRole(r)}>{t('Remove')}</button>
              </div>
            </article>
          ))}
          <button type="button" className="btn btn-primary btn-full" onClick={() => startEdit(null)}>{t('Add a role')}</button>
        </section>
      )}

      {tab === 'roles' && edit && (
        <form className="cal-box plan-form" onSubmit={saveRole} noValidate>
          <h2>{edit.id ? t('Edit role') : t('New role')}</h2>
          <label htmlFor="pr-name">{t('Role name')}</label>
          <input id="pr-name" type="text" maxLength={60} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder={t('For example: Table host')} />
          <label htmlFor="pr-what">{t("What you'll do")}</label>
          <textarea id="pr-what" rows={3} maxLength={500} value={edit.what} onChange={(e) => setEdit({ ...edit, what: e.target.value })} placeholder={t('For example: Greet people, hand out stickers, answer questions.')} />
          <label htmlFor="pr-bring">{t('Bring')}</label>
          <input id="pr-bring" type="text" maxLength={300} value={edit.bring} onChange={(e) => setEdit({ ...edit, bring: e.target.value })} placeholder={t('For example: Water and a chair')} />
          <label htmlFor="pr-know">{t('Good to know')}</label>
          <textarea id="pr-know" rows={2} maxLength={500} value={edit.good_to_know} onChange={(e) => setEdit({ ...edit, good_to_know: e.target.value })} placeholder={t('For example: You can sit the whole time. Breaks any time.')} />
          <fieldset className="plan-slot-edit">
            <legend>{t('Time slots')}</legend>
            {edit.slots.map((s, i) => (
              <div key={i} className="plan-slot-row">
                <label>{t('Day')}<input type="date" value={s.date} onChange={(e) => setEdit({ ...edit, slots: edit.slots.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} /></label>
                <label>{t('Starts')}<input type="time" value={s.start} onChange={(e) => setEdit({ ...edit, slots: edit.slots.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} /></label>
                <label>{t('Ends')}<input type="time" value={s.end} onChange={(e) => setEdit({ ...edit, slots: edit.slots.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} /></label>
                <label>{t('People')}<input type="number" inputMode="numeric" min={1} max={100} value={s.capacity} onChange={(e) => setEdit({ ...edit, slots: edit.slots.map((x, j) => (j === i ? { ...x, capacity: e.target.value } : x)) })} /></label>
                <button type="button" className="btn btn-outline" disabled={s.taken > 0} onClick={() => setEdit({ ...edit, slots: edit.slots.filter((_, j) => j !== i) })}>{s.taken > 0 ? t('Taken') : t('Remove')}</button>
              </div>
            ))}
            {edit.slots.length < 20 && (
              <button type="button" className="btn btn-outline btn-full" onClick={() => {
                const last = edit.slots[edit.slots.length - 1]
                setEdit({ ...edit, slots: [...edit.slots, { id: null, date: last ? last.date : dateIn(ev.starts_at), start: last ? last.end : '', end: '', capacity: last ? last.capacity : '2' }] })
              }}>{t('Add a time slot')}</button>
            )}
          </fieldset>
          <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{busy ? t('Saving...') : t('Save role')}</button>
          <button type="button" className="btn btn-outline btn-full" onClick={() => { setEdit(null); setNote('') }}>{t('Cancel')}</button>
        </form>
      )}

      {tab === 'tasks' && (
        <section aria-label={t('Checklist')}>
          <form className="cal-box plan-form" onSubmit={addTask} noValidate>
            <label htmlFor="pt-task">{t('New task')}</label>
            <input id="pt-task" type="text" maxLength={200} value={newTask.task} onChange={(e) => setNewTask({ ...newTask, task: e.target.value })} placeholder={t('For example: Print 50 flyers')} />
            <label htmlFor="pt-who">{t('Who')}</label>
            <select id="pt-who" value={newTask.who} onChange={(e) => setNewTask({ ...newTask, who: e.target.value })}>
              <option value="">{t('Nobody yet')}</option>
              {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}
            </select>
            <label htmlFor="pt-due">{t('By when')}</label>
            <input id="pt-due" type="date" value={newTask.due_on} onChange={(e) => setNewTask({ ...newTask, due_on: e.target.value })} />
            <button type="submit" className="btn btn-primary btn-full" disabled={busy || !newTask.task.trim()}>{t('Add task')}</button>
          </form>
          {tasks.length === 0 && <p className="cal-sub">{t('No tasks yet.')}</p>}
          <ul className="task-list">
            {tasks.map((x) => (
              <li key={x.id} className="plan-task">
                <label className={'cal-choice' + (x.done ? ' is-on' : '')}>
                  <input type="checkbox" checked={x.done} onChange={() => tick(x)} />
                  <span>{x.task}{x.due_on && <small>{t('By {day}', { day: fmtDay(x.due_on) })}</small>}</span>
                </label>
                <div className="plan-btns">
                  <label className="sr-only" htmlFor={'who-' + x.id}>{t('Who')}</label>
                  <select id={'who-' + x.id} value={x.who || ''} onChange={(e) => reassign(x, e.target.value)}>
                    <option value="">{t('Nobody yet')}</option>
                    {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}
                  </select>
                  <button type="button" className="btn btn-outline" onClick={() => removeTask(x)}>{t('Remove')}</button>
                </div>
              </li>
            ))}
          </ul>
          <p className="field-hint">{t('People see only the tasks given to them, on the event page. They get an alert when you give them one.')}</p>
        </section>
      )}

      {tab === 'show' && (
        <form className="cal-box plan-form" onSubmit={saveShow} noValidate>
          <label htmlFor="ps-show">{t('What happens, in order')}</label>
          <textarea id="ps-show" rows={10} maxLength={1000} value={show} onChange={(e) => setShow(e.target.value)} placeholder={t('One thing per line. For example:\n10:00 Doors open\n10:30 Welcome\n11:00 Games')} />
          <p className="field-hint">{t('Shows on the event page, and on the public page if the event is public.')}</p>
          <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{busy ? t('Saving...') : t('Save')}</button>
        </form>
      )}

      <p className="field-hint plan-next">{t('Coming next: teams with their own chats, and partner groups on the same event.')}</p>
    </div>
  )
}
