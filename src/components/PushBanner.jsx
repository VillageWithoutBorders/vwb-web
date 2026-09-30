import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { isPushSupported, subscribeToPush } from '../utils/pushUtils'

export default function PushBanner() {
  const { user } = useAuth()
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    async function check() {
      if (!user?.id || !isPushSupported()) return
      if (Notification.permission === 'denied') return
      if (localStorage.getItem('vwb_push_v2') === 'true') return
      if (Notification.permission === 'granted') {
        try {
          const reg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => setTimeout(() => reject('timeout'), 2000))
          ])
          const sub = await reg.pushManager.getSubscription()
          if (sub) {
            // Re-save quietly so the server always has this device's current keys
            const synced = await subscribeToPush(user.id)
            if (synced.ok) {
              localStorage.setItem('vwb_push_v2', 'true')
              return
            }
          }
        } catch {
          // SW not ready, check dismissed
        }
      }
      const dismissed = localStorage.getItem('vwb_push_dismissed')
      if (dismissed) {
        const dismissedAt = parseInt(dismissed, 10)
        if (Date.now() - dismissedAt < 3 * 24 * 60 * 60 * 1000) return
      }
      setVisible(true)
    }
    check()
  }, [user?.id])

  async function handleEnable() {
    setLoading(true)
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setLoading(false)
      setMessage('Notifications were blocked. You can enable them in your browser settings.')
      return
    }
    const result = await subscribeToPush(user.id)
    setLoading(false)
    if (result.ok) {
      localStorage.setItem('vwb_push_v2', 'true')
      setMessage('Notifications are on.')
      setTimeout(() => setVisible(false), 2500)
    } else {
      setMessage('Could not turn on notifications. Please try again later.')
      setTimeout(() => setVisible(false), 4000)
    }
  }

  function handleDismiss() {
    localStorage.setItem('vwb_push_dismissed', Date.now().toString())
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="push-banner">
      <div className="push-banner-content">
        <span className="push-banner-icon">&#x1F514;</span>
        <div className="push-banner-text">
          <strong>{message || 'Stay in the loop'}</strong>
          {!message && <p>Get notified when neighbors need help or someone responds to your request.</p>}
        </div>
      </div>
      {!message && (
        <div className="push-banner-actions">
          <button className="btn btn-primary btn-sm" onClick={handleEnable} disabled={loading}>
            {loading ? 'Enabling...' : 'Enable'}
          </button>
          <button className="push-banner-dismiss" onClick={handleDismiss}>Not now</button>
        </div>
      )}
    </div>
  )
}