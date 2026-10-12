import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppMenu from '../components/AppMenu'

// Your corner: everything about you in one place.
// Opened from your letter in the top bar. Replaces the Profile tab and the Menu.
export default function YourCorner() {
  const { profile, organizations } = useAuth()
  const name = profile?.display_name || 'Neighbor'
  const letter = (name.trim().charAt(0) || '?').toUpperCase()
  const runsAGroup = organizations.some((o) => o.role === 'admin' || o.role === 'organizer')
  const place = profile?.neighborhood || (profile?.zip_code ? 'Zip ' + profile.zip_code : '')

  return (
    <div className="corner-page">
      <h1 className="corner-title">Your corner</h1>

      <Link to="/profile" className="corner-card">
        <span className="corner-letter" aria-hidden="true">{letter}</span>
        <span className="corner-who">
          <b>{name}</b>
          {place && <span>{place}</span>}
          {profile?.is_hope_ambassador && <span className="corner-chip">Hope Ambassador</span>}
          <span className="corner-see">See my profile ›</span>
        </span>
      </Link>

      <nav aria-label="Your things" className="corner-list">
        <Link to="/profile#past-tasks" className="corner-item"><span aria-hidden="true">{'\u{1F4E6}'}</span> Past tasks<span className="corner-arrow" aria-hidden="true">›</span></Link>
        <Link to="/profile" className="corner-item"><span aria-hidden="true">{'\u{1F91D}'}</span> Vouches and trust<span className="corner-arrow" aria-hidden="true">›</span></Link>
        <Link to="/find-village" className="corner-item"><span aria-hidden="true">{'\u{1F333}'}</span> My villages<span className="corner-arrow" aria-hidden="true">›</span></Link>
        {runsAGroup && (
          <Link to="/org-dashboard" className="corner-item"><span aria-hidden="true">{'\u{1F465}'}</span> My organization dashboard<span className="corner-arrow" aria-hidden="true">›</span></Link>
        )}
      </nav>

      <AppMenu inline />
    </div>
  )
}
