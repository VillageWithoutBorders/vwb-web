// When someone was reported in the last 24 hours, removing them waits (a cooling-off time).
// This says when the wait is over, like "Tue 3:15 PM", in the person's own time zone.
import { afterEach, describe, expect, it } from 'vitest'
import { setLangLocal } from '../../src/utils/lang'
import { waitTime } from '../../src/utils/removalWait'

describe('waitTime', () => {
  afterEach(async () => { await setLangLocal('en') })

  it('gives the day and time in Eastern time', () => {
    // 20:15 UTC is 3:15 PM Eastern in winter (5 hours behind).
    expect(waitTime('2026-11-17T20:15:00Z')).toMatch(/^Tue,? 3:15\sPM$/)
    // In summer Eastern is 4 hours behind.
    expect(waitTime('2026-07-14T19:15:00Z')).toMatch(/^Tue,? 3:15\sPM$/)
  })

  it('uses the Eastern day when the UTC day is already tomorrow', () => {
    expect(waitTime('2026-11-18T02:30:00Z')).toMatch(/^Tue,? 9:30\sPM$/)
  })

  it.each([[null], [undefined], ['']])('gives nothing when there is no wait (%j)', (ts) => {
    expect(waitTime(ts)).toBe('')
  })

  it('follows the app\'s language when it is Spanish', async () => {
    const english = waitTime('2026-11-17T20:15:00Z')
    await setLangLocal('es')
    const spanish = waitTime('2026-11-17T20:15:00Z')
    expect(spanish).not.toBe(english)
    expect(spanish).toMatch(/^mar/i) // martes
    expect(spanish).toContain('3:15')
  })
})
