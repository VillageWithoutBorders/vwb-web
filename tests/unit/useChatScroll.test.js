// A chat only moves to the newest message when the reader wants it to: when it opens,
// when they are already at the bottom, or when the new message is their own.
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useChatScroll } from '../../src/hooks/useChatScroll'

const ME = 'me'
const msg = (id, sender = 'ruth') => ({ id, sender_id: sender })

// The test browser has no real layout, so a pretend list stands in for the scrolling box:
// 2000px tall in a 500px window. scrollTop 1500 is the very bottom.
function pretendList() {
  return { scrollHeight: 2000, clientHeight: 500, scrollTop: 1500, scrollTo: vi.fn() }
}

// Opens a chat the way the app does: the screen draws first, then the messages arrive.
function openChat(firstMessages = [msg(1), msg(2)], { active = true } = {}) {
  const list = pretendList()
  const hook = renderHook(({ messages }) => useChatScroll(messages, ME, active), { initialProps: { messages: [] } })
  hook.result.current.containerRef.current = list
  const show = (messages) => hook.rerender({ messages })
  show(firstMessages)
  const readerScrollsTo = (scrollTop) => { list.scrollTop = scrollTop; act(() => hook.result.current.onScroll()) }
  return { list, show, readerScrollsTo, ...hook }
}

describe('useChatScroll', () => {
  it('opens at the newest message, with no sliding', () => {
    const { list, result } = openChat()
    expect(list.scrollTo).toHaveBeenCalledTimes(1)
    expect(list.scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: 'auto' })
    expect(result.current.showNew).toBe(false)
  })

  it('does not move on a refresh that brings nothing new', () => {
    const { list, show, readerScrollsTo } = openChat()
    readerScrollsTo(200)
    show([msg(1), msg(2)])
    show([msg(1), msg(2)])
    expect(list.scrollTo).toHaveBeenCalledTimes(1)
  })

  it('slides to a new message when the reader is already at the bottom', () => {
    const { list, show, result } = openChat()
    show([msg(1), msg(2), msg(3)])
    expect(list.scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'smooth' })
    expect(result.current.showNew).toBe(false)
  })

  it('counts "within 120px of the bottom" as at the bottom', () => {
    const { list, show, readerScrollsTo } = openChat()
    readerScrollsTo(1381)
    show([msg(1), msg(2), msg(3)])
    expect(list.scrollTo).toHaveBeenCalledTimes(2)
  })

  it('leaves a reader who scrolled up where they are, and offers "New messages" instead', () => {
    const { list, show, readerScrollsTo, result } = openChat()
    readerScrollsTo(1380)
    show([msg(1), msg(2), msg(3)])
    expect(list.scrollTo).toHaveBeenCalledTimes(1)
    expect(result.current.showNew).toBe(true)
  })

  it.each([
    ['a direct message (sender_id)', { id: 3, sender_id: ME }],
    ['a group post (user_id)', { id: 3, user_id: ME }],
  ])("always follows the reader's own new message: %s", (_kind, mine) => {
    const { list, show, readerScrollsTo, result } = openChat()
    readerScrollsTo(200)
    show([msg(1), msg(2), mine])
    expect(list.scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'smooth' })
    expect(result.current.showNew).toBe(false)
  })

  it('hides "New messages" once the reader scrolls back to the bottom', () => {
    const { show, readerScrollsTo, result } = openChat()
    readerScrollsTo(200)
    show([msg(1), msg(2), msg(3)])
    expect(result.current.showNew).toBe(true)
    readerScrollsTo(1500)
    expect(result.current.showNew).toBe(false)
  })

  it('tapping "New messages" jumps to the newest and follows new ones again', () => {
    const { list, show, readerScrollsTo, result } = openChat()
    readerScrollsTo(200)
    show([msg(1), msg(2), msg(3)])
    act(() => result.current.jumpToNewest())
    expect(list.scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'smooth' })
    expect(result.current.showNew).toBe(false)
    show([msg(1), msg(2), msg(3), msg(4)])
    expect(list.scrollTo).toHaveBeenCalledTimes(3)
  })

  it('never slides for someone who asked for calm motion', () => {
    document.documentElement.classList.add('calm-motion')
    const { list, show } = openChat()
    show([msg(1), msg(2), msg(3)])
    expect(list.scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' })
  })

  it('does nothing while the chat is not the one on screen', () => {
    const { list, show, result } = openChat([msg(1)], { active: false })
    show([msg(1), msg(2)])
    expect(list.scrollTo).not.toHaveBeenCalled()
    expect(result.current.showNew).toBe(false)
  })

  it('after resetScroll, a different list opens at its newest message with no sliding', () => {
    const { list, show, readerScrollsTo, result } = openChat()
    readerScrollsTo(200)
    act(() => result.current.resetScroll())
    show([msg(50), msg(51)])
    expect(list.scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' })
    expect(result.current.showNew).toBe(false)
  })
})
