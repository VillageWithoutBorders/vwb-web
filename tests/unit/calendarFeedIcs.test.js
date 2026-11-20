// A group's followers can subscribe to its public events from their own calendar app.
// The feed has to follow the calendar file rules exactly, or those apps silently drop events.
import { describe, expect, it } from 'vitest'
import { parseIcs } from '../../src/utils/icsParse'
import { buildCalendar, fold, icsEscape } from '../../supabase/functions/calendar-feed/ics.ts'

const NOW = new Date('2026-09-01T12:00:00Z')
const SITE = 'https://app.example.org'
const bytes = (s) => new TextEncoder().encode(s).length
// What a calendar app does first: join continued lines back together.
const unfold = (s) => s.replace(/\r\n /g, '')

const FOOD_SHARE = {
  id: 42,
  title: 'Food share; bring bags',
  description: 'Free groceries.',
  starts_at: '2026-10-03T13:00:00Z',
  ends_at: '2026-10-03T15:00:00Z',
  location_name: 'Ringgold Depot',
  address: '155 Depot St',
  town: 'Ringgold',
  status: 'active',
}

const feed = (events, extra = {}) => buildCalendar({ name: 'Ringgold Mutual Aid', siteUrl: SITE, events, now: NOW, ...extra })
// The lines of one event in a feed, joined back together.
const eventLines = (events) => {
  const lines = unfold(feed(events)).split('\r\n')
  return lines.slice(lines.indexOf('BEGIN:VEVENT'), lines.indexOf('END:VEVENT') + 1)
}
const line = (events, name) => eventLines(events).find((l) => l.startsWith(name + ':'))

describe('icsEscape', () => {
  it('escapes commas, semicolons, backslashes and line breaks', () => {
    expect(icsEscape('Bags, boxes; no glass')).toBe('Bags\\, boxes\\; no glass')
    expect(icsEscape('C:\\food')).toBe('C:\\\\food')
    expect(icsEscape('Line one\nLine two\r\nLine three')).toBe('Line one\\nLine two\\nLine three')
  })

  it('gives an empty string for a missing value', () => {
    expect(icsEscape(null)).toBe('')
    expect(icsEscape(undefined)).toBe('')
    expect(icsEscape('')).toBe('')
  })
})

describe('fold', () => {
  it('leaves a line of 75 bytes or less alone', () => {
    expect(fold('SUMMARY:Food share')).toBe('SUMMARY:Food share')
    const exactly75 = 'X'.repeat(75)
    expect(fold(exactly75)).toBe(exactly75)
  })

  it('continues a longer line on the next line, after a space', () => {
    expect(fold('X'.repeat(76))).toBe('X'.repeat(75) + '\r\n ' + 'X')
  })

  it('keeps every piece of a long line within 75 bytes and loses nothing', () => {
    const long = 'DESCRIPTION:' + 'Bring bags and boxes. '.repeat(30)
    const folded = fold(long)
    const pieces = folded.split('\r\n')
    expect(pieces.length).toBeGreaterThan(8)
    for (const piece of pieces) expect(bytes(piece)).toBeLessThanOrEqual(75)
    for (const piece of pieces.slice(1)) expect(piece.startsWith(' ')).toBe(true)
    expect(unfold(folded)).toBe(long)
  })

  it('counts bytes, not letters, and never cuts an accented letter or an emoji in half', () => {
    const long = 'SUMMARY:' + 'Niños y niñas 🎉 '.repeat(12)
    const folded = fold(long)
    for (const piece of folded.split('\r\n')) {
      expect(bytes(piece)).toBeLessThanOrEqual(75)
      // Half an emoji does not survive being written out as bytes and read back.
      expect(new TextDecoder().decode(new TextEncoder().encode(piece))).toBe(piece)
    }
    expect(unfold(folded)).toBe(long)
    // Thirty-eight two-byte letters are 76 bytes, though only 38 letters long.
    expect(fold('é'.repeat(38))).toBe('é'.repeat(37) + '\r\n ' + 'é')
  })
})

