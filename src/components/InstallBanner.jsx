import { useState, useEffect } from 'react'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { useT } from '../utils/lang'

export default function InstallBanner() {
  const { canInstall, isStandalone, isIOS, promptInstall } = useInstallPrompt()
  const t = useT()
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
          <strong>{t('Install VWB')}</strong>
          {isIOS ? (
            <p>{t('Tap the share button')} <span style={{ fontSize: '1.1em' }}>&#x2B06;&#xFE0F;</span> {t('then "Add to Home Screen" to install.')}</p>
          ) : (
            <p>{t('Add Village Without Borders to your home screen for quick access.')}</p>
          )}
        </div>
      </div>
      <div className="install-banner-actions">
        {!isIOS && (
          <button className="btn btn-primary btn-sm" onClick={handleInstall}>
            {t('Install')}
          </button>
        )}
        <button className="install-banner-dismiss" onClick={handleDismiss}>
          {isIOS ? t('Got it') : t('Not now')}
        </button>
      </div>
    </div>
  )
}