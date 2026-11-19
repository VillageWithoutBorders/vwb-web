// The calendar decides who sees which event (by distance and by privacy setting)
// and builds the "add to my calendar" links. A private invite link must never ride along in those.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'
import { setVisitZip } from '../../src/utils/location'
import { parseIcs } from '../../src/utils/icsParse'
import {
  addToPhoneCalendar, androidCalendarLink, dayLabel, downloadIcs, eventUrl, fetchCalendarEvent, fetchCalendarEvents,
  filterByDistance, fullDateTime, googleCalendarLink, groupByDay, hasEnded, isAndroid, isIOS, loadSavedPlace,
  mapLink, mapLinkFor, memberArea, outlookCalendarLink, placeFromZip, savePlace, startingOrigin, timeRange,
} from '../../src/utils/calendar'

const RINGGOLD = { name: 'Ringgold, GA', lat: 34.916, lng: -85.109, kind: 'zip' }
// About 9 miles from Ringgold.
const FORT_O = { latitude: 34.949, longitude: -85.257 }
// About 90 miles from Ringgold.
const ATLANTA = { latitude: 33.749, longitude: -84.388 }

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function useDevice(userAgent, touchPoints) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  if (touchPoints !== undefined) Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true })
}

afterEach(() => {
  delete navigator.maxTouchPoints
  document.body.innerHTML = ''
})

describe('filterByDistance', () => {
  const titles = (events, origin, miles) => filterByDistance(events, origin, miles).map((e) => e.title)

  it('shows a public event only inside the distance the viewer picked', () => {
    const events = [{ title: 'Food share', visibility: 'public', ...FORT_O }]
    expect(titles(events, RINGGOLD, 10)).toEqual(['Food share'])
    expect(titles(events, RINGGOLD, 5)).toEqual([])
  })

  it('shows a public event only inside the distance its host picked, 25 miles if they picked none', () => {
    const near = { title: 'Small radius', visibility: 'public', show_radius_miles: 5, ...FORT_O }
    const far = { title: 'Default radius', visibility: 'public', ...ATLANTA }
    const wide = { title: 'Wide radius', visibility: 'public', show_radius_miles: 100, ...ATLANTA }
    expect(titles([near, far, wide], RINGGOLD, 100)).toEqual(['Wide radius'])
  })

  it('treats signed-in-members-only events like public ones', () => {
    const events = [{ title: 'Account only', visibility: 'account', ...ATLANTA }]
    expect(titles(events, RINGGOLD, 100)).toEqual([])
    expect(titles([{ ...events[0], ...FORT_O }], RINGGOLD, 10)).toEqual(['Account only'])
  })

  it('hides a public event that has a place from someone who has not said where they are', () => {
    const events = [
      { title: 'In a place', visibility: 'public', ...FORT_O },
      { title: 'No place given', visibility: 'public', latitude: null, longitude: null },
      { title: 'Online', visibility: 'public', is_online: true, ...ATLANTA },
    ]
    expect(titles(events, null, 25)).toEqual(['No place given', 'Online'])
  })

  it('shows online events to everyone, however far away the host is', () => {
    const events = [{ title: 'Online', visibility: 'public', is_online: true, show_radius_miles: 5, ...ATLANTA }]
    expect(titles(events, RINGGOLD, 5)).toEqual(['Online'])
  })

  it.each(['members', 'invite', 'affiliates'])('never hides a %s event by distance: if you may see it, you do', (visibility) => {
    const events = [{ title: 'Private', visibility, show_radius_miles: 5, ...ATLANTA }]
    expect(titles(events, RINGGOLD, 5)).toEqual(['Private'])
    expect(titles(events, null, 5)).toEqual(['Private'])
  })

  it('holds events you organize to your own distance setting, but not to the host radius', () => {
    const mine = { title: 'Mine', visibility: 'public', can_manage: true, show_radius_miles: 5, ...FORT_O }
    expect(titles([mine], RINGGOLD, 10)).toEqual(['Mine'])
    expect(titles([mine], RINGGOLD, 5)).toEqual([])
    // With no place picked yet, your own events still show.
    expect(titles([mine], null, 5)).toEqual(['Mine'])
  })

  it('adds how many miles away each event is, or nothing when that cannot be known', () => {
    const events = [
      { title: 'Numbers', visibility: 'members', ...FORT_O },
      { title: 'Text from the database', visibility: 'members', latitude: '34.949', longitude: '-85.257' },
      { title: 'No place', visibility: 'members', latitude: null, longitude: null },
    ]
    const [a, b, c] = filterByDistance(events, RINGGOLD, 25)
    expect(a.miles).toBeGreaterThan(8)
    expect(a.miles).toBeLessThan(9.5)
    expect(b.miles).toBeCloseTo(a.miles, 6)
    expect(c.miles).toBeNull()
    expect(filterByDistance(events, null, 25).map((e) => e.miles)).toEqual([null, null, null])
  })
})

