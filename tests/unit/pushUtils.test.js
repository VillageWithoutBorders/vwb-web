// Phone alerts (push): VWB only asks for permission when the person taps to turn alerts
// on, saves this device's alert address under their account, and removes it when turned off.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'

// "-_8" is the URL-safe way to write the two bytes 251, 255.
const KEY_TEXT = '-_8'
const KEY_BYTES = [251, 255]

function pretendSubscription(endpoint = 'https://push.example/device-1', keyBytes = KEY_BYTES) {
  return {
    endpoint,
    options: { applicationServerKey: new Uint8Array(keyBytes).buffer },
    unsubscribe: vi.fn(async () => true),
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-of-' + endpoint, auth: 'auth-of-' + endpoint } }),
  }
}

// The test browser has no service worker or push, so this stands in a small pretend one.
// `subscription` is the alert address it already holds (or null).
function pretendPushBrowser({ permission = 'default', answer = 'granted', subscription = null, ready = true } = {}) {
  const pushManager = {
    getSubscription: vi.fn(async () => subscription),
    subscribe: vi.fn(async () => pretendSubscription('https://push.example/new-device')),
  }
  const requestPermission = vi.fn(async () => answer)
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: ready ? Promise.resolve({ pushManager }) : new Promise(() => {}) },
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', { permission, requestPermission })
  return { pushManager, requestPermission }
}

// The app's push key is read when the file loads, so load a fresh copy for each test.
async function load({ key = KEY_TEXT } = {}) {
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', key)
  vi.resetModules()
  return import('../../src/utils/pushUtils')
}

function onAnIphone() {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')
}
function openedFromHomeScreen(yes) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: yes && query === '(display-mode: standalone)', media: query }))
}
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})
const saved = () => db.rows('push_subscriptions')

afterEach(() => {
  delete navigator.serviceWorker
  delete navigator.maxTouchPoints
  delete navigator.standalone
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('what this phone or computer can do', () => {
  it('isPushSupported needs a service worker, push, and notifications', async () => {
    const { isPushSupported } = await load()
    expect(isPushSupported()).toBe(false)
    pretendPushBrowser()
    expect(isPushSupported()).toBe(true)
    vi.unstubAllGlobals()
    expect(isPushSupported()).toBe(false)
  })

  it('isAppleMobile spots an iPhone, and an iPad that says it is a Mac', async () => {
    const { isAppleMobile } = await load()
    expect(isAppleMobile()).toBe(false)
    onAnIphone()
    expect(isAppleMobile()).toBe(true)
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15')
    expect(isAppleMobile()).toBe(false)
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 })
    expect(isAppleMobile()).toBe(true)
  })

  it('isInstalledApp is true when opened from the Home Screen', async () => {
    const { isInstalledApp } = await load()
    openedFromHomeScreen(false)
    expect(isInstalledApp()).toBe(false)
    openedFromHomeScreen(true)
    expect(isInstalledApp()).toBe(true)
    openedFromHomeScreen(false)
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    expect(isInstalledApp()).toBe(true)
  })
})

