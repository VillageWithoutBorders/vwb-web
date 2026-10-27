import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppMenu from '../components/AppMenu'
import Icon from '../components/Icon'
import { useSimpleView } from '../utils/simpleView'

// My Corner: everything about you in one place.
// It shows under your cottage map (embedded) and as its own page at /me.
// Oct 25 (Jade): My Corner in the top bar opens /me: profile, account, and settings.
// Role tools and alerts live in My Tools.
export default function YourCorner({ embedded = false }) {
  const { user, profile, organizations } = useAuth()
  const [avatarFailed, setAvatarFailed] = useState(false)
  const simple = useSimpleView()
  // Your avatar from the avatar builder, or the same drawn avatar others see. The letter shows only if it can't load.
  const avatarSrc = profile?.avatar_url || 'https://api.dicebear.com/7.x/thumbs/svg?seed=' + (user?.id || 'default')
  const name = profile?.display_name || 'Neighbor'
  const letter = (name.trim().charAt(0) || '?').toUpperCase()
  const place = profile?.neighborhood || (profile?.zip_code ? 'Zip ' + profile.zip_code : '')

  return (
    <div className="corner-page">
      {embedded ? <h2 className="corner-title">My Corner</h2> : <h1 className="corner-title">My Corner</h1>}

      <Link to="/profile" className="corner-card">
        {avatarFailed
          ? <span className="corner-letter" aria-hidden="true">{letter}</span>
          : <img className="corner-avatar" src={avatarSrc} alt="" width="60" height="60" onError={() => setAvatarFailed(true)} />}
        <span className="corner-who">
          <b>{name}</b>
          {place && <span>{place}</span>}
          {profile?.is_hope_ambassador && <span className="corner-chip">Hope Ambassador</span>}
          <span className="corner-see">See my profile ›</span>
        </span>
      </Link>

      {/* Oct 27 (Jade): Settings first and big, so it's easy to find, in both views. */}
      {!embedded && (
        <Link to="/settings" className="corner-item corner-settings">
          <span aria-hidden="true"><Icon name="gear" /></span>
          <span className="corner-item-text">Settings<small>Text size, light or dark, Simple view</small></span>
          <span className="corner-arrow" aria-hidden="true">›</span>
        </Link>
      )}

      <nav aria-label="Your things" className="corner-list">
        <Link to="/profile#past-tasks" className="corner-item"><span aria-hidden="true"><Icon name="box" /></span> Past tasks<span className="corner-arrow" aria-hidden="true">›</span></Link>
        <Link to="/trail" className="corner-item"><span aria-hidden="true"><Icon name="compass" /></span> My trail<span className="corner-arrow" aria-hidden="true">›</span></Link>
        <Link to="/my-code" className="corner-item"><span aria-hidden="true"><Icon name="qr-code" /></span> My QR code<span className="corner-arrow" aria-hidden="true">›</span></Link>
        <Link to="/profile" className="corner-item"><span aria-hidden="true"><Icon name="handshake" /></span> {simple ? <span className="corner-item-text">Vouches and trust<small>Neighbors who say you can be trusted</small></span> : 'Vouches and trust'}<span className="corner-arrow" aria-hidden="true">›</span></Link>
        {/* Oct 22: your cottage is your house in your home village: your own private map. */}
        {!embedded && !simple && <Link to="/cottage" className="corner-item"><span aria-hidden="true"><Icon name="cottage" /></span> My cottage<span className="corner-arrow" aria-hidden="true">›</span></Link>}
        {!simple && <Link to="/world" className="corner-item"><span aria-hidden="true"><Icon name="houses" /></span> Map of my villages<span className="corner-arrow" aria-hidden="true">›</span></Link>}
        {!simple && !organizations.some((o) => o.kind !== 'group') && (
          <Link to="/calendar?bring=org" className="corner-item"><span aria-hidden="true"><Icon name="people" /></span> Bring your group<span className="corner-arrow" aria-hidden="true">›</span></Link>
        )}
      </nav>

      <AppMenu inline />
    </div>
  )
}
