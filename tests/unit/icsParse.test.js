// Hosts bring events in from a calendar file (Google, Apple, Outlook, Facebook).
// The reader has to get the day and the hour right, or people show up at the wrong time.
import { describe, expect, it } from 'vitest'
import { parseIcs } from '../../src/utils/icsParse'

// "Now" in every test: Tuesday, Sept 1, 2026, 8:00 AM Eastern (daylight time).
const NOW = new Date('2026-09-01T12:00:00Z')

// A calendar file with one VEVENT per list of lines.
function calendar(...events) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//EN',
    ...events.flatMap((lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']),
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n'
}

const starts = (result) => result.events.map((e) => e.startsAt)

describe('parseIcs, one event at a time', () => {
  it('reads a Google Calendar export: name, notes, place and Eastern times', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-TIMEZONE:America/New_York',
      // The time zone block has its own DTSTART and RRULE. They are not an event.
      'BEGIN:VTIMEZONE',
      'TZID:America/New_York',
      'BEGIN:DAYLIGHT',
      'TZOFFSETFROM:-0500',
      'TZOFFSETTO:-0400',
      'TZNAME:EDT',
      'DTSTART:19700308T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
      'END:DAYLIGHT',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'DTSTART;TZID=America/New_York:20261003T090000',
      'DTEND;TZID=America/New_York:20261003T120000',
      'DTSTAMP:20260820T151500Z',
      'UID:abc123@google.com',
      'DESCRIPTION:Free groceries for anyone who needs them.\\nNo ID needed\\; bring',
      '  your own bags\\, please.',
      'LOCATION:Ringgold Depot\\, 155 Depot St\\, Ringgold\\, GA 30736',
      'SEQUENCE:0',
      'STATUS:CONFIRMED',
      'SUMMARY:Community Food Share',
      'TRANSP:OPAQUE',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')

    expect(parseIcs(text, NOW)).toEqual({
      events: [{
        key: 'abc123@google.com|2026-10-03T13:00:00.000Z',
        title: 'Community Food Share',
        description: 'Free groceries for anyone who needs them.\nNo ID needed; bring your own bags, please.',
        location: 'Ringgold Depot, 155 Depot St, Ringgold, GA 30736',
        online: false,
        link: '',
        startsAt: '2026-10-03T13:00:00.000Z',
        endsAt: '2026-10-03T16:00:00.000Z',
        allDay: false,
        repeats: false,
      }],
      skippedPast: 0,
      repeating: 0,
    })
  })

  it.each([
    ['a time marked UTC', 'DTSTART:20261003T130000Z', '2026-10-03T13:00:00.000Z'],
    ['Central time in summer (5 hours behind UTC)', 'DTSTART;TZID=America/Chicago:20261003T090000', '2026-10-03T14:00:00.000Z'],
    ['Central time in winter (6 hours behind UTC)', 'DTSTART;TZID=America/Chicago:20261205T090000', '2026-12-05T15:00:00.000Z'],
    ['a zone name in quote marks', 'DTSTART;TZID="America/Los_Angeles":20261003T090000', '2026-10-03T16:00:00.000Z'],
    ['a time with no zone, read as this device\'s time (Eastern here)', 'DTSTART:20261003T090000', '2026-10-03T13:00:00.000Z'],
    ['a zone name the browser does not know, read as this device\'s time', 'DTSTART;TZID=Eastern Standard Time:20261003T090000', '2026-10-03T13:00:00.000Z'],
    ['a time with no seconds', 'DTSTART:20261003T1300Z', '2026-10-03T13:00:00.000Z'],
  ])('reads %s', (_what, dtstart, expected) => {
    const { events } = parseIcs(calendar(['UID:one', 'SUMMARY:Work day', dtstart]), NOW)
    expect(events).toHaveLength(1)
    expect(events[0].startsAt).toBe(expected)
    expect(events[0].allDay).toBe(false)
  })

  it('reads an all-day event as midnight to midnight on this device', () => {
    const { events } = parseIcs(calendar([
      'UID:fair',
      'SUMMARY:Resource fair',
      'DTSTART;VALUE=DATE:20261003',
      'DTEND;VALUE=DATE:20261004',
    ]), NOW)
    expect(events[0]).toMatchObject({
      allDay: true,
      startsAt: '2026-10-03T04:00:00.000Z', // midnight Eastern daylight time
      endsAt: '2026-10-04T04:00:00.000Z',
    })
  })

  it('fills in what a bare event leaves out', () => {
    const { events } = parseIcs(calendar(
      ['DTSTART:20261003T130000Z'],
      ['DTSTART:20261003T130000Z'],
    ), NOW)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ title: 'Untitled event', description: '', location: '', endsAt: null })
    // No UID in the file: the two still get keys of their own, so each can be picked.
    expect(events[0].key).not.toBe(events[1].key)
  })

  it('undoes the calendar file\'s escapes for commas, semicolons, backslashes and line breaks', () => {
    const { events } = parseIcs(calendar([
      'UID:one',
      'SUMMARY:Rock\\, Paper\\; Scissors',
      'DESCRIPTION:Line one\\nLine two\\NLine three with a back\\\\slash',
      'DTSTART:20261003T130000Z',
    ]), NOW)
    expect(events[0].title).toBe('Rock, Paper; Scissors')
    expect(events[0].description).toBe('Line one\nLine two\nLine three with a back\\slash')
  })

  it('joins lines folded with a space or a tab, whatever the line endings are', () => {
    const body = ['BEGIN:VEVENT', 'UID:one', 'SUMMARY:Community', '  food', '\t share', 'DTSTART:20261003T130000Z', 'END:VEVENT']
    for (const ending of ['\r\n', '\n', '\r']) {
      const { events } = parseIcs(body.join(ending), NOW)
      expect(events).toHaveLength(1)
      expect(events[0].title).toBe('Community food share')
    }
  })

  it('leaves out cancelled events, edited single dates of a series, and events with no readable start', () => {
    const { events, skippedPast } = parseIcs(calendar(
      ['UID:a', 'SUMMARY:Called off', 'STATUS:CANCELLED', 'DTSTART:20261003T130000Z'],
      ['UID:b', 'SUMMARY:Moved date', 'RECURRENCE-ID:20261003T130000Z', 'DTSTART:20261004T130000Z'],
      ['UID:c', 'SUMMARY:No start'],
      ['UID:d', 'SUMMARY:Garbled start', 'DTSTART:next Tuesday'],
      ['UID:e', 'SUMMARY:Still on', 'DTSTART:20261005T130000Z'],
    ), NOW)
    expect(events.map((e) => e.title)).toEqual(['Still on'])
    expect(skippedPast).toBe(0)
  })

  it('skips events that are over and counts them, but keeps one that is under way', () => {
    const result = parseIcs(calendar(
      ['UID:past', 'SUMMARY:Last month', 'DTSTART:20260801T130000Z', 'DTEND:20260801T140000Z'],
      ['UID:past2', 'SUMMARY:An hour ago, no end time', 'DTSTART:20260901T110000Z'],
      ['UID:now', 'SUMMARY:Under way', 'DTSTART:20260901T110000Z', 'DTEND:20260901T130000Z'],
    ), NOW)
    expect(result.events.map((e) => e.title)).toEqual(['Under way'])
    expect(result.skippedPast).toBe(2)
  })

  it('leaves out events more than a year ahead without calling them past', () => {
    const result = parseIcs(calendar(
      ['UID:far', 'SUMMARY:Two years out', 'DTSTART:20280901T130000Z'],
      ['UID:near', 'SUMMARY:Next summer', 'DTSTART:20270801T130000Z'],
    ), NOW)
    expect(result.events.map((e) => e.title)).toEqual(['Next summer'])
    expect(result.skippedPast).toBe(0)
  })

  it('lists events soonest first, whatever order the file has them in', () => {
    const { events } = parseIcs(calendar(
      ['UID:c', 'SUMMARY:Third', 'DTSTART:20261105T130000Z'],
      ['UID:a', 'SUMMARY:First', 'DTSTART:20261003T130000Z'],
      ['UID:b', 'SUMMARY:Second', 'DTSTART;TZID=America/Chicago:20261003T090000'],
    ), NOW)
    expect(events.map((e) => e.title)).toEqual(['First', 'Second', 'Third'])
  })

  it('finds nothing in an empty file or a file with no events', () => {
    const nothing = { events: [], skippedPast: 0, repeating: 0 }
    expect(parseIcs('', NOW)).toEqual(nothing)
    expect(parseIcs('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n', NOW)).toEqual(nothing)
    expect(parseIcs('This is a flyer, not a calendar file.', NOW)).toEqual(nothing)
  })
})

