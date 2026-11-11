import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { usePlaceReportCount } from './PlaceReports'
import { dayLabel } from '../utils/calendar'
import Icon from './Icon'
import { useT } from '../utils/lang'

// Round E part 3 (Nov 10): Today, for Heads and organizers (Keepers and Helpers).
// One list of what needs a leader now, one button each (vwb-handbook-and-today.sql).
// Report counts come from the place reports list, so only report readers see them.
// "closes tomorrow", not "closes Tomorrow".
function dayWord(iso) {
  const s = dayLabel(iso)
  return /^(Today|Tomorrow|Hoy|Mañana)$/.test(s) ? s.toLowerCase() : s
}

export default function LeadToday({ orgId, onOpen }) {
  const t = useT()
  const navigate = useNavigate()
  const [d, setD] = useState(null)
  const reports = usePlaceReportCount('org', orgId)

  useEffect(() => {
    let alive = true
    supabase.rpc('org_lead_today', { p_org: orgId }).then(({ data, error }) => {
      if (!alive) return
      if (error) { if (error.code !== 'PGRST202') console.error('Failed to load Today:', error); setD({ ok: false }); return }
      setD(data || { ok: false })
    })
    return () => { alive = false }
  }, [orgId])

  if (!d || !d.ok) return null
  const dash = '/orgs/' + orgId + '/dashboard'
  const items = [
    ...(d.partner_asks || []).slice(0, 3).map((x) => ({ k: 'p' + x.event_id, icon: 'people', text: t('{host} asked you to co-host {title}', { host: x.host || t('A group'), title: x.title }), btn: t('Answer'), tip: t('Open the event and say yes or no to co-hosting.'), go: () => navigate('/events/' + x.event_id) })),
    reports > 0 && { k: 'r', icon: 'flag', text: reports === 1 ? t('1 report to look at') : t('{n} reports to look at', { n: reports }), btn: t('Look'), tip: t('See the reports in your dashboard.'), go: () => navigate(dash + '?tab=people') },
    d.asks > 0 && { k: 'a', icon: 'raise-hand', text: d.asks === 1 ? t('1 person asked to join') : t('{n} people asked to join', { n: d.asks }), btn: t('Answer'), tip: t('Say yes or no to the people who asked to join.'), go: () => navigate(dash + '?tab=people') },
    ...(d.shifts || []).slice(0, 3).map((s, i) => ({ k: 's' + i, icon: 'calendar',
      text: t('{title}, {day}: {label} needs {n} more', { title: s.title, day: dayWord(s.starts_at), label: s.label, n: s.open }), btn: t('Open'), tip: t('Open the event to fill the open spots.'), go: () => navigate('/events/' + s.event_id) })),
    d.needs_no_offers > 0 && { k: 'n', icon: 'heart-hands', text: d.needs_no_offers === 1 ? t('1 need has no offers yet') : t('{n} needs have no offers yet', { n: d.needs_no_offers }), btn: t('See'), tip: t('See the needs that no one has offered to help with yet.'), go: () => onOpen('needs') },
    ...(d.decisions || []).slice(0, 2).map((x) => ({ k: 'd' + x.id, icon: 'scroll', text: t('Deciding "{title}" closes {day}', { title: x.title, day: dayWord(x.closes_at) }), btn: t('Open'), tip: t('Open the decision and have your say.'), go: () => onOpen('rules') })),
    d.joined_week > 0 && { k: 'j', icon: 'people', text: d.joined_week === 1 ? t('1 person joined this week') : t('{n} people joined this week', { n: d.joined_week }), btn: t('Say hi'), tip: t('Open your Campfires to welcome the new people.'), go: () => onOpen('fires') },
  ].filter(Boolean)

  return (
    <section className="gh-part gh-today" aria-labelledby="gh-today">
      <h2 id="gh-today"><Icon name="sun" /> {t('Today')}</h2>
      {items.length === 0 && <p className="gh-empty">{t('All caught up.')}</p>}
      {items.map((it) => (
        <div key={it.k} className="gh-today-row">
          <span className="gh-today-ic" aria-hidden="true"><Icon name={it.icon} /></span>
          <span className="gh-today-text">{it.text}</span>
          <button type="button" className="btn btn-outline gh-today-btn" onClick={it.go} data-tip={it.tip}>{it.btn}</button>
        </div>
      ))}
    </section>
  )
}
