// Alerts that are admin work. For VWB admins and founders these live in the
// shared Admin inbox (the shield in the top bar), not in personal Alerts.
// The database already sends new admin work to the shared feed
// (vwb-admin-inbox.sql); this also hides older ones and the two event close
// requests that the Admin page still reads from personal alerts.
export const ADMIN_WORK_TYPES = ['false_alarm_request', 'duplicate_merge_request']

export function isAdminWork(n) {
  if (!n) return false
  if (ADMIN_WORK_TYPES.includes(n.type)) return true
  const link = n.link || ''
  if (link.startsWith('/admin')) return true
  if (link.startsWith('/resource-reports') && (n.type === 'resource_report' || n.type === 'safety_report')) return true
  return false
}
