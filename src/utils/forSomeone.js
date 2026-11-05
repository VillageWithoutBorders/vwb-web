// Requests posted for someone else (vwb-help-for-someone.sql).
// The poster stays the requester. for_name is the neighbor's first name only.
import { t } from './lang'

/** "For Ruth, posted by Jade". Falls back to just the poster's name. */
export function forLine(req, posterName) {
  const who = (req?.for_name || '').trim()
  if (!who) return ''
  return posterName ? t('For {who}, posted by {poster}', { who, poster: posterName }) : t('For {who}', { who })
}

/** Short title for lists: "Yard work for Ruth". */
export function forTitle(req, fallback = 'Help request') {
  const base = t(req?.skill_needed || fallback)
  const who = (req?.for_name || '').trim()
  return who ? t('{what} for {who}', { what: base, who }) : base
}

/** One line for helpers, so they know who they talk with. */
export function helperNote(req, posterName) {
  const who = (req?.for_name || '').trim()
  if (!who) return ''
  return t('You will talk with {poster}. They will pass things along to {who}.', { poster: posterName || t('the person who posted this'), who })
}
