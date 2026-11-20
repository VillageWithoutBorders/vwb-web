// The Admin page shows its phone build below 1024px and its desktop build at 1024px and
// wider, and switches when the window is resized.
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useWideScreen } from '../../src/hooks/useWideScreen'

// A pretend screen the test can widen and narrow.
function pretendScreen(wide, { old = false } = {}) {
  const listeners = new Set()
  const mq = { matches: wide }
  if (old) {
    mq.addListener = vi.fn((fn) => listeners.add(fn))
    mq.removeListener = vi.fn((fn) => listeners.delete(fn))
  } else {
    mq.addEventListener = vi.fn((_type, fn) => listeners.add(fn))
    mq.removeEventListener = vi.fn((_type, fn) => listeners.delete(fn))
  }
  const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(() => mq)
  return {
    matchMedia,
    listeners,
    resize(nowWide) { mq.matches = nowWide; listeners.forEach((fn) => fn()) },
  }
}

describe('useWideScreen', () => {
  it('asks about 1024px and wider', () => {
    const { matchMedia } = pretendScreen(false)
    renderHook(() => useWideScreen())
    expect(matchMedia).toHaveBeenCalledWith('(min-width: 1024px)')
  })

  it('is false on a phone and true on a computer', () => {
    pretendScreen(false)
    expect(renderHook(() => useWideScreen()).result.current).toBe(false)
    pretendScreen(true)
    expect(renderHook(() => useWideScreen()).result.current).toBe(true)
  })

  it('follows the window as it is made wider or narrower', () => {
    const screen = pretendScreen(false)
    const { result } = renderHook(() => useWideScreen())
    act(() => screen.resize(true))
    expect(result.current).toBe(true)
    act(() => screen.resize(false))
    expect(result.current).toBe(false)
  })

  it('stops listening when the page goes away', () => {
    const screen = pretendScreen(false)
    const { unmount } = renderHook(() => useWideScreen())
    expect(screen.listeners.size).toBe(1)
    unmount()
    expect(screen.listeners.size).toBe(0)
  })

  it('works on an older browser that only has addListener', () => {
    const screen = pretendScreen(false, { old: true })
    const { result, unmount } = renderHook(() => useWideScreen())
    act(() => screen.resize(true))
    expect(result.current).toBe(true)
    unmount()
    expect(screen.listeners.size).toBe(0)
  })

  it('is the phone build, without breaking, when the browser cannot be asked', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(() => { throw new Error('no matchMedia') })
    expect(renderHook(() => useWideScreen()).result.current).toBe(false)
  })
})
