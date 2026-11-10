import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'

const UnreadCountContext = createContext({ unreadCount: 0, refreshUnread: () => {}, newBoards: new Set() })
const NO_BOARDS = new Set()

export function UnreadCountProvider({ children }) {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  // Nov 10 (Jade): Cottage Chats and Campfires with a new post you have not read yet.
  // The database keeps one unread 'group_post' alert per board, so each board counts once.
  const [newBoards, setNewBoards] = useState(NO_BOARDS)

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
    const { data: posts, error: postsErr } = await supabase
      .from('notifications')
      .select('type, link')
      .eq('user_id', user.id)
      .in('type', ['group_post', 'campfire'])
      .eq('read', false)
      .limit(100)
    if (postsErr) console.error('[UnreadCount] new board posts', postsErr)
    const rows = postsErr ? [] : posts || []
    const boards = new Set(rows.filter((p) => p.type === 'group_post').map((p) => String(p.link || '').replace(/^\/groups\//, '')).filter(Boolean))
    // The Village Square summary counts once, however many there are.
    const square = rows.some((p) => p.type === 'campfire') ? 1 : 0
    setNewBoards(boards)
    setCount(data + (markedErr ? 0 : (marked || 0)) + boards.size + square)
  }, [user?.id])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 30000)
    // Catch up as soon as someone comes back to the app.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [refresh])

  return (
    <UnreadCountContext.Provider value={{ unreadCount: count, refreshUnread: refresh, newBoards }}>
      {children}
    </UnreadCountContext.Provider>
  )
}

export function useUnreadCount() {
  return useContext(UnreadCountContext)
}
