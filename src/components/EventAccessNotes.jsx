import { ACCESS_CHOICES, ACCESS_TEXTS } from '../utils/eventAccess'
import { useT } from '../utils/lang'

// Round E part 4 (Nov 10): "What to expect" on the event page (also the public page).
export default function EventAccessNotes({ info }) {
  const t = useT()
  const a = (info && info.access) || {}
  const rows = [
    ...Object.entries(ACCESS_CHOICES).filter(([k]) => a[k]).map(([k, c]) => [t(c.label), t((c.options.find(([v]) => v === a[k]) || [])[1] || '')]),
    ...['quiet_room', 'entry', 'look_for'].filter((k) => a[k]).map((k) => [t(ACCESS_TEXTS[k].label), a[k]]),
  ]
  const order = (a.order || '').split('\n').map((x) => x.trim()).filter(Boolean)
  if (!rows.length && !order.length && !info?.entry_hidden) return null
  return (
    <section className="cal-box acc-view" aria-labelledby="acc-h">
      <h2 id="acc-h">{t('What to expect')}</h2>
      {rows.length > 0 && (
        <dl className="acc-list">
          {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
      {info?.entry_hidden && <p className="cal-sub">{t('Parking and entry are shared with people who sign up.')}</p>}
      {order.length > 0 && <>
        <h3>{t('What happens, in order')}</h3>
        <ol className="acc-order">{order.map((x, i) => <li key={i}>{x}</li>)}</ol>
      </>}
    </section>
  )
}
