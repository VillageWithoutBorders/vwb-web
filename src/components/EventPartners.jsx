import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { askConfirm } from './AdminDialog'
import { useT } from '../utils/lang'

// Round F part 2 (Nov 11): partner groups on one shared event (vwb-event-teams-partners.sql).
// The host's organizers tag groups; a partner's Heads say yes or no; only yes shows.
// A partner's leaders can open the plan (their own team) or leave. The host can remove a tag.

export function useEventPartners(eventId, token, user) {
  const [rows, setRows] = useState([])
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_event_partners', { p_event: Number(eventId), p_token: token || null })
    if (error) { if (error.code !== 'PGRST202') console.error('list_event_partners', error); setRows([]); return }
    setRows(data || [])
  }, [eventId, token])
  useEffect(() => { load() }, [load, user?.id])
  return [rows, load]
}

// "Hosted by APC, with Library Friends and Pride Center"
export function hostedLine(t, host, rows) {
  const with_ = (rows || []).filter((r) => r.status === 'accepted').map((r) => r.name)
  if (!with_.length) return host
  const list = with_.length === 1 ? with_[0] : with_.slice(0, -1).join(', ') + ' ' + t('and') + ' ' + with_[with_.length - 1]
  return t('Hosted by {host}, with {partners}', { host, partners: list })
}

// For a partner group's Heads and leaders, near the top of the event.
export function PartnerAnswer({ eventId, rows, hostName, onChanged }) {
  const t = useT()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const asks = rows.filter((r) => r.status === 'pending' && r.i_head)
  const leads = rows.filter((r) => r.status === 'accepted' && r.i_lead)
  if (!asks.length && !leads.length) return null
  async function answer(r, yes) {
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('answer_event_partner', { p_event: Number(eventId), p_org: r.org_id, p_yes: yes })
    setBusy(false)
    if (error) { console.error('answer_event_partner', error); setMsg(t("We couldn't save that. Try again.")); return }
    setMsg(yes ? t('{name} is now a partner on this event.', { name: r.name }) : t('Got it. {name} said no.', { name: r.name }))
    onChanged()
  }
  async function leave(r) {
    if (!(await askConfirm(t('Take {name} off this event? Your teams and their slots move to the host.', { name: r.name }), { yes: t('Leave the event'), no: t('Stay') }))) return
    setBusy(true)
    const { error } = await supabase.rpc('end_event_partner', { p_event: Number(eventId), p_org: r.org_id })
    setBusy(false)
    if (error) { console.error('end_event_partner', error); setMsg(t("We couldn't save that. Try again.")); return }
    onChanged()
  }
  return (
    <section className="cal-box partner-box" aria-labelledby="partner-h">
      <h2 id="partner-h">{t('Partner groups')}</h2>
      {asks.map((r) => (
        <div key={r.org_id} className="partner-ask">
          <p>{t('{host} asked {name} to host this event with them. It would show on your page and calendar, and your members could sign up.', { host: hostName || t('A group'), name: r.name })}</p>
          <div className="plan-btns">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => answer(r, true)}>{t('Yes, co-host')}</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => answer(r, false)}>{t('No thanks')}</button>
          </div>
        </div>
      ))}
      {leads.map((r) => (
        <div key={r.org_id} className="partner-ask">
          <p>{t('{name} is a partner on this event. You can run your own team in the plan.', { name: r.name })}</p>
          <div className="plan-btns">
            <button type="button" className="btn btn-primary" onClick={() => navigate('/calendar/' + eventId + '/plan')}>{t('Open the plan')}</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => leave(r)}>{t('Leave the event')}</button>
          </div>
        </div>
      ))}
      {msg && <p className="rsvp-msg" role="status">{msg}</p>}
    </section>
  )
}

// For the host's organizers, inside Organizer tools.
export function PartnerTags({ eventId, rows, onChanged }) {
  const t = useT()
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return }
    const tm = setTimeout(async () => {
      const { data, error } = await supabase.rpc('event_partner_search', { p_event: Number(eventId), p_query: q.trim() })
      if (error) { console.error('event_partner_search', error); return }
      const have = new Set(rows.filter((r) => r.status === 'pending' || r.status === 'accepted').map((r) => r.org_id))
      setFound((data || []).filter((o) => !have.has(o.org_id)))
    }, 300)
    return () => clearTimeout(tm)
  }, [q, eventId, rows])
  async function tag(o) {
    setMsg('')
    const { error } = await supabase.rpc('tag_event_partner', { p_event: Number(eventId), p_org: o.org_id })
    if (error) { console.error('tag_event_partner', error); setMsg(['22023', 'P0002'].includes(error.code) ? error.message : t("We couldn't save that. Try again.")); return }
    setQ(''); setFound([]); setMsg(t('Asked {name}. Their Heads get an alert to say yes or no.', { name: o.name })); onChanged()
  }
  async function remove(r) {
    if (!(await askConfirm(t('Remove {name} from this event? Their teams and slots move to you.', { name: r.name }), { yes: t('Remove'), no: t('Keep them') }))) return
    const { error } = await supabase.rpc('end_event_partner', { p_event: Number(eventId), p_org: r.org_id })
    if (error) { console.error('end_event_partner', error); setMsg(t("We couldn't save that. Try again.")); return }
    onChanged()
  }
  const STATUS = { pending: 'Waiting for their answer', accepted: 'Co-hosting', declined: 'Said no', left: 'Left the event', removed: 'Removed' }
  return (
    <div className="partner-tags">
      <h2 style={{ marginTop: '1rem' }}>{t('Partner groups')}</h2>
      <p className="cal-sub" style={{ marginTop: 0 }}>{t('Host this as one event with other groups. It shows on their page and calendar too, and their members can sign up.')}</p>
      {rows.length > 0 && (
        <ul className="task-list">
          {rows.map((r) => (
            <li key={r.org_id} className="partner-row">
              <span><b>{r.name}</b><small>{t(STATUS[r.status] || r.status)}</small></span>
              {(r.status === 'pending' || r.status === 'accepted') && <button type="button" className="btn btn-outline" onClick={() => remove(r)}>{t('Remove')}</button>}
            </li>
          ))}
        </ul>
      )}
      <label htmlFor="partner-q">{t('Add a partner group')}</label>
      <input id="partner-q" type="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Type the group name')} />
      {found.map((o) => (
        <div key={o.org_id} className="partner-row">
          <span>{o.name}</span>
          <button type="button" className="btn btn-primary" onClick={() => tag(o)}>{t('Ask')}</button>
        </div>
      ))}
      {msg && <p className="rsvp-msg" role="status">{msg}</p>}
    </div>
  )
}