describe('telling when an event is', () => {
  // Saturday, Oct 3, 2026, 10:00 AM Eastern.
  const setNow = () => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T14:00:00Z')) }
  // The tests say how the pieces fit together. The clock words themselves ("9:00 AM")
  // come from the device's language, so they are worked out the same way here.
  const clock = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  it('counts an event as ended once its end time has passed, or its start when it has no end', () => {
    setNow()
    expect(hasEnded({ starts_at: '2026-10-03T12:00:00Z', ends_at: '2026-10-03T13:59:00Z' })).toBe(true)
    expect(hasEnded({ starts_at: '2026-10-03T12:00:00Z', ends_at: '2026-10-03T15:00:00Z' })).toBe(false)
    expect(hasEnded({ starts_at: '2026-10-03T13:00:00Z', ends_at: null })).toBe(true)
    expect(hasEnded({ starts_at: '2026-10-03T15:00:00Z' })).toBe(false)
  })

  it('says Today and Tomorrow by the Eastern day, not the UTC day', () => {
    setNow()
    // 11:30 PM Eastern tonight is already Oct 4 in UTC.
    expect(dayLabel('2026-10-04T03:30:00Z')).toBe('Today')
    expect(dayLabel('2026-10-04T04:30:00Z')).toBe('Tomorrow')
    expect(dayLabel('2026-10-04T22:00:00Z')).toBe('Tomorrow')
  })

  it('names any other day in full', () => {
    setNow()
    const iso = '2026-10-10T14:00:00Z'
    const label = dayLabel(iso)
    expect(label).toBe(new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))
    expect(label).toContain('10')
    // Yesterday is not "Today" or "Tomorrow" either.
    expect(['Today', 'Tomorrow']).not.toContain(dayLabel('2026-10-02T14:00:00Z'))
  })

  it('says Tomorrow across the end of a month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-31T14:00:00Z'))
    expect(dayLabel('2026-11-01T15:00:00Z')).toBe('Tomorrow')
  })

  it('groups events under one heading per Eastern day, keeping their order', () => {
    setNow()
    const events = [
      { id: 1, starts_at: '2026-10-03T22:00:00Z' },
      { id: 2, starts_at: '2026-10-04T03:30:00Z' }, // 11:30 PM Eastern, still today
      { id: 3, starts_at: '2026-10-04T16:00:00Z' },
      { id: 4, starts_at: '2026-10-10T16:00:00Z' },
    ]
    const groups = groupByDay(events)
    expect(groups.map((g) => g.events.map((e) => e.id))).toEqual([[1, 2], [3], [4]])
    expect(groups.map((g) => g.label).slice(0, 2)).toEqual(['Today', 'Tomorrow'])
    expect(groupByDay([])).toEqual([])
  })

  it('shows just the start time when there is no end time', () => {
    expect(timeRange({ starts_at: '2026-10-03T13:00:00Z', ends_at: null })).toBe(clock('2026-10-03T13:00:00Z'))
  })

  it('shows "start to end" for an event that ends the same Eastern day', () => {
    // 7 PM to 9 PM Eastern. In UTC the end falls on the next day, which must not matter.
    const ev = { starts_at: '2026-10-03T23:00:00Z', ends_at: '2026-10-04T01:00:00Z' }
    expect(timeRange(ev)).toBe(clock(ev.starts_at) + ' to ' + clock(ev.ends_at))
  })

  it('adds the end date when an event runs past midnight into another day', () => {
    const ev = { starts_at: '2026-10-03T23:00:00Z', ends_at: '2026-10-04T14:00:00Z' }
    const endDay = new Date(ev.ends_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    expect(timeRange(ev)).toBe(clock(ev.starts_at) + ' to ' + endDay + ', ' + clock(ev.ends_at))
  })

  it('writes the full date, then the times', () => {
    const ev = { starts_at: '2026-10-03T13:00:00Z', ends_at: '2026-10-03T15:00:00Z' }
    const day = new Date(ev.starts_at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    expect(fullDateTime(ev)).toBe(day + ', ' + timeRange(ev))
    expect(fullDateTime(ev)).toContain('2026')
  })
})

