import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'

const UnreadCountContext = createContext({ unreadCount: 0, refreshUnread: () => {} })

export function UnreadCountProvider({ children }) {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!user?.id) return
    const { data, error } = await supabase.rpc('unread_conversation_count', { user_uuid: user.id })
    if (!error && typeof data === 'number') setCount(data)
  }, [user?.id])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 30000)
    return () => clearInterval(timer)
  }, [refresh])

  return (
    <UnreadCountContext.Provider value={{ unreadCount: count, refreshUnread: refresh }}>
      {children}
    </UnreadCountContext.Provider>
  )
}

export function useUnreadCount() {
  return useContext(UnreadCountContext)
}
