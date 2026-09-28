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
    if (error || typeof data !== 'number') return
    // Chats you marked unread yourself (Messages > Mark as unread) count too.
    // If that column isn't there yet, just use the regular count.
    const { count: marked, error: markedErr } = await supabase
      .from('conversation_user_settings')
      .select('conversation_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('marked_unread', true)
    setCount(data + (markedErr ? 0 : (marked || 0)))
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