describe('links for an event', () => {
  const origin = window.location.origin
  const EVENT = {
    id: 42,
    title: 'Food share & supper',
    description: 'Bring bags.\nNo ID needed.',
    starts_at: '2026-10-03T13:00:00Z',
    ends_at: '2026-10-03T15:30:00Z',
    location_name: 'Ringgold Depot',
    address: '155 Depot St',
    town: 'Ringgold',
    invite_token: 'secret-invite-token',
  }

  it('builds the event page link, adding the invite only when asked', () => {
    expect(eventUrl(EVENT, false)).toBe(origin + '/events/42')
    expect(eventUrl(EVENT, true)).toBe(origin + '/events/42?invite=secret-invite-token')
    expect(eventUrl({ id: 7 }, true)).toBe(origin + '/events/7')
  })

  it('fills in a Google Calendar event with UTC times, notes, place and the event page', () => {
    const url = new URL(googleCalendarLink(EVENT))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      action: 'TEMPLATE',
      text: 'Food share & supper',
      dates: '20261003T130000Z/20261003T153000Z',
      details: 'Bring bags.\nNo ID needed.\n\n' + origin + '/events/42',
      location: 'Ringgold Depot, 155 Depot St, Ringgold',
    })
  })

  it('fills in an Outlook event the same way', () => {
    const url = new URL(outlookCalendarLink(EVENT))
    expect(url.origin + url.pathname).toBe('https://outlook.live.com/calendar/0/deeplink/compose')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      path: '/calendar/action/compose',
      rru: 'addevent',
      subject: 'Food share & supper',
      startdt: '2026-10-03T13:00:00.000Z',
      enddt: '2026-10-03T15:30:00.000Z',
      body: 'Bring bags.\nNo ID needed.\n\n' + origin + '/events/42',
      location: 'Ringgold Depot, 155 Depot St, Ringgold',
    })
  })

  it('opens the Android calendar with the event filled in', () => {
    const link = androidCalendarLink(EVENT)
    expect(link.startsWith('intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.item/event;')).toBe(true)
    expect(link.endsWith(';end')).toBe(true)
    const extras = Object.fromEntries(link.split(';').filter((p) => /^[Sl]\./.test(p)).map((p) => {
      const at = p.indexOf('=')
      return [p.slice(0, at), decodeURIComponent(p.slice(at + 1))]
    }))
    expect(extras).toEqual({
      'S.title': 'Food share & supper',
      'S.description': 'Bring bags.\nNo ID needed.\n\n' + origin + '/events/42',
      'S.eventLocation': 'Ringgold Depot, 155 Depot St, Ringgold',
      'l.beginTime': String(Date.parse('2026-10-03T13:00:00Z')),
      'l.endTime': String(Date.parse('2026-10-03T15:30:00Z')),
    })
  })

  it('assumes one hour when the event has no end time', () => {
    const open = { ...EVENT, ends_at: null }
    expect(new URL(googleCalendarLink(open)).searchParams.get('dates')).toBe('20261003T130000Z/20261003T140000Z')
    expect(new URL(outlookCalendarLink(open)).searchParams.get('enddt')).toBe('2026-10-03T14:00:00.000Z')
    expect(androidCalendarLink(open)).toContain('l.endTime=' + Date.parse('2026-10-03T14:00:00Z') + ';')
  })

  it('uses the meeting link as the place for an online event, or says "Online event"', () => {
    const online = { ...EVENT, is_online: true, online_link: 'https://meet.example.org/abc' }
    expect(new URL(googleCalendarLink(online)).searchParams.get('location')).toBe('https://meet.example.org/abc')
    expect(new URL(outlookCalendarLink({ ...online, online_link: null })).searchParams.get('location')).toBe('Online event')
  })

  it('never puts the private invite link into a calendar entry', () => {
    const made = [googleCalendarLink(EVENT), outlookCalendarLink(EVENT), androidCalendarLink(EVENT)]
    for (const link of made) expect(decodeURIComponent(link)).not.toContain('secret-invite-token')
  })
})

