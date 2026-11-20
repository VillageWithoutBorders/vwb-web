import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'

const UnreadCountContext = createContext({ unreadCount: 0, chatUnread: 0, refreshUnread: () => {}, newBoards: new Set() })
const NO_BOARDS = new Set()

export function UnreadCountProvider({ children }) {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  // Nov 20 (Jade): private chats only, for the People and Chats buttons.
  // The bottom Messages tab still shows everything (chats plus new posts).
  const [chatCount, setChatCount] = useState(0)
  // Nov 10 (Jade): Cottage Chats and Campfires with a new post you have not read yet.
  // The database keeps one unread 'group_post' alert per board, so each board counts once.
  const [newBoards, setNewBoards] = useState(NO_BOARDS)

  const refresh = useCallback(async () => {
    if (!user?.id) return
    // Nov 14 (Jade): unread_chat_count counts the same chats the Unread list shows
    // (no blocked people, no chats you emptied, chats you marked unread counted once).
    // Until that SQL is run, fall back to the older count.
    let chats = 0
    const { data: v2, error: v2Err } = await supabase.rpc('unread_chat_count')
    if (!v2Err && typeof v2 === 'number') {
      chats = v2
    } else {
      const { data, error } = await supabase.rpc('unread_conversation_count', { user_uuid: user.id })
      if (error || typeof data !== 'number') return
      // Chats you marked unread yourself (Messages > Mark as unread) count too.
      const { count: marked, error: markedErr } = await supabase
        .from('conversation_user_settings')
        .select('conversation_id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('marked_unread', true)
      chats = data + (markedErr ? 0 : (marked || 0))
    }
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
    // Nov 19 (Jade): village chats with new posts count too, one per chat, so the
    // bottom Messages tab shows the same new posts as Places > Village Square.
    // If that check fails, fall back to counting the Village Square summary once.
    const { data: vu, error: vuErr } = await supabase.rpc('campfire_unread')
    if (vuErr) console.error('[UnreadCount] village chats', vuErr)
    const villageChats = vuErr ? 0 : (vu || []).filter((r) => Number(r.unread || 0) > 0).length
    const square = villageChats || (rows.some((p) => p.type === 'campfire') ? 1 : 0)
    setNewBoards(boards)
    setChatCount(chats)
    setCount(chats + boards.size + square)
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
    <UnreadCountContext.Provider value={{ unreadCount: count, chatUnread: chatCount, refreshUnread: refresh, newBoards }}>
      {children}
    </UnreadCountContext.Provider>
  )
}

export function useUnreadCount() {
  return useContext(UnreadCountContext)
}
