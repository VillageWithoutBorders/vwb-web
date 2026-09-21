import { useEffect, useRef, useState, useCallback } from 'react'

// Keeps a chat scrolled to the newest message only when that is what the
// reader wants.
//
// The chat screens refresh their messages every few seconds. Each refresh
// hands React a brand new list, and the old code scrolled to the bottom on
// every new list, even when nothing new had arrived. That yanked people back
// down whenever they tried to scroll up to read earlier messages.
//
// Now the chat only moves when:
//   - it first opens (jump straight to the newest message),
//   - a genuinely new message arrives and the reader is already at the
//     bottom, or the new message is their own.
// If a new message arrives while someone is reading further up, they stay
// where they are and a "New messages" button appears instead.
export function useChatScroll(messages, myUserId, active = true) {
  const containerRef = useRef(null)
  const stickRef = useRef(true)
  const lastIdRef = useRef(null)
  const firstLoadRef = useRef(true)
  const [showNew, setShowNew] = useState(false)

  const scrollToBottom = useCallback((smooth) => {
    const el = containerRef.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? 'smooth' : 'auto' })
  }, [])

  const onScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    stickRef.current = nearBottom
    if (nearBottom) setShowNew(false)
  }, [])

  useEffect(() => {
    if (!active || !messages || messages.length === 0) return
    const last = messages[messages.length - 1]

    if (firstLoadRef.current) {
      firstLoadRef.current = false
      lastIdRef.current = last.id
      stickRef.current = true
      scrollToBottom(false)
      return
    }

    // Same newest message as before: this was just a refresh. Leave the
    // reader exactly where they are.
    if (last.id === lastIdRef.current) return
    lastIdRef.current = last.id

    const mine = !!myUserId && (last.sender_id === myUserId || last.user_id === myUserId)
    if (stickRef.current || mine) {
      stickRef.current = true
      setShowNew(false)
      scrollToBottom(true)
    } else {
      setShowNew(true)
    }
  }, [messages, myUserId, active, scrollToBottom])

  // Call when the list is swapped for a different one (for example an admin
  // switching villages) so the new list opens at the newest message.
  const resetScroll = useCallback(() => {
    firstLoadRef.current = true
    lastIdRef.current = null
    stickRef.current = true
    setShowNew(false)
  }, [])

  const jumpToNewest = useCallback(() => {
    stickRef.current = true
    setShowNew(false)
    scrollToBottom(true)
  }, [scrollToBottom])

  return { containerRef, onScroll, showNew, jumpToNewest, resetScroll }
}
