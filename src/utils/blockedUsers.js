import { supabase } from '../supabaseClient'

// Returns the set of user ids that should be hidden from `userId` — anyone
// they've blocked, plus anyone who has blocked them. Blocking is enforced
// both ways so it actually protects the person being escaped from, not just
// the person who clicked "Block": otherwise a blocked user could still see
// your posts and message you, they'd just be missing from your own list.
export async function getBlockedUserIds(userId) {
  const blocked = new Set()
  if (!userId) return blocked

  const { data: iBlocked, error: iBlockedErr } = await supabase
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', userId)
  if (iBlockedErr) console.error('[blockedUsers] failed to load who you blocked', iBlockedErr)
  if (iBlocked) iBlocked.forEach(b => blocked.add(b.blocked_id))

  const { data: blockedMe, error: blockedMeErr } = await supabase
    .from('blocks')
    .select('blocker_id')
    .eq('blocked_id', userId)
  if (blockedMeErr) console.error('[blockedUsers] failed to load who blocked you', blockedMeErr)
  if (blockedMe) blockedMe.forEach(b => blocked.add(b.blocker_id))

  return blocked
}
