// Builds an iCalendar (.ics) feed from public event rows. No imports on purpose,
// so it can be tested on its own.

export type FeedEvent = {
  id: number
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  location_name: string | null
  address: string | null
  town: string | null
  status: string | null
  is_online?: boolean | null
  online_link?: string | null
}

const enc = new TextEncoder()

export function icsEscape(s: string): string {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

// Lines may not run past 75 bytes. Longer ones continue on the next line after a space.
export function fold(line: string): string {
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let bytes = 0
  let limit = 75
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > limit) {
      parts.push(cur)
      cur = ''
      bytes = 0
      limit = 74 // the leading space counts
    }
    cur += ch
    bytes += n
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function whereText(e: FeedEvent): string {
  if (e.is_online) return e.online_link || 'Online event'
  return [e.location_name, e.address, e.town].filter(Boolean).join(', ')
}

export function buildCalendar(opts: {
  name: string
  siteUrl: string
  events: FeedEvent[]
  now?: Date
}): string {
  const now = opts.now || new Date()
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Village Without Borders//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsEscape(opts.name),
    'X-WR-TIMEZONE:UTC',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  for (const e of opts.events) {
    const start = new Date(e.starts_at)
    if (isNaN(start.getTime())) continue
    const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + 60 * 60 * 1000)
    const url = opts.siteUrl.replace(/\/$/, '') + '/events/' + e.id
    const desc = ((e.description ? e.description.slice(0, 1500) + '\n\n' : '') + url)
    const where = whereText(e)
    lines.push(
      'BEGIN:VEVENT',
      'UID:vwb-event-' + e.id + '@villagewithoutborders.org',
      'DTSTAMP:' + stamp(now),
      'DTSTART:' + stamp(start),
      'DTEND:' + stamp(isNaN(end.getTime()) ? new Date(start.getTime() + 3600000) : end),
      'SUMMARY:' + icsEscape(e.title),
      'DESCRIPTION:' + icsEscape(desc),
    )
    if (where) lines.push('LOCATION:' + icsEscape(where))
    lines.push('URL:' + url)
    lines.push('STATUS:' + (e.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'))
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
