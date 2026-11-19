// Keeping an open app in step with the newest version, so a tap never lands on a blank
// page: notice a new version, look for one when the person comes back, and reload cleanly.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The test browser has no service worker, so this stands in a small pretend one.
// controller: the version already running this page (null on a very first visit).
function pretendServiceWorker({ controller = null, registration } = {}) {
  const sw = new EventTarget()
  sw.controller = controller
  sw.getRegistration = vi.fn(async () => registration)
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw })
  return sw
}

// A new version on its way in: starts "installing", and the test moves it along.
function pretendNewVersion() {
  const worker = new EventTarget()
  worker.state = 'installing'
  worker.become = (state) => { worker.state = state; worker.dispatchEvent(new Event('statechange')) }
  return worker
}

function pretendReload() {
  const reload = vi.fn()
  vi.stubGlobal('location', { reload })
  return reload
}

// freshApp.js remembers things from the moment it loads, so each test loads a fresh copy.
async function load() {
  vi.resetModules()
  return import('../../src/utils/freshApp')
}

// watchForUpdates listens on the page for good. Take those listeners off after each test.
const listeners = []
beforeEach(() => {
  for (const target of [document, window]) {
    const add = target.addEventListener.bind(target)
    vi.spyOn(target, 'addEventListener').mockImplementation((type, fn, options) => {
      listeners.push([target, type, fn])
      add(type, fn, options)
    })
  }
})
afterEach(() => {
  for (const [target, type, fn] of listeners.splice(0)) target.removeEventListener(type, fn)
  delete navigator.serviceWorker
  vi.unstubAllGlobals()
})

const comeBackToTheApp = () => document.dispatchEvent(new Event('visibilitychange'))
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('watchForUpdates and hasUpdate', () => {
  it('does nothing, without breaking, in a browser with no service worker', async () => {
    const { watchForUpdates, hasUpdate } = await load()
    expect(() => watchForUpdates()).not.toThrow()
    expect(hasUpdate()).toBe(false)
  })

  it('knows a newer version is running once it takes over from an older one', async () => {
    const sw = pretendServiceWorker({ controller: {} })
    const { watchForUpdates, hasUpdate } = await load()
    watchForUpdates()
    expect(hasUpdate()).toBe(false)
    sw.dispatchEvent(new Event('controllerchange'))
    expect(hasUpdate()).toBe(true)
  })

  it('does not count the very first install as an update', async () => {
    const sw = pretendServiceWorker({ controller: null })
    const { watchForUpdates, hasUpdate } = await load()
    watchForUpdates()
    sw.dispatchEvent(new Event('controllerchange'))
    expect(hasUpdate()).toBe(false)
  })

  it('looks for a new version when the person comes back to the app', async () => {
    const registration = { update: vi.fn(async () => {}) }
    pretendServiceWorker({ controller: {}, registration })
    const { watchForUpdates } = await load()
    watchForUpdates()
    comeBackToTheApp()
    await settle()
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('does not look while the app is going out of view', async () => {
    const registration = { update: vi.fn(async () => {}) }
    const sw = pretendServiceWorker({ controller: {}, registration })
    const { watchForUpdates } = await load()
    watchForUpdates()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    comeBackToTheApp()
    await settle()
    expect(sw.getRegistration).not.toHaveBeenCalled()
    expect(registration.update).not.toHaveBeenCalled()
  })

  it('stays quiet when there is nothing registered, or the check fails with no signal', async () => {
    const sw = pretendServiceWorker({ controller: {}, registration: undefined })
    const { watchForUpdates } = await load()
    watchForUpdates()
    comeBackToTheApp()
    await settle()
    sw.getRegistration.mockRejectedValue(new Error('offline'))
    comeBackToTheApp()
    await settle()
    expect(sw.getRegistration).toHaveBeenCalledTimes(2)
  })

  it("reloads with the new version when a screen's files will not load", async () => {
    pretendServiceWorker({ controller: {}, registration: undefined })
    const reload = pretendReload()
    const { watchForUpdates } = await load()
    watchForUpdates()
    const failed = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(failed)
    expect(failed.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })
})

describe('reloadFresh', () => {
  it('just reloads in a browser with no service worker', async () => {
    const reload = pretendReload()
    const { reloadFresh } = await load()
    await reloadFresh()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('asks for the newest version first, then reloads', async () => {
    const order = []
    const registration = { update: vi.fn(async () => { order.push('update') }) }
    pretendServiceWorker({ registration })
    const reload = pretendReload().mockImplementation(() => { order.push('reload') })
    const { reloadFresh } = await load()
    await reloadFresh()
    expect(order).toEqual(['update', 'reload'])
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it.each(['activated', 'redundant'])('waits for a new version that is settling in, and reloads once it is %s', async (endState) => {
    vi.useFakeTimers()
    const incoming = pretendNewVersion()
    pretendServiceWorker({ registration: { update: async () => {}, installing: incoming } })
    const reload = pretendReload()
    const { reloadFresh } = await load()
    const done = reloadFresh()
    await vi.advanceTimersByTimeAsync(1000)
    incoming.become('installed')
    await vi.advanceTimersByTimeAsync(1000)
    expect(reload).not.toHaveBeenCalled()
    incoming.become(endState)
    await done
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('waits for a new version that is already downloaded and waiting', async () => {
    vi.useFakeTimers()
    const waiting = pretendNewVersion()
    pretendServiceWorker({ registration: { update: async () => {}, waiting } })
    const reload = pretendReload()
    const { reloadFresh } = await load()
    const done = reloadFresh()
    await vi.advanceTimersByTimeAsync(1000)
    expect(reload).not.toHaveBeenCalled()
    waiting.become('activated')
    await done
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads anyway after 5 seconds if the new version never settles in', async () => {
    vi.useFakeTimers()
    pretendServiceWorker({ registration: { update: async () => {}, installing: pretendNewVersion() } })
    const reload = pretendReload()
    const { reloadFresh } = await load()
    const done = reloadFresh()
    await vi.advanceTimersByTimeAsync(4999)
    expect(reload).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await done
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads anyway after 4 seconds if the check for a new version hangs (weak signal)', async () => {
    vi.useFakeTimers()
    pretendServiceWorker({ registration: { update: () => new Promise(() => {}) } })
    const reload = pretendReload()
    const { reloadFresh } = await load()
    const done = reloadFresh()
    await vi.advanceTimersByTimeAsync(3999)
    expect(reload).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await done
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('still reloads when the check for a new version fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    pretendServiceWorker({ registration: { update: async () => { throw new Error('offline') } } })
    const reload = pretendReload()
    const { reloadFresh } = await load()
    await reloadFresh()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalled()
  })
})
