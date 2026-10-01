import { supabase } from '../supabaseClient'
import { distanceMiles, getMyLocation, lookupZip } from './location'

// Where to look for events. Never a guess, and never a fixed town list:
// people pick a place by zip code (anywhere in the US), share their
// location for this visit, or use the area saved on their own profile.
// An origin is { name, lat, lng, kind } where kind is 'zip', 'me', or
// 'area'. Zip centers are rounded (see zip_codes), so nobody's exact spot
// is ever used or stored.

// The member's own area (their saved zip, or a place shared this visit).
export function memberArea(profile) {
  const mine = getMyLocation(profile)
  if (!mine) return null
  return { name: 'Your area' + (mine.label ? ' (' + mine.label + ')' : ''), lat: mine.lat, lng: mine.lng, kind: 'area' }
}

// Where the calendar starts: a place this browser picked before, then the
// member's own area, then nothing (every event shows, with a nudge to
// choose). There is no built-in default place.
export function startingOrigin(profile) {
  return loadSavedPlace() || memberArea(profile)
}

export const DISTANCE_OPTIONS = [5, 10, 25, 50, 100]

export const VISIBILITY = {
  public: { label: 'Public', desc: 'Anyone nearby can see it, including on the Village Without Borders website.' },
  account: { label: 'Signed-in members only', desc: 'Anyone with a Village Without Borders account can see it. Not shown to the public or on the website.' },
  members: { label: 'Members only', desc: 'Only members of your group can see it, inside the app.' },
  invite: { label: 'Invite only', desc: 'Only people you send the private invite link to can see it.' },
}

// By default only upcoming events. The month calendar passes
// { thisMonth: true } to also get events earlier in the current month,
// which it shows as ended.
export function hasEnded(ev) {
  return new Date(ev.ends_at || ev.starts_at) < new Date()
}

export async function fetchCalendarEvents(opts = {}) {
  const args = opts.thisMonth
    ? { p_from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString() }
    : undefined
  const { data, error } = await supabase.rpc('list_calendar_events', args)
  if (error) {
    console.error('Failed to load calendar events:', error)
    return { events: [], error }
  }
  return { events: data || [], error: null }
}

export async function fetchCalendarEvent(id, token) {
  const { data, error } = await supabase.rpc('get_calendar_event', { p_id: Number(id), p_token: token || null })
  if (error) {
    console.error('Failed to load event:', error)
    return { event: null, error }
  }
  return { event: (data && data[0]) || null, error: null }
}

// Public events only show to people inside the distance the host picked,
// and inside the distance the viewer is willing to go. Members-only and
// invite-only events skip the distance check: if you're allowed to see
// them at all, you should.
export function filterByDistance(events, origin, maxMiles) {
  return events
    .map((ev) => {
      const hasPlace = ev.latitude != null && ev.longitude != null
      const miles = hasPlace && origin ? distanceMiles(origin.lat, origin.lng, Number(ev.latitude), Number(ev.longitude)) : null
      return { ...ev, miles }
    })
    .filter((ev) => {
      // Online events have no place, so everyone sees them.
      if (ev.is_online || ev.can_manage) return true
      if (ev.visibility !== 'public' && ev.visibility !== 'account') return true
      if (ev.latitude == null || ev.longitude == null) return true
      // An event in a place only shows to people who told us where they are.
      if (!origin) return false
      return ev.miles <= maxMiles && ev.miles <= Number(ev.show_radius_miles || 25)
    })
}

export function groupByDay(events) {
  const groups = []
  for (const ev of events) {
    const key = new Date(ev.starts_at).toDateString()
    let g = groups.find((x) => x.key === key)
    if (!g) {
      g = { key, label: dayLabel(ev.starts_at), events: [] }
      groups.push(g)
    }
    g.events.push(ev)
  }
  return groups
}

export function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

export function timeRange(ev) {
  const opts = { hour: 'numeric', minute: '2-digit' }
  const start = new Date(ev.starts_at).toLocaleTimeString(undefined, opts)
  if (!ev.ends_at) return start
  const end = new Date(ev.ends_at)
  const sameDay = end.toDateString() === new Date(ev.starts_at).toDateString()
  return sameDay
    ? start + ' to ' + end.toLocaleTimeString(undefined, opts)
    : start + ' to ' + end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + end.toLocaleTimeString(undefined, opts)
}

