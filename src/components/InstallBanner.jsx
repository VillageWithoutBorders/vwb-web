import { useState, useEffect } from 'react'

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (navigator.standalone) return

    const dismissed = localStorage.getItem('vwb_install_dismissed')
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10)
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return
    }

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    setIsIOS(ios)

    if (ios) {
      setVisible(true)
      return
    }

    function handlePrompt(e) {
      e.preventDefault()
      setDeferredPrompt(e)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handlePrompt)
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt)
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
    }
    setDeferredPrompt(null)
  }

  function handleDismiss() {
    localStorage.setItem('vwb_install_dismissed', Date.now().toString())
    setVisible(false)
  }

  if (!visible) return null

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