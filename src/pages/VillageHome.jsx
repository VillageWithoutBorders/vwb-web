import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// The Village tab (/village) opens your home village. Oct 22: your cottage
// (your own private map) moved to /cottage, inside your home village as your house.
// No home village yet: go find or start one.
export default function VillageHome() {
  const { profile } = useAuth()
  if (!profile) return <div className="cal-page"><p className="cal-empty">Loading...</p></div>
  return <Navigate to={profile.home_village_id ? '/village/' + profile.home_village_id : '/find-village'} replace />
}
