import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { askConfirm } from './AdminDialog'
import PlaceReports from './PlaceReports'
import { useT, getLang } from '../utils/lang'

// Care circle (Nov 7, Jade). A small group of members (2 to 5) who read
// reports about people in the group, instead of only the leaders. People
// serve for a set time, then the circle turns over. The database decides
// who reads what (vwb-care-circles.sql); this only shows it.
//
// where="page": on the group page, for every member (who is in the circle,
//   say yes or no when asked, step out, and the reports for circle members).
// where="dashboard": in the group dashboard, for Heads (ask people, choose
//   where reports go and how long people serve). `members` is the member list.

function day(iso) {
  return new Date(iso).toLocaleDateString(getLang() === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function CareCircle({ orgId, where = 'page', members = [] }) {
  const t = useT()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [pick, setPick] = useState('')
  const [goTo, setGoTo] = useState('leaders')
  const [term, setTerm] = useState(3)

  const load = useCallback(async () => {
    const { data: res, error } = await supabase.rpc('care_circle_for', { p_org: orgId })
    if (error) { console.error('Failed to load the care circle:', error); setNote(t("We couldn't load the care circle. Try again.")); return }
    setData(res)
    if (res?.ok) { setGoTo(res.reports_go_to || 'leaders'); setTerm(res.term_months || 3) }
  }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  if (!data || !data.ok) return note ? <p className="hub-note" role="alert">{note}</p> : null
  if (where === 'dashboard' && !data.is_head) return null

  async function run(fn, args, okText) {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) {
      console.error('Care circle change failed:', fn, error)
      setNote(error.message && error.message.length < 140 ? t(error.message) : t('Something went wrong. Try again.'))
      return false
    }
    if (okText) setNote(t(okText))
    await load()
    return true
  }

  const serving = data.serving || []
  const asked = data.asked || []
  const inCircle = new Set([...serving, ...asked].map((p) => p.user_id))
  const canAsk = members.filter((m) => !inCircle.has(m.user_id))
  const status = data.circle_on
    ? t('Reports about people in this group go to the care circle.')
    : data.reports_go_to === 'circle'
      ? t('Reports go to the leaders until at least 2 people are in the care circle.')
      : t('Reports about people in this group go to its leaders.')

  const list = (
    <>
      {serving.length === 0
        ? <p className="hub-empty">{t('No one is in the care circle yet.')}</p>
        : (
          <ul className="cc-list">
            {serving.map((p) => (
              <li key={p.user_id} className={where === 'dashboard' ? 'dash-row' : 'cc-person'}>
                <div className="dash-row-main"><strong>{p.name}</strong> <small>{t('Serving until {day}', { day: day(p.ends_at) })}</small></div>
                {where === 'dashboard' && (
                  <button type="button" className="btn btn-outline group-small-btn" disabled={busy}
                    onClick={async () => { if (await askConfirm(t('Take {name} out of the care circle?', { name: p.name }))) run('leave_care_circle', { p_org: orgId, p_user: p.user_id }, 'Done.') }}>
                    {t('Take out')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
    </>
  )

  if (where === 'dashboard') {
    return (
      <section className="hub-section" aria-labelledby="cc-h">
        <div className="hub-section-head"><h2 id="cc-h">{t('Care circle')}</h2></div>
        <p className="cc-text">{t('A care circle is 2 to 5 members who read reports about people in your group, instead of only the leaders. Leaders can be reported too, and the circle still sees it. People serve for a set time, then you ask someone new.')}</p>
        <p className="cc-text"><b>{status}</b></p>
        {list}
        {asked.length > 0 && (
          <>
            <p className="cal-sub">{t('Asked, waiting for an answer')}</p>
            <ul className="cc-list">
              {asked.map((p) => (
                <li key={p.user_id} className="dash-row">
                  <div className="dash-row-main"><strong>{p.name}</strong></div>
                  <button type="button" className="btn btn-outline group-small-btn" disabled={busy} onClick={() => run('leave_care_circle', { p_org: orgId, p_user: p.user_id }, 'Done.')}>{t('Cancel the ask')}</button>
                </li>
              ))}
            </ul>
          </>
        )}
        {serving.length + asked.length < 5 && canAsk.length > 0 && (
          <div className="cc-ask">
            <label htmlFor="cc-pick" className="cc-label">{t('Ask a member to join')}</label>
            <select id="cc-pick" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{t('Choose a member')}</option>
              {canAsk.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
            </select>
            <button type="button" className="btn btn-primary" disabled={busy || !pick}
              onClick={async () => { if (await run('ask_to_care_circle', { p_org: orgId, p_user: pick }, 'Asked. They say yes or no on the group page.')) setPick('') }}>
              {t('Ask')}
            </button>
          </div>
        )}
        <fieldset className="cc-rules" disabled={busy}>
          <legend className="cal-sub">{t('Where reports go')}</legend>
          <label className="gd-radio"><input type="radio" name="cc-go" checked={goTo === 'leaders'} onChange={() => setGoTo('leaders')} /><span>{t('To our leaders')}</span></label>
          <label className="gd-radio"><input type="radio" name="cc-go" checked={goTo === 'circle'} onChange={() => setGoTo('circle')} /><span>{t('To our care circle (needs at least 2 people)')}</span></label>
          <label htmlFor="cc-term" className="cc-label">{t('How long each person serves')}</label>
          <select id="cc-term" value={term} onChange={(e) => setTerm(Number(e.target.value))}>
            {[1, 3, 6].map((n) => <option key={n} value={n}>{t(n === 1 ? '1 month' : '{n} months', { n })}</option>)}
          </select>
          <button type="button" className="btn btn-primary btn-full cc-save" disabled={busy || (goTo === data.reports_go_to && term === data.term_months)}
            onClick={() => run('set_care_circle_rules', { p_org: orgId, p_reports_go_to: goTo, p_term_months: term }, 'Saved.')}>
            {busy ? t('Saving...') : t('Save')}
          </button>
        </fieldset>
        {note && <p className="hub-note" role="status">{note}</p>}
      </section>
    )
  }

  // The group page, for every member
  return (
    <section className="hub-section" aria-labelledby="cc-h">
      <div className="hub-section-head"><h2 id="cc-h">{t('Care circle')}</h2></div>
      <p className="cc-text">{status} {t('Who made a report is never shown.')}</p>
      {list}
      {data.me === 'asked' && (
        <div className="cc-asked">
          <p><b>{t('You were asked to join the care circle.')}</b> {t('You would read reports about people in this group and help sort things out, for {n} months. You can step out any time.', { n: data.term_months })}</p>
          <div className="gd-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run('answer_care_circle', { p_org: orgId, p_yes: true }, 'Thank you. You are in the care circle.')}>{t('Yes, I will')}</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run('answer_care_circle', { p_org: orgId, p_yes: false }, 'No problem.')}>{t('No, thank you')}</button>
          </div>
        </div>
      )}
      {data.me === 'serving' && (
        <>
          <PlaceReports kind="org" placeId={orgId} circle />
          <button type="button" className="link-button cc-out" disabled={busy}
            onClick={async () => { if (await askConfirm(t('Step out of the care circle?'))) run('leave_care_circle', { p_org: orgId }, 'You stepped out. Thank you for serving.') }}>
            {t('Step out of the care circle')}
          </button>
        </>
      )}
      {note && <p className="hub-note" role="status">{note}</p>}
    </section>
  )
}
