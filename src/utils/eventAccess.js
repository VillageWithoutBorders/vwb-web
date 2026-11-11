// Round E part 4 (Nov 10): event access notes. Optional. Saved on calendar_events.access.
// Never a workplace or building field, and never someone's home.
export const ACCESS_CHOICES = {
  noise: { label: 'Noise', options: [['quiet', 'Quiet'], ['some', 'Some noise'], ['loud', 'Loud']] },
  light: { label: 'Lights', options: [['dim', 'Dim'], ['soft', 'Soft'], ['bright', 'Bright or flashing']] },
  crowd: { label: 'About how many people', options: [['small', 'Under 20'], ['medium', '20 to 100'], ['big', 'Over 100']] },
  masks: { label: 'Masks', options: [['required', 'Required'], ['welcome', 'Welcome but not required'], ['not_asked', 'Not asked']] },
}
export const ACCESS_TEXTS = {
  quiet_room: { label: 'Quiet room', hint: 'For example: Yes, Room 2 down the hall', max: 200 },
  entry: { label: 'Parking and entry', hint: 'For example: Free lot behind the building. Ramp at the side door.', max: 500 },
  order: { label: 'What happens, in order', hint: 'One thing per line. For example:\n10:00 Doors open\n10:30 Welcome\n11:00 Games', max: 1000 },
  look_for: { label: 'Who to look for', hint: 'For example: Volunteers in green shirts at the front table', max: 200 },
}

// Keep only known keys and allowed values. Empty means null.
export function cleanAccess(a) {
  const out = {}
  for (const [k, c] of Object.entries(ACCESS_CHOICES)) if (a && c.options.some(([v]) => v === a[k])) out[k] = a[k]
  for (const [k, c] of Object.entries(ACCESS_TEXTS)) { const v = a && typeof a[k] === 'string' ? a[k].trim().slice(0, c.max) : ''; if (v) out[k] = v }
  return Object.keys(out).length ? out : null
}
