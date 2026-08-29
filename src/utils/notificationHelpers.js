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