describe('parseIcs, online events', () => {
  const one = (...lines) => parseIcs(calendar(['UID:one', 'SUMMARY:Meeting', 'DTSTART:20261003T130000Z', ...lines]), NOW).events[0]

  it('treats a web link in the place field as an online event', () => {
    expect(one('LOCATION:https://example.org/room')).toMatchObject({ online: true, link: 'https://example.org/room', location: '' })
  })

  it.each([
    ['a Zoom link in the notes', 'DESCRIPTION:Join us at https://us02web.zoom.us/j/123456?pwd=abc before 6.', 'https://us02web.zoom.us/j/123456?pwd=abc'],
    ['a Google Meet conference field', 'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij', 'https://meet.google.com/abc-defg-hij'],
    ['a Teams link in the URL field', 'URL:https://teams.microsoft.com/l/meetup-join/1', 'https://teams.microsoft.com/l/meetup-join/1'],
  ])('finds %s', (_what, line, link) => {
    expect(one(line)).toMatchObject({ online: true, link })
  })

  it('treats a place that just says "Online" as online, with no link', () => {
    expect(one('LOCATION:Online')).toMatchObject({ online: true, link: '', location: '' })
    expect(one('LOCATION:Zoom (link sent after sign-up)')).toMatchObject({ online: true, link: '' })
  })

  it('keeps an in-person event in person when the notes only link to a flyer', () => {
    expect(one('LOCATION:Ringgold Library', 'DESCRIPTION:Flyer: https://example.org/flyer.pdf'))
      .toMatchObject({ online: false, link: '', location: 'Ringgold Library' })
  })

  it('does not mistake a place name for "online" because of how it starts', () => {
    expect(one('LOCATION:Zoomers Cafe')).toMatchObject({ online: false, location: 'Zoomers Cafe' })
  })
})

