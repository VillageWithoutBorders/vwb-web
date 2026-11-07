import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { getTownToday, setTownToday } from '../utils/location'
import Icon from './Icon'
import { useT } from '../utils/lang'

// "I'm in town today" (Jade, Nov 7). A helper picks one town they are in
// today. Until midnight, SkillShare looks from that town, and (if they ask)
// they get an alert for urgent requests there. Only the town is kept, never
// the phone's location. Nobody else can see it. Accounts older than 14 days
// only: the database checks that and the other limits (vwb-in-town-today.sql).
//
// onChanged() runs when the town starts, changes or stops, so the page reloads.

const WHY = {
  too_new: 'You can use this after your first 14 days on VWB.',
  bad_zip: "We couldn't find that zip code. Check the numbers and try again.",
  no_home: 'Save your home zip code first. Then you can pick a town for today.',
  too_far: 'That town is more than 50 miles from your home zip code. Pick a town closer to home.',
  limit: 'You changed towns 6 times today. Try again tomorrow.',
  not_allowed: 'This is not available on your account.',
}

function untilText(t, iso) {
  if (!iso) return t('Until midnight.')
  const end = new Date(iso)
  // Midnight shows as "Until midnight", not "Until 12:00 AM".
  if (end.getHours() === 0 && end.getMinutes() === 0) return t('Until midnight.')
  return t('Until {time}.', { time: end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })
}

export default function TownToday({ onChanged }) {
  const t = useT()
  const { user } = useAuth()
  const [canUse, setCanUse] = useState(false)
  const [town, setTown] = useState(() => getTownToday())
  const [open, setOpen] = useState(false)
  const [zip, setZip] = useState('')
  const [alerts, setAlerts] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // The database is the truth (the same choice follows you to any phone).
  useEffect(() => {
    if (!user) return
    let gone = false
    supabase.rpc('my_town_today').then(({ data, error: err }) => {
      if (gone) return
      if (err) { console.error('my_town_today failed:', err); return }
      setCanUse(!!data?.can_use)
      const before = getTownToday()
      const now = data?.active ? data : null
      setTownToday(now)
      setTown(now ? getTownToday() : null)
      if ((before?.zip || null) !== (now?.zip || null)) onChanged?.()
    }, (err) => console.error('my_town_today failed:', err))
    return () => { gone = true }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || (!canUse && !town)) return null

  async function start(e) {
    e.preventDefault()
    setError('')
    const clean = zip.replace(/[^0-9]/g, '')
    if (clean.length !== 5) { setError(t('Zip codes have 5 numbers.')); return }
    setBusy(true)
    const { data, error: err } = await supabase.rpc('set_town_today', { p_zip: clean, p_alerts: alerts })
    setBusy(false)
    if (err) {
      console.error('set_town_today failed:', err)
      setError(t('Something went wrong. Try again.'))
      return
    }
    if (!data?.ok) { setError(t(WHY[data?.why] || 'Something went wrong. Try again.')); return }
    setTownToday(data)
    setTown(getTownToday())
    setOpen(false)
    setZip('')
    onChanged?.()
  }

  async function changeAlerts(next) {
    setError('')
    setBusy(true)
    const { data, error: err } = await supabase.rpc('set_town_today', { p_zip: town.zip, p_alerts: next })
    setBusy(false)
    if (err || !data?.ok) {
      console.error('set_town_today (alerts) failed:', err || data)
      setError(t(WHY[data?.why] || 'Could not change your alerts. Try again.'))
      return
    }
    setTownToday(data)
    setTown(getTownToday())
  }

  async function stop() {
    setError('')
    setBusy(true)
    const { error: err } = await supabase.rpc('clear_town_today')
    setBusy(false)
    if (err) {
      console.error('clear_town_today failed:', err)
      setError(t('Could not stop. Try again.'))
      return
    }
    setTownToday(null)
    setTown(null)
    onChanged?.()
  }

  if (town && !open) {
    return (
      <div className="town-today town-today-on" role="region" aria-label={t('Town for today')}>
        <p className="town-today-line">
          <span aria-hidden="true"><Icon name="pin" /></span>{' '}
          <strong>{t('Helping in {town} today.', { town: town.label })}</strong>{' '}
          {untilText(t, town.expires_at)}
        </p>
        <label className="checkbox-field town-today-check">
          <input type="checkbox" checked={!!town.alerts} disabled={busy} onChange={(e) => changeAlerts(e.target.checked)} />
          <span>{t('Tell me about urgent requests there today')}</span>
        </label>
        <div className="town-today-actions">
          <button type="button" className="btn btn-outline" onClick={() => { setOpen(true); setError('') }} disabled={busy}>{t('Change town')}</button>
          <button type="button" className="btn btn-outline" onClick={stop} disabled={busy}>{t('Stop')}</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    )
  }

  if (!open) {
    return (
      <div className="town-today">
        <button type="button" className="link-button town-today-open" onClick={() => setOpen(true)}>
          <span aria-hidden="true"><Icon name="pin" /></span> {t('Helping in another town today?')}
        </button>
      </div>
    )
  }

  return (
    <div className="town-today town-today-form" role="region" aria-label={t('Town for today')}>
      <h2 className="town-today-title">{t('Pick a town for today')}</h2>
      <p className="town-today-text">{t('See requests in that town until midnight. Only you can see which town you picked.')}</p>
      <form onSubmit={start} noValidate>
        <label htmlFor="townTodayZip" className="town-today-label">{t('Zip code of the town')}</label>
        <input
          id="townTodayZip"
          className="location-prompt-input town-today-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={5}
          value={zip}
          onChange={(e) => { setZip(e.target.value.replace(/[^0-9]/g, '')); setError('') }}
          aria-invalid={!!error}
          aria-describedby={error ? 'townTodayError' : undefined}
        />
        <label className="checkbox-field town-today-check">
          <input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} />
          <span>{t('Tell me about urgent requests there today')}<span className="location-prompt-fine"> {t('Up to 5 alerts. No names.')}</span></span>
        </label>
        {error && <p id="townTodayError" className="form-error" role="alert">{error}</p>}
        <div className="town-today-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('Saving...') : t('Use this town')}</button>
          <button type="button" className="btn btn-outline" onClick={() => { setOpen(false); setError('') }} disabled={busy}>{t('Cancel')}</button>
        </div>
      </form>
    </div>
  )
}