describe('buildCalendar', () => {
  it('writes a complete feed for one event', () => {
    expect(feed([FOOD_SHARE], { name: 'Ringgold Mutual Aid, events' }).split('\r\n')).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Village Without Borders//Calendar Feed//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Ringgold Mutual Aid\\, events',
      'X-WR-TIMEZONE:UTC',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      'X-PUBLISHED-TTL:PT1H',
      'BEGIN:VEVENT',
      'UID:vwb-event-42@villagewithoutborders.org',
      'DTSTAMP:20260901T120000Z',
      'DTSTART:20261003T130000Z',
      'DTEND:20261003T150000Z',
      'SUMMARY:Food share\\; bring bags',
      'DESCRIPTION:Free groceries.\\n\\nhttps://app.example.org/events/42',
      'LOCATION:Ringgold Depot\\, 155 Depot St\\, Ringgold',
      'URL:https://app.example.org/events/42',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
      '', // the file ends with a line break
    ])
  })

  it('writes a valid, empty calendar when the group has no public events', () => {
    const lines = feed([]).split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines.at(-2)).toBe('END:VCALENDAR')
    expect(lines).not.toContain('BEGIN:VEVENT')
  })

  it('gives an event with no end time one hour', () => {
    expect(line([{ ...FOOD_SHARE, ends_at: null }], 'DTEND')).toBe('DTEND:20261003T140000Z')
    expect(line([{ ...FOOD_SHARE, ends_at: 'not a date' }], 'DTEND')).toBe('DTEND:20261003T140000Z')
  })

  it('writes times in UTC whatever zone the database row is in', () => {
    const ev = { ...FOOD_SHARE, starts_at: '2026-10-03T09:00:00-04:00', ends_at: '2026-10-03T11:30:00-04:00' }
    expect(line([ev], 'DTSTART')).toBe('DTSTART:20261003T130000Z')
    expect(line([ev], 'DTEND')).toBe('DTEND:20261003T153000Z')
  })

  it('leaves out an event whose start cannot be read, and keeps the rest', () => {
    const text = feed([{ ...FOOD_SHARE, id: 1, starts_at: 'soon' }, { ...FOOD_SHARE, id: 2 }])
    expect(text).not.toContain('vwb-event-1@')
    expect(text).toContain('UID:vwb-event-2@villagewithoutborders.org')
  })

  it('marks a cancelled event as cancelled, so calendar apps can cross it out', () => {
    expect(line([{ ...FOOD_SHARE, status: 'cancelled' }], 'STATUS')).toBe('STATUS:CANCELLED')
    expect(line([{ ...FOOD_SHARE, status: null }], 'STATUS')).toBe('STATUS:CONFIRMED')
  })

  it('writes no place line when the event has no place to show', () => {
    const hidden = { ...FOOD_SHARE, location_name: null, address: null, town: null }
    expect(line([hidden], 'LOCATION')).toBeUndefined()
    expect(line([{ ...hidden, town: 'Ringgold' }], 'LOCATION')).toBe('LOCATION:Ringgold')
  })

  it('uses the meeting link as the place for an online event, or says "Online event"', () => {
    const online = { ...FOOD_SHARE, is_online: true, online_link: 'https://meet.example.org/abc' }
    expect(line([online], 'LOCATION')).toBe('LOCATION:https://meet.example.org/abc')
    expect(line([{ ...online, online_link: null }], 'LOCATION')).toBe('LOCATION:Online event')
  })

  it('links back to the event page, with or without a slash on the end of the site address', () => {
    expect(line([FOOD_SHARE], 'URL')).toBe('URL:https://app.example.org/events/42')
    const lines = unfold(feed([FOOD_SHARE], { siteUrl: SITE + '/' })).split('\r\n')
    expect(lines).toContain('URL:https://app.example.org/events/42')
  })

  it('puts just the event page link in the notes when there is no description', () => {
    expect(line([{ ...FOOD_SHARE, description: null }], 'DESCRIPTION')).toBe('DESCRIPTION:https://app.example.org/events/42')
  })

  it('cuts a very long description at 1500 characters and still adds the event page link', () => {
    const notes = line([{ ...FOOD_SHARE, description: 'a'.repeat(1400) + 'b'.repeat(400) }], 'DESCRIPTION')
    expect(notes).toBe('DESCRIPTION:' + 'a'.repeat(1400) + 'b'.repeat(100) + '\\n\\nhttps://app.example.org/events/42')
  })

  it('keeps every line of the file within 75 bytes, however long the event text is', () => {
    const wordy = { ...FOOD_SHARE, title: 'Comida para todos: niños, niñas y familias. '.repeat(5), description: 'Bring bags, boxes; no glass.\n'.repeat(40) }
    const text = feed([wordy])
    for (const piece of text.split('\r\n')) expect(bytes(piece)).toBeLessThanOrEqual(75)
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/) // no bare line breaks from the description
  })

  it('makes a feed the app\'s own calendar reader gets the same events back from', () => {
    const events = [
      FOOD_SHARE,
      { ...FOOD_SHARE, id: 43, title: 'Tenant help night, with supper', description: 'Bring your lease; copies are fine.\nNo ID needed.', starts_at: '2026-10-05T22:00:00Z', ends_at: null },
      { ...FOOD_SHARE, id: 44, title: 'Called off', status: 'cancelled', starts_at: '2026-10-06T22:00:00Z' },
    ]
    const read = parseIcs(feed(events), NOW)
    expect(read.events.map((e) => [e.title, e.startsAt, e.endsAt, e.location])).toEqual([
      ['Food share; bring bags', '2026-10-03T13:00:00.000Z', '2026-10-03T15:00:00.000Z', 'Ringgold Depot, 155 Depot St, Ringgold'],
      ['Tenant help night, with supper', '2026-10-05T22:00:00.000Z', '2026-10-05T23:00:00.000Z', 'Ringgold Depot, 155 Depot St, Ringgold'],
    ])
    expect(read.events[1].description).toBe('Bring your lease; copies are fine.\nNo ID needed.\n\nhttps://app.example.org/events/43')
  })
})
