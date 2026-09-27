import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { startAppTour } from './AppTour'

// The one menu in the top bar. It replaces two hidden menus (tapping the logo,
// and a separate person icon) that people didn't know were there.
// The button says "Menu" in words, not just an icon.

// Wherever the app is actually running, so the shared link and QR code always work.
const APP_URL = window.location.origin
// The QR code opens the sign-up form directly, so someone scanning at an event
// is one step from joining.
const SIGNUP_URL = `${APP_URL}/login?mode=signup`
const SHARE_TEXT = 'Village Without Borders is a mutual aid network where neighbors help neighbors. Join us:'

export default function AppMenu() {
  const navigate = useNavigate()
  const { signOut, isAdmin } = useAuth()
  const { canInstall, isStandalone, isIOS, promptInstall } = useInstallPrompt()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState(null) // 'share' | 'install' | 'logout'
  const [copied, setCopied] = useState(false)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  // Open: focus the first item. Escape closes and returns focus to the button.
  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector('button, a')?.focus()
    function onKey(e) {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!panel) return
    function onKey(e) { if (e.key === 'Escape') closePanel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel])

  function closePanel() {
    setPanel(null)
    setCopied(false)
    buttonRef.current?.focus()
  }

  function go(path, state) {
    setOpen(false)
    navigate(path, state ? { state } : undefined)
  }

  async function handleInstall() {
    setOpen(false)
    if (canInstall) { await promptInstall(); return }
    setPanel('install')
  }

  async function handleNativeShare() {
    if (!navigator.share) return
    try {
      await navigator.share({ title: 'Village Without Borders', text: SHARE_TEXT, url: APP_URL })
    } catch (err) {
      if (err.name !== 'AbortError') console.error('[AppMenu] share', err)
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(`${SHARE_TEXT} ${APP_URL}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('[AppMenu] copy', err)
      alert(`Could not copy automatically. Here's the link: ${APP_URL}`)
    }
  }

  return (
    <div className="app-menu">
      <button
        ref={buttonRef}
        type="button"
        className="header-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="appMenuList"
        aria-haspopup="true"
        aria-label="Menu"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
        <span className="header-btn-label">Menu</span>
      </button>

      {open && (
        <>
          <button type="button" className="app-menu-scrim" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} />
          <div id="appMenuList" className="app-menu-list" ref={menuRef}>
            <p className="app-menu-heading">Your account</p>
            <button type="button" className="app-menu-item" onClick={() => go('/profile', { openEdit: true })}>
              <span aria-hidden="true">{'\u{1F464}'}</span> Edit my profile
            </button>
            <button type="button" className="app-menu-item" onClick={() => go('/settings')}>
              <span aria-hidden="true">{'⚙️'}</span> Settings and privacy
            </button>
            {isAdmin && (
              <button type="button" className="app-menu-item" onClick={() => go('/admin')}>
                <span aria-hidden="true">{'\u{1F6E1}️'}</span> Admin panel
              </button>
            )}

            <p className="app-menu-heading">Help</p>
            <button type="button" className="app-menu-item" onClick={() => go('/help')}>
              <span aria-hidden="true">{'❓'}</span> Help and feedback
            </button>
            <button type="button" className="app-menu-item" onClick={() => { setOpen(false); startAppTour() }}>
              <span aria-hidden="true">{'\u{1F9ED}'}</span> Take the tour
            </button>

            <p className="app-menu-heading">Village Without Borders</p>
            <button type="button" className="app-menu-item" onClick={() => { setOpen(false); setPanel('share') }}>
              <span aria-hidden="true">{'\u{1F4E4}'}</span> Share the app
            </button>
            {!isStandalone && (
              <button type="button" className="app-menu-item" onClick={handleInstall}>
                <span aria-hidden="true">{'\u{1F4F2}'}</span> Put the app on my home screen
              </button>
            )}
            <a className="app-menu-item" href="https://villagewithoutborders.org" target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              <span aria-hidden="true">{'\u{1F310}'}</span> Visit our website
              <span className="sr-only"> (opens in a new tab)</span>
            </a>

            <button type="button" className="app-menu-item app-menu-logout" onClick={() => { setOpen(false); setPanel('logout') }}>
              <span aria-hidden="true">{'\u{1F6AA}'}</span> Log out
            </button>
          </div>
        </>
      )}

      {panel && (
        <>
          <button type="button" className="app-dialog-scrim" aria-label="Close" tabIndex={-1} onClick={closePanel} />
          {panel === 'share' && (
            <div role="dialog" aria-modal="true" aria-labelledby="shareTitle" className="app-dialog">
              <h2 id="shareTitle" className="app-dialog-title">Share Village Without Borders</h2>
              <p className="app-dialog-text">Scan with a phone camera to sign up. It's a plain link. Nothing is tracked.</p>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=520x520&margin=0&data=${encodeURIComponent(SIGNUP_URL)}`}
                alt="QR code that opens the Village Without Borders sign-up form"
                width={260}
                height={260}
                className="app-dialog-qr"
              />
              <p className="app-dialog-link">{APP_URL}</p>
              <div className="app-dialog-buttons">
                {typeof navigator !== 'undefined' && navigator.share && (
                  <button type="button" className="btn btn-primary btn-full" onClick={handleNativeShare}>Share...</button>
                )}
                <button type="button" className="btn btn-outline btn-full" onClick={handleCopyLink}>{copied ? 'Copied!' : 'Copy link'}</button>
                <button type="button" className="btn btn-outline btn-full" onClick={closePanel} autoFocus>Close</button>
              </div>
            </div>
          )}
          {panel === 'install' && (
            <div role="dialog" aria-modal="true" aria-labelledby="installTitle" className="app-dialog">
              <h2 id="installTitle" className="app-dialog-title">Put the app on your home screen</h2>
              {isIOS ? (
                <p className="app-dialog-text">In Safari, tap the Share button (the square with an arrow pointing up) at the bottom of the screen. Then tap "Add to Home Screen."</p>
              ) : (
                <p className="app-dialog-text">Open your browser's menu (the three dots or three lines). Then tap "Install app" or "Add to Home Screen."</p>
              )}
              <div className="app-dialog-buttons">
                <button type="button" className="btn btn-primary btn-full" onClick={closePanel} autoFocus>Got it</button>
              </div>
            </div>
          )}
          {panel === 'logout' && (
            <div role="dialog" aria-modal="true" aria-labelledby="logoutTitle" className="app-dialog">
              <h2 id="logoutTitle" className="app-dialog-title">Log out?</h2>
              <p className="app-dialog-text">You'll need your email and password to get back in.</p>
              <div className="app-dialog-buttons">
                <button type="button" className="btn btn-full app-dialog-danger" onClick={() => { setPanel(null); signOut() }}>Log out</button>
                <button type="button" className="btn btn-outline btn-full" onClick={closePanel} autoFocus>Stay logged in</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
