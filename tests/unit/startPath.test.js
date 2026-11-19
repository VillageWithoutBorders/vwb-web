// Two ways to sign up: Quick (straight in) or Full setup. The choice is kept on the
// account, and only people who picked Full setup are sent to the setup screens.
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The module remembers "left setup this visit". Load a fresh copy for each test.
let startPath, setupWaiting, needsFullSetup, leaveSetup
beforeEach(async () => {
  vi.resetModules()
  ;({ startPath, setupWaiting, needsFullSetup, leaveSetup } = await import('../../src/utils/startPath'))
})

const user = (start_path) => ({ id: 'u1', user_metadata: { start_path } })

describe('startPath', () => {
  it('reads the way the person picked at sign-up', () => {
    expect(startPath(user('quick'))).toBe('quick')
    expect(startPath(user('full'))).toBe('full')
  })

  it.each([
    ['an account made before there was a choice', { id: 'u1', user_metadata: {} }],
    ['an account with no extra details', { id: 'u1' }],
    ['a value that is not one of the two ways', { id: 'u1', user_metadata: { start_path: 'admin' } }],
    ['nobody signed in', null],
  ])('gives no path for %s', (_what, who) => {
    expect(startPath(who)).toBeNull()
  })
})

describe('setupWaiting', () => {
  it('is waiting when the profile has the setup column and it is still empty', () => {
    expect(setupWaiting({ setup_done_at: null })).toBe(true)
  })

  it('is not waiting once setup is finished', () => {
    expect(setupWaiting({ setup_done_at: '2026-11-01T15:00:00Z' })).toBe(false)
  })

  it('is not waiting when the profile is missing or the database has no setup column yet', () => {
    expect(setupWaiting(null)).toBe(false)
    expect(setupWaiting(undefined)).toBe(false)
    expect(setupWaiting({ display_name: 'Ruth' })).toBe(false)
  })
})

describe('needsFullSetup', () => {
  const unfinished = { setup_done_at: null }

  it('opens setup for someone who picked Full setup and has not finished it', () => {
    expect(needsFullSetup(user('full'), unfinished)).toBe(true)
  })

  it('never sends Quick start people or older accounts to setup', () => {
    expect(needsFullSetup(user('quick'), unfinished)).toBe(false)
    expect(needsFullSetup(user(undefined), unfinished)).toBe(false)
    expect(needsFullSetup(null, unfinished)).toBe(false)
  })

  it('leaves people alone once setup is finished', () => {
    expect(needsFullSetup(user('full'), { setup_done_at: '2026-11-01T15:00:00Z' })).toBe(false)
  })

  it('stops sending them back for the rest of the visit once they have left setup', () => {
    expect(needsFullSetup(user('full'), unfinished)).toBe(true)
    leaveSetup()
    expect(needsFullSetup(user('full'), unfinished)).toBe(false)
  })
})
