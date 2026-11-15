import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../utils/lang'

// Nov 13 (Jade): What's new posts come by email too. On unless the person turns it off
// here or taps Stop news emails in an email (vwb-whats-new.sql, send-news-email).
export default function NewsEmailSwitch() {
  const t = useT()
  const [on, setOn] = useState(null) // null = loading or not set up yet
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    let alive = true
    supabase.rpc('my_news_email').then(({ data, error }) => {
      if (!alive) return
      if (error) {
        // Before vwb-whats-new.sql is run the function is not there: hide the switch.
        if (error.code === 'PGRST202' || /my_news_email/.test(error.message || '')) { setMissing(true); return }
        console.error('Failed to load news email choice:', error)
        setNote(t("We couldn't load this setting. Try again later."))
        return
      }
      setOn(data !== false)
    })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) return null

  async function flip(next) {
    if (busy) return
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('set_my_news_email', { p_on: next })
    setBusy(false)
    if (error) { console.error('Failed to save news email choice:', error); setNote(t("We couldn't save that. Try again.")); return }
    setOn(next)
    setNote(next ? t('News emails are on.') : t('News emails are off.'))
  }

  return (
    <div className="news-email-switch">
      <label className={'alert-choice' + (on ? ' is-on' : '')}>
        <input type="checkbox" checked={!!on} disabled={on === null || busy} onChange={(e) => flip(e.target.checked)} />
        <span><b>{t('Email me VWB news')}</b><small>{t('When something new comes to VWB, or is coming soon. A few times a month at most.')}</small></span>
      </label>
      {note && <p className="alert-choices-note" role="status">{note}</p>}
    </div>
  )
}
