// Kept so existing imports keep working. The real state now lives in
// context/NotificationsContext.jsx, shared by the top bar and Alerts page.
import { useNotificationsContext } from '../context/NotificationsContext'

export function useNotifications() {
  return useNotificationsContext()
}
