import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchCalendarEvent } from '../utils/calendar'
import BackLink from '../components/BackLink'
import { askConfirm } from '../components/AdminDialog'
import { useEventPartners } from '../components/EventPartners'
import { useT, getLang } from '../utils/lang'

// Round F part 1 (Nov 11): Plan this event (vwb-event-plans.sql). For the event's
// organizers. Roles with time slots, a checklist, and the run of show (the event's
// "What happens, in order", which also shows on the public page).
// Part 2 (Nov 11): teams, each with its own chat, and partner groups. Partner leaders
// see the whole plan but change only their own group's teams, roles, and tasks.

const TABS = [['roles', 'Roles'], ['tasks', 'Checklist'], ['teams', 'Teams'], ['show', 'Run of show']]

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
  const [canPlan, setCanPlan] = useState(false)
  const [teams, setTeams] = useState([])
  const [newTeam, setNewTeam] = useState({ name: '', org_id: '' })
  const [partners] = useEventPartners(id, null, null)

  const loadRoles = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_event_roles', { p_event: Number(id), p_token: null })
    if (error) { console.error('list_event_roles', error); return null }
    setRoles(data?.roles || [])
    return data
  }, [id])
  const loadTeams = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_event_teams', { p_event: Number(id), p_token: null })
    if (error) { if (error.code !== 'PGRST202') console.error('list_event_teams', error); return }
    setTeams(data || [])
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
      if (!event) { setEv(null); setLoading(false); return }
      const d = await loadRoles()
      if (!alive) return
      setEv(event); setCanPlan(!!(d && (d.can_plan || d.can_manage))); setLoading(false)
      if (!d || !(d.can_plan || d.can_manage)) return
      loadTeams()
      if (event.can_manage && !d.plan_on) supabase.rpc('set_event_plan_on', { p_event: Number(id), p_on: true }).then(({ error }) => { if (error) console.error('set_event_plan_on', error) })
      loadTasks()
      supabase.rpc('event_plan_people', { p_event: Number(id) }).then(({ data, error }) => { if (error) console.error('event_plan_people', error); setPeople(data || []) })
      supabase.rpc('get_event_access', { p_id: Number(id), p_token: null }).then(({ data, error }) => {
        if (error) { console.error('Failed to load run of show:', error); return }
        setAccess(data?.access || {}); setShow((data?.access && data.access.order) || '')
      })
    })()
    return () => { alive = false }
  }, [id, loadRoles, loadTasks, loadTeams])

  if (loading) return <div className="cal-page"><p role="status">{t('Loading...')}</p></div>
  if (!ev || !canPlan) {
    return <div className="cal-page"><h1>{t('Plan this event')}</h1><p>{t('Only the organizers of this event can plan it.')}</p>
      <button type="button" className="btn btn-outline" onClick={() => navigate('/events/' + id)}>{t('Back to the event')}</button></div>
  }

  const setTab = (k) => { const n = new URLSearchParams(params); n.set('tab', k); setParams(n, { replace: true }); setNote('') }

  // Teams this person can put things in. Host organizers can also leave things with no team.
  const myTeams = teams.filter((x) => x.can_edit)
  const hostOrgs = [
    ...(ev.can_manage && ev.organization_id ? [{ org_id: ev.organization_id, name: ev.organization_name }] : []),
    ...partners.filter((r) => r.status === 'accepted' && (ev.can_manage || r.i_lead)).map((r) => ({ org_id: r.org_id, name: r.name })),
  ]
  const defaultTeam = ev.can_manage ? '' : (myTeams[0] ? String(myTeams[0].id) : '')
  function teamPicker(value, onChange, idFor) {
    if (!teams.length && ev.can_manage) return null
    return <>
      <label htmlFor={idFor}>{t('Team')}</label>
      <select id={idFor} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {ev.can_manage && <option value="">{t('No team')}</option>}
        {myTeams.map((x) => <option key={x.id} value={x.id}>{x.name}{x.org_name && x.org_id !== ev.organization_id ? ' (' + x.org_name + ')' : ''}</option>)}
      </select>
    </>
  }

  function startEdit(r) {
    if (!r) { setEdit({ ...emptyRole(ev), team_id: defaultTeam }); return }
    setEdit({ id: r.id, team_id: r.team_id ? String(r.team_id) : '', name: r.name, what: r.what || '', bring: r.bring || '', good_to_know: r.good_to_know || '',
      slots: (r.slots || []).map((s) => ({ id: s.id, date: s.starts_at ? dateIn(s.starts_at) : dateIn(ev.starts_at), start: s.starts_at ? timeIn(s.starts_at) : '', end: s.ends_at ? timeIn(s.ends_at) : '', capacity: String(s.capacity), taken: s.taken })) })
  }
  async function saveRole(e) {
    e.preventDefault()
    if (!edit.name.trim()) { setNote(t('Give the role a name.')); return }
    const slots = edit.slots.map((s) => ({ id: s.id, starts_at: toIso(s.date, s.start), ends_at: toIso(s.date, s.end), capacity: Number(s.capacity) }))
    if (slots.some((s) => !s.capacity || s.capacity < 1)) { setNote(t('Each time slot needs how many people.')); return }
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('save_event_role', { p_event: Number(id), p_role: { id: edit.id, team_id: edit.team_id || null, name: edit.name, what: edit.what, bring: edit.bring, good_to_know: edit.good_to_know, slots } })
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
    const { error } = await supabase.rpc('save_event_task', { p_event: Number(id), p_task: { task: newTask.task, who: newTask.who || null, due_on: newTask.due_on || null, team_id: (newTask.team_id ?? defaultTeam) || null } })
    setBusy(false)
    if (error) { console.error('save_event_task', error); setNote(error.code === '22023' ? error.message : t("We couldn't save that. Try again.")); return }
    setNewTask({ task: '', who: '', due_on: '', team_id: newTask.team_id }); loadTasks()
  }
  async function tick(x) {
    const { error } = await supabase.rpc('set_event_task_done', { p_task: x.id, p_done: !x.done })
    if (error) { console.error('set_event_task_done', error); return }
    loadTasks()
  }
  async function reassign(x, who) {
    const { error } = await supabase.rpc('save_event_task', { p_event: Number(id), p_task: { id: x.id, task: x.task, who: who || null, due_on: x.due_on, team_id: x.team_id } })
    if (error) { console.error('save_event_task', error); setNote(t("We couldn't save that. Try again.")); return }
    loadTasks()
  }
  async function removeTask(x) {
    const { error } = await supabase.rpc('delete_event_task', { p_task: x.id })
    if (error) { console.error('delete_event_task', error); return }
    loadTasks()
  }
  async function addTeam(e) {
    e.preventDefault()
    if (!newTeam.name.trim()) return
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('save_event_team', { p_event: Number(id), p_team: { name: newTeam.name, org_id: newTeam.org_id || (hostOrgs[0] && hostOrgs[0].org_id) || null } })
    setBusy(false)
    if (error) { console.error('save_event_team', error); setNote(['22023', '42501'].includes(error.code) ? error.message : t("We couldn't save that. Try again.")); return }
    setNewTeam({ name: '', org_id: newTeam.org_id }); loadTeams()
  }
  async function removeTeam(x) {
    if (!(await askConfirm(t('Remove the team "{name}"? Its roles and tasks stay, with no team.', { name: x.name }), { yes: t('Remove'), no: t('Keep it') }))) return
    const { error } = await supabase.rpc('delete_event_team', { p_team: x.id })
    if (error) { console.error('delete_event_team', error); setNote(t("We couldn't save that. Try again.")); return }
    loadTeams(); loadRoles(); loadTasks()
  }
  async function startTeamChat(x) {
    setBusy(true); setNote('')
    const { data: gen } = await supabase.from('community_groups').select('id').eq('organization_id', x.org_id).eq('is_general', true).maybeSingle()
    if (!gen) { setBusy(false); setNote(t("{name} needs a general chat first. Start it in the group's tools, then come back.", { name: x.org_name })); return }
    const { data: gid, error } = await supabase.rpc('start_sidechat', { p_parent: gen.id, p_name: (ev.title + ': ' + x.name).slice(0, 80), p_members: [] })
    if (error || !gid) { setBusy(false); console.error('start_sidechat', error); setNote(error?.message && error.message.length < 140 ? t(error.message) : t('Could not start the chat. Try again.')); return }
    const { error: linkErr } = await supabase.rpc('set_event_team_chat', { p_team: x.id, p_group: gid })
    setBusy(false)
    if (linkErr) { console.error('set_event_team_chat', linkErr); setNote(t("We couldn't save that. Try again.")); return }
    navigate('/groups/' + gid, { state: { justStarted: true } })
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
              {r.team_name && <p className="cal-sub plan-team-tag">{t('Team: {name}', { name: r.team_name })}</p>}
              {r.what && <p><b>{t("What you'll do")}:</b> {r.what}</p>}
              <ul className="plan-slots">
                {(r.slots || []).map((s) => (
                  <li key={s.id}>{s.starts_at ? new Date(s.starts_at).toLocaleString(getLang() === 'es' ? 'es-US' : 'en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : t('Any time')}{' · '}{t('{n} of {total} filled', { n: s.taken, total: s.capacity })}{s.handoff_note ? ' · ' + t('Has a note') : ''}</li>
                ))}
              </ul>
              {(r.can_edit ?? ev.can_manage) && (
                <div className="plan-btns">
                  <button type="button" className="btn btn-outline" onClick={() => startEdit(r)}>{t('Edit')}</button>
                  <button type="button" className="btn btn-outline" onClick={() => removeRole(r)}>{t('Remove')}</button>
                </div>
              )}
            </article>
          ))}
          {(ev.can_manage || myTeams.length > 0)
            ? <button type="button" className="btn btn-primary btn-full" onClick={() => startEdit(null)}>{t('Add a role')}</button>
            : <p className="field-hint">{t('Add a team for your group first (Teams tab). Then you can add roles to it.')}</p>}
        </section>
      )}

      {tab === 'roles' && edit && (
        <form className="cal-box plan-form" onSubmit={saveRole} noValidate>
          <h2>{edit.id ? t('Edit role') : t('New role')}</h2>
          {teamPicker(edit.team_id, (v) => setEdit({ ...edit, team_id: v }), 'pr-team')}
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
          {(ev.can_manage || myTeams.length > 0) && <form className="cal-box plan-form" onSubmit={addTask} noValidate>
            {teamPicker(newTask.team_id ?? defaultTeam, (v) => setNewTask({ ...newTask, team_id: v }), 'pt-team')}
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
          </form>}
          {tasks.length === 0 && <p className="cal-sub">{t('No tasks yet.')}</p>}
          <ul className="task-list">
            {tasks.map((x) => (
              <li key={x.id} className="plan-task">
                <label className={'cal-choice' + (x.done ? ' is-on' : '')}>
                  <input type="checkbox" checked={x.done} disabled={!(x.can_edit ?? true) && !x.mine} onChange={() => tick(x)} />
                  <span>{x.task}{x.due_on && <small>{t('By {day}', { day: fmtDay(x.due_on) })}</small>}{x.team_name && <small>{t('Team: {name}', { name: x.team_name })}</small>}{!(x.can_edit ?? true) && x.who_name && <small>{t('For {name}', { name: x.who_name })}</small>}</span>
                </label>
                {(x.can_edit ?? true) && <div className="plan-btns">
                  <label className="sr-only" htmlFor={'who-' + x.id}>{t('Who')}</label>
                  <select id={'who-' + x.id} value={x.who || ''} onChange={(e) => reassign(x, e.target.value)}>
                    <option value="">{t('Nobody yet')}</option>
                    {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}
                  </select>
                  <button type="button" className="btn btn-outline" onClick={() => removeTask(x)}>{t('Remove')}</button>
                </div>}
              </li>
            ))}
          </ul>
          <p className="field-hint">{t('People see only the tasks given to them, on the event page. They get an alert when you give them one.')}</p>
        </section>
      )}

      {tab === 'teams' && (
        <section aria-label={t('Teams')}>
          <p className="cal-sub">{t('A team is a group of people with its own jobs, like the welcome table. Each team can have its own chat.')}</p>
          {teams.length === 0 && <p className="cal-sub">{t('No teams yet.')}</p>}
          {teams.map((x) => (
            <article key={x.id} className="cal-box plan-role">
              <h2>{x.name}</h2>
              <p className="cal-sub plan-team-tag">{x.org_name}</p>
              <div className="plan-btns">
                {x.chat_group_id
                  ? <button type="button" className="btn btn-primary" onClick={() => navigate('/groups/' + x.chat_group_id)}>{t('Open team chat')}</button>
                  : x.can_edit && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => startTeamChat(x)}>{t('Start a team chat')}</button>}
                {x.can_edit && <button type="button" className="btn btn-outline" onClick={() => removeTeam(x)}>{t('Remove')}</button>}
              </div>
            </article>
          ))}
          {hostOrgs.length > 0 && (
            <form className="cal-box plan-form" onSubmit={addTeam} noValidate>
              <label htmlFor="ptm-name">{t('New team')}</label>
              <input id="ptm-name" type="text" maxLength={60} value={newTeam.name} onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })} placeholder={t('For example: Welcome table')} />
              {hostOrgs.length > 1 && <>
                <label htmlFor="ptm-org">{t('Which group runs it')}</label>
                <select id="ptm-org" value={newTeam.org_id || hostOrgs[0].org_id} onChange={(e) => setNewTeam({ ...newTeam, org_id: e.target.value })}>
                  {hostOrgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
                </select>
              </>}
              <button type="submit" className="btn btn-primary btn-full" disabled={busy || !newTeam.name.trim()}>{t('Add team')}</button>
            </form>
          )}
          <p className="field-hint">{t('Partner groups are added from the event page, under Organizer tools.')}</p>
        </section>
      )}

      {tab === 'show' && !ev.can_manage && (
        <section className="cal-box">
          <h2>{t('What happens, in order')}</h2>
          {show.trim() ? <ol className="acc-order">{show.split('\n').filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ol> : <p className="cal-sub">{t('Nothing yet.')}</p>}
          <p className="field-hint">{t('The host organizers write the run of show.')}</p>
        </section>
      )}
      {tab === 'show' && ev.can_manage && (
        <form className="cal-box plan-form" onSubmit={saveShow} noValidate>
          <label htmlFor="ps-show">{t('What happens, in order')}</label>
          <textarea id="ps-show" rows={10} maxLength={1000} value={show} onChange={(e) => setShow(e.target.value)} placeholder={t('One thing per line. For example:\n10:00 Doors open\n10:30 Welcome\n11:00 Games')} />
          <p className="field-hint">{t('Shows on the event page, and on the public page if the event is public.')}</p>
          <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{busy ? t('Saving...') : t('Save')}</button>
        </form>
      )}

    </div>
  )
}
