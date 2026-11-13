// Round E part 2 (Nov 10): plain names for kinds of alerts, for Mute this and the
// muted list in Settings. The database decides what is muted (vwb-invites-and-quiet-alerts.sql).
// These always come through and can't be muted. Keep in step with alert_always() in the SQL.
export const ALWAYS_ALERTS = ['emergency', 'emergency_verified', 'security_alert', 'daily_summary', 'push_test']

const NAMES = {
  message: 'Private messages',
  message_request: 'Message requests',
  group_post: 'New posts in group chats',
  campfire: 'Village Square and Campfire posts',
  calendar_invite: 'Event invites',
  calendar_update: 'Changes to events',
  calendar_signup: 'Sign-ups for events you posted',
  event_signup: 'Sign-ups for events you posted',
  event_signup_cancel: 'Cancelled sign-ups',
  new_request: 'New requests for help nearby',
  match_request: 'Offers of help on your requests',
  match_accepted: 'Your offers being accepted',
  match_declined: 'Your offers being declined',
  task_update: 'Updates on help tasks',
  task_complete: 'Finished help tasks',
  request_expiring: 'Requests about to close',
  vouch: 'Vouches',
  village: 'Village news',
  group_member: 'People joining chats',
  group_waiting: 'People waiting to join chats',
  group_setting: 'Chat setting changes',
  org_invite_accepted: 'Group join asks and invites',
  resource_approved: 'Resources you shared',
  care_circle: 'Care circle updates',
}

export function alertKindName(type) {
  return NAMES[type] || 'Other alerts like this'
}

export function canMute(type) {
  return !!type && !ALWAYS_ALERTS.includes(type) && /^[a-z_]{1,40}$/.test(type)
}
