import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppMenu from '../components/AppMenu'
import Icon from '../components/Icon'

// Your corner: everything about you in one place.
// Opened from your avatar in the top bar. Replaces the Profile tab and the Menu.
export default function YourCorner() {
  const { user, profile, organizations } = useAuth()
  const [avatarFailed, setAvatarFailed] = useState(false)
  // Your avatar from the avatar builder, or the same drawn avatar others see. The letter shows only if it can't load.
  const avatarSrc = profile?.avatar_url || 'https://api.dicebear.com/7.x/thumbs/svg?seed=' + (user?.id || 'default')
  const name = profile?.display_name || 'Neighbor'
  const letter = (name.trim().charAt(0) || '?').toUpperCase()
  const runsAGroup = organizations.some((o) => o.role === 'admin' || o.role === 'organizer')
  const place = profile?.neighborhood || (profile?.zip_code ? 'Zip ' + profile.zip_code : '')

  return (
    <div className="corner-page">
      <h1 className="corner-title">Your corner</h1>

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

      <nav aria-label="Your things" className="corner-list">
        <Link to="/profile#past-tasks" className="corner-item"><span aria-hidden="true"><Icon name="box" /></span> Past tasks<span className="corner-arrow" aria-hidden="true">›</span></Link>
        <Link to="/trail" className="corner-item"><span aria-hidden="true"><Icon name="compass" /></span> My trail<span className="corner-arrow" aria-hidden="true">›</span></Link>
        <Link to="/my-code" className="corner-item"><span aria-hidden="true"><Icon name="phone-add" /></span> My QR code<span className="corner-arrow" aria-hidden="true">›</span></Link>
        <Link to="/profile" className="corner-item"><span aria-hidden="true"><Icon name="handshake" /></span> Vouches and trust<span className="corner-arrow" aria-hidden="true">›</span></Link>
        {/* Oct 22: your cottage is your house in your home village: your own private map. */}
        <Link to="/cottage" className="corner-item"><span aria-hidden="true"><Icon name="cottage" /></span> My cottage<span className="corner-arrow" aria-hidden="true">›</span></Link>
        <Link to="/villages" className="corner-item"><span aria-hidden="true"><Icon name="tree" /></span> My villages<span className="corner-arrow" aria-hidden="true">›</span></Link>
        {!organizations.some((o) => o.kind !== 'group') && (
          <Link to="/community?bring=org" className="corner-item"><span aria-hidden="true"><Icon name="people" /></span> Bring your organization<span className="corner-arrow" aria-hidden="true">›</span></Link>
        )}
        {runsAGroup && (
          <Link to="/org-dashboard" className="corner-item"><span aria-hidden="true"><Icon name="people" /></span> My organization dashboard<span className="corner-arrow" aria-hidden="true">›</span></Link>
        )}
      </nav>

      <AppMenu inline />
    </div>
  )
}
