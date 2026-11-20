import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useUnreadCount } from '../context/UnreadCountContext'
import { useNotificationsContext } from '../context/NotificationsContext'

// Nov 20 (Jade): the number on the VWB icon on a phone's home screen or a computer's
// taskbar. It is the bottom Messages count plus the Alerts bell count.
// iPhone shows it only for a home screen app with alerts turned on. Most Android
// phones show a dot; some show the number. Phones that can't do it skip it quietly.
// The service worker (sw.js) adds one for each alert that arrives while VWB is closed,
// and this sets the exact number again as soon as VWB opens.
export default function AppIconBadge() {
  const { user } = useAuth()
  const { unreadCount } = useUnreadCount()
  const { badgeCount = 0 } = useNotificationsContext()
  const total = user?.id ? (unreadCount || 0) + (badgeCount || 0) : 0

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return
    const job = total > 0 ? navigator.setAppBadge(total) : navigator.clearAppBadge()
    Promise.resolve(job).catch((err) => console.warn('[AppIconBadge] could not set icon number', err))
    // Tell the service worker where the count starts, so closed-app alerts add to it.
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: 'vwb-badge', count: total })
    } catch { /* no service worker yet */ }
  }, [total])

  return null
}
