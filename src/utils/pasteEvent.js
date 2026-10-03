// Turn text copied from a Facebook event (or any announcement) into a first
// draft of the new-event form. Runs in the browser. Nothing is sent anywhere.
// It only guesses. The host checks every field before posting, and the form
// tells them what it could not find.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const WEEKDAY_RE = '(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*'
const TIME_RE = '(\\d{1,2})(?::(\\d{2}))?\\s*([ap])\\.?\\s*m\\.?'
const STREET_RE = /\b\d{1,6}\s+[A-Za-z0-9.' -]{2,40}\s(?:st|street|rd|road|ave|avenue|dr|drive|blvd|boulevard|ln|lane|hwy|highway|way|ct|court|pkwy|parkway|pike|cir|circle|trl|trail)\b\.?/i
const NOISE = /^(event|public|private|public event|going|interested|invite|share|see more|see less|details|about|discussion|more|write something\.{0,3}|duration|hosted by.*|event by.*|\d[\d,.]*\s*(?:people )?(?:went|going|interested|responded).*|.*people responded|.*invited you.*|guests?|online event|add to calendar|ticket info|public · anyone on or off facebook)$/i

const pad = (n) => String(n).padStart(2, '0')

function toDate(y, m, d) {
  const dt = new Date(y, m, d)
  if (dt.getMonth() !== m || dt.getDate() !== d) return null
  return dt
}

function ymd(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) }

function to24(h, min, ap) {
  let hh = Number(h) % 12
  if (String(ap).toLowerCase() === 'p') hh += 12
  return pad(hh) + ':' + pad(min || 0)
}

function findDate(line, now) {
  // "October 10, 2026", "Oct 10", "10 October 2026"
  let m = line.match(new RegExp('\\b' + MONTH_RE + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b', 'i'))
  let mon, day, yr
  if (m) { mon = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()); day = Number(m[2]); yr = m[3] ? Number(m[3]) : null }
  if (!m) {
    m = line.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+' + MONTH_RE + '\\.?(?:,?\\s+(\\d{4}))?\\b', 'i'))
    if (m) { day = Number(m[1]); mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); yr = m[3] ? Number(m[3]) : null }
  }
  if (!m) {
    m = line.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
    if (m) { mon = Number(m[1]) - 1; day = Number(m[2]); yr = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null }
  }
  if (!m || mon < 0 || mon > 11) return null
  if (yr) return toDate(yr, mon, day)
  // No year: the next time that date comes around.
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let dt = toDate(now.getFullYear(), mon, day)
  if (dt && dt < start) dt = toDate(now.getFullYear() + 1, mon, day)
  return dt
}

function findTimes(line) {
  const re = new RegExp(TIME_RE, 'gi')
  const found = []
  let m
  while ((m = re.exec(line)) !== null) found.push({ h: m[1], min: m[2], ap: m[3], at: m.index, end: m.index + m[0].length })
  if (!found.length) return { start: '', end: '' }
  // "10 - 2 PM": the first time has no am/pm of its own, so borrow the second's.
  if (found.length === 1) {
    const bare = line.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\b/i)
    if (bare) {
      const first = Number(bare[1]), second = Number(bare[3])
      const ap1 = (bare[5].toLowerCase() === 'p' && first <= second && first !== 12) || (bare[5].toLowerCase() === 'p' && first === 12) ? bare[5] : (first > second && bare[5].toLowerCase() === 'p' ? 'a' : bare[5])
      return { start: to24(bare[1], bare[2], ap1), end: to24(bare[3], bare[4], bare[5]) }
    }
    return { start: to24(found[0].h, found[0].min, found[0].ap), end: '' }
  }
  return { start: to24(found[0].h, found[0].min, found[0].ap), end: to24(found[1].h, found[1].min, found[1].ap) }
}

