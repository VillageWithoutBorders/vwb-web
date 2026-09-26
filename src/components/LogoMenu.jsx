import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

// Wherever the app is actually running (production, a preview deploy, or
// localhost), not a hardcoded domain, so the shared link and QR code always
// point somewhere real.
const APP_URL = window.location.origin
// The QR code skips the landing page and opens the sign-up form directly,
// so someone scanning at an event is one step from joining.
const SIGNUP_URL = `${APP_URL}/login?mode=signup`
const SHARE_TEXT = 'Village Without Borders is a mutual aid network where neighbors help neighbors. Join us:'

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

// The logo doubles as the account menu: tap it from anywhere in the app to
// share Village Without Borders with someone, visit the marketing site, or
// log out. No page needs its own logout button because of this.
export default function LogoMenu() {
  const { signOut } = useAuth()
  const { canInstall, isStandalone, isIOS, promptInstall } = useInstallPrompt()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sharePanelOpen, setSharePanelOpen] = useState(false)
  const [installInfoOpen, setInstallInfoOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  // A custom modal instead of window.confirm(): the native dialog doesn't
  // fire reliably in every environment the app runs in (it's silently
  // blocked in some in-app preview browsers, and renders inconsistently
  // once this is installed as a PWA on a phone), so logging out could
  // silently do nothing depending on where you opened the app from.
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false)

  function closeAll() {
    setMenuOpen(false)
    setSharePanelOpen(false)
    setInstallInfoOpen(false)
    setCopied(false)
    setConfirmLogoutOpen(false)
  }

  // On browsers that support it (Chrome/Edge, most Android browsers), this
  // shows the real install dialog directly. Everywhere else -- iOS Safari,
  // which never offers that dialog at all, or a browser that hasn't decided
  // this page is installable yet -- it falls back to plain instructions
  // instead of doing nothing, so the menu item always does something useful.
  async function handleInstallClick() {
    setMenuOpen(false)
    if (canInstall) {
      await promptInstall()
      return
    }
    setInstallInfoOpen(true)
  }

  async function handleNativeShare() {
    if (!navigator.share) return
    try {
      await navigator.share({ title: 'Village Without Borders', text: SHARE_TEXT, url: APP_URL })
    } catch (err) {
      if (err.name !== 'AbortError') console.error('[LogoMenu] share', err)
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(`${SHARE_TEXT} ${APP_URL}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('[LogoMenu] copy', err)
      alert(`Could not copy automatically. Here's the link: ${APP_URL}`)
    }
  }

  function handleLogout() {
    setMenuOpen(false)
    setConfirmLogoutOpen(true)
  }

  function confirmLogout() {
    closeAll()
    signOut()
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu" aria-expanded={menuOpen} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'block' }}>
        <img src="/images/vwb_header.png" alt="Village Without Borders" style={{ height: '40px', borderRadius: '50%' }} />
      </button>

      {menuOpen && (
        <>
          <button type="button" aria-label="Close menu" onClick={closeAll} style={{ position: 'fixed', inset: 0, background: 'none', border: 'none', padding: 0, cursor: 'default', zIndex: 200 }} />
          <div style={{ position: 'absolute', top: '48px', left: 0, background: '#242424', border: '1px solid #444', borderRadius: '12px', minWidth: '200px', overflow: 'hidden', zIndex: 201, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            <button type="button" onClick={() => { setMenuOpen(false); setSharePanelOpen(true) }} style={menuItemStyle}>
              <span aria-hidden="true">{'\u{1F4E4}'}</span> Share the app
            </button>
            <a href="https://villagewithoutborders.org" target="_blank" rel="noopener noreferrer" onClick={closeAll} style={{ ...menuItemStyle, textDecoration: 'none', display: 'flex', borderTop: '1px solid #333' }}>
              <span aria-hidden="true">{'\u{1F310}'}</span> Visit our website
            </a>
            {!isStandalone && (
              <button type="button" onClick={handleInstallClick} style={{ ...menuItemStyle, borderTop: '1px solid #333' }}>
                <span aria-hidden="true">{'\u{1F4F2}'}</span> Install app
              </button>
            )}
            <button type="button" onClick={handleLogout} style={{ ...menuItemStyle, color: '#ff8888', borderTop: '1px solid #333' }}>
              <span aria-hidden="true">{'\u{1F6AA}'}</span> Log out
            </button>
          </div>
        </>
      )}

      {sharePanelOpen && (
        <>
          <button type="button" aria-label="Close" onClick={closeAll} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', border: 'none', padding: 0, cursor: 'pointer', zIndex: 210 }} />
          <div role="dialog" aria-label="Share Village Without Borders" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#242424', border: '1px solid #444', borderRadius: '16px', padding: '1.5rem', zIndex: 211, width: '90%', maxWidth: '340px', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 0.5rem', color: '#4ecca3', fontSize: '1.1rem' }}>Share Village Without Borders</h2>
            <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 1rem' }}>Scan with your phone camera to sign up. Just a plain link, nothing tracked.</p>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=520x520&margin=0&data=${encodeURIComponent(SIGNUP_URL)}`}
              alt="QR code that opens the Village Without Borders sign-up form"
              width={260}
              height={260}
              style={{ width: '100%', maxWidth: '260px', height: 'auto', aspectRatio: '1 / 1', borderRadius: '8px', background: '#fff', padding: '12px', boxSizing: 'border-box' }}
            />
            <p style={{ color: '#ccc', fontSize: '0.8rem', margin: '1rem 0 0.75rem', wordBreak: 'break-all' }}>{APP_URL}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {typeof navigator !== 'undefined' && navigator.share && (
                <button type="button" className="btn btn-primary btn-full" onClick={handleNativeShare}>Share...</button>
              )}
              <button type="button" className="btn btn-outline btn-full" onClick={handleCopyLink}>{copied ? 'Copied!' : 'Copy link'}</button>
              <button type="button" className="link-button" onClick={closeAll} style={{ marginTop: '0.25rem' }}>Close</button>
            </div>
          </div>
        </>
      )}

      {installInfoOpen && (
        <>
          <button type="button" aria-label="Close" onClick={closeAll} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', border: 'none', padding: 0, cursor: 'pointer', zIndex: 210 }} />
          <div role="dialog" aria-label="Install Village Without Borders" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#242424', border: '1px solid #444', borderRadius: '16px', padding: '1.5rem', zIndex: 211, width: '90%', maxWidth: '340px', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 0.5rem', color: '#4ecca3', fontSize: '1.1rem' }}>Install Village Without Borders</h2>
            {isIOS ? (
              <p style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1.25rem' }}>
                Tap the share button <span style={{ fontSize: '1.1em' }}>&#x2B06;&#xFE0F;</span> at the bottom of Safari, then "Add to Home Screen."
              </p>
            ) : (
              <p style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1.25rem' }}>
                Look for "Install app" or "Add to Home Screen" in your browser's menu -- usually behind an icon in the address bar, or your browser's main menu (the three dots or lines).
              </p>
            )}
            <button type="button" className="btn btn-primary btn-full" onClick={closeAll}>Got it</button>
          </div>
        </>
      )}

      {confirmLogoutOpen && (
        <>
          <button type="button" aria-label="Close" onClick={closeAll} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', border: 'none', padding: 0, cursor: 'pointer', zIndex: 210 }} />
          <div role="dialog" aria-label="Confirm log out" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#242424', border: '1px solid #444', borderRadius: '16px', padding: '1.5rem', zIndex: 211, width: '90%', maxWidth: '320px', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 0.5rem', color: '#eee', fontSize: '1.1rem' }}>Log out?</h2>
            <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>You'll need to sign back in to get to your account again.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button type="button" onClick={confirmLogout} style={{ padding: '0.7rem', borderRadius: '10px', border: 'none', background: '#ff8888', color: '#1a1a1a', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>Log out</button>
              <button type="button" className="link-button" onClick={closeAll} style={{ marginTop: '0.1rem' }}>Cancel</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
