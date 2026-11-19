// Someone who opens an event link and then has to sign in should land back on that
// event. The remembered page must be a page inside the app, and must not linger past a day.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearReturnTo, peekReturnTo, setReturnTo } from '../../src/utils/returnTo'

const KEY = 'vwb_return_to'
const DAY = 24 * 60 * 60 * 1000

describe('returnTo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-19T17:00:00Z'))
  })

  it('remembers the page someone was headed to, query and all', () => {
    setReturnTo('/events/42?invite=abc123')
    expect(peekReturnTo()).toBe('/events/42?invite=abc123')
  })

  it('keeps it until it is cleared, so it survives the "check your email" gap', () => {
    setReturnTo('/join/token-1')
    expect(peekReturnTo()).toBe('/join/token-1')
    expect(peekReturnTo()).toBe('/join/token-1')
    clearReturnTo()
    expect(peekReturnTo()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('replaces an older page with the newest one', () => {
    setReturnTo('/events/1')
    setReturnTo('/events/2')
    expect(peekReturnTo()).toBe('/events/2')
  })

  it('has nothing to return to when nothing was remembered', () => {
    expect(peekReturnTo()).toBeNull()
  })

  it('forgets the page after a day, so an old one never hijacks a later sign-in', () => {
    setReturnTo('/events/42')
    vi.advanceTimersByTime(DAY)
    expect(peekReturnTo()).toBe('/events/42')
    vi.advanceTimersByTime(1)
    expect(peekReturnTo()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it.each([
    ['another website', 'https://example.org/login'],
    ['a script', 'javascript:alert(1)'],
    ['a page with no leading slash', 'events/42'],
    ['an empty page', ''],
    ['no page', null],
    ['a number', 42],
    ['a list', ['/events/42']],
  ])('refuses to return to %s, and throws the saved value away', (_what, path) => {
    setReturnTo(path)
    expect(peekReturnTo()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it.each([
    ['text that is not JSON', '/events/42'],
    ['an empty value', 'null'],
  ])('ignores saved data that is damaged (%s)', (_what, saved) => {
    localStorage.setItem(KEY, saved)
    expect(peekReturnTo()).toBeNull()
  })
})
