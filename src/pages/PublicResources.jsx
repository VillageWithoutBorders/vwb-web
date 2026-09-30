import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import CommunityResources from './CommunityResources'

// The resource list for anyone, no account needed. This is the page to share
// with people of any age: it only reads, and it collects nothing. Signed-in
// members are sent to the same list inside the app.
export default function PublicResources() {
  const { user, loading } = useAuth()
  if (!loading && user) return <Navigate to="/community/resources" replace />

  return (
    <div>
      <div className="cal-topbar">
        <Link to="/welcome" aria-label="Village Without Borders home">
          <img src="/images/vwb_header.png" alt="" width="32" height="32" style={{ borderRadius: '50%' }} />
          <span>Village Without Borders</span>
        </Link>
      </div>
      <main className="cal-page">
        <CommunityResources />
      </main>
    </div>
  )
}
