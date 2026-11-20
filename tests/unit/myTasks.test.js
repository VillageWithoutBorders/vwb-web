// The one overview of your asks, offers and tasks (Home and Profile): each task shows in
// exactly one list, and the note says plainly whether it is waiting on you or on them.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'
import { loadMyTaskOverview, urgencyLabel } from '../../src/utils/myTasks'

const ME = 'me'
const ask = (id, more = {}) => ({
  id, requester_id: ME, skill_needed: 'Yard work', description: 'Rake leaves', urgency: 'this_week', status: 'open',
  archived_at: null, created_at: '2026-11-10T12:00:00.000Z', for_name: null, ...more,
})
const match = (id, more = {}) => ({
  id, request_id: 1, helper_id: 'ruth', accepted: true, helper_completed: false, requester_completed: false,
  created_at: '2026-11-11T12:00:00.000Z', ...more,
})
const iAnswered = (matchId) => ({ match_id: matchId, from_user_id: ME, kind: 'finished' })
const bothAnswered = (...matchIds) => db.onRpc('both_rated_matches', () => matchIds.map((id) => ({ match_id: id })))

beforeEach(() => {
  db.seed('helper_profiles_public', [{ user_id: 'ruth', display_name: 'Ruth' }, { user_id: 'sam', display_name: 'Sam' }])
})

describe('urgencyLabel', () => {
  it.each([['now', 'Right now'], ['today', 'Today'], ['this_week', 'This week'], ['flexible', 'Flexible']])('%s reads "%s"', (key, label) => {
    expect(urgencyLabel(key)).toBe(label)
  })

  it('is blank for anything else', () => {
    expect(urgencyLabel('someday')).toBe('')
    expect(urgencyLabel(undefined)).toBe('')
  })
})

