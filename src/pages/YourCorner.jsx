import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppMenu from '../components/AppMenu'
import Icon from '../components/Icon'
import CottageMap from '../components/CottageMap'
import { useWideScreen } from '../hooks/useWideScreen'
import { supabase } from '../supabaseClient'
import { useSimpleView } from '../utils/simpleView'
import { useT } from '../utils/lang'

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
  const [cottage, setCottage] = useState(null)
  useEffect(() => {
    if (!showCottage || !user) return undefined
    let alive = true
    supabase.rpc('get_cottage', { p_user: user.id }).then(({ data, error }) => {
      if (!alive) return
      if (error) { if (error.code !== 'PGRST202') console.error('Failed to load my cottage:', error); return }
      setCottage(data && data.ok ? data : null)
    })
    return () => { alive = false }
  }, [showCottage, user])
  const cottageTitle = (cottage && cottage.cottage_name) || t('My cottage')

  const split = showCottage && wide && !!cottage
  const page = (
    // Oct 30 (Jade): on a computer, /me is three cards in a row under your card and Settings.
    <div className={'corner-page' + (embedded ? '' : ' corner-page-full')}>
      {embedded ? <h2 className="corner-title">{t('My Corner')}</h2> : <h1 className="corner-title">{t('My Corner')}</h1>}

      <Link to="/profile" className="corner-card">
        {avatarFailed
          ? <span className="corner-letter" aria-hidden="true">{letter}</span>
          : <img className="corner-avatar" src={avatarSrc} alt="" width="60" height="60" onError={() => setAvatarFailed(true)} />}
        <span className="corner-who">
          <b>{name}</b>
          {place && <span>{place}</span>}
          {profile?.is_hope_ambassador && <span className="corner-chip">{t('Hope Ambassador')}</span>}
          <span className="corner-see">{t('See my profile')} ›</span>
        </span>
      </Link>

      {showCottage && !wide && cottage && (
        <section className="pp-cottage-preview corner-cottage-preview" aria-labelledby="corner-cottage-h">
          <h2 id="corner-cottage-h" className="pp-cottage-h">{cottageTitle}</h2>
          <Link to="/cottage" className="pp-cottage-link" aria-label={t('Open my cottage')}>
            <CottageMap data={cottage} name={name} preview />
            <span className="pp-cottage-open">{t('Open my cottage')} &#8250;</span>
          </Link>
        </section>
      )}

      {/* Oct 27 (Jade): Settings first and big, so it's easy to find, in both views. */}
      {!embedded && (
        <Link to="/settings" className="corner-item corner-settings">
          <span aria-hidden="true"><Icon name="gear" /></span>
          <span className="corner-item-text">{t('Settings')}<small>{t('Text size, light or dark, Simple view')}</small></span>
          <span className="corner-arrow" aria-hidden="true">›</span>
        </Link>
      )}

      <section className="corner-group" aria-labelledby="corner-things">
      <h2 id="corner-things" className="corner-group-h">{t('Your things')}</h2>
      <nav aria-labelledby="corner-things" className="corner-list">
        <Link to="/profile#past-tasks" className="corner-item"><span aria-hidden="true"><Icon name="box" /></span> {t('Past tasks')}<span className="corner-arrow" aria-hidden="true">›</span></Link>
        <Link to="/trail" className="corner-item"><span aria-hidden="true"><Icon name="compass" /></span> {t('My trail')}<span className="corner-arrow" aria-hidden="true">›</span></Link>
        <Link to="/my-code" className="corner-item"><span aria-hidden="true"><Icon name="qr-code" /></span> {t('My QR code')}<span className="corner-arrow" aria-hidden="true">›</span></Link>
        <Link to="/profile" className="corner-item"><span aria-hidden="true"><Icon name="handshake" /></span> {simple ? <span className="corner-item-text">{t('Vouches and trust')}<small>{t('Neighbors who say you can be trusted')}</small></span> : t('Vouches and trust')}<span className="corner-arrow" aria-hidden="true">›</span></Link>
        {/* Oct 22: your cottage is your house in your home village: your own private map. */}
        {!embedded && !simple && <Link to="/cottage" className="corner-item"><span aria-hidden="true"><Icon name="cottage" /></span> {t('My cottage')}<span className="corner-arrow" aria-hidden="true">›</span></Link>}
        {!simple && <Link to="/world" className="corner-item"><span aria-hidden="true"><Icon name="houses" /></span> {t('Map of my villages')}<span className="corner-arrow" aria-hidden="true">›</span></Link>}
        {!simple && !organizations.some((o) => o.kind !== 'group') && (
          <Link to="/calendar?bring=org" className="corner-item"><span aria-hidden="true"><Icon name="people" /></span> {t('Bring your group')}<span className="corner-arrow" aria-hidden="true">›</span></Link>
        )}
      </nav>
      </section>

      <AppMenu inline />
    </div>
  )

  if (!split) return page
  return (
    <div className="corner-split">
      <div className="corner-split-main">{page}</div>
      <aside className="pp-cottage" aria-labelledby="corner-cottage-side-h">
        <h2 id="corner-cottage-side-h" className="pp-cottage-h">{cottageTitle}</h2>
        <div className="pp-cottage-map"><CottageMap data={cottage} name={name} /></div>
        <p className="pp-cottage-note">{t('This is how your cottage looks to neighbors who can visit.')}</p>
        <Link to="/cottage" className="btn btn-primary btn-full pp-cottage-go">{t('Open my cottage')}</Link>
      </aside>
    </div>
  )
}
