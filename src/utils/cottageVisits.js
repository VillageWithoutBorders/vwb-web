import { supabase } from '../supabaseClient'

// Which of these people's cottages you may visit (Nov 1, Jade). Same rule as
// get_cottage: each person picks connections, anyone on VWB, or only me.
// Returns a Set of user ids. Empty if anything goes wrong, so no button shows.
export async function cottagesICanVisit(ids) {
  const list = [...new Set((ids || []).filter(Boolean))]
  if (list.length === 0) return new Set()
  const { data, error } = await supabase.rpc('cottages_i_can_visit', { p_users: list })
  if (error) {
    if (error.code !== 'PGRST202') console.error('Failed to check cottage visits:', error)
    return new Set()
  }
  return new Set((data || []).map((r) => (typeof r === 'string' ? r : r.cottages_i_can_visit || r.user_id)))
}
