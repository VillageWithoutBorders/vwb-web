// "Keep me signed in" (src/supabaseClient.js). On a shared or library computer the
// box is unchecked, and the sign-in must be gone when the browser closes.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const made = vi.hoisted(() => ({ options: null }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url, _key, options) => {
    made.options = options
    return { auth: { storageKey: 'sb-fake-auth-token' } }
  },
}))
// This file tests the real client file, not the pretend one from tests/setup.js.
vi.unmock('../../src/supabaseClient')

async function load() {
  vi.resetModules()
  return import('../../src/supabaseClient')
}

beforeEach(() => { made.options = null })

describe('where the sign-in is kept', () => {
  it('stays on the phone by default', async () => {
    const client = await load()
    expect(client.keepSignedIn()).toBe(true)
    made.options.auth.storage.setItem('sb-fake-auth-token', 'session')
    expect(localStorage.getItem('sb-fake-auth-token')).toBe('session')
    expect(sessionStorage.getItem('sb-fake-auth-token')).toBeNull()
  })

  it('lasts only until the browser closes when "Keep me signed in" is unchecked', async () => {
    const client = await load()
    client.setKeepSignedIn(false)
    expect(client.keepSignedIn()).toBe(false)
    made.options.auth.storage.setItem('sb-fake-auth-token', 'session')
    expect(sessionStorage.getItem('sb-fake-auth-token')).toBe('session')
    expect(localStorage.getItem('sb-fake-auth-token')).toBeNull()
    expect(made.options.auth.storage.getItem('sb-fake-auth-token')).toBe('session')
  })

  it('goes back to staying on the phone when the box is checked again', async () => {
    const client = await load()
    client.setKeepSignedIn(false)
    client.setKeepSignedIn(true)
    expect(client.keepSignedIn()).toBe(true)
    made.options.auth.storage.setItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
  })

  it('signing out removes the sign-in from both places', async () => {
    const client = await load()
    localStorage.setItem('sb-fake-auth-token', 'a')
    sessionStorage.setItem('sb-fake-auth-token', 'b')
    made.options.auth.storage.removeItem('sb-fake-auth-token')
    expect(localStorage.getItem('sb-fake-auth-token')).toBeNull()
    expect(sessionStorage.getItem('sb-fake-auth-token')).toBeNull()
    expect(client.savedSignIn()).toBeNull()
  })
})

describe('the sign-in saved on this phone (used when there is no signal)', () => {
  it('is read straight from storage', async () => {
    const client = await load()
    localStorage.setItem('sb-fake-auth-token', JSON.stringify({ user: { id: 'u1' }, refresh_token: 'r' }))
    expect(client.savedSignIn()).toMatchObject({ user: { id: 'u1' } })
  })

  it.each([
    ['nothing saved', null],
    ['broken data', '{not json'],
    ['no user', JSON.stringify({ refresh_token: 'r' })],
    ['no way to renew it', JSON.stringify({ user: { id: 'u1' } })],
  ])('is null with %s', async (_what, raw) => {
    const client = await load()
    if (raw) localStorage.setItem('sb-fake-auth-token', raw)
    expect(client.savedSignIn()).toBeNull()
  })

  it('does not crash when the browser blocks storage (a private window)', async () => {
    const client = await load()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(client.keepSignedIn()).toBe(true)
    expect(() => client.setKeepSignedIn(false)).not.toThrow()
    expect(made.options.auth.storage.getItem('x')).toBeNull()
    expect(() => made.options.auth.storage.setItem('x', 'y')).not.toThrow()
    expect(client.savedSignIn()).toBeNull()
  })
})
