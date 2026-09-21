import { supabase } from '../supabaseClient'

// Files a report about a person, for the admins to review. Saved in the
// user_reports table (admins are notified by the database). Returns {} on
// success or { error } with a plain sentence that is safe to show.
//
// source is one of: profile, conversation, messages, campfire, event.
export async function submitUserReport({ reporterId, reportedUserId, source, reason = null, details = null }) {
  if (!reporterId) return { error: 'Could not submit your report. Try again.' }
  const { error } = await supabase.from('user_reports').insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId || null,
    source,
    reason: reason ? String(reason).slice(0, 200) : null,
    details: details ? String(details).slice(0, 1000) : null,
  })
  if (error) {
    console.error('[submitUserReport] failed', error)
    return { error: 'Could not submit your report. Try again.' }
  }
  return {}
}
