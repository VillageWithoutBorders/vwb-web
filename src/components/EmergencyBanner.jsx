import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon'
import { useT } from '../utils/lang'
import { useEmergenciesICanHelp } from '../hooks/useEmergenciesICanHelp'

// Nov 10 (Jade, Round A3): two taps was too slow. While a verified emergency is open,
// people who can act on it see this at the top of every page, under the top bar.
// One tap opens the response. "Hide for 1 hour" tucks it away on this phone; it comes
// back if the emergency is still open. A new emergency shows right away.
// Everyone else never sees it and keeps the normal way to report an emergency.

const KEY = 'vwb_em_tucked'
const HOUR = 60 * 60 * 1000

function readTucked() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    const now = Date.now()
    const live = {}
    Object.keys(saved || {}).forEach((id) => { if (saved[id] > now) live[id] = saved[id] })
    return live
  } catch { return {} }
}

export default function EmergencyBanner() {
  const t = useT()
  const { pathname } = useLocation()
  const list = useEmergenciesICanHelp()
  const [tucked, setTucked] = useState(readTucked)
  const [now, setNow] = useState(() => Date.now())

  // When the hour is up, show it again.
  useEffect(() => {
    const at = Date.now()
    const waits = Object.values(tucked).filter((until) => until > at)
    if (!waits.length) return
    const tm = setTimeout(() => setNow(Date.now()), Math.min(...waits) - at + 500)
    return () => clearTimeout(tm)
  }, [tucked])

  const open = list.filter((e) => !(tucked[e.id] > now))
  // Not on the Emergency pages themselves: you are already there.
  if (!open.length || pathname.startsWith('/emergency')) return null

  function tuck() {
    const at = new Date().getTime()
    const next = { ...readTucked() }
    open.forEach((e) => { next[e.id] = at + HOUR })
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private window: hidden until the app reloads */ }
    setTucked(next)
    setNow(at)
  }

  const one = open.length === 1
  const name = String(open[0].title || t('Emergency')).trim().replace(/[.!\s]+$/, '')
  return (
    <section className="em-banner" aria-label={t('Emergency')}>
      <Link to={one ? '/emergency/' + open[0].id : '/emergency'} className="em-banner-go">
        <Icon name="siren" size={28} />
        <b>{one ? t('Emergency open: {name}. Tap to help.', { name }) : t('{n} emergencies open. Tap to help.', { n: open.length })}</b>
      </Link>
      <button type="button" className="em-banner-hide" onClick={tuck}>{t('Hide for 1 hour')}</button>
    </section>
  )
}
