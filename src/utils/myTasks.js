import { supabase } from '../supabaseClient'
import { forTitle } from './forSomeone'

// One overview of your SkillShare and Tasks, for Home and Profile.
//   requests: help you asked for that nobody has taken yet
//   offers:   help you offered
//   active:   tasks in progress (your requests someone took, or ones you are helping with)
//   archived: finished tasks, once you have both said how it went
// Same rules as the Tasks page, so a task never shows in two places.

const URGENCY = { now: 'Right now', today: 'Today', this_week: 'This week', flexible: 'Flexible' }
export const urgencyLabel = (u) => URGENCY[u] || ''

async function namesFor(ids) {
  const out = {}
  const list = [...new Set(ids.filter(Boolean))]
  if (!list.length) return out
  const { data, error } = await supabase.from('helper_profiles_public').select('user_id, display_name').in('user_id', list)
  if (error) { console.error('Failed to load names for tasks:', error); return out }
  for (const p of data || []) out[p.user_id] = p.display_name
  return out
}

export async function loadMyTaskOverview(userId) {
  const empty = { requests: [], offers: [], active: [], archived: [], ok: false }
  if (!userId) return empty

  const [reqRes, helpRes, offRes, fbRes] = await Promise.all([
    supabase.from('help_requests')
      .select('id, skill_needed, description, urgency, status, archived_at, created_at, for_name')
      .eq('requester_id', userId).order('created_at', { ascending: false }),
    supabase.from('skill_matches')
      .select('id, request_id, helper_id, accepted, helper_completed, requester_completed, created_at')
      .eq('helper_id', userId).eq('accepted', true),
    supabase.from('offers').select('id, title, category, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('task_feedback').select('match_id').eq('from_user_id', userId).eq('kind', 'finished'),
  ])
  if (reqRes.error) console.error('Failed to load your requests:', reqRes.error)
  if (helpRes.error) console.error('Failed to load tasks you are helping with:', helpRes.error)
  if (offRes.error) console.error('Failed to load your offers:', offRes.error)
  if (fbRes.error) console.error('Failed to load your task answers:', fbRes.error)

  const myReqs = reqRes.data || []
  const helping = helpRes.data || []
  const answered = new Set((fbRes.data || []).map((f) => f.match_id))

  // Helpers on my requests: accepted ones and ones still waiting for my yes.
  let reqMatches = []
  if (myReqs.length) {
    const { data, error } = await supabase.from('skill_matches')
      .select('id, request_id, helper_id, accepted, helper_completed, requester_completed')
      .in('request_id', myReqs.map((r) => r.id))
    if (error) console.error('Failed to load helpers on your requests:', error)
    reqMatches = (data || []).filter((m) => m.accepted !== false)
  }

  // The requests I am helping with.
  let helpReqs = []
  if (helping.length) {
    const { data, error } = await supabase.from('help_requests')
      .select('id, skill_needed, urgency, status, requester_id, archived_at, created_at, for_name')
      .in('id', helping.map((m) => m.request_id))
    if (error) console.error('Failed to load requests you are helping with:', error)
    helpReqs = data || []
  }

  // Which finished tasks both people have answered.
  const doneIds = [...reqMatches, ...helping].filter((m) => m.accepted && m.helper_completed && m.requester_completed).map((m) => m.id)
  let bothRated = null
  if (doneIds.length) {
    const { data, error } = await supabase.rpc('both_rated_matches', { p_match_ids: [...new Set(doneIds)] })
    if (error) console.error('Failed to check who has answered:', error)
    else bothRated = new Set((data || []).map((r) => r.match_id))
  }
  // If the check is not available, a task moves once you have answered.
  const settled = (id) => (bothRated ? bothRated.has(id) : answered.has(id))

  // How many people asked about each offer.
  let offerAsks = {}
  const offers = offRes.data || []
  if (offers.length) {
    const { data, error } = await supabase.from('conversations').select('offer_id').in('offer_id', offers.map((o) => o.id))
    if (error) console.error('Failed to count offer messages:', error)
    for (const c of data || []) offerAsks[c.offer_id] = (offerAsks[c.offer_id] || 0) + 1
  }

  const names = await namesFor([...reqMatches.map((m) => m.helper_id), ...helpReqs.map((r) => r.requester_id)])

  // What, if anything, is waiting on you for this match.
  function needs(m, iAmRequester) {
    const mine = iAmRequester ? m.requester_completed : m.helper_completed
    const theirs = iAmRequester ? m.helper_completed : m.requester_completed
    if (m.helper_completed && m.requester_completed) {
      if (!answered.has(m.id)) return { you: true, text: 'Say how it went' }
      return { you: false, text: 'Waiting for them to say how it went' }
    }
    if (!mine && theirs) return { you: true, text: 'They marked it done. Your turn.' }
    if (mine && !theirs) return { you: false, text: 'Waiting for them to mark it done' }
    return { you: false, text: 'In progress' }
  }

  const requests = [], active = [], archived = []

  for (const r of myReqs) {
    const ms = reqMatches.filter((m) => m.request_id === r.id)
    const taken = ms.filter((m) => m.accepted)
    const waiting = ms.filter((m) => m.accepted === null || m.accepted === undefined)
    const stillNeedsAnswer = taken.some((m) => m.helper_completed && m.requester_completed && !settled(m.id))
    const base = { key: 'r' + r.id, id: r.id, title: forTitle(r), urgency: r.urgency, created_at: r.created_at, role: 'asked' }

    if (r.archived_at || (r.status === 'completed' && !stillNeedsAnswer)) {
      archived.push({ ...base, who: taken.map((m) => names[m.helper_id] || 'A neighbor').join(', '), note: r.archived_at && !taken.length ? 'Closed' : 'Finished' })
    } else if (taken.length) {
      const n = taken.map((m) => needs(m, true))
      const mine = n.find((x) => x.you)
      active.push({ ...base, who: taken.map((m) => names[m.helper_id] || 'A neighbor').join(', '), note: (mine || n[0]).text, needsYou: !!mine })
    } else if (!['completed', 'cancelled', 'closed', 'archived'].includes(r.status)) {
      requests.push({ ...base, note: waiting.length ? waiting.length + (waiting.length === 1 ? ' neighbor offered' : ' neighbors offered') + ' to help' : 'Waiting for a helper', needsYou: waiting.length > 0 })
    }
  }

  for (const m of helping) {
    const r = helpReqs.find((x) => x.id === m.request_id)
    if (!r) continue
    const base = { key: 'h' + m.id, id: r.id, title: forTitle(r), urgency: r.urgency, created_at: m.created_at || r.created_at, role: 'helping', who: names[r.requester_id] || 'A neighbor' }
    const done = m.helper_completed && m.requester_completed
    if (r.archived_at || (done && settled(m.id))) archived.push({ ...base, note: 'Finished' })
    else {
      const n = needs(m, false)
      active.push({ ...base, note: n.text, needsYou: n.you })
    }
  }

  const offerRows = offers.map((o) => ({
    key: 'o' + o.id, id: o.id, title: o.title || 'Offer', created_at: o.created_at, category: o.category,
    note: offerAsks[o.id] ? offerAsks[o.id] + (offerAsks[o.id] === 1 ? ' neighbor messaged you' : ' neighbors messaged you') : 'No messages yet',
  }))

  const byNew = (a, b) => new Date(b.created_at) - new Date(a.created_at)
  active.sort((a, b) => (b.needsYou ? 1 : 0) - (a.needsYou ? 1 : 0) || byNew(a, b))
  archived.sort(byNew)

  return { requests, offers: offerRows, active, archived, ok: true }
}
