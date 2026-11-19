// "Install app": the real install dialog is offered only when the browser handed VWB a
// prompt, a prompt is used once, and an installed app is never asked to install again.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useInstallPrompt } from '../../src/hooks/useInstallPrompt'

// What Chrome and Android browsers send when the app can be installed.
function browserOffersInstall(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  event.prompt = vi.fn()
  event.userChoice = Promise.resolve({ outcome })
  act(() => { window.dispatchEvent(event) })
  return event
}
function openedFromHomeScreen(yes) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: yes && query === '(display-mode: standalone)', media: query }))
}

afterEach(() => {
  delete navigator.standalone
})

describe('useInstallPrompt', () => {
  it('starts with nothing to offer, in a normal browser tab', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current).toMatchObject({ canInstall: false, isStandalone: false, isIOS: false })
    expect(await result.current.promptInstall()).toBeNull()
  })

  it("can install once the browser offers, and keeps the browser's own banner from popping up", () => {
    const { result } = renderHook(() => useInstallPrompt())
    const event = browserOffersInstall()
    expect(result.current.canInstall).toBe(true)
    expect(event.defaultPrevented).toBe(true)
  })

  it.each(['accepted', 'dismissed'])("shows the browser's install dialog, reports \"%s\", and uses the offer only once", async (outcome) => {
    const { result } = renderHook(() => useInstallPrompt())
    const event = browserOffersInstall(outcome)
    let answer
    await act(async () => { answer = await result.current.promptInstall() })
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(answer).toBe(outcome)
    expect(result.current.canInstall).toBe(false)
    expect(await result.current.promptInstall()).toBeNull()
    expect(event.prompt).toHaveBeenCalledTimes(1)
  })

  it('knows the app is installed as soon as the browser says so, and drops the offer', () => {
    const { result } = renderHook(() => useInstallPrompt())
    browserOffersInstall()
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(result.current).toMatchObject({ canInstall: false, isStandalone: true })
  })

  it('knows it is already installed when opened from the Home Screen', () => {
    openedFromHomeScreen(true)
    expect(renderHook(() => useInstallPrompt()).result.current.isStandalone).toBe(true)
  })

  it('knows it is already installed on an iPhone Home Screen (navigator.standalone)', () => {
    openedFromHomeScreen(false)
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    expect(renderHook(() => useInstallPrompt()).result.current.isStandalone).toBe(true)
  })

  it('spots an iPhone or iPad, where installing is done by hand from the Share menu', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current).toMatchObject({ isIOS: true, canInstall: false })
  })

  it('stops listening when the screen goes away', () => {
    const { result, unmount } = renderHook(() => useInstallPrompt())
    unmount()
    const event = new Event('beforeinstallprompt', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(result.current.canInstall).toBe(false)
  })
})
