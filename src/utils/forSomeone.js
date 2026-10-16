// Requests posted for someone else (vwb-help-for-someone.sql).
// The poster stays the requester. for_name is the neighbor's first name only.

/** "For Ruth, posted by Jade". Falls back to just the poster's name. */
export function forLine(req, posterName) {
  const who = (req?.for_name || '').trim()
  if (!who) return ''
  return posterName ? 'For ' + who + ', posted by ' + posterName : 'For ' + who
}

/** Short title for lists: "Yard work for Ruth". */
export function forTitle(req, fallback = 'Help request') {
  const base = req?.skill_needed || fallback
  const who = (req?.for_name || '').trim()
  return who ? base + ' for ' + who : base
}

/** One line for helpers, so they know who they talk with. */
export function helperNote(req, posterName) {
  const who = (req?.for_name || '').trim()
  if (!who) return ''
  return 'You will talk with ' + (posterName || 'the person who posted this') + '. They will pass things along to ' + who + '.'
}