describe('map links', () => {
  const PLACE = { location_name: 'Ringgold Depot', address: '155 Depot St', town: 'Ringgold' }
  const QUERY = encodeURIComponent('Ringgold Depot, 155 Depot St, Ringgold')

  it('opens Apple Maps on an iPhone', () => {
    useDevice(IPHONE)
    expect(mapLink(PLACE)).toBe('https://maps.apple.com/?q=' + QUERY)
  })

  it('opens the phone\'s own map app on Android', () => {
    useDevice(ANDROID)
    expect(mapLink(PLACE)).toBe('geo:0,0?q=' + QUERY)
  })

  it('opens Google Maps on a computer', () => {
    useDevice(WINDOWS)
    expect(mapLink(PLACE)).toBe('https://www.google.com/maps/search/?api=1&query=' + QUERY)
  })

  it('uses whatever parts of the place are filled in, and gives no link when none are', () => {
    useDevice(WINDOWS)
    expect(mapLink({ town: 'Ringgold' })).toBe('https://www.google.com/maps/search/?api=1&query=Ringgold')
    expect(mapLink({ location_name: '', address: null })).toBeNull()
    expect(mapLinkFor('   ')).toBeNull()
    expect(mapLinkFor(null)).toBeNull()
    expect(mapLinkFor(' 155 Depot St ')).toBe('https://www.google.com/maps/search/?api=1&query=155%20Depot%20St')
  })

  it('tells iPhones, iPads, Android phones and computers apart', () => {
    useDevice(IPHONE)
    expect([isIOS(), isAndroid()]).toEqual([true, false])
    useDevice(ANDROID)
    expect([isIOS(), isAndroid()]).toEqual([false, true])
    // A newer iPad says it is a Mac. The touch screen gives it away.
    useDevice(MAC, 5)
    expect([isIOS(), isAndroid()]).toEqual([true, false])
    useDevice(MAC, 0)
    expect([isIOS(), isAndroid()]).toEqual([false, false])
    useDevice(WINDOWS)
    expect([isIOS(), isAndroid()]).toEqual([false, false])
  })
})

describe('the calendar file', () => {
  const EVENT = {
    id: 42,
    title: 'Food share; bring bags, please',
    description: 'Line one\nLine two',
    starts_at: '2026-10-03T13:00:00Z',
    ends_at: null,
    location_name: 'Ringgold Depot',
    address: '155 Depot St',
    town: 'Ringgold',
    invite_token: 'secret-invite-token',
  }

  // The code tidies up on a timer after each download. Pretend clocks keep that inside the test.
  beforeEach(() => { vi.useFakeTimers() })

  // Catches the file the code hands to the browser.
  function catchDownloads() {
    const files = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { files.push({ blob }); return 'blob:calendar-file' })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { files.at(-1).name = this.download })
    return files
  }

  it('saves an .ics file with the event in it, escaped the way calendar apps expect', async () => {
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'))
    const files = catchDownloads()

    downloadIcs(EVENT)

    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('food-share-bring-bags-please.ics')
    expect(files[0].blob.type).toBe('text/calendar')
    const page = window.location.origin + '/events/42'
    expect((await files[0].blob.text()).split('\r\n')).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Village Without Borders//Calendar//EN',
      'BEGIN:VEVENT',
      'UID:vwb-event-42@villagewithoutborders.org',
      'DTSTAMP:20260901T120000Z',
      'DTSTART:20261003T130000Z',
      'DTEND:20261003T140000Z',
      'SUMMARY:Food share\\; bring bags\\, please',
      'DESCRIPTION:Line one\\nLine two\\n\\n' + page,
      'LOCATION:Ringgold Depot\\, 155 Depot St\\, Ringgold',
      'URL:' + page,
      'END:VEVENT',
      'END:VCALENDAR',
    ])
  })

  it('makes a file the app\'s own calendar reader gets the same event back from', async () => {
    const files = catchDownloads()
    downloadIcs(EVENT)
    const text = await files[0].blob.text()
    const { events } = parseIcs(text, new Date('2026-09-01T12:00:00Z'))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      title: 'Food share; bring bags, please',
      description: 'Line one\nLine two\n\n' + window.location.origin + '/events/42',
      location: 'Ringgold Depot, 155 Depot St, Ringgold',
      startsAt: '2026-10-03T13:00:00.000Z',
      endsAt: '2026-10-03T14:00:00.000Z',
    })
    expect(text).not.toContain('secret-invite-token')
  })

  it('names the file "event.ics" when the event has no title', () => {
    const files = catchDownloads()
    downloadIcs({ ...EVENT, title: '' })
    expect(files[0].name).toBe('event.ics')
  })

  it('downloads the file right away on a computer', () => {
    useDevice(WINDOWS)
    const files = catchDownloads()
    addToPhoneCalendar(EVENT)
    expect(files).toHaveLength(1)
  })

  // In the next two tests the pretend browser prints "Not implemented: navigation",
  // because it cannot follow the link that opens a phone's calendar app. That is expected.
  it('falls back to the file on a phone when no calendar app opened', () => {
    useDevice(ANDROID)
    const files = catchDownloads()

    addToPhoneCalendar(EVENT)
    vi.advanceTimersByTime(1499)
    expect(files).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('food-share-bring-bags-please.ics')
  })

  it('does not also download the file when the phone\'s calendar app took over', () => {
    useDevice(ANDROID)
    const files = catchDownloads()

    addToPhoneCalendar(EVENT)
    window.dispatchEvent(new Event('blur')) // the calendar app came to the front
    vi.advanceTimersByTime(5000)
    expect(files).toHaveLength(0)
  })
})

