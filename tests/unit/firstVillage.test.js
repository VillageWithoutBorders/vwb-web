// First run: new members are asked once to find their village. Older members and
// Quick start sign-ups are not stopped by that screen.
import { afterEach, describe, expect, it } from 'vitest'
import { firstRunPaused, needsFirstVillage, pauseFirstRun } from '../../src/utils/firstVillage'

const NEW_MEMBER = { village_opt_in: null, tour_done_at: null }
const user = (start_path) => ({ id: 'u1', user_metadata: start_path ? { start_path } : {} })

describe('needsFirstVillage', () => {
  it('asks a new member who has not answered about villages or done the tour', () => {
    expect(needsFirstVillage(NEW_MEMBER, user())).toBe(true)
    expect(needsFirstVillage(NEW_MEMBER, user('full'))).toBe(true)
    expect(needsFirstVillage(NEW_MEMBER, null)).toBe(true)
  })

  it('does not ask again once they have answered, yes or no', () => {
    expect(needsFirstVillage({ ...NEW_MEMBER, village_opt_in: true }, user())).toBe(false)
    expect(needsFirstVillage({ ...NEW_MEMBER, village_opt_in: false }, user())).toBe(false)
  })

  it('does not ask members who already finished the tour', () => {
    expect(needsFirstVillage({ ...NEW_MEMBER, tour_done_at: '2026-10-01T12:00:00Z' }, user())).toBe(false)
  })

  it('skips the screen for Quick start sign-ups', () => {
    expect(needsFirstVillage(NEW_MEMBER, user('quick'))).toBe(false)
  })

  it('stays out of the way while the profile is loading or the database has no such columns yet', () => {
    expect(needsFirstVillage(null, user())).toBe(false)
    expect(needsFirstVillage(undefined, user())).toBe(false)
    expect(needsFirstVillage({ tour_done_at: null }, user())).toBe(false)
    expect(needsFirstVillage({ village_opt_in: null }, user())).toBe(false)
  })
})

describe('firstRunPaused', () => {
  afterEach(() => pauseFirstRun(false))

  it.each(['/join/abc123', '/find-village', '/village-square', '/setup'])('holds the first-run questions on %s', (path) => {
    expect(firstRunPaused(path)).toBe(true)
  })

  it.each(['/', '/dashboard', '/calendar', '/joined', '/setup/more', '/village'])('lets them show on %s', (path) => {
    expect(firstRunPaused(path)).toBe(false)
  })

  it('holds them everywhere while someone is arranging their cottage, then lets go', () => {
    pauseFirstRun(true)
    expect(firstRunPaused('/dashboard')).toBe(true)
    pauseFirstRun(false)
    expect(firstRunPaused('/dashboard')).toBe(false)
  })
})
