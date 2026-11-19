// Event starting points fill in the new-event form in one tap. A broken one would
// post an event with the wrong privacy setting or a choice the form does not have.
import { describe, expect, it } from 'vitest'
import { DISTANCE_OPTIONS, VISIBILITY } from '../../src/utils/calendar'
import { EVENT_TEMPLATES, addMinutes } from '../../src/utils/eventTemplates'

describe('EVENT_TEMPLATES', () => {
  it('gives every starting point its own key', () => {
    const keys = EVENT_TEMPLATES.map((tpl) => tpl.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(EVENT_TEMPLATES.map((tpl) => [tpl.key, tpl]))('"%s" only uses choices the event form offers', (_key, tpl) => {
    for (const field of ['icon', 'name', 'blurb', 'title', 'description']) {
      expect(typeof tpl[field]).toBe('string')
      expect(tpl[field].trim()).not.toBe('')
    }
    expect(Object.keys(VISIBILITY)).toContain(tpl.visibility)
    expect(DISTANCE_OPTIONS).toContain(tpl.radius)
    expect([undefined, 'help', 'attend']).toContain(tpl.signupKind)
    expect(typeof tpl.signupEnabled).toBe('boolean')
    expect(typeof tpl.hideAddress).toBe('boolean')
    // A sign-up limit is a whole number of people, or blank for no limit.
    if (tpl.signupLimit !== '') expect(Number.isInteger(tpl.signupLimit) && tpl.signupLimit > 0).toBe(true)
    // Used to fill in the end time, so it has to be a real length shorter than a day.
    expect(Number.isInteger(tpl.durationMins)).toBe(true)
    expect(tpl.durationMins).toBeGreaterThan(0)
    expect(tpl.durationMins).toBeLessThan(24 * 60)
  })

  it('keeps the place of a cleanup at someone\'s home out of public view', () => {
    const cleanup = EVENT_TEMPLATES.find((tpl) => tpl.key === 'cleanup')
    expect(cleanup.hideAddress).toBe(true)
    // The place shows only to people who sign up, so sign-up has to be on.
    expect(cleanup.signupEnabled).toBe(true)
    expect(cleanup.description).toMatch(/town only/i)
    expect(cleanup.description).toMatch(/private message/i)
  })

  it('starts a group meeting as members only, with the place hidden', () => {
    const meeting = EVENT_TEMPLATES.find((tpl) => tpl.key === 'meeting')
    expect(meeting).toMatchObject({ visibility: 'members', hideAddress: true })
  })
})

describe('addMinutes', () => {
  it.each([
    ['14:30', 90, '16:00'],
    ['09:00', 180, '12:00'],
    ['09:05', 5, '09:10'],
    ['00:00', 60, '01:00'],
    ['23:30', 90, '01:00'], // past midnight
    ['22:00', 120, '00:00'],
  ])('%s plus %i minutes is %s', (time, mins, expected) => {
    expect(addMinutes(time, mins)).toBe(expected)
  })

  it('gives nothing when there is no start time or no length yet', () => {
    expect(addMinutes('', 90)).toBe('')
    expect(addMinutes(null, 90)).toBe('')
    expect(addMinutes('14:30', 0)).toBe('')
    expect(addMinutes('14:30', undefined)).toBe('')
  })
})