describe('the place the calendar starts from', () => {
  const PROFILE = { location_source: 'zip', latitude: 34.916, longitude: -85.109, zip_code: '30736', neighborhood: ' Ringgold ' }

  it('remembers a zip code place on this device', () => {
    savePlace({ name: 'Ringgold, GA', lat: 34.916, lng: -85.109, zip: '30736', kind: 'zip' })
    expect(loadSavedPlace()).toEqual({ name: 'Ringgold, GA', lat: 34.916, lng: -85.109, zip: '30736', kind: 'zip' })
  })

  it('forgets the remembered place when the person switches to their own area or clears it', () => {
    const zipPlace = { name: 'Ringgold, GA', lat: 34.916, lng: -85.109, zip: '30736', kind: 'zip' }
    savePlace(zipPlace)
    savePlace({ name: 'Your area', lat: 34.7, lng: -84.9, kind: 'area' })
    expect(loadSavedPlace()).toBeNull()
    // The member's own area is never written to this browser.
    expect(localStorage.getItem('vwb_calendar_place')).toBeNull()

    savePlace(zipPlace)
    savePlace(null)
    expect(loadSavedPlace()).toBeNull()
  })

  it.each([
    ['text that is not JSON', 'Ringgold'],
    ['a place with no name', JSON.stringify({ lat: 34.9, lng: -85.1 })],
    ['a place whose numbers are text', JSON.stringify({ name: 'Ringgold', lat: '34.9', lng: '-85.1' })],
    ['a bare number', '5'],
  ])('ignores a saved place that is damaged (%s)', (_what, saved) => {
    localStorage.setItem('vwb_calendar_place', saved)
    expect(loadSavedPlace()).toBeNull()
  })

  it('clears out the old town-name setting it replaced', () => {
    localStorage.setItem('vwb_calendar_town', 'Ringgold')
    loadSavedPlace()
    expect(localStorage.getItem('vwb_calendar_town')).toBeNull()
  })

  it('names the member\'s own area by their town and zip', () => {
    expect(memberArea(PROFILE)).toEqual({ name: 'Ringgold (30736)', lat: 34.916, lng: -85.109, kind: 'area' })
  })

  it('says "Your area" when the profile has no town', () => {
    expect(memberArea({ ...PROFILE, neighborhood: null }).name).toBe('Your area (30736)')
  })

  it('uses a zip shared for this visit ahead of the saved one', () => {
    setVisitZip({ latitude: 34.77, longitude: -84.97, label: 'Dalton, GA' })
    expect(memberArea({ ...PROFILE, neighborhood: '' })).toEqual({ name: 'Your area (Dalton, GA)', lat: 34.77, lng: -84.97, kind: 'area' })
  })

  it('has no area for someone who has not shared a place, and never guesses one', () => {
    expect(memberArea(null)).toBeNull()
    expect(memberArea({ neighborhood: 'Ringgold' })).toBeNull()
    expect(startingOrigin(null)).toBeNull()
  })

  it('starts from the place picked on this device, then the member\'s own area', () => {
    expect(startingOrigin(PROFILE)).toMatchObject({ kind: 'area', name: 'Ringgold (30736)' })
    savePlace({ name: 'Dalton, GA', lat: 34.77, lng: -84.97, zip: '30720', kind: 'zip' })
    expect(startingOrigin(PROFILE)).toMatchObject({ kind: 'zip', name: 'Dalton, GA' })
  })
})

