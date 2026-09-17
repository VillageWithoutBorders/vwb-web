import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export function useNotifications(intervalMs = 30000) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return
    // 'message' notifications are excluded here on purpose: the Messages tab
    // already has its own unread badge for new messages, and a new message
    // used to bump both badges at once. The row still gets created (it's
    // what triggers the push notification), it just isn't counted or shown
    // in this bell feed anymore, so there's one clear signal per event.
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .neq('type', 'message')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      console.error('[useNotifications] fetchNotifications', error)
    } else if (data) {
      setNotifications(data)
      setUnreadCount(data.filter(n => !n.read).length)
    }
    setLoading(false)
  }, [user?.id])

  const fetchUnreadCount = useCallback(async () => {
    if (!user?.id) return
    const { data, error } = await supabase.rpc('unread_notification_count', { user_uuid: user.id })
    if (error) {
      console.error('[useNotifications] fetchUnreadCount', error)
    } else if (typeof data === 'number') {
      setUnreadCount(data)
    }
  }, [user?.id])

  useEffect(() => {
    fetchNotifications()
    const timer = setInterval(fetchUnreadCount, intervalMs)
    return () => clearInterval(timer)
  }, [fetchNotifications, fetchUnreadCount, intervalMs])

  return { notifications, unreadCount, loading, refresh: fetchNotifications }
}