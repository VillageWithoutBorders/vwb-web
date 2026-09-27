import { supabase } from '../supabaseClient'
import { distanceMiles, getMyLocation } from './location'

// Towns for the location dropdown (website calendar, app calendar, and the
// "where is it" picker when posting an event). Coordinates are town centers,
// which is all the distance filter needs, and it means nobody's exact
// location is ever stored or shared just to place an event on the map.
export const TOWNS = [
  { name: 'Ringgold, GA', lat: 34.916, lng: -85.109 },
  { name: 'Fort Oglethorpe, GA', lat: 34.949, lng: -85.257 },
  { name: 'Rossville, GA', lat: 34.983, lng: -85.286 },
  { name: 'Chickamauga, GA', lat: 34.871, lng: -85.291 },
  { name: 'LaFayette, GA', lat: 34.705, lng: -85.282 },
  { name: 'Tunnel Hill, GA', lat: 34.841, lng: -85.043 },
  { name: 'Dalton, GA', lat: 34.770, lng: -84.970 },
  { name: 'Trenton, GA', lat: 34.872, lng: -85.509 },
  { name: 'Chattanooga, TN', lat: 35.046, lng: -85.310 },
  { name: 'East Ridge, TN', lat: 35.014, lng: -85.252 },
  { name: 'Hixson, TN', lat: 35.149, lng: -85.240 },
  { name: 'Ooltewah, TN', lat: 35.075, lng: -85.062 },
  { name: 'Cleveland, TN', lat: 35.160, lng: -84.877 },
]

// Where the calendar starts. Never a guess (no more defaulting to
// Ringgold). In order:
//   1. A town this browser picked before on the calendar.
//   2. The member's own area: this visit's shared location, or the zip
//      saved on their profile. Shown as "Your area (Ringgold, GA)".
//   3. Nothing. The calendar shows every public event and asks them to
//      pick an area.
export function startingOrigin(profile) {
  const saved = loadSavedTown()
  if (saved) return saved
  const mine = getMyLocation(profile)
  if (mine) return { name: 'Your area' + (mine.label ? ' (' + mine.label + ')' : ''), lat: mine.lat, lng: mine.lng, isArea: true }
  return null
}

export const DISTANCE_OPTIONS = [5, 10, 25, 50, 100]

export const VISIBILITY = {
  public: { label: 'Public', desc: 'Anyone nearby can see it, including on the Village Without Borders website.' },
  members: { label: 'Members only', desc: 'Only members of your group can see it, inside the app.' },
  invite: { label: 'Invite only', desc: 'Only people you send the private invite link to can see it.' },
}

export async function fetchCalendarEvents() {
  const { data, error } = await supabase.rpc('list_calendar_events')
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
      if (ev.visibility !== 'public' || ev.can_manage) return true
      if (ev.miles == null) return true
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

// Remembered town for the calendar (a per-browser convenience only).
export function loadSavedTown() {
  try {
    const name = localStorage.getItem('vwb_calendar_town')
    return TOWNS.find((t) => t.name === name) || null
  } catch { return null }
}

export function saveTown(name) {
  try { localStorage.setItem('vwb_calendar_town', name) } catch { /* private mode */ }
}
