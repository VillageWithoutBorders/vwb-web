import { getLang } from './lang'

// Cooling-off wait (Nov 16): when someone was reported in a place in the last
// 24 hours, removing them from it waits. This formats when it can finish,
// like "Tue 3:15 PM".
export function waitTime(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString(getLang() === 'es' ? 'es-US' : 'en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}
