import { supabase } from '../supabaseClient'

export async function createNotification({ userId, type, title, body, link }) {
  if (!userId) return
  const { error } = await supabase
    .from('notifications')
    .insert({ user_id: userId, type, title, body, link })
  if (error) console.error('Failed to create notification:', error)
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
  if (error) console.error('Failed to mark notification read:', error)
}

export async function markAllNotificationsRead(userId) {
  if (!userId) return
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false)
  if (error) console.error('Failed to mark all read:', error)
}

export async function deleteNotification(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)
  if (error) console.error('Failed to delete notification:', error)
}

// Flags an alert (or un-flags it) so you can come back to it. Only your
// own alerts can be changed. Needs vwb-notification-followup.sql.
export async function setNotificationFollowUp(notificationId, value) {
  const { error } = await supabase
    .from('notifications')
    .update({ follow_up: !!value })
    .eq('id', notificationId)
  if (error) console.error('Failed to change follow up flag:', error)
  return { error }
}

// Deletes every alert you can see, except the ones flagged to follow up.
// Message alerts are left alone: they never show in the list, they only
// exist to trigger push notifications.
export async function clearAllNotifications(userId) {
  if (!userId) return { error: null }
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .eq('follow_up', false)
    .neq('type', 'message')
  if (error) console.error('Failed to clear alerts:', error)
  return { error }
}