describe('loading from the database', () => {
  it('asks for upcoming events by default', async () => {
    db.onRpc('list_calendar_events', () => [{ id: 1, title: 'Food share' }])
    const { events, error } = await fetchCalendarEvents()
    expect(error).toBeNull()
    expect(events).toEqual([{ id: 1, title: 'Food share' }])
    expect(db.rpcCalls('list_calendar_events')[0].args).toBeUndefined()
    // No event has a host group, so partner names are not asked for.
    expect(db.rpcCalls('event_partner_names')).toHaveLength(0)
  })

  it('asks from the first of the month, Eastern time, for the month view', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-17T19:00:00Z'))
    db.onRpc('list_calendar_events', () => [])
    await fetchCalendarEvents({ thisMonth: true })
    expect(db.rpcCalls('list_calendar_events')[0].args).toEqual({ p_from: '2026-10-01T04:00:00.000Z' })
  })

  it('adds partner group names to events hosted by a group', async () => {
    db.onRpc('list_calendar_events', () => [
      { id: 1, title: 'Resource fair', organization_id: 9 },
      { id: 2, title: 'Potluck', organization_id: null },
      { id: 3, title: 'Cleanup', organization_id: 9 },
    ])
    db.onRpc('event_partner_names', () => [{ event_id: 1, names: ['Library Friends'] }])
    const { events } = await fetchCalendarEvents()
    expect(db.rpcCalls('event_partner_names')[0].args).toEqual({ p_events: [1, 3] })
    expect(events.map((e) => e.partner_names)).toEqual([['Library Friends'], undefined, undefined])
  })

  it('gives an empty list and the error when events cannot load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('list_calendar_events', 'rpc', { message: 'offline' })
    expect(await fetchCalendarEvents()).toEqual({ events: [], error: { message: 'offline' } })
    expect(console.error).toHaveBeenCalled()
  })

  it('still shows the events when partner names cannot load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.onRpc('list_calendar_events', () => [{ id: 1, title: 'Resource fair', organization_id: 9 }])
    db.failNext('event_partner_names', 'rpc', { message: 'boom', code: 'XX000' })
    const { events, error } = await fetchCalendarEvents()
    expect(error).toBeNull()
    expect(events).toEqual([{ id: 1, title: 'Resource fair', organization_id: 9 }])
    expect(console.error).toHaveBeenCalled()
  })

  it('stays quiet when the database does not have partner names yet', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.onRpc('list_calendar_events', () => [{ id: 1, title: 'Resource fair', organization_id: 9 }])
    db.failNext('event_partner_names', 'rpc', { message: 'function not found', code: 'PGRST202' })
    const { events } = await fetchCalendarEvents()
    expect(events).toHaveLength(1)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('loads one event by its number, passing the invite along when there is one', async () => {
    db.onRpc('get_calendar_event', (args) => (args.p_id === 12 ? [{ id: 12, title: 'Board meeting' }] : []))
    expect(await fetchCalendarEvent('12', 'secret-invite-token')).toEqual({ event: { id: 12, title: 'Board meeting' }, error: null })
    expect(db.rpcCalls('get_calendar_event')[0].args).toEqual({ p_id: 12, p_token: 'secret-invite-token' })

    expect(await fetchCalendarEvent(99)).toEqual({ event: null, error: null })
    expect(db.rpcCalls('get_calendar_event')[1].args).toEqual({ p_id: 99, p_token: null })
  })

  it('gives no event and the error when the event cannot load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('get_calendar_event', 'rpc', { message: 'offline' })
    expect(await fetchCalendarEvent(12)).toEqual({ event: null, error: { message: 'offline' } })
  })

  it('turns a zip code into a place to look from', async () => {
    db.onRpc('lookup_zip', ({ p_zip }) => (p_zip === '30736' ? [{ zip: '30736', city: 'Ringgold', state: 'GA', latitude: '34.92', longitude: '-85.11' }] : []))
    expect(await placeFromZip('30736')).toEqual({ name: 'Ringgold, GA', lat: 34.92, lng: -85.11, zip: '30736', kind: 'zip' })
    expect(await placeFromZip('99999')).toBeNull()
  })

  it('does not ask the database about something that is not a 5-digit zip', async () => {
    expect(await placeFromZip('3073')).toBeNull()
    expect(db.rpcCalls('lookup_zip')).toHaveLength(0)
  })
})
