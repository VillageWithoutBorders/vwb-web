// A small CSV reader and writer, so the app doesn't need another package.
// Handles quoted fields, commas and line breaks inside quotes, "" for a
// quote mark, Windows line endings, and the invisible mark (BOM) some
// spreadsheet programs put at the start of a file.

export function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, '')
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((v) => v.trim() !== ''))
}

// First row is the header. Returns { headers, rows: [{ header: value }] }.
export function csvToObjects(text) {
  const all = parseCsv(text)
  if (!all.length) return { headers: [], rows: [] }
  const headers = all[0].map((h) => h.trim())
  const rows = all.slice(1).map((r) => {
    const o = {}
    headers.forEach((h, i) => { if (h) o[h] = r[i] ?? '' })
    return o
  })
  return { headers, rows }
}

export function toCsv(headers, rows) {
  const esc = (v) => {
    const t = v == null ? '' : String(v)
    return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
  }
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n')
}

export function downloadText(filename, text, type = 'text/csv') {
  const blob = new Blob(['﻿' + text], { type: type + ';charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
