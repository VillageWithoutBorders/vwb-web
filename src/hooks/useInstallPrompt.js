import { useState, useEffect, useCallback } from 'react'

// Shared install-prompt detection, used by both InstallBanner (the
// dismissible one-time nudge on the Dashboard) and LogoMenu (the permanent
// "Install app" item in the header menu), so there's one place that listens
// for the browser's install prompt and knows whether the app is already
// installed, instead of two components each carrying their own copy of this
// logic.
//
// canInstall only ever becomes true on browsers that fire
// beforeinstallprompt (Chrome/Edge/most Android browsers) once the page
// meets their installability criteria. iOS Safari never fires it at all --
// there's no programmatic install there, only the manual Share > Add to
// Home Screen flow -- and some desktop browsers (Firefox, some Safari
// versions) don't support an install prompt either. Callers should treat
// !canInstall as "show instructions" rather than "hide the option", since
// the browser not having offered a prompt yet doesn't mean installing is
// impossible.
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
    setIsStandalone(standalone)
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream)

    function handlePrompt(e) {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    function handleInstalled() {
      setDeferredPrompt(null)
      setIsStandalone(true)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  // Shows the browser's real install dialog. Only works when canInstall is
  // true (a beforeinstallprompt event is in hand); returns null otherwise so
  // the caller knows to fall back to instructions instead. The captured
  // event can only be used once, so it's cleared either way after this.
  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return null
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    return outcome
  }, [deferredPrompt])

  return { canInstall: !!deferredPrompt, isStandalone, isIOS, promptInstall }
}
