import { supabase } from '../supabaseClient'

// A vouch is only allowed between two people who have actually completed
// a task together: one was the accepted helper on the other's request, and
// both sides marked their part done. This checks both directions.
export async function canVouch(voucherId, voucheeId) {
  if (!voucherId || !voucheeId || voucherId === voucheeId) return false

  const { data: asHelper, error: helperErr } = await supabase
    .from('skill_matches')
    .select('id, help_requests!inner(requester_id)')
    .eq('helper_id', voucherId)
    .eq('help_requests.requester_id', voucheeId)
    .eq('helper_completed', true)
    .eq('requester_completed', true)
    .limit(1)
  if (helperErr) console.error('[canVouch] asHelper', helperErr)
  if (asHelper?.length) return true

  const { data: asRequester, error: requesterErr } = await supabase
    .from('skill_matches')
    .select('id, help_requests!inner(requester_id)')
    .eq('helper_id', voucheeId)
    .eq('help_requests.requester_id', voucherId)
    .eq('helper_completed', true)
    .eq('requester_completed', true)
    .limit(1)
  if (requesterErr) console.error('[canVouch] asRequester', requesterErr)
  return !!asRequester?.length
}
