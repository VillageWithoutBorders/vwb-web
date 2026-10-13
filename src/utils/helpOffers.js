import { supabase } from '../supabaseClient'
import { createNotification } from './notificationHelpers'

// Saying yes or no to a neighbor who offered to help with your request.
// Used by Messages (Help Offers) and Help > Mine > Requests, so both work the same way.
// offer needs: id, helper_id, request_id, skill_needed, max_helpers, accepted_count.

// Returns { ok, convoId }. On yes, a chat opens with the helper (reusing one you already have).
export async function acceptHelpOffer(offer, myId) {
  const { error: acceptErr } = await supabase
    .from('skill_matches')
    .update({ accepted: true })
    .eq('id', offer.id)
  if (acceptErr) {
    console.error('Failed to accept offer:', acceptErr)
    return { ok: false, convoId: null }
  }

  // Reuse any existing conversation with this helper, so messages with the same
  // neighbor stay in one thread instead of splitting per request.
  const { data: existingConvo, error: existingErr } = await supabase
    .from('conversations')
    .select('id')
    .or('and(helper_id.eq.' + offer.helper_id + ',requester_id.eq.' + myId + '),and(helper_id.eq.' + myId + ',requester_id.eq.' + offer.helper_id + ')')
    .maybeSingle()
  if (existingErr) console.error('Failed to check for an existing conversation:', existingErr)

  let convo = existingConvo
  if (!convo) {
    const { data: newConvo, error: convoErr } = await supabase
      .from('conversations')
      .insert({ request_id: offer.request_id, helper_id: offer.helper_id, requester_id: myId })
      .select()
      .single()
    if (convoErr) console.error('Failed to create conversation for accepted offer:', convoErr)
    convo = newConvo
  } else {
    // Point the reused conversation at this newest request so its banner shows what you are talking about now.
    const { error: updErr } = await supabase
      .from('conversations')
      .update({ request_id: offer.request_id })
      .eq('id', convo.id)
    if (updErr) console.error('Failed to update conversation context:', updErr)
  }

  createNotification({
    userId: offer.helper_id,
    type: 'offer_accepted',
    title: 'Your offer was accepted!',
    body: `You've been accepted to help with: ${offer.skill_needed}`,
    link: convo ? '/conversation/' + convo.id : '/tasks',
  })

  const newAcceptedCount = (offer.accepted_count || 0) + 1
  if (offer.max_helpers !== null && offer.max_helpers !== undefined && newAcceptedCount >= offer.max_helpers) {
    const { error: statusErr } = await supabase
      .from('help_requests')
      .update({ status: 'in_progress' })
      .eq('id', offer.request_id)
    if (statusErr) console.error('Failed to mark request in_progress:', statusErr)
  }

  return { ok: true, convoId: convo ? convo.id : null }
}

// Returns true when the offer was removed.
export async function declineHelpOffer(offer) {
  const { data: deleted, error: declineErr } = await supabase
    .from('skill_matches')
    .delete()
    .eq('id', offer.id)
    .select('id')
  // The database can refuse a delete without an error. Treat "nothing removed" as a failure.
  const error = declineErr || (!deleted || deleted.length === 0 ? { message: 'No offer was removed.' } : null)
  if (error) {
    console.error('Failed to decline offer:', error)
    return false
  }
  createNotification({
    userId: offer.helper_id,
    type: 'offer_declined',
    title: 'Help update',
    body: 'The requester found help from someone else. Thank you for offering!',
    link: '/skillshare',
  })
  return true
}
