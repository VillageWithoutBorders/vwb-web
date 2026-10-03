import { supabase } from '../supabaseClient'
import { NEW_ACCOUNT_NOTE, isNewAccountBlock } from './newAccount'
import { getBlockedUserIds } from './blockedUsers'

// Opens the direct conversation between two people, starting one if they
// have never talked. Used by the Message buttons on profiles and the avatar
// popup. Returns { id } on success or { error } with a plain sentence that is
// safe to show the person, or { notice } when a request was sent instead.
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

  // No conversation yet. One database call decides: open a chat if the rules
  // allow it, otherwise send a message request they can accept or ignore.
  const { data: rows, error: reqErr } = await supabase.rpc('open_conversation', { p_other: otherId })
  if (reqErr) {
    if (isNewAccountBlock(reqErr)) return { error: NEW_ACCOUNT_NOTE }
    console.error('[startConversation] open failed', reqErr)
    if (reqErr.code === '42501' && reqErr.message) return { error: reqErr.message }
    return { error: 'Could not start a conversation. Try again.' }
  }
  const row = Array.isArray(rows) ? rows[0] : rows
  const result = row?.result
  if (result === 'open' && row.convo_id) return { id: row.convo_id }
  if (result === 'limit') return { error: 'You have sent a lot of requests today. Try again tomorrow.' }
  if (result === 'already') return { notice: 'You already asked. They will see it in their Messages.' }
  return { notice: 'Request sent. They will get an alert and can accept or ignore it.' }
}
