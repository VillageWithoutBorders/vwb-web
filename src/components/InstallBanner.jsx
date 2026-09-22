import { useState, useEffect } from 'react'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

export default function InstallBanner() {
  const { canInstall, isStandalone, isIOS, promptInstall } = useInstallPrompt()
  const [dismissedRecently, setDismissedRecently] = useState(true)

  useEffect(() => {
    const dismissed = localStorage.getItem('vwb_install_dismissed')
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10)
      setDismissedRecently(Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000)
    } else {
      setDismissedRecently(false)
    }
  }, [])

  async function handleInstall() {
    const outcome = await promptInstall()
    if (outcome === 'accepted') {
      setDismissedRecently(true)
    }
  }

  function handleDismiss() {
    localStorage.setItem('vwb_install_dismissed', Date.now().toString())
    setDismissedRecently(true)
  }

  // Same "install app" access is always available permanently from the
  // logo menu in the header (see LogoMenu.jsx) -- this banner is just an
  // early, dismissible nudge toward it, not the only way in.
  if (isStandalone || dismissedRecently) return null
  if (!isIOS && !canInstall) return null

  return (
    <div className="install-banner">
      <div className="install-banner-content">
        <span className="install-banner-icon">&#x1F4F2;</span>
        <div className="install-banner-text">
          <strong>Install VWB</strong>
          {isIOS ? (
            <p>Tap the share button <span style={{ fontSize: '1.1em' }}>&#x2B06;&#xFE0F;</span> then "Add to Home Screen" to install.</p>
          ) : (
            <p>Add Village Without Borders to your home screen for quick access.</p>
          )}
        </div>
      </div>
      <div className="install-banner-actions">
        {!isIOS && (
          <button className="btn btn-primary btn-sm" onClick={handleInstall}>
            Install
          </button>
        )}
        <button className="install-banner-dismiss" onClick={handleDismiss}>
          {isIOS ? 'Got it' : 'Not now'}
        </button>
      </div>
    </div>
  )
}