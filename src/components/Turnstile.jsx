import { useEffect, useRef, useState } from 'react'

// Cloudflare Turnstile: a quick "are you a person?" check that stops
// automated fake sign-ups. Most people never see a puzzle. Supabase checks
// the token when "CAPTCHA protection" is on in the dashboard.
// Needs VITE_TURNSTILE_SITE_KEY. Without it this renders nothing, so the
// app keeps working until the check is set up.
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''

let scriptPromise = null
function loadScript() {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => { scriptPromise = null; reject(new Error('Turnstile failed to load')) }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

// `onToken(token)` gets a fresh token, or '' when it expires. Change
// `resetKey` after each sign-in or sign-up try, since a token works once.
export default function Turnstile({ onToken, resetKey = 0 }) {
  const box = useRef(null)
  const widgetId = useRef(null)
  // If the check can't load (an ad blocker, or a network that blocks
  // Cloudflare), say so, instead of leaving the button grey with no reason.
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    let cancelled = false
    setFailed(false)
    const slow = setTimeout(() => { if (!cancelled && !window.turnstile) setFailed(true) }, 12000)
    loadScript().then(() => {
      clearTimeout(slow)
      setFailed(false)
      if (cancelled || !box.current || !window.turnstile) return
      if (widgetId.current != null) { window.turnstile.remove(widgetId.current); widgetId.current = null }
      onToken('')
      widgetId.current = window.turnstile.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'auto',
        callback: (t) => onToken(t),
        'expired-callback': () => onToken(''),
        'error-callback': () => { onToken(''); setFailed(true) },
      })
    }).catch((e) => { console.error('[Turnstile]', e); if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      clearTimeout(slow)
      if (widgetId.current != null && window.turnstile) { window.turnstile.remove(widgetId.current); widgetId.current = null }
    }
  }, [resetKey])

  if (!TURNSTILE_SITE_KEY) return null
  return (
    <>
      <div ref={box} className="turnstile-box" aria-label="Human check" />
      {failed && (
        <p className="form-error" role="alert">
          The quick "are you a person?" check didn't load. If you use an ad blocker, pause it for this site, or try another browser. Still stuck? Email info@villagewithoutborders.org.
        </p>
      )}
    </>
  )
}
