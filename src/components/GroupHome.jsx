import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { dayLabel, timeRange } from '../utils/calendar'
import Icon from './Icon'
import LeadToday from './LeadToday'
import { useT } from '../utils/lang'

// Round E (Nov 10): the group home for members. Four parts, in this order:
// What's next, What's needed, My shifts and RSVPs, Chat. Everything else sits
// under "More about this group" on the page. Same for organizations and crews.
export default function GroupHome({ org, events, posts, chats, news, canManage, hasNeedsSpot, onOpen }) {
  const t = useT()
  const navigate = useNavigate()
  const [myShifts, setMyShifts] = useState(null)

  // My shifts: the shifts I took on this group's next few events.
  const soonIds = events.slice(0, 6).map((e) => e.id).join(',')
  useEffect(() => {
    const ids = soonIds ? soonIds.split(',') : []
    if (!ids.length) { setMyShifts([]); return }
    let alive = true
    Promise.all(ids.map((eid) => supabase.rpc('list_event_shifts', { p_event: Number(eid) }))).then((all) => {
      if (!alive) return
      const out = []
      all.forEach((res, i) => {
        if (res.error) { console.error('Failed to load shifts:', res.error); return }
        ;(res.data || []).filter((s) => s.mine).forEach((s) => out.push({ ...s, event_id: Number(ids[i]) }))
      })
      setMyShifts(out)
    })
    return () => { alive = false }
  }, [soonIds])

  const next = events.slice(0, 2)
  const needs = (posts || []).filter((p) => p.kind === 'need')
  const general = chats.find((c) => c.is_general)
  const smaller = chats.filter((c) => !c.is_general)
  const evById = Object.fromEntries(events.map((e) => [e.id, e]))
  const rsvps = events.filter((e) => e.is_signed_up)
  const shifts = myShifts || []
  // An event shows once: with its shift if I took one, else as a plain RSVP.
  const mineRows = [
    ...shifts.map((s) => ({ key: 's' + s.id, ev: evById[s.event_id], what: s.label || t('Shift'), when: s.starts_at ? dayLabel(s.starts_at) + ' ' + timeRange({ starts_at: s.starts_at, ends_at: s.ends_at }) : null })),
    ...rsvps.filter((e) => !shifts.some((s) => s.event_id === e.id)).map((e) => ({ key: 'r' + e.id, ev: e, what: t('Going'), when: null })),
  ].filter((r) => r.ev)

  return (
    <div className="gh" aria-label={t('Home for {name}', { name: org.name })}>
      {/* Round E part 3: leaders see Today first. */}
      {canManage && <LeadToday orgId={org.id} onOpen={onOpen} />}
      <section className="gh-part" aria-labelledby="gh-next">
        <h2 id="gh-next"><Icon name="calendar" /> {t("What's next")}</h2>
        {next.length === 0 && <p className="gh-empty">{t('Nothing planned yet.')}</p>}
        {next.map((ev) => (
          <button key={ev.id} type="button" className="vs-row" onClick={() => navigate('/events/' + ev.id)}>
            <span aria-hidden="true"><Icon name="calendar" /></span> {ev.title}
            <small>{dayLabel(ev.starts_at)} {timeRange(ev)}{ev.partner_host ? ' · ' + t('Hosted by {host}', { host: ev.partner_host }) : ''}{ev.is_signed_up ? ' · ' + t("You're signed up") : ''}</small>
          </button>
        ))}
        <div className="gh-more">
          {events.length > next.length && <button type="button" className="gh-link" onClick={() => onOpen('events')}>{t('See all {n} events', { n: events.length })}</button>}
          {canManage && <button type="button" className="gh-link" onClick={() => navigate('/calendar/new')}>{t('Post an event')}</button>}
        </div>
      </section>

      <section className="gh-part" aria-labelledby="gh-need">
        <h2 id="gh-need"><Icon name="heart-hands" /> {t("What's needed")}</h2>
        {posts === null && <p className="gh-empty" role="status">{t('Loading...')}</p>}
        {posts && needs.length === 0 && <p className="gh-empty">{t('Nothing needed right now.')}</p>}
        {needs.slice(0, 3).map((p) => (
          <button key={'n' + p.id} type="button" className="vs-row" disabled={p.full} onClick={() => (hasNeedsSpot ? onOpen('needs') : navigate('/skillshare'))}>
            <span aria-hidden="true"><Icon name="heart-hands" /></span> {p.title ? t(p.title) : t('A need')}
            <small>{p.description ? p.description.slice(0, 80) : t('Need')}{p.full ? ' (' + t('has enough helpers') + ')' : ''}</small>
          </button>
        ))}
        <div className="gh-more">
          {hasNeedsSpot
            ? <button type="button" className="gh-link" onClick={() => onOpen('needs')}>{t('Needs and what we share')}</button>
            : <button type="button" className="gh-link" onClick={() => onOpen('share')}>{t('Supplies we keep')}</button>}
        </div>
      </section>

      <section className="gh-part" aria-labelledby="gh-mine">
        <h2 id="gh-mine"><Icon name="check" /> {t('My shifts and RSVPs')}</h2>
        {myShifts === null && <p className="gh-empty" role="status">{t('Loading...')}</p>}
        {myShifts !== null && mineRows.length === 0 && <p className="gh-empty">{t('You have not signed up for anything yet.')}</p>}
        {mineRows.map((r) => (
          <button key={r.key} type="button" className="vs-row" onClick={() => navigate('/events/' + r.ev.id)}>
            <span aria-hidden="true"><Icon name="check" /></span> {r.ev.title}
            <small>{r.what}{' · '}{r.when || (dayLabel(r.ev.starts_at) + ' ' + timeRange(r.ev))}</small>
          </button>
        ))}
      </section>

      <section className="gh-part" aria-labelledby="gh-chat">
        <h2 id="gh-chat"><Icon name="campfire" /> {t('Chat')}</h2>
        {general
          ? <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/groups/' + general.id)}><Icon name="campfire" /> {t('Open the general chat')}</button>
          : <p className="gh-empty">{canManage ? t('No general chat yet. Start it from your tools.') : t('No general chat yet.')}</p>}
        <div className="gh-more">
          {news && <button type="button" className="gh-link" onClick={() => navigate('/groups/' + news.id)}><Icon name="megaphone" /> {t('Announcements')}</button>}
          {smaller.length > 0 && <button type="button" className="gh-link" onClick={() => onOpen('fires')}>{smaller.length === 1 ? t('1 smaller Campfire') : t('{n} smaller Campfires', { n: smaller.length })}</button>}
        </div>
      </section>

      <div className="gh-decide">
        <button type="button" className="btn btn-outline" onClick={() => onOpen('rules')}><Icon name="clipboard" /> {t('Handbook')}</button>
        <button type="button" className="btn btn-outline" onClick={() => onOpen('decide')}><Icon name="scroll" /> {t('Decide something')}</button>
      </div>
    </div>
  )
}
