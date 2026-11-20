// The phone's Back button closes a pop-up (My Tools, My QR code) instead of leaving the
// page, and closing it any other way leaves Back working as before.
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBackCloses } from '../../src/hooks/useBackCloses'

let back
beforeEach(() => {
  vi.useFakeTimers()
  window.history.replaceState(null, '')
  // Stand in for the browser going back, so the test page itself never moves.
  back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
})

function openPopUp(options) {
  const close = vi.fn()
  const hook = renderHook(() => useBackCloses({ current: close }), options)
  return { close, ...hook }
}
// What the browser does when the person presses Back: the pop-up's step is gone.
function pressBack() {
  window.history.replaceState(null, '')
  window.dispatchEvent(new PopStateEvent('popstate'))
}
const hasPopUpStep = () => !!(window.history.state && window.history.state.vwbSheet)

describe('useBackCloses', () => {
  it('opening a pop-up adds one step to the history, keeping what was there', () => {
    window.history.replaceState({ scroll: 120 }, '')
    const before = window.history.length
    openPopUp()
    expect(window.history.length).toBe(before + 1)
    expect(hasPopUpStep()).toBe(true)
    expect(window.history.state.scroll).toBe(120)
  })

  it('Back closes the pop-up', () => {
    const { close } = openPopUp()
    pressBack()
    expect(close).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith(false)
  })

  it('a history move that still has the pop-up step does not close it', () => {
    const { close } = openPopUp()
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(close).not.toHaveBeenCalled()
  })

  it('closing the pop-up another way takes its step back out, a moment later', () => {
    const { unmount } = openPopUp()
    unmount()
    expect(back).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('does not go back a second time after Back already closed it', () => {
    const { unmount } = openPopUp()
    pressBack()
    unmount()
    vi.runAllTimers()
    expect(back).not.toHaveBeenCalled()
  })

  it('stops listening for Back once the pop-up is closed', () => {
    const { close, unmount } = openPopUp()
    unmount()
    vi.runAllTimers()
    pressBack()
    expect(close).not.toHaveBeenCalled()
  })

  it('two pop-ups share one step, and it stays until the last one closes', () => {
    const before = window.history.length
    const first = openPopUp()
    const second = openPopUp()
    expect(window.history.length).toBe(before + 1)
    first.unmount()
    vi.runAllTimers()
    expect(back).not.toHaveBeenCalled()
    second.unmount()
    vi.runAllTimers()
    expect(back).toHaveBeenCalledTimes(1)
  })

  it("does not close itself when React's strict mode opens it twice in a row", () => {
    const listen = vi.spyOn(window, 'addEventListener')
    const { close } = openPopUp({ wrapper: StrictMode })
    // Strict mode really did open it, close it, and open it again.
    expect(listen.mock.calls.filter(([type]) => type === 'popstate')).toHaveLength(2)
    vi.runAllTimers()
    expect(back).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(hasPopUpStep()).toBe(true)
  })
})
