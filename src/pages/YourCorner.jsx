import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppMenu from '../components/AppMenu'
import Icon from '../components/Icon'
import CornerRoom, { ROOM_READY } from '../components/CornerRoom'
import { useWideScreen } from '../hooks/useWideScreen'
import { useSimpleView } from '../utils/simpleView'
import { useT } from '../utils/lang'
import { openMyQr } from '../utils/qrSheet'

// My Corner: everything about you in one place.
// It shows under your cottage map (embedded) and as its own page at /me.
// Oct 25 (Jade): My Corner in the top bar opens /me: profile, account, and settings.
// Role tools and alerts live in My Tools.
export default function YourCorner({ embedded = false }) {
  const t = useT()
  const { user, profile, organizations } = useAuth()
  const [avatarFailed, setAvatarFailed] = useState(false)
  const simple = useSimpleView()
  // Your avatar from the avatar builder, or the same drawn avatar others see. The letter shows only if it can't load.
  const avatarSrc = profile?.avatar_url || 'https://api.dicebear.com/7.x/thumbs/svg?seed=' + (user?.id || 'default')
  const name = profile?.display_name || t('Neighbor')
  const letter = (name.trim().charAt(0) || '?').toUpperCase()
  const place = profile?.neighborhood || (profile?.zip_code ? t('Zip {zip}', { zip: profile.zip_code }) : '')

  // Nov 7 (Jade): My Corner looks like a neighbor's page. Your cottage, the way
  // visitors see it, sits beside your corner on a computer, and under your card on a phone.
  const wide = useWideScreen()
  const showCottage = !embedded && !simple

  // Nov 7 (Jade): the inside of your cottage (a cozy room) replaces the outside map here.
  const split = showCottage && wide
  // Your things: in the list on phones, and under the room on a computer (Nov 7, Jade).
  const thingsList = (hid) => (
      <section className="corner-group" aria-labelledby={hid}>
      <h2 id={hid} className="corner-group-h">{t('Your things')}</h2>
      <nav aria-labelledby={hid} className="corner-list">
        <Link to="/profile#past-tasks" className="corner-item"><span aria-hidden="true"><Icon name="box" /></span> {t('Past tasks')}<span className="corner-arrow" aria-hidden="true">›</span></Link>
        <Link to="/trail" className="corner-item"><span aria-hidden="true"><Icon name="compass" /></span> {t('My trail')}<span className="corner-arrow" aria-hidden="true">›</span></Link>
        <button type="button" className="corner-item corner-item-btn" onClick={openMyQr}><span aria-hidden="true"><Icon name="qr-code" /></span> {t('My QR code')}<span className="corner-arrow" aria-hidden="true">›</span></button>
        <Link to="/profile" className="corner-item"><span aria-hidden="true"><Icon name="handshake" /></span> {simple ? <span className="corner-item-text">{t('Vouches and trust')}<small>{t('Neighbors who say you can be trusted')}</small></span> : t('Vouches and trust')}<span className="corner-arrow" aria-hidden="true">›</span></Link>
        {/* Oct 22: your cottage is your house in your home village: your own private map. */}
        {!embedded && !simple && <Link to="/cottage" className="corner-item"><span aria-hidden="true"><Icon name="cottage" /></span> {t('My cottage')}<span className="corner-arrow" aria-hidden="true">›</span></Link>}
        {!simple && <Link to="/world" className="corner-item"><span aria-hidden="true"><Icon name="houses" /></span> {t('Map of my villages')}<span className="corner-arrow" aria-hidden="true">›</span></Link>}
        {!simple && !organizations.some((o) => o.kind !== 'group') && (
          <Link to="/calendar?bring=org" className="corner-item"><span aria-hidden="true"><Icon name="people" /></span> {t('Bring your group')}<span className="corner-arrow" aria-hidden="true">›</span></Link>
        )}
      </nav>
      </section>
  )

  const page = (
    // Oct 30 (Jade): on a computer, /me is three cards in a row under your card and Settings.
    <div className={'corner-page' + (embedded ? '' : ' corner-page-full')}>
      {/* Nov 8 (Jade): side by side, the title sits above both sides so their boxes line up. */}
      {!split && (embedded ? <h2 className="corner-title">{t('My Corner')}</h2> : <h1 className="corner-title">{t('My Corner')}</h1>)}

      <Link to="/profile" className="corner-card">
        {avatarFailed
          ? <span className="corner-letter" aria-hidden="true">{letter}</span>
          : <img className="corner-avatar" src={avatarSrc} alt="" width="120" height="120" onError={() => setAvatarFailed(true)} />}
        <span className="corner-who">
          <b>{name}</b>
          {place && <span>{place}</span>}
          {profile?.is_hope_ambassador && <span className="corner-chip">{t('Hope Ambassador')}</span>}
          <span className="corner-see">{t('See my profile')} ›</span>
        </span>
      </Link>

      {showCottage && !wide && ROOM_READY && (
        <section className="corner-room-preview" aria-labelledby="corner-room-h">
          <h2 id="corner-room-h" className="pp-cottage-h">{t('Inside your cottage')}</h2>
          <CornerRoom />
          <p className="pp-cottage-note">{t('Tap something in the room.')}</p>
        </section>
      )}

      {/* Oct 27 (Jade): Settings first and big, so it's easy to find, in both views. */}
      {!embedded && (
        <Link to="/settings" className="corner-item corner-settings">
          <span aria-hidden="true"><Icon name="gear" /></span>
          <span className="corner-item-text">{t('Settings')}<small>{t('Language, text size, light or dark, Simple view, less motion')}</small></span>
          <span className="corner-arrow" aria-hidden="true">›</span>
        </Link>
      )}

      {!split && thingsList('corner-things')}

      {/* Nov 8 (Jade): side by side, the left is your account; the app's own links move to the right. */}
      <AppMenu inline only={split ? ['account'] : null} />
    </div>
  )

  if (!split) return page
  return (
    <>
    <h1 className="corner-title corner-title-wide">{t('My Corner')}</h1>
    <div className="corner-split">
      <div className="corner-split-main">{page}</div>
      <div className="corner-split-side">
      <aside className={'pp-cottage corner-room-panel' + (ROOM_READY ? '' : ' corner-room-plain')} aria-labelledby={ROOM_READY ? 'corner-room-side-h' : 'corner-things-side'}>
        {ROOM_READY && <>
          <h2 id="corner-room-side-h" className="pp-cottage-h">{t('Inside your cottage')}</h2>
          <CornerRoom />
          <p className="pp-cottage-note">{t('Each thing in the room opens part of your corner. Hold your mouse over one to see what it is.')}</p>
        </>}
        <div className="corner-room-things">{thingsList('corner-things-side')}</div>
        <Link to="/cottage" className="btn btn-outline btn-full pp-cottage-go">{t('Step outside to My Cottage')}</Link>
      </aside>
      <div className="corner-side-menu"><AppMenu inline only={['about', 'vwb']} /></div>
      </div>
    </div>
    </>
  )
}
