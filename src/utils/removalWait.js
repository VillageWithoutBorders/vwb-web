import { getLang } from './lang'

// Cooling-off wait (Nov 16): when someone was reported in a place in the last
// 24 hours, removing them from it waits. This formats when it can finish,
// like "Tue 3:15 PM".
export function waitTime(ts) {
  if (!ts) return ''
  const when = new Date(ts)
  // A time that can't be read shows nothing, not the words "Invalid Date".
  if (Number.isNaN(when.getTime())) return ''
  try {
    return when.toLocaleString(getLang() === 'es' ? 'es-US' : 'en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}
