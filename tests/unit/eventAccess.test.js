// Hosts can add access notes to an event (noise, lights, parking, who to look for).
// Only the known questions are saved: never a workplace, a building, or someone's home.
import { describe, expect, it } from 'vitest'
import { ACCESS_CHOICES, ACCESS_TEXTS, cleanAccess } from '../../src/utils/eventAccess'

describe('cleanAccess', () => {
  it('keeps the choices and notes the form offers, with notes trimmed', () => {
    expect(cleanAccess({
      noise: 'quiet',
      light: 'bright',
      crowd: 'medium',
      masks: 'welcome',
      quiet_room: '  Yes, Room 2 down the hall ',
      entry: 'Ramp at the side door.',
      order: '10:00 Doors open\n10:30 Welcome',
      look_for: 'Green shirts at the front table',
    })).toEqual({
      noise: 'quiet',
      light: 'bright',
      crowd: 'medium',
      masks: 'welcome',
      quiet_room: 'Yes, Room 2 down the hall',
      entry: 'Ramp at the side door.',
      order: '10:00 Doors open\n10:30 Welcome',
      look_for: 'Green shirts at the front table',
    })
  })

  it('drops anything that is not one of its questions', () => {
    expect(cleanAccess({ noise: 'quiet', home_address: '12 Oak St', workplace: 'The mill', building: 'B' }))
      .toEqual({ noise: 'quiet' })
  })

  it('drops a choice that is not on the list for its question', () => {
    expect(cleanAccess({ noise: 'deafening', light: 'quiet', crowd: 'Small', masks: 'required' })).toEqual({ masks: 'required' })
  })

  it('drops a note that is not text', () => {
    expect(cleanAccess({ noise: 'some', quiet_room: 42, entry: ['a'], order: { a: 1 }, look_for: true })).toEqual({ noise: 'some' })
  })

  it.each(Object.entries(ACCESS_TEXTS).map(([key, c]) => [key, c.max]))('cuts the %s note off at %i characters', (key, max) => {
    const cleaned = cleanAccess({ [key]: 'x'.repeat(max + 50) })
    expect(cleaned[key]).toHaveLength(max)
  })

  it.each([
    [null],
    [undefined],
    [{}],
    [{ noise: '', quiet_room: '   ', entry: '' }],
    [{ somewhere: 'else' }],
    ['quiet'],
  ])('saves nothing at all for %j', (value) => {
    expect(cleanAccess(value)).toBeNull()
  })
})

describe('the questions', () => {
  it('gives every choice question a label and options with different saved values', () => {
    for (const [key, c] of Object.entries(ACCESS_CHOICES)) {
      expect(c.label, key).toBeTruthy()
      const values = c.options.map(([value]) => value)
      expect(values.length, key).toBeGreaterThan(1)
      expect(new Set(values).size, key).toBe(values.length)
      for (const [, label] of c.options) expect(label, key).toBeTruthy()
    }
  })

  it('does not use one name for both a choice and a note', () => {
    for (const key of Object.keys(ACCESS_TEXTS)) expect(ACCESS_CHOICES[key]).toBeUndefined()
  })
})
