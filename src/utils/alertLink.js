// Where an alert opens (Oct 28, Jade: "all alerts should be clickable and take
// you to the right page"). Most alerts carry their own link. Older ones, and a
// few the database sends with no link or only "/admin", get one here by kind.

// Personal alerts (notifications.type) with no link.
const PERSONAL = {
  village: '/village', role: '/me', security_alert: '/settings?tab=account',
  message: '/messages', message_request: '/messages', campfire: '/messages',
  match_request: '/tasks?tab=requests', match_accepted: '/tasks', match_declined: '/tasks',
  task_update: '/tasks', task_complete: '/tasks', request_expiring: '/tasks?tab=requests',
  new_request: '/skillshare', emergency: '/emergency', vouch: '/profile',
  resource_approved: '/community/resources', ambassador_application: '/admin?tab=approvals',
  ambassador_approved: '/me', safety_report: '/admin?tab=reports', report_reviewed: '/notifications',
  group_removal_request: '/groups', group_post: '/groups', group_setting: '/groups', group_waiting: '/groups', group_member: '/groups',
  calendar_signup: '/calendar', calendar_invite: '/calendar', calendar_update: '/calendar',
  event_signup: '/calendar', event_signup_cancel: '/calendar',
  affiliation_request: '/org-dashboard', affiliation_accepted: '/org-dashboard', affiliation_ended: '/org-dashboard',
}

// Admin alerts (admin_alerts.kind): the Admin section that handles each kind.
const ADMIN = {
  village: '/admin?tab=villages', role: '/admin?tab=villages',
  member_report: '/admin?tab=reports', task_issue: '/admin?tab=reports', safety_report: '/admin?tab=reports',
  emergency: '/admin?tab=emergencies', group_response: '/admin?tab=emergencies',
  ambassador_application: '/admin?tab=approvals', admin_application: '/admin?tab=approvals',
  organization: '/admin?tab=organizations', org_request: '/admin?tab=organizations',
  resource_report: '/resource-reports', resource_claim: '/admin?tab=approvals',
  resource_suggestion: '/community/resources?suggestions=1',
  crn_preview: '/admin?tab=crn', event_close: '/admin?tab=emergencies',
}

export function personalAlertLink(n) {
  return (n && n.link) || PERSONAL[n && n.type] || '/notifications'
}

export function adminAlertLink(a) {
  const link = a && a.link
  // A bare "/admin" goes nowhere when you are already on Admin, so pick the section.
  if (link && link !== '/admin' && link !== '/admin/') return link
  const text = ((a && a.title) || '') + ' ' + ((a && a.body) || '')
  if (/village|keeper/i.test(text)) return '/admin?tab=villages'
  return ADMIN[a && a.kind] || '/admin?tab=inbox'
}
