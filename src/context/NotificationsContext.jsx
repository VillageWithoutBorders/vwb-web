import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'

// One shared list of alerts for the whole app, so the badge in the top bar
// and the Alerts page always agree. (They used to each keep their own
// count, and the badge only caught up every 30 seconds.)
//
// Two different ideas:
//   unreadCount: alerts you haven't tapped yet. Shown as "New" on the page.
//   badgeCount:  alerts that arrived since you last OPENED the Alerts page.
//                Opening the page clears the badge, like Facebook does,
//                even before you tap each one.
// "Last opened" is remembered per person on this device.

const NotificationsContext = createContext(null)
const POLL_MS = 30000

function seenKey(userId) { return 'vwb_alerts_seen_' + userId }

export function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [seenAt, setSeenAt] = useState(0)

  useEffect(() => {
    if (!user?.id) { setSeenAt(0); return }
    try { setSeenAt(Number(localStorage.getItem(seenKey(user.id)) || 0)) } catch { setSeenAt(0) }
  }, [user?.id])

  const refresh = useCallback(async () => {
    if (!user?.id) { setNotifications([]); setLoading(false); return }
    // 'message' alerts are left out on purpose: the Messages tab has its own
    // unread badge, and a new message used to bump both at once. The row
    // still exists (it's what sends the push notification).
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .neq('type', 'message')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) console.error('[NotificationsContext] refresh', error)
    else setNotifications(data || [])
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    refresh()
    if (!user?.id) return
    const timer = setInterval(refresh, POLL_MS)
    // Catch up as soon as someone comes back to the app.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [refresh, user?.id])

  // Called when the Alerts page opens: the badge goes to zero right away.
  const markSeen = useCallback(() => {
    if (!user?.id) return
    const now = Date.now()
    setSeenAt(now)
    try { localStorage.setItem(seenKey(user.id), String(now)) } catch { /* private mode */ }
  }, [user?.id])

  const unread = notifications.filter(n => !n.read)
  const value = {
    notifications,
    loading,
    refresh,
    markSeen,
    unreadCount: unread.length,
    badgeCount: unread.filter(n => new Date(n.created_at).getTime() > seenAt).length,
  }
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotificationsContext() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotificationsContext must be inside NotificationsProvider')
  return ctx
}
