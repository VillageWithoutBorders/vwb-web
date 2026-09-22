import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const menuItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  width: '100%',
  padding: '0.75rem 1rem',
  background: 'none',
  border: 'none',
  color: '#eee',
  fontSize: '0.9rem',
  textAlign: 'left',
  cursor: 'pointer',
  boxSizing: 'border-box',
}

// A second account menu, opposite LogoMenu on the header's right side, next
// to the notification bell. Same visual pattern as LogoMenu, but this one is
// about the SIGNED-IN PERSON'S account (edit profile, settings, and admin
// tools for those who have them) rather than sharing/logging out of the app.
// This is now the ONLY way to reach these three -- Profile.jsx's own
// Edit profile / Settings & Privacy / Admin Panel buttons were removed as
// duplicates once this menu covered every page. Edit Profile passes
// state.openEdit so Profile.jsx opens straight into the edit form instead
// of just landing on the read-only view.
export default function AccountMenu() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  function closeMenu() {
    setMenuOpen(false)
  }

  function go(path) {
    closeMenu()
    navigate(path)
  }

  function goEditProfile() {
    closeMenu()
    navigate('/profile', { state: { openEdit: true } })
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Account" aria-expanded={menuOpen} style={{ background: 'none', border: 'none', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
      </button>

      {menuOpen && (
        <>
          <button type="button" aria-label="Close menu" onClick={closeMenu} style={{ position: 'fixed', inset: 0, background: 'none', border: 'none', padding: 0, cursor: 'default', zIndex: 200 }} />
          <div style={{ position: 'absolute', top: '48px', right: 0, background: '#242424', border: '1px solid #444', borderRadius: '12px', minWidth: '200px', overflow: 'hidden', zIndex: 201, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            <button type="button" onClick={goEditProfile} style={menuItemStyle}>
              <span aria-hidden="true">{'\u{1F464}'}</span> Edit Profile
            </button>
            <button type="button" onClick={() => go('/settings')} style={{ ...menuItemStyle, borderTop: '1px solid #333' }}>
              <span aria-hidden="true">{'\u2699\uFE0F'}</span> Settings &amp; Privacy
            </button>
            {isAdmin && (
              <button type="button" onClick={() => go('/admin')} style={{ ...menuItemStyle, color: '#4ecca3', borderTop: '1px solid #333' }}>
                <span aria-hidden="true">{'\u{1F6E1}\uFE0F'}</span> Admin Panel
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