describe('loadMyTaskOverview', () => {
  it('is empty, without asking the database, when nobody is signed in', async () => {
    expect(await loadMyTaskOverview(null)).toEqual({ requests: [], offers: [], active: [], archived: [], ok: false })
    expect(db.calls).toHaveLength(0)
  })

  describe('help you asked for that nobody has taken yet', () => {
    it('says it is waiting for a helper', async () => {
      db.seed('help_requests', [ask(1)])
      const out = await loadMyTaskOverview(ME)
      expect(out.requests).toEqual([{
        key: 'r1', id: 1, title: 'Yard work', urgency: 'this_week', created_at: '2026-11-10T12:00:00.000Z', role: 'asked',
        note: 'Waiting for a helper', needsYou: false,
      }])
      expect(out.active).toEqual([])
      expect(out.archived).toEqual([])
    })

    it('counts the neighbors waiting for your yes, and leaves out offers you turned down', async () => {
      db.seed('help_requests', [ask(1), ask(2)])
      db.seed('skill_matches', [
        match(10, { request_id: 1, accepted: null }),
        match(20, { request_id: 2, accepted: null, helper_id: 'ruth' }),
        match(21, { request_id: 2, accepted: null, helper_id: 'sam' }),
        match(22, { request_id: 2, accepted: false, helper_id: 'tess' }),
      ])
      const { requests } = await loadMyTaskOverview(ME)
      expect(requests.map((r) => [r.id, r.note, r.needsYou])).toEqual([
        [1, '1 neighbor offered to help', true],
        [2, '2 neighbors offered to help', true],
      ])
    })

    it('shows who the ask is for when you posted it for someone else', async () => {
      db.seed('help_requests', [ask(1, { for_name: ' Ruth ' })])
      expect((await loadMyTaskOverview(ME)).requests[0].title).toBe('Yard work for Ruth')
    })

    it('leaves out an ask you cancelled before anyone took it', async () => {
      db.seed('help_requests', [ask(1, { status: 'cancelled' })])
      const out = await loadMyTaskOverview(ME)
      expect([out.requests, out.active, out.archived]).toEqual([[], [], []])
    })

    it("does not show a neighbor's asks", async () => {
      db.seed('help_requests', [ask(1, { requester_id: 'sam' })])
      expect((await loadMyTaskOverview(ME)).requests).toEqual([])
    })
  })

  describe('a task someone took for you', () => {
    it('moves from Requests to In progress, with the helper named', async () => {
      db.seed('help_requests', [ask(1, { status: 'in_progress' })])
      db.seed('skill_matches', [match(10)])
      const out = await loadMyTaskOverview(ME)
      expect(out.requests).toEqual([])
      expect(out.active).toEqual([expect.objectContaining({ key: 'r1', role: 'asked', who: 'Ruth', note: 'In progress', needsYou: false })])
    })

    it('names every helper, and says "A neighbor" for one whose name cannot be read', async () => {
      db.seed('help_requests', [ask(1)])
      db.seed('skill_matches', [match(10), match(11, { helper_id: 'hidden' })])
      expect((await loadMyTaskOverview(ME)).active[0].who).toBe('Ruth, A neighbor')
    })

    it.each([
      ['the helper marked it done', 'in_progress', { helper_completed: true }, 'They marked it done. Your turn.', true],
      ['you marked it done first', 'in_progress', { requester_completed: true }, 'Waiting for them to mark it done', false],
      ['you both marked it done', 'completed', { helper_completed: true, requester_completed: true }, 'Say how it went', true],
    ])('when %s, the note is right', async (_when, status, done, note, needsYou) => {
      db.seed('help_requests', [ask(1, { status })])
      db.seed('skill_matches', [match(10, done)])
      const out = await loadMyTaskOverview(ME)
      expect(out.active.map((a) => [a.note, a.needsYou])).toEqual([[note, needsYou]])
      expect(out.archived).toEqual([])
    })

    it('waits in In progress, not on you, after you said how it went and they have not', async () => {
      db.seed('help_requests', [ask(1, { status: 'completed' })])
      db.seed('skill_matches', [match(10, { helper_completed: true, requester_completed: true })])
      db.seed('task_feedback', [iAnswered(10)])
      bothAnswered()
      const out = await loadMyTaskOverview(ME)
      expect(out.active.map((a) => [a.note, a.needsYou])).toEqual([['Waiting for them to say how it went', false]])
      expect(out.archived).toEqual([])
    })

    it('moves to Finished once you have both said how it went', async () => {
      db.seed('help_requests', [ask(1, { status: 'completed' })])
      db.seed('skill_matches', [match(10, { helper_completed: true, requester_completed: true })])
      db.seed('task_feedback', [iAnswered(10)])
      bothAnswered(10)
      const out = await loadMyTaskOverview(ME)
      expect(out.active).toEqual([])
      expect(out.archived).toEqual([expect.objectContaining({ key: 'r1', role: 'asked', who: 'Ruth', note: 'Finished' })])
    })

    it('if that check is not available, moves to Finished once you have answered', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      db.seed('help_requests', [ask(1, { status: 'completed' }), ask(2, { status: 'completed' })])
      db.seed('skill_matches', [
        match(10, { request_id: 1, helper_completed: true, requester_completed: true }),
        match(20, { request_id: 2, helper_completed: true, requester_completed: true }),
      ])
      db.seed('task_feedback', [iAnswered(10)])
      db.failNext('both_rated_matches', 'rpc')
      const out = await loadMyTaskOverview(ME)
      expect(out.archived.map((a) => a.key)).toEqual(['r1'])
      expect(out.active.map((a) => [a.key, a.note])).toEqual([['r2', 'Say how it went']])
    })

    it('a request you closed with no helper is filed as Closed', async () => {
      db.seed('help_requests', [ask(1, { archived_at: '2026-11-12T00:00:00.000Z' })])
      const out = await loadMyTaskOverview(ME)
      expect(out.requests).toEqual([])
      expect(out.archived.map((a) => [a.key, a.note, a.who])).toEqual([['r1', 'Closed', '']])
    })
  })

  describe('a task you are helping with', () => {
    const theirAsk = (more = {}) => ask(5, { requester_id: 'sam', skill_needed: 'Rides', ...more })
    const myHelp = (more = {}) => match(50, { request_id: 5, helper_id: ME, ...more })

    it('shows in In progress with the name of the neighbor who asked', async () => {
      db.seed('help_requests', [theirAsk()])
      db.seed('skill_matches', [myHelp()])
      const out = await loadMyTaskOverview(ME)
      expect(out.active).toEqual([{
        key: 'h50', id: 5, title: 'Rides', urgency: 'this_week', created_at: '2026-11-11T12:00:00.000Z', role: 'helping', who: 'Sam',
        note: 'In progress', needsYou: false,
      }])
      expect(out.requests).toEqual([])
    })

    it('does not show an offer of yours they have not said yes to', async () => {
      db.seed('help_requests', [theirAsk()])
      db.seed('skill_matches', [myHelp({ accepted: null })])
      const out = await loadMyTaskOverview(ME)
      expect([out.requests, out.active, out.archived]).toEqual([[], [], []])
    })

    it.each([
      ['they marked it done', { requester_completed: true }, 'They marked it done. Your turn.', true],
      ['you marked it done first', { helper_completed: true }, 'Waiting for them to mark it done', false],
      ['you both marked it done', { helper_completed: true, requester_completed: true }, 'Say how it went', true],
    ])('when %s, the note is right', async (_when, done, note, needsYou) => {
      db.seed('help_requests', [theirAsk()])
      db.seed('skill_matches', [myHelp(done)])
      expect((await loadMyTaskOverview(ME)).active.map((a) => [a.note, a.needsYou])).toEqual([[note, needsYou]])
    })

    it('moves to Finished once you have both said how it went', async () => {
      db.seed('help_requests', [theirAsk({ status: 'completed' })])
      db.seed('skill_matches', [myHelp({ helper_completed: true, requester_completed: true })])
      db.seed('task_feedback', [iAnswered(50)])
      bothAnswered(50)
      const out = await loadMyTaskOverview(ME)
      expect(out.active).toEqual([])
      expect(out.archived).toEqual([expect.objectContaining({ key: 'h50', role: 'helping', who: 'Sam', note: 'Finished' })])
    })

    it('moves to Finished when the neighbor closed their request', async () => {
      db.seed('help_requests', [theirAsk({ archived_at: '2026-11-12T00:00:00.000Z' })])
      db.seed('skill_matches', [myHelp()])
      const out = await loadMyTaskOverview(ME)
      expect(out.active).toEqual([])
      expect(out.archived.map((a) => a.key)).toEqual(['h50'])
    })
  })

  describe('help you offered', () => {
    it('says how many neighbors messaged you about each offer', async () => {
      db.seed('offers', [
        { id: 1, user_id: ME, title: 'Free firewood', category: 'Home', created_at: '2026-11-03T00:00:00.000Z' },
        { id: 2, user_id: ME, title: 'Rides to church', category: 'Rides', created_at: '2026-11-02T00:00:00.000Z' },
        { id: 3, user_id: ME, title: '', category: 'Other', created_at: '2026-11-01T00:00:00.000Z' },
        { id: 4, user_id: 'sam', title: "Sam's offer", category: 'Other', created_at: '2026-11-04T00:00:00.000Z' },
      ])
      db.seed('conversations', [{ id: 1, offer_id: 1 }, { id: 2, offer_id: 2 }, { id: 3, offer_id: 2 }, { id: 4, offer_id: 4 }, { id: 5, offer_id: null }])
      const { offers } = await loadMyTaskOverview(ME)
      expect(offers).toEqual([
        { key: 'o1', id: 1, title: 'Free firewood', created_at: '2026-11-03T00:00:00.000Z', category: 'Home', note: '1 neighbor messaged you' },
        { key: 'o2', id: 2, title: 'Rides to church', created_at: '2026-11-02T00:00:00.000Z', category: 'Rides', note: '2 neighbors messaged you' },
        { key: 'o3', id: 3, title: 'Offer', created_at: '2026-11-01T00:00:00.000Z', category: 'Other', note: 'No messages yet' },
      ])
    })
  })

  describe('order', () => {
    it('puts what is waiting on you first, then the newest', async () => {
      db.seed('help_requests', [
        ask(1, { created_at: '2026-11-01T00:00:00.000Z' }),
        ask(2, { created_at: '2026-11-05T00:00:00.000Z' }),
        ask(3, { created_at: '2026-11-03T00:00:00.000Z' }),
        ask(4, { created_at: '2026-11-02T00:00:00.000Z' }),
      ])
      db.seed('skill_matches', [
        match(10, { request_id: 1, helper_completed: true }),
        match(20, { request_id: 2 }),
        match(30, { request_id: 3 }),
        match(40, { request_id: 4, helper_completed: true }),
      ])
      const { active } = await loadMyTaskOverview(ME)
      expect(active.map((a) => [a.key, a.needsYou])).toEqual([['r4', true], ['r1', true], ['r2', false], ['r3', false]])
    })

    it('lists finished tasks newest first', async () => {
      db.seed('help_requests', [
        ask(1, { archived_at: '2026-11-12T00:00:00.000Z', created_at: '2026-11-01T00:00:00.000Z' }),
        ask(2, { archived_at: '2026-11-12T00:00:00.000Z', created_at: '2026-11-09T00:00:00.000Z' }),
        ask(3, { archived_at: '2026-11-12T00:00:00.000Z', created_at: '2026-11-05T00:00:00.000Z' }),
      ])
      expect((await loadMyTaskOverview(ME)).archived.map((a) => a.key)).toEqual(['r2', 'r3', 'r1'])
    })
  })

  it('never shows one task in two lists', async () => {
    db.seed('help_requests', [
      ask(1),
      ask(2, { status: 'in_progress' }),
      ask(3, { status: 'completed' }),
      ask(4, { status: 'completed' }),
      ask(5, { requester_id: 'sam' }),
      ask(6, { requester_id: 'sam', status: 'completed' }),
    ])
    db.seed('skill_matches', [
      match(10, { request_id: 1, accepted: null }),
      match(20, { request_id: 2 }),
      match(30, { request_id: 3, helper_completed: true, requester_completed: true }),
      match(40, { request_id: 4, helper_completed: true, requester_completed: true }),
      match(50, { request_id: 5, helper_id: ME }),
      match(60, { request_id: 6, helper_id: ME, helper_completed: true, requester_completed: true }),
    ])
    db.seed('task_feedback', [iAnswered(40), iAnswered(60)])
    bothAnswered(40, 60)
    const out = await loadMyTaskOverview(ME)
    expect(out.requests.map((x) => x.key)).toEqual(['r1'])
    expect(out.active.map((x) => x.key).sort()).toEqual(['h50', 'r2', 'r3'])
    expect(out.archived.map((x) => x.key).sort()).toEqual(['h60', 'r4'])
  })

  it('still shows the parts that loaded when one part fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.seed('help_requests', [ask(1)])
    db.seed('offers', [{ id: 1, user_id: ME, title: 'Free firewood', category: 'Home', created_at: '2026-11-03T00:00:00.000Z' }])
    db.failNext('offers', 'select')
    const out = await loadMyTaskOverview(ME)
    expect(out.requests.map((r) => r.key)).toEqual(['r1'])
    expect(out.offers).toEqual([])
    expect(console.error).toHaveBeenCalled()
  })
})
