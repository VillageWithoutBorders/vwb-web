import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1 className="app-title">VWB</h1>
        <div className="header-right">
          {profile && (
            <span className="header-name">{profile.display_name}</span>
          )}
          <button onClick={signOut} className="btn btn-small btn-outline">
            Sign out
          </button>
        </div>
      </header>

      <nav className="app-nav" aria-label="Main navigation">
        <NavLink to="/" end className="nav-link">
          <span className="nav-icon" aria-hidden="true">&#9741;</span>
          <span className="nav-label">SkillShare</span>
        </NavLink>
      </nav>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