describe('parseIcs, repeating events', () => {
  it('lists each date of a weekly event on Tuesdays and Thursdays, minus the skipped date', () => {
    const result = parseIcs(calendar([
      'UID:supper',
      'SUMMARY:Community supper',
      'DTSTART;TZID=America/New_York:20261006T180000',
      'DTEND;TZID=America/New_York:20261006T193000',
      'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=5',
      'EXDATE;TZID=America/New_York:20261008T180000',
    ]), NOW)
    // Five dates in the rule (Oct 6, 8, 13, 15, 20); Oct 8 is taken out.
    expect(starts(result)).toEqual([
      '2026-10-06T22:00:00.000Z',
      '2026-10-13T22:00:00.000Z',
      '2026-10-15T22:00:00.000Z',
      '2026-10-20T22:00:00.000Z',
    ])
    expect(result.repeating).toBe(1)
    expect(result.events.every((e) => e.repeats && e.title === 'Community supper')).toBe(true)
    // Each date keeps the hour and a half length, and has a key of its own.
    expect(result.events[1].endsAt).toBe('2026-10-13T23:30:00.000Z')
    expect(new Set(result.events.map((e) => e.key)).size).toBe(4)
  })

  it('keeps a weekly event at 6:00 PM Eastern when the clocks fall back on Nov 1', () => {
    const result = parseIcs(calendar([
      'UID:supper',
      'SUMMARY:Community supper',
      'DTSTART;TZID=America/New_York:20261027T180000',
      'RRULE:FREQ=WEEKLY;COUNT=3',
    ]), NOW)
    expect(starts(result)).toEqual([
      '2026-10-27T22:00:00.000Z', // 6 PM daylight time
      '2026-11-03T23:00:00.000Z', // 6 PM standard time
      '2026-11-10T23:00:00.000Z',
    ])
  })

  it('follows "every other week"', () => {
    const result = parseIcs(calendar([
      'UID:pickup',
      'SUMMARY:Trash pickup',
      'DTSTART;TZID=America/New_York:20261006T090000',
      'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3',
    ]), NOW)
    expect(starts(result)).toEqual(['2026-10-06T13:00:00.000Z', '2026-10-20T13:00:00.000Z', '2026-11-03T14:00:00.000Z'])
  })

  it('runs a daily event through its last day when the rule ends on a date', () => {
    const result = parseIcs(calendar([
      'UID:drive',
      'SUMMARY:Supply drive',
      'DTSTART;TZID=America/New_York:20261005T090000',
      'RRULE:FREQ=DAILY;UNTIL=20261007',
    ]), NOW)
    expect(starts(result)).toEqual(['2026-10-05T13:00:00.000Z', '2026-10-06T13:00:00.000Z', '2026-10-07T13:00:00.000Z'])
  })

  it('skips months that have no 31st for a monthly event on the 31st', () => {
    const result = parseIcs(calendar([
      'UID:rent',
      'SUMMARY:Tenant help night',
      'DTSTART;TZID=America/New_York:20261031T100000',
      'RRULE:FREQ=MONTHLY;COUNT=4',
    ]), NOW)
    expect(starts(result)).toEqual([
      '2026-10-31T14:00:00.000Z',
      '2026-12-31T15:00:00.000Z',
      '2027-01-31T15:00:00.000Z',
      '2027-03-31T14:00:00.000Z',
    ])
  })

  it('brings in only the next date of a yearly event that started in the past', () => {
    const result = parseIcs(calendar([
      'UID:picnic',
      'SUMMARY:Fourth of July picnic',
      'DTSTART;VALUE=DATE:20250704',
      'RRULE:FREQ=YEARLY',
    ]), NOW)
    expect(starts(result)).toEqual(['2027-07-04T04:00:00.000Z'])
    expect(result.events[0]).toMatchObject({ allDay: true, repeats: true })
  })

  it.each([
    ['the second Tuesday of each month', 'RRULE:FREQ=MONTHLY;BYDAY=2TU'],
    ['the last weekday of each month', 'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'],
    ['every hour', 'RRULE:FREQ=HOURLY'],
  ])('brings in only the first date for a rule it cannot follow (%s)', (_what, rrule) => {
    const result = parseIcs(calendar([
      'UID:board',
      'SUMMARY:Board meeting',
      'DTSTART;TZID=America/New_York:20261013T100000',
      rrule,
    ]), NOW)
    expect(starts(result)).toEqual(['2026-10-13T14:00:00.000Z'])
    // Still marked as repeating, so the host can be told to add the other dates by hand.
    expect(result.events[0].repeats).toBe(true)
    expect(result.repeating).toBe(1)
  })

  it('stops a never-ending daily event at 60 dates', () => {
    const result = parseIcs(calendar([
      'UID:walk',
      'SUMMARY:Morning walk',
      'DTSTART;TZID=America/New_York:20260902T080000',
      'RRULE:FREQ=DAILY',
    ]), NOW)
    expect(result.events).toHaveLength(60)
    expect(result.events[0].startsAt).toBe('2026-09-02T12:00:00.000Z')
    expect(result.events[59].startsAt).toBe('2026-10-31T12:00:00.000Z')
  })

  it('stops a never-ending weekly event one year out', () => {
    const result = parseIcs(calendar([
      'UID:pantry',
      'SUMMARY:Pantry hours',
      'DTSTART;TZID=America/New_York:20260907T080000',
      'RRULE:FREQ=WEEKLY',
    ]), NOW)
    const yearOut = NOW.getTime() + 366 * 86400000
    const last = new Date(result.events.at(-1).startsAt).getTime()
    expect(result.events).toHaveLength(52)
    expect(last).toBeLessThanOrEqual(yearOut)
    expect(last + 7 * 86400000).toBeGreaterThan(yearOut)
  })

  it('offers only the dates still to come from a series that began months ago', () => {
    const result = parseIcs(calendar([
      'UID:pantry',
      'SUMMARY:Pantry hours',
      'DTSTART;TZID=America/New_York:20260105T170000',
      'RRULE:FREQ=WEEKLY;UNTIL=20260930',
    ]), NOW)
    // Mondays at 5 PM Eastern: Sept 7, 14, 21 and 28 are left.
    expect(starts(result)).toEqual([
      '2026-09-07T21:00:00.000Z',
      '2026-09-14T21:00:00.000Z',
      '2026-09-21T21:00:00.000Z',
      '2026-09-28T21:00:00.000Z',
    ])
  })

  it('brings in nothing from a series that has already ended', () => {
    const result = parseIcs(calendar([
      'UID:old',
      'SUMMARY:Winter coat drive',
      'DTSTART;TZID=America/New_York:20260105T170000',
      'RRULE:FREQ=WEEKLY;UNTIL=20260301',
    ]), NOW)
    expect(result.events).toEqual([])
    expect(result.repeating).toBe(1)
  })
})
