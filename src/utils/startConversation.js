import { supabase } from '../supabaseClient'
import { getBlockedUserIds } from './blockedUsers'

// Opens the direct conversation between two people, starting one if they
// have never talked. Used by the Message buttons on profiles and the avatar
// popup. Returns { id } on success or { error } with a plain sentence that is
// safe to show the person.
export async function startConversation(myId, otherId) {
  if (!myId || !otherId || myId === otherId) return { error: 'Something went wrong. Try again.' }

  // A block hides people from each other in both directions. The message
  // deliberately does not say who blocked whom.
  const blocked = await getBlockedUserIds(myId)
  if (blocked.has(otherId)) return { error: 'You cannot message this person.' }

  const { data: existing, error: lookupErr } = await supabase
    .from('conversations')
    .select('id')
    .or('and(helper_id.eq.' + otherId + ',requester_id.eq.' + myId + '),and(helper_id.eq.' + myId + ',requester_id.eq.' + otherId + ')')
    .order('created_at', { ascending: true })
    .limit(1)
  if (lookupErr) {
    console.error('[startConversation] lookup failed', lookupErr)
    return { error: 'Something went wrong. Try again.' }
  }
  if (existing && existing.length > 0) return { id: existing[0].id }

  const { data: created, error: createErr } = await supabase
    .from('conversations')
    .insert({ helper_id: otherId, requester_id: myId })
    .select('id')
    .single()
  if (createErr || !created) {
    console.error('[startConversation] create failed', createErr)
    return { error: 'Could not start a conversation. Try again.' }
  }
  return { id: created.id }
}
