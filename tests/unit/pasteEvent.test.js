// Hosts paste an event from Facebook or a flyer and get a first draft of the form.
// It only guesses, so it must say what it could not find instead of making things up.
import { describe, expect, it } from 'vitest'
import { parsePastedEvent } from '../../src/utils/pasteEvent'

// "Now" in every test: Tuesday, Sept 1, 2026, at noon on this device.
const NOW = new Date(2026, 8, 1, 12, 0, 0)

describe('parsePastedEvent', () => {
  it('drafts an event from text copied off a Facebook event page', () => {
    const text = [
      'Event by Ringgold Mutual Aid',
      'Saturday, October 10, 2026 at 10 AM – 2 PM',
      'Community Food Share',
      'Ringgold Depot',
      '155 Depot St, Ringgold, GA 30736',
      'Public · Anyone on or off Facebook',
      '42 people responded',
      'Details',
      'Free groceries for anyone who needs them.',
      'No ID needed. Bring your own bags.',
      'See more',
    ].join('\n')

    expect(parsePastedEvent(text, NOW)).toEqual({
      title: 'Community Food Share',
      date: '2026-10-10',
      startTime: '10:00',
      endTime: '14:00',
      locationName: 'Ringgold Depot',
      address: '155 Depot St, Ringgold, GA 30736',
      description: 'Free groceries for anyone who needs them.\nNo ID needed. Bring your own bags.',
      online: false,
      onlineLink: '',
      missing: [],
    })
  })

  it('copes with Windows line endings, capitals, extra spaces and blank lines', () => {
    const text = '  Community   Food Share \r\n\r\nSATURDAY, OCTOBER 10, 2026 AT 10 AM – 2 PM\r\nRinggold Depot\r\n155 Depot St, Ringgold, GA 30736\r\nGoing\r\nInterested\r\n'
    expect(parsePastedEvent(text, NOW)).toMatchObject({
      title: 'Community Food Share',
      date: '2026-10-10',
      startTime: '10:00',
      endTime: '14:00',
      locationName: 'Ringgold Depot',
      address: '155 Depot St, Ringgold, GA 30736',
      description: '',
    })
  })

  it('reads a flyer with the times on the line under the date and a "Where:" line', () => {
    const text = [
      'Trash pickup at the creek',
      'Oct 10',
      '10:00 AM - 12:30 PM',
      'Where: Chickamauga Creek trailhead',
      'Wear boots. We bring bags.',
    ].join('\n')
    expect(parsePastedEvent(text, NOW)).toEqual({
      title: 'Trash pickup at the creek',
      date: '2026-10-10',
      startTime: '10:00',
      endTime: '12:30',
      locationName: 'Chickamauga Creek trailhead',
      address: '',
      description: 'Wear boots. We bring bags.',
      online: false,
      onlineLink: '',
      missing: [],
    })
  })

  it.each([
    ['October 10, 2026', '2026-10-10'],
    ['Oct 10, 2026', '2026-10-10'],
    ['Sept. 12, 2026', '2026-09-12'],
    ['10 October 2026', '2026-10-10'],
    ['10th October 2026', '2026-10-10'],
    ['10/10/2026', '2026-10-10'],
    ['10/10/26', '2026-10-10'],
    ['3/7/2027', '2027-03-07'], // month first, the US way
  ])('reads the date "%s"', (written, date) => {
    expect(parsePastedEvent('Potluck\n' + written + ' at 6 PM', NOW).date).toBe(date)
  })

  it('picks the next time a date comes around when no year is given', () => {
    // Today counts as still to come. A date already gone this year means next year.
    expect(parsePastedEvent('Potluck\nSeptember 1 at 6 PM', NOW).date).toBe('2026-09-01')
    expect(parsePastedEvent('Potluck\nOct 10 at 6 PM', NOW).date).toBe('2026-10-10')
    expect(parsePastedEvent('Potluck\nAugust 3 at 6 PM', NOW).date).toBe('2027-08-03')
  })

  it('does not guess a date that is not on the calendar', () => {
    const draft = parsePastedEvent('Potluck\nFebruary 30, 2027 at 6 PM', NOW)
    expect(draft.date).toBe('')
    expect(draft.startTime).toBe('')
    expect(draft.missing).toContain('the date')
    expect(draft.missing).toContain('the start time')
  })

  it.each([
    ['10 AM – 2 PM', '10:00', '14:00'],
    ['10:00 AM - 12:30 PM', '10:00', '12:30'],
    ['10 - 2 PM', '10:00', '14:00'], // the 10 has to be morning
    ['1-3pm', '13:00', '15:00'],
    ['12 - 2 PM', '12:00', '14:00'],
    ['9 to 11 a.m.', '09:00', '11:00'],
    ['5:30–7 PM', '17:30', '19:00'],
    ['6:30 p.m.', '18:30', ''],
    ['7pm', '19:00', ''],
    ['12 PM - 12 AM', '12:00', '00:00'], // noon to midnight
    ['12:30 AM', '00:30', ''],
  ])('reads the time "%s"', (written, startTime, endTime) => {
    expect(parsePastedEvent('Potluck\nOct 10, ' + written, NOW)).toMatchObject({ date: '2026-10-10', startTime, endTime })
  })

  it('splits a labeled place into its name and its street address', () => {
    const draft = parsePastedEvent('Potluck\nSat Oct 10, 10 - 2 PM\nLocation: Grange Hall, 20 Mill Rd, LaFayette', NOW)
    expect(draft).toMatchObject({ locationName: 'Grange Hall', address: '20 Mill Rd, LaFayette', missing: [] })
  })

  it('finds a street address on its own line or after the place name', () => {
    expect(parsePastedEvent('Skill share\nOct 10 at 5 PM\nRinggold Library, 123 Main Street, Ringgold', NOW))
      .toMatchObject({ title: 'Skill share', locationName: 'Ringgold Library', address: '123 Main Street, Ringgold' })
    expect(parsePastedEvent('Cookie swap\n12/12/2026 2pm-4pm\n1200 Battlefield Pkwy, Fort Oglethorpe', NOW))
      .toMatchObject({ title: 'Cookie swap', locationName: '', address: '1200 Battlefield Pkwy, Fort Oglethorpe' })
    expect(parsePastedEvent('Cookie swap\nDec 12 at 2 PM\nAddress: 400 Oak Ave', NOW))
      .toMatchObject({ locationName: '', address: '400 Oak Ave', missing: [] })
  })

  it('keeps the first line as the event name even when an address comes right under it', () => {
    const draft = parsePastedEvent('Winter coat giveaway\n123 Main Street\nOct 10 at 5 PM', NOW)
    expect(draft).toMatchObject({ title: 'Winter coat giveaway', locationName: '', address: '123 Main Street' })
  })

  it('marks the event online when it has a video call link, and does not ask for a place', () => {
    const draft = parsePastedEvent('Tenant rights Q and A\n10 October 2026, 6:30 p.m.\nJoin (https://us02web.zoom.us/j/123456?pwd=abc)', NOW)
    expect(draft).toMatchObject({ online: true, onlineLink: 'https://us02web.zoom.us/j/123456?pwd=abc' })
    expect(draft.missing).toEqual([])
  })

  it('does not call an event online because the text links back to its Facebook page', () => {
    const draft = parsePastedEvent('Movie night\nOctober 10 at 6 PM\nhttps://www.facebook.com/events/12345', NOW)
    expect(draft).toMatchObject({ online: false, onlineLink: '' })
    expect(draft.missing).toEqual(['the place'])
  })

  it('never uses Facebook\'s own buttons and counters as the name or the notes', () => {
    const draft = parsePastedEvent('Going\nInterested\nShare\nHosted by Ringgold Mutual Aid\n1.2K people responded\nSee more', NOW)
    expect(draft.title).toBe('')
    expect(draft.description).toBe('')
    expect(draft.missing).toEqual(['the name', 'the date', 'the start time', 'the place'])
  })

  it('says what is still missing when only a name was pasted', () => {
    const draft = parsePastedEvent('Community meal', NOW)
    expect(draft.title).toBe('Community meal')
    expect(draft.missing).toEqual(['the date', 'the start time', 'the place'])
  })

  it('asks for the start time when the date has none', () => {
    const draft = parsePastedEvent('Cookie swap\nDec 12\nWhere: Grange Hall', NOW)
    expect(draft).toMatchObject({ date: '2026-12-12', startTime: '', endTime: '' })
    expect(draft.missing).toEqual(['the start time'])
  })

  it.each([[''], [null], [undefined], ['  \n \t\r\n']])('reports everything missing for empty input %j', (text) => {
    expect(parsePastedEvent(text, NOW)).toEqual({
      title: '', date: '', startTime: '', endTime: '', locationName: '', address: '', description: '', online: false, onlineLink: '', missing: ['everything'],
    })
  })

  it('cuts very long notes off at 3000 characters', () => {
    const draft = parsePastedEvent('Potluck\nOct 10 at 5 PM\n' + 'word '.repeat(2000), NOW)
    expect(draft.title).toBe('Potluck')
    expect(draft.description).toHaveLength(3000)
  })
})