export function parsePastedEvent(text, nowDate) {
  const now = nowDate || new Date()
  const raw = String(text || '').replace(/\r/g, '')
  const lines = raw.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const out = { title: '', date: '', startTime: '', endTime: '', locationName: '', address: '', description: '', online: false, onlineLink: '', missing: [] }
  if (!lines.length) { out.missing = ['everything']; return out }

  const used = new Set()
  const dateRe = new RegExp('(\\b' + MONTH_RE + '\\.?\\s+\\d{1,2}\\b)|(\\b\\d{1,2}(?:st|nd|rd|th)?\\s+' + MONTH_RE + '\\b)|(\\b\\d{1,2}\\/\\d{1,2}\\b)', 'i')

  // Date and times: the first line that has a date in it.
  let dateIdx = lines.findIndex((l) => dateRe.test(l))
  if (dateIdx >= 0) {
    const dt = findDate(lines[dateIdx], now)
    if (dt) {
      out.date = ymd(dt)
      const t = findTimes(lines[dateIdx])
      out.startTime = t.start
      out.endTime = t.end
      used.add(dateIdx)
      // Times can sit on the next line ("10:00 AM - 2:00 PM").
      if (!out.startTime && lines[dateIdx + 1]) {
        const t2 = findTimes(lines[dateIdx + 1])
        if (t2.start) { out.startTime = t2.start; out.endTime = t2.end; used.add(dateIdx + 1) }
      }
    } else dateIdx = -1
  }

  // Online link
  const link = raw.match(/https?:\/\/(?:[\w-]+\.)?(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|facebook\.com\/events|fb\.me)[^\s)]*/i)
  if (link && !/facebook\.com\/events|fb\.me/i.test(link[0])) { out.online = true; out.onlineLink = link[0] }

  // Place: a labeled line, else a street address (with the line above as the name).
  const labelIdx = lines.findIndex((l, i) => !used.has(i) && /^(location|where|venue|place|address)\s*[:-]\s*\S/i.test(l))
  const addrIdx = lines.findIndex((l, i) => !used.has(i) && STREET_RE.test(l))
  if (labelIdx >= 0) {
    const val = lines[labelIdx].replace(/^[A-Za-z]+\s*[:-]\s*/, '')
    used.add(labelIdx)
    const sm = val.match(STREET_RE)
    if (sm) { out.address = val.slice(val.indexOf(sm[0])).trim(); out.locationName = val.slice(0, val.indexOf(sm[0])).replace(/[,\s-]+$/, '').trim() }
    else out.locationName = val
  } else if (addrIdx >= 0) {
    const l = lines[addrIdx]
    const sm = l.match(STREET_RE)
    const before = l.slice(0, l.indexOf(sm[0])).replace(/[,\s-]+$/, '').trim()
    out.address = l.slice(l.indexOf(sm[0])).trim()
    used.add(addrIdx)
    if (before) out.locationName = before
    else if (addrIdx > 0 && !used.has(addrIdx - 1) && lines[addrIdx - 1].length <= 60 && !NOISE.test(lines[addrIdx - 1]) && addrIdx - 1 !== 0) {
      out.locationName = lines[addrIdx - 1]
      used.add(addrIdx - 1)
    }
  }

  // Title: first line that is not the date, the place, or Facebook chrome.
  const titleIdx = lines.findIndex((l, i) => !used.has(i) && !NOISE.test(l) && !new RegExp('^' + WEEKDAY_RE + '\\b', 'i').test(l) && l.length <= 120)
  if (titleIdx >= 0) { out.title = lines[titleIdx]; used.add(titleIdx) }

  // Description: everything left, minus Facebook chrome.
  out.description = lines
    .filter((l, i) => !used.has(i) && !NOISE.test(l))
    .join('\n')
    .trim()
    .slice(0, 3000)

  if (!out.title) out.missing.push('the name')
  if (!out.date) out.missing.push('the date')
  if (!out.startTime) out.missing.push('the start time')
  if (!out.online && !out.locationName && !out.address) out.missing.push('the place')
  return out
}
