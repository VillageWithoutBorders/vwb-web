// Icons, colors, and "5m ago" text for alerts. Used by the Alerts popout
// in the top bar and by the full Alerts page, so they always match.

export const TYPE_ICONS = {
  event_signup: '\u{1F4C5}',
  event_signup_cancel: '\u{1F4C5}',
  village: '\u{1F525}',
  security_alert: '\u{1F512}',
  message: '\u{1F4AC}',
  match_request: '\u{1F91D}',
  match_accepted: '\u2705',
  match_declined: '\u274C',
  task_update: '\u{1F4CB}',
  emergency: '\u{1F6A8}',
  vouch: '\u2B50',
  task_complete: '\u2705',
  resource_approved: '\u{1F4DA}',
  ambassador_application: '\u{1F33F}',
  ambassador_approved: '\u2705',
  safety_report: '\u{1F6A9}',
  report_reviewed: '\u2705',
  group_removal_request: '\u{1F525}',
  campfire: '\u{1F525}',
  calendar_signup: '\u{1F4C5}',
  affiliation_request: '\u{1F91D}',
  affiliation_accepted: '\u{1F91D}',
  affiliation_ended: '\u{1F91D}',
  message_request: '\u2709\uFE0F'
}

export const TYPE_COLORS = {
  event_signup: '#10b981',
  event_signup_cancel: '#f59e0b',
  village: '#e8833a',
  security_alert: '#ef4444',
  message: '#3b82f6',
  match_request: '#8b5cf6',
  match_accepted: '#10b981',
  match_declined: '#ef4444',
  task_update: '#f59e0b',
  emergency: '#dc2626',
  vouch: '#eab308',
  task_complete: '#10b981',
  resource_approved: '#06b6d4',
  ambassador_application: '#f59e0b',
  ambassador_approved: '#10b981',
  safety_report: '#ef4444',
  report_reviewed: '#10b981',
  group_removal_request: '#f59e0b',
  campfire: '#e8833a',
  calendar_signup: '#4ecca3',
  affiliation_request: '#4ecca3',
  affiliation_accepted: '#4ecca3',
  affiliation_ended: '#8a8a8a',
  message_request: '#4ecca3'
}

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return mins + 'm ago'
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hrs + 'h ago'
  const days = Math.floor(hrs / 24)
  if (days < 7) return days + 'd ago'
  return new Date(dateStr).toLocaleDateString()
}
