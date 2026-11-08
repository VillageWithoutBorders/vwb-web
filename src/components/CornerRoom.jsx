import { useNavigate } from 'react-router-dom'
import { useT } from '../utils/lang'
import { useState } from 'react'
import { startAppTour } from './AppTour'
import { openMyQr } from '../utils/qrSheet'
import { isLight } from '../utils/theme'
import { usePrefsRefresh } from '../hooks/usePrefsRefresh'

// Inside your cottage (Nov 7, Jade). My Corner shows the inside of your cottage: a cozy
// room where each thing is a door to part of your corner. My Cottage shows the outside.
// The picture is never cropped, so every object can be found. Each object is a real
// button with its name, which shows on hover or keyboard focus and is read by screen
// readers. Everything here is also in the plain list beside it.
// x and y are the middle of each object, as a percent of the picture.
const SPOTS = [
  { k: 'fire', label: 'Cottage Chats and Campfires', sub: 'Gather by the fire', to: '/groups', x: 21, y: 80 },
  { k: 'chair', label: 'Settings', sub: 'Get comfortable', to: '/settings', x: 53, y: 74 },
  { k: 'books', label: 'Past tasks', sub: 'The stories so far', to: '/profile#past-tasks', x: 45, y: 24 },
  { k: 'oldbooks', label: 'My trail', sub: 'Where you have been', to: '/trail', x: 4, y: 20 },
  { k: 'window', label: 'Map of my villages', sub: 'Look out at your world', to: '/world', x: 81, y: 30 },
  { k: 'cat', label: 'Vouches and trust', sub: 'Friends who know you', to: '/profile', x: 94, y: 64 },
  { k: 'lamps', label: 'App guide and feedback', sub: 'A light to find your way', to: '/help', x: 29, y: 18 },
  { k: 'lantern', label: 'Take the tour', sub: 'A walk around the app', tour: true, x: 88, y: 69 },
  { k: 'plant', label: 'My QR code', sub: 'Help your circle grow', qr: true, x: 61, y: 38 },
]

// Nov 8 (Jade): a daytime room for light mode. Turn this on once
// public/art/corner/corner-room-day.webp and corner-room-day-800.webp are added.
// The day picture must have the same layout, so the spots above still line up.
const DAY_READY = false

// Nov 8 (Jade): the first room picture was not ours to use, so it came down.
// Turn this on when Jade's own corner-room.webp and corner-room-800.webp are in
// public/art/corner. Until then My Corner shows the plain list.
export const ROOM_READY = false

export default function CornerRoom() {
  const t = useT()
  const navigate = useNavigate()
  const [light, setLight] = useState(isLight())
  usePrefsRefresh(() => setLight(isLight()))
  const [dayFailed, setDayFailed] = useState(false)
  const pic = DAY_READY && light && !dayFailed ? 'corner-room-day' : 'corner-room'
  return (
    <div className="cr-room">
      <img className="cr-pic" src={'/art/corner/' + pic + '.webp'} srcSet={'/art/corner/' + pic + '-800.webp 800w, /art/corner/' + pic + '.webp 1600w'}
        sizes="(min-width: 1024px) 700px, 100vw" alt="" width="1600" height="859" loading="lazy" onError={() => { if (pic !== 'corner-room') setDayFailed(true) }} />
      {SPOTS.map((s) => (
        <button key={s.k} type="button" className={'cr-spot' + (s.x > 75 ? ' cr-right' : s.x < 20 ? ' cr-left' : '')} style={{ left: s.x + '%', top: s.y + '%' }}
          aria-label={t(s.label) + '. ' + t(s.sub)} data-tip={t(s.label) + '. ' + t(s.sub)}
          onClick={() => (s.tour ? startAppTour() : s.qr ? openMyQr() : navigate(s.to))}>
          <span className="cr-dot" aria-hidden="true" />
          <span className="cr-lab" aria-hidden="true">{t(s.label)}</span>
        </button>
      ))}
    </div>
  )
}
