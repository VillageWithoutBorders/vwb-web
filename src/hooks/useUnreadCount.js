import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export function useUnreadCount(intervalMs = 30000) {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!user?.id) return
    const { data, error } = await supabase.rpc('unread_conversation_count', { user_uuid: user.id })
    if (!error && typeof data === 'number') setCount(data)
  }, [user?.id])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, intervalMs)
    return () => clearInterval(timer)
  }, [refresh, intervalMs])

  return { unreadCount: count, refreshUnread: refresh }
}
