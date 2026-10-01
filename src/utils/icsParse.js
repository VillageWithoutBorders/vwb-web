// Reads an .ics calendar file (what Google, Apple, Outlook, and Facebook
// export) in the browser. Nothing is sent anywhere until the host chooses
// events and confirms. Returns { events, skippedPast, repeating } where each
// event is { key, title, description, location, startsAt, endsAt, allDay,
// repeats } with ISO date strings.

const MAX_DAYS_AHEAD = 366
const MAX_PER_SERIES = 60

function unfold(text) {
  return text.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '')
}

function unescapeText(v) {
  return String(v || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

// "DTSTART;TZID=America/New_York:20261003T090000" -> { name, params, value }
function parseLine(line) {
  const idx = line.indexOf(':')
  if (idx < 0) return null
  const head = line.slice(0, idx)
  const value = line.slice(idx + 1)
  const parts = head.split(';')
  const name = parts[0].toUpperCase()
  const params = {}
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/"/g, '')
  }
  return { name, params, value }
}

// Turn wall-clock time in a named time zone into a real Date.
function zonedToDate(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    const offsetAt = (ms) => {
      const p = {}
      for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value
      const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
      return asUtc - ms
    }
    let ms = guess - offsetAt(guess)
    ms = guess - offsetAt(ms)
    return new Date(ms)
  } catch {
    return new Date(y, mo - 1, d, h, mi, s)
  }
}

// Returns { date, allDay } or null.
function parseDate(prop) {
  if (!prop) return null
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(prop.value.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (h === undefined) {
    return { date: new Date(+y, +mo - 1, +d, 0, 0, 0), allDay: true }
  }
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0))), allDay: false }
  if (prop.params.TZID) return { date: zonedToDate(+y, +mo, +d, +h, +mi, +(s || 0), prop.params.TZID), allDay: false }
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0)), allDay: false }
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

// Expands the common repeat rules (daily, weekly, monthly, yearly) for the
// next year. Anything fancier imports the first date only.
function expand(start, rrule, exdates, now, limit) {
  const rule = {}
  for (const piece of rrule.split(';')) {
    const [k, v] = piece.split('=')
    if (k && v) rule[k.toUpperCase()] = v
  }
  const freq = rule.FREQ
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null
  if (rule.BYSETPOS || rule.BYWEEKNO || rule.BYYEARDAY) return null
  if (freq !== 'WEEKLY' && rule.BYDAY && /\d/.test(rule.BYDAY)) return null // "second Tuesday"
  const interval = Math.max(1, parseInt(rule.INTERVAL || '1', 10))
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : null
  let until = null
  if (rule.UNTIL) {
    const u = parseDate({ value: rule.UNTIL, params: {} })
    until = u ? u.date : null
  }
  const stopAt = Math.min(limit.getTime(), until ? until.getTime() + 86400000 : Infinity)
  const out = []
  const skip = new Set((exdates || []).map((d) => d.getTime()))
  const byDay = rule.BYDAY ? rule.BYDAY.split(',').map((d) => DAYS.indexOf(d.slice(-2))).filter((i) => i >= 0) : null

  let produced = 0
  const push = (d) => {
    produced += 1
    if (!skip.has(d.getTime()) && d.getTime() >= now.getTime() - 86400000) out.push(d)
  }

  if (freq === 'WEEKLY') {
    const days = byDay && byDay.length ? byDay : [start.getDay()]
    const weekStart = new Date(start)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    for (let w = 0; w < 600; w++) {
      const base = new Date(weekStart)
      base.setDate(base.getDate() + w * 7 * interval)
      for (const dow of [...days].sort()) {
        const d = new Date(base)
        d.setDate(d.getDate() + dow)
        d.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0)
        if (d < start) continue
        if (d.getTime() > stopAt) return out
        if (count && produced >= count) return out
        push(d)
        if (out.length >= MAX_PER_SERIES) return out
      }
    }
    return out
  }

  for (let i = 0; i < 1500; i++) {
    const d = new Date(start)
    if (freq === 'DAILY') d.setDate(start.getDate() + i * interval)
    else if (freq === 'MONTHLY') d.setMonth(start.getMonth() + i * interval)
    else d.setFullYear(start.getFullYear() + i * interval)
    if (freq === 'MONTHLY' && d.getDate() !== start.getDate()) continue // e.g. the 31st in a 30-day month
    if (d.getTime() > stopAt) return out
    if (count && produced >= count) return out
    if (byDay && byDay.length && freq === 'DAILY' && !byDay.includes(d.getDay())) continue
    push(d)
    if (out.length >= MAX_PER_SERIES) return out
  }
  return out
}

export function parseIcs(text, nowDate) {
  const now = nowDate || new Date()
  const limit = new Date(now.getTime() + MAX_DAYS_AHEAD * 86400000)
  const lines = unfold(text).split('\n')
  const blocks = []
  let cur = null
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^BEGIN:VEVENT$/i.test(line)) cur = []
    else if (/^END:VEVENT$/i.test(line)) { if (cur) blocks.push(cur); cur = null }
    else if (cur) cur.push(line)
  }

  const events = []
  let skippedPast = 0
  let repeating = 0

  blocks.forEach((block, bi) => {
    const props = block.map(parseLine).filter(Boolean)
    const get = (n) => props.find((p) => p.name === n)
    const status = (get('STATUS')?.value || '').toUpperCase()
    if (status === 'CANCELLED') return
    if (get('RECURRENCE-ID')) return // an edited single date; the main series covers it
    const start = parseDate(get('DTSTART'))
    if (!start) return
    const end = parseDate(get('DTEND'))
    const title = unescapeText(get('SUMMARY')?.value) || 'Untitled event'
    const description = unescapeText(get('DESCRIPTION')?.value)
    const location = unescapeText(get('LOCATION')?.value)
    const uid = get('UID')?.value || String(bi)
    const durationMs = end ? Math.max(0, end.date.getTime() - start.date.getTime()) : 0
    const rrule = get('RRULE')?.value
    const exdates = props.filter((p) => p.name === 'EXDATE').flatMap((p) => p.value.split(',').map((v) => parseDate({ value: v, params: p.params })?.date).filter(Boolean))

    let starts = [start.date]
    let repeats = false
    if (rrule) {
      const list = expand(start.date, rrule, exdates, now, limit)
      repeats = true
      repeating += 1
      if (list && list.length) starts = list
      else if (list) starts = []
      // list === null means a rule we don't expand: bring in the first date only.
    }

    for (const s of starts) {
      const e = durationMs ? new Date(s.getTime() + durationMs) : null
      const finish = e || s
      if (finish.getTime() < now.getTime()) { skippedPast += 1; continue }
      if (s.getTime() > limit.getTime()) continue
      events.push({
        key: uid + '|' + s.toISOString(),
        title,
        description,
        location,
        startsAt: s.toISOString(),
        endsAt: e ? e.toISOString() : null,
        allDay: start.allDay,
        repeats,
      })
    }
  })

  events.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return { events, skippedPast, repeating }
}