export function fullDateTime(ev) {
  return new Date(ev.starts_at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + ', ' + timeRange(ev)
}

export function eventUrl(ev, withToken) {
  const base = window.location.origin + '/events/' + ev.id
  return withToken && ev.invite_token ? base + '?invite=' + ev.invite_token : base
}

function whereText(ev) {
  if (ev.is_online) return ev.online_link || 'Online event'
  return [ev.location_name, ev.address, ev.town].filter(Boolean).join(', ')
}

function toCalStamp(date) {
  return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function endOrDefault(ev) {
  return ev.ends_at || new Date(new Date(ev.starts_at).getTime() + 60 * 60 * 1000).toISOString()
}

export function googleCalendarLink(ev) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: toCalStamp(ev.starts_at) + '/' + toCalStamp(endOrDefault(ev)),
    details: (ev.description ? ev.description + '\n\n' : '') + eventUrl(ev, false),
    location: whereText(ev),
  })
  return 'https://calendar.google.com/calendar/render?' + params.toString()
}

export function isAndroid() {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '')
}

// Android: open the phone's own calendar with a new event already filled in.
// The Google link above gets grabbed by the Google Calendar app on Android,
// which can't open it ("hasn't been synchronized yet").
export function androidCalendarLink(ev) {
  const extra = (key, value) => (value ? key + '=' + encodeURIComponent(value) + ';' : '')
  return 'intent:#Intent;' +
    'action=android.intent.action.INSERT;' +
    'type=vnd.android.cursor.item/event;' +
    extra('S.title', ev.title) +
    extra('S.description', (ev.description ? ev.description + '\n\n' : '') + eventUrl(ev, false)) +
    extra('S.eventLocation', whereText(ev)) +
    'l.beginTime=' + new Date(ev.starts_at).getTime() + ';' +
    'l.endTime=' + new Date(endOrDefault(ev)).getTime() + ';' +
    'end'
}

function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

export function downloadIcs(ev) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Village Without Borders//Calendar//EN',
    'BEGIN:VEVENT',
    'UID:vwb-event-' + ev.id + '@villagewithoutborders.org',
    'DTSTAMP:' + toCalStamp(new Date()),
    'DTSTART:' + toCalStamp(ev.starts_at),
    'DTEND:' + toCalStamp(endOrDefault(ev)),
    'SUMMARY:' + icsEscape(ev.title),
    'DESCRIPTION:' + icsEscape((ev.description ? ev.description + '\n\n' : '') + eventUrl(ev, false)),
    'LOCATION:' + icsEscape(whereText(ev)),
    'URL:' + eventUrl(ev, false),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = (ev.title || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.ics'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000)
}

// Remembered place for the calendar: a per-browser convenience only,
// kept on this device. Replaces the old town-name setting.
const PLACE_KEY = 'vwb_calendar_place'

export function loadSavedPlace() {
  try {
    localStorage.removeItem('vwb_calendar_town')
    const p = JSON.parse(localStorage.getItem(PLACE_KEY) || 'null')
    if (p && p.name && typeof p.lat === 'number' && typeof p.lng === 'number') return { name: p.name, lat: p.lat, lng: p.lng, zip: p.zip, kind: 'zip' }
  } catch { /* private mode or bad data */ }
  return null
}

export function savePlace(origin) {
  try {
    if (!origin) localStorage.removeItem(PLACE_KEY)
    else if (origin.kind === 'zip') localStorage.setItem(PLACE_KEY, JSON.stringify({ name: origin.name, lat: origin.lat, lng: origin.lng, zip: origin.zip }))
  } catch { /* private mode */ }
}

// Look up a 5-digit zip for the calendar. Returns an origin or null.
export async function placeFromZip(zip) {
  const place = await lookupZip(zip)
  if (!place) return null
  return { name: place.label, lat: place.latitude, lng: place.longitude, zip: place.zip, kind: 'zip' }
}
