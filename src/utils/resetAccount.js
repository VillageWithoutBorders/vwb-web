import { supabase } from '../supabaseClient'

// Resets a helper_profiles row back to a plain "Neighbor" (base user) account:
// clears Hope Ambassador status and details, clears admin coverage-area info,
// and drops role back to 'member' — unless the account is the founder's,
// which this never demotes. Shared by three surfaces: a self-service
// step-down in Profile, Jade's own quick dev/testing reset, and an
// admin-triggered reset of another user's account in the Admin panel.
export async function resetAccountToBase(userId, { currentRole } = {}) {
  const updates = {
    is_hope_ambassador: false,
    is_available: false,
    skills: [],
    availability: '',
    interests: '',
    radius_miles: 10,
    admin_region_name: null,
    admin_latitude: null,
    admin_longitude: null,
  }
  if (currentRole !== 'founder') {
    updates.role = 'member'
  }
  const { error } = await supabase.from('helper_profiles').update(updates).eq('user_id', userId)
  return { error }
}