describe('getPushState', () => {
  it('"unsupported" on a browser that cannot do push', async () => {
    const { getPushState, getPushPermission } = await load()
    expect(await getPushState()).toBe('unsupported')
    expect(await getPushPermission()).toBe('unsupported')
  })

  it('"needs-home-screen" on an iPhone that has not added VWB to the Home Screen', async () => {
    const { getPushState } = await load()
    onAnIphone()
    openedFromHomeScreen(false)
    expect(await getPushState()).toBe('needs-home-screen')
  })

  it('"unsupported" on an older iPhone even from the Home Screen', async () => {
    const { getPushState } = await load()
    onAnIphone()
    openedFromHomeScreen(true)
    expect(await getPushState()).toBe('unsupported')
  })

  it('"blocked" when the person told the browser no', async () => {
    const { getPushState, getPushPermission } = await load()
    pretendPushBrowser({ permission: 'denied' })
    expect(await getPushState()).toBe('blocked')
    expect(await getPushPermission()).toBe('denied')
  })

  it('"off" when the person has not been asked yet, without asking them', async () => {
    const { getPushState } = await load()
    const { requestPermission } = pretendPushBrowser({ permission: 'default' })
    expect(await getPushState()).toBe('off')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('"on" when they said yes and this device has an alert address', async () => {
    const { getPushState } = await load()
    pretendPushBrowser({ permission: 'granted', subscription: pretendSubscription() })
    expect(await getPushState()).toBe('on')
  })

  it('"off" when they said yes but this device has no alert address', async () => {
    const { getPushState } = await load()
    pretendPushBrowser({ permission: 'granted', subscription: null })
    expect(await getPushState()).toBe('off')
  })

  it('"off" when the service worker never gets ready (gives up after 2 seconds)', async () => {
    vi.useFakeTimers()
    const { getPushState } = await load()
    pretendPushBrowser({ permission: 'granted', ready: false })
    const state = getPushState()
    await vi.advanceTimersByTimeAsync(2000)
    expect(await state).toBe('off')
  })
})

describe('subscribeToPush (the person taps to turn alerts on)', () => {
  it('asks permission, makes an alert address with the app key, and saves it under the account', async () => {
    const { subscribeToPush } = await load()
    const { pushManager, requestPermission } = pretendPushBrowser()
    expect(await subscribeToPush('me')).toEqual({ ok: true })
    expect(requestPermission).toHaveBeenCalledTimes(1)
    const options = pushManager.subscribe.mock.calls[0][0]
    expect(options.userVisibleOnly).toBe(true)
    expect([...options.applicationServerKey]).toEqual(KEY_BYTES)
    expect(saved()).toEqual([expect.objectContaining({
      user_id: 'me', endpoint: 'https://push.example/new-device', p256dh: 'p256dh-of-https://push.example/new-device', auth: 'auth-of-https://push.example/new-device',
    })])
  })

  it('saves nothing when the person says no', async () => {
    const { subscribeToPush } = await load()
    const { pushManager } = pretendPushBrowser({ answer: 'denied' })
    expect(await subscribeToPush('me')).toEqual({ ok: false, reason: 'denied' })
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(db.calls).toHaveLength(0)
  })

  it('says "unsupported" on a browser that cannot do push', async () => {
    const { subscribeToPush } = await load()
    expect(await subscribeToPush('me')).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('does not bother the person with a permission question when the app has no push key', async () => {
    const { subscribeToPush } = await load({ key: '' })
    const { requestPermission } = pretendPushBrowser()
    expect(await subscribeToPush('me')).toEqual({ ok: false, reason: 'no_key' })
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('keeps the alert address this device already has, and saves it once', async () => {
    const { subscribeToPush } = await load()
    const existing = pretendSubscription('https://push.example/device-1')
    const { pushManager } = pretendPushBrowser({ subscription: existing })
    db.seed('push_subscriptions', [{ id: 1, user_id: 'me', endpoint: 'https://push.example/device-1', p256dh: 'old', auth: 'old' }])
    expect(await subscribeToPush('me')).toEqual({ ok: true })
    expect(existing.unsubscribe).not.toHaveBeenCalled()
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(saved()).toEqual([{ id: 1, user_id: 'me', endpoint: 'https://push.example/device-1', p256dh: 'p256dh-of-https://push.example/device-1', auth: 'auth-of-https://push.example/device-1' }])
  })

  it('replaces an alert address made with an older app key, which could never get alerts', async () => {
    const { subscribeToPush } = await load()
    const stale = pretendSubscription('https://push.example/device-1', [1, 2])
    const { pushManager } = pretendPushBrowser({ subscription: stale })
    expect(await subscribeToPush('me')).toEqual({ ok: true })
    expect(stale.unsubscribe).toHaveBeenCalledTimes(1)
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1)
    expect(saved().map((s) => s.endpoint)).toEqual(['https://push.example/new-device'])
  })

  it("keeps two people's addresses apart on a shared device", async () => {
    const { subscribeToPush } = await load()
    pretendPushBrowser({ subscription: pretendSubscription('https://push.example/device-1') })
    await subscribeToPush('me')
    await subscribeToPush('neighbor')
    expect(saved().map((s) => [s.user_id, s.endpoint])).toEqual([['me', 'https://push.example/device-1'], ['neighbor', 'https://push.example/device-1']])
  })

  it('says so when the address cannot be saved to the account', async () => {
    quiet()
    const { subscribeToPush } = await load()
    pretendPushBrowser()
    db.failNext('push_subscriptions', 'upsert')
    expect(await subscribeToPush('me')).toEqual({ ok: false, reason: 'db_error' })
  })

  it('says so, without breaking the page, when the browser refuses to make an address', async () => {
    quiet()
    const { subscribeToPush } = await load()
    const { pushManager } = pretendPushBrowser()
    pushManager.subscribe.mockRejectedValue(new Error('push service not available'))
    expect(await subscribeToPush('me')).toEqual({ ok: false, reason: 'error' })
    expect(db.calls).toHaveLength(0)
  })
})

describe('resyncPush (quietly keeping the saved address current)', () => {
  it('saves the address the device has now, without asking for permission', async () => {
    const { resyncPush } = await load()
    const { requestPermission } = pretendPushBrowser({ permission: 'granted', subscription: pretendSubscription('https://push.example/swapped') })
    expect(await resyncPush('me')).toEqual({ ok: true })
    expect(saved().map((s) => [s.user_id, s.endpoint])).toEqual([['me', 'https://push.example/swapped']])
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it.each([
    ['nobody is signed in', { userId: null, permission: 'granted' }],
    ['the person has not said yes', { userId: 'me', permission: 'default' }],
    ['the person said no', { userId: 'me', permission: 'denied' }],
  ])('does nothing when %s', async (_when, { userId, permission }) => {
    const { resyncPush } = await load()
    const { pushManager, requestPermission } = pretendPushBrowser({ permission, subscription: pretendSubscription() })
    expect(await resyncPush(userId)).toEqual({ ok: false, reason: 'skip' })
    expect(requestPermission).not.toHaveBeenCalled()
    expect(pushManager.getSubscription).not.toHaveBeenCalled()
    expect(db.calls).toHaveLength(0)
  })

  it('does nothing on a browser that cannot do push, or when the app has no push key', async () => {
    expect(await (await load()).resyncPush('me')).toEqual({ ok: false, reason: 'skip' })
    const { resyncPush } = await load({ key: '' })
    pretendPushBrowser({ permission: 'granted', subscription: pretendSubscription() })
    expect(await resyncPush('me')).toEqual({ ok: false, reason: 'skip' })
    expect(db.calls).toHaveLength(0)
  })

  it('does not make a new address if alerts were never turned on from this device', async () => {
    const { resyncPush } = await load()
    const { pushManager } = pretendPushBrowser({ permission: 'granted', subscription: null })
    expect(await resyncPush('me')).toEqual({ ok: false, reason: 'off' })
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(db.calls).toHaveLength(0)
  })

  it('makes a new address when the old one is gone and alerts were turned on from this device', async () => {
    localStorage.setItem('vwb_push_v2', 'true')
    const { resyncPush } = await load()
    const { pushManager } = pretendPushBrowser({ permission: 'granted', subscription: null })
    expect(await resyncPush('me')).toEqual({ ok: true })
    expect([...pushManager.subscribe.mock.calls[0][0].applicationServerKey]).toEqual(KEY_BYTES)
    expect(saved().map((s) => s.endpoint)).toEqual(['https://push.example/new-device'])
  })

  it('says so when the address cannot be saved', async () => {
    quiet()
    const { resyncPush } = await load()
    pretendPushBrowser({ permission: 'granted', subscription: pretendSubscription() })
    db.failNext('push_subscriptions', 'upsert')
    expect(await resyncPush('me')).toEqual({ ok: false, reason: 'db_error' })
  })

  it('gives up after 4 seconds when the service worker never gets ready', async () => {
    quiet()
    vi.useFakeTimers()
    const { resyncPush } = await load()
    pretendPushBrowser({ permission: 'granted', ready: false })
    const result = resyncPush('me')
    await vi.advanceTimersByTimeAsync(4000)
    expect(await result).toEqual({ ok: false, reason: 'error' })
  })
})

describe('unsubscribeFromPush (turning alerts off)', () => {
  it("drops this device's address, removes only that row from the account, and forgets the switch", async () => {
    localStorage.setItem('vwb_push_v2', 'true')
    const { unsubscribeFromPush } = await load()
    const mine = pretendSubscription('https://push.example/device-1')
    pretendPushBrowser({ permission: 'granted', subscription: mine })
    db.seed('push_subscriptions', [
      { id: 1, user_id: 'me', endpoint: 'https://push.example/device-1' },
      { id: 2, user_id: 'me', endpoint: 'https://push.example/my-other-phone' },
      { id: 3, user_id: 'neighbor', endpoint: 'https://push.example/device-1' },
    ])
    expect(await unsubscribeFromPush('me')).toEqual({ ok: true })
    expect(mine.unsubscribe).toHaveBeenCalledTimes(1)
    expect(saved().map((s) => s.id)).toEqual([2, 3])
    expect(localStorage.getItem('vwb_push_v2')).toBeNull()
  })

  it('still forgets the switch when this device had no address', async () => {
    localStorage.setItem('vwb_push_v2', 'true')
    const { unsubscribeFromPush } = await load()
    pretendPushBrowser({ permission: 'granted', subscription: null })
    expect(await unsubscribeFromPush('me')).toEqual({ ok: true })
    expect(db.calls).toHaveLength(0)
    expect(localStorage.getItem('vwb_push_v2')).toBeNull()
  })

  it('says it did not work when the browser refuses', async () => {
    quiet()
    const { unsubscribeFromPush } = await load()
    const mine = pretendSubscription()
    mine.unsubscribe.mockRejectedValue(new Error('nope'))
    pretendPushBrowser({ permission: 'granted', subscription: mine })
    db.seed('push_subscriptions', [{ id: 1, user_id: 'me', endpoint: mine.endpoint }])
    expect(await unsubscribeFromPush('me')).toEqual({ ok: false })
    expect(saved()).toHaveLength(1)
  })
})
