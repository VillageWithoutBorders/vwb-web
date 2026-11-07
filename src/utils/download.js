// Save data as a file on this device (Nov 7). Nothing leaves the phone or
// computer: the file is made here and handed to the browser's own download.

export function saveFile(name, text, type) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// One cell. Spreadsheet apps run anything starting with = + - @ as a formula,
// so those get a ' in front (a known trick to stop harmful formulas).
function cell(v) {
  if (v === null || v === undefined) return ''
  let s = Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

// rows: [{...}], columns: [[key, heading], ...]. Starts with a byte-order mark
// so Excel shows accents (Spanish) correctly.
export function toCsv(rows, columns) {
  const head = columns.map(([, h]) => cell(h)).join(',')
  const body = (rows || []).map((r) => columns.map(([k]) => cell(r[k])).join(',')).join('\r\n')
  return '﻿' + head + '\r\n' + body + (body ? '\r\n' : '')
}

// A safe file name from a group name.
export function fileSlug(name) {
  return (String(name || 'group').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'group').slice(0, 40)
}
