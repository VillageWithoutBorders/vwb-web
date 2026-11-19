// The choices for how long to mute a chat. The words on each button have to match
// the time it really mutes for.
import { describe, expect, it } from 'vitest'
import { MUTE_OPTIONS } from '../../src/utils/muteOptions'

const UNIT_MS = { hour: 3600000, hours: 3600000, day: 86400000, days: 86400000 }

describe('MUTE_OPTIONS', () => {
  it('mutes for exactly as long as each button says', () => {
    const timed = MUTE_OPTIONS.filter((o) => o.ms !== null)
    expect(timed.length).toBeGreaterThan(0)
    for (const { label, ms } of timed) {
      const [count, unit] = label.split(' ')
      expect(ms, label).toBe(Number(count) * UNIT_MS[unit])
    }
  })

  it('goes from shortest to longest and ends with Forever, the only one with no end', () => {
    const last = MUTE_OPTIONS.at(-1)
    expect(last).toEqual({ label: 'Forever', ms: null })
    const timed = MUTE_OPTIONS.slice(0, -1).map((o) => o.ms)
    expect(timed.every((ms) => typeof ms === 'number' && ms > 0)).toBe(true)
    expect(timed).toEqual([...timed].sort((a, b) => a - b))
    expect(new Set(MUTE_OPTIONS.map((o) => o.label)).size).toBe(MUTE_OPTIONS.length)
  })
})
