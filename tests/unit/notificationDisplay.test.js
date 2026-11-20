// The Alerts popout and the Alerts page share these icons, colors and "5m ago" words,
// so the two always match.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TYPE_COLORS, TYPE_ICONS, timeAgo } from '../../src/utils/notificationDisplay'

const NOW = new Date('2026-11-19T17:00:00Z')
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString()

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  it.each([
    ['this very second', 'Just now', 0],
    ['59 seconds ago', 'Just now', 59 * 1000],
    ['1 minute ago', '1m ago', MINUTE],
    ['5 and a half minutes ago', '5m ago', 5.5 * MINUTE],
    ['59 minutes ago', '59m ago', 59 * MINUTE],
    ['1 hour ago', '1h ago', HOUR],
    ['just under a day ago', '23h ago', DAY - MINUTE],
    ['1 day ago', '1d ago', DAY],
    ['just under a week ago', '6d ago', 7 * DAY - MINUTE],
  ])('shows an alert from %s as "%s"', (_what, expected, ms) => {
    expect(timeAgo(ago(ms))).toBe(expected)
  })

  it('switches to the date once an alert is a week old', () => {
    const then = ago(7 * DAY)
    expect(timeAgo(then)).toBe(new Date(then).toLocaleDateString())
    expect(timeAgo(then)).not.toMatch(/ago/)
  })

  it('says "Just now" when the phone\'s clock is a little behind the server', () => {
    expect(timeAgo(new Date(NOW.getTime() + 2 * MINUTE).toISOString())).toBe('Just now')
  })
})

describe('icons and colors', () => {
  it('has an icon for every kind of alert that has a color', () => {
    for (const type of Object.keys(TYPE_COLORS)) expect(TYPE_ICONS[type], type).toBeTruthy()
  })

  it('writes every color as a six-digit hex color', () => {
    for (const [type, color] of Object.entries(TYPE_COLORS)) expect(color, type).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('shows emergencies in red, with the same look whether verified or not', () => {
    expect(TYPE_ICONS.emergency_verified).toBe(TYPE_ICONS.emergency)
    expect(TYPE_COLORS.emergency_verified).toBe(TYPE_COLORS.emergency)
    expect(TYPE_COLORS.emergency).toBe('#dc2626')
  })
})
