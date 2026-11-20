// A "helped together" vouch is only allowed between two people who really finished a
// task together: one helped on the other's request, and both marked their part done.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, supabase } from '../helpers/fakeSupabase.js'
import { canVouch } from '../../src/utils/vouchEligibility'

// Kept on purpose: the pretend database still cannot follow a join (help_requests!inner).
// This teaches it the one the app uses here: "matches whose request was made by this person".
function teachRequestJoin() {
  const realFrom = supabase.from.bind(supabase)
  vi.spyOn(supabase, 'from').mockImplementation((table) => {
    const q = realFrom(table)
    const realEq = q.eq.bind(q)
    q.eq = (col, value) => (col === 'help_requests.requester_id'
      ? q._add('eq', col, value, (row) => db.rows('help_requests').some((r) => r.id === row.request_id && r.requester_id === value))
      : realEq(col, value))
    return q
  })
}

const done = { helper_completed: true, requester_completed: true }

beforeEach(() => {
  teachRequestJoin()
  db.seed('help_requests', [
    { id: 1, requester_id: 'ruth' },
    { id: 2, requester_id: 'me' },
    { id: 3, requester_id: 'sam' },
  ])
})

describe('canVouch', () => {
  it('yes, when I helped on their request and we both marked it done', async () => {
    db.seed('skill_matches', [{ id: 10, request_id: 1, helper_id: 'me', ...done }])
    expect(await canVouch('me', 'ruth')).toBe(true)
  })

  it('yes, when they helped on my request and we both marked it done', async () => {
    db.seed('skill_matches', [{ id: 10, request_id: 2, helper_id: 'ruth', ...done }])
    expect(await canVouch('me', 'ruth')).toBe(true)
  })

  it.each([
    ['only the helper marked it done', { helper_completed: true, requester_completed: false }],
    ['only the person who asked marked it done', { helper_completed: false, requester_completed: true }],
    ['nobody marked it done yet', { helper_completed: false, requester_completed: false }],
  ])('no, when %s', async (_when, state) => {
    db.seed('skill_matches', [
      { id: 10, request_id: 1, helper_id: 'me', ...state },
      { id: 11, request_id: 2, helper_id: 'ruth', ...state },
    ])
    expect(await canVouch('me', 'ruth')).toBe(false)
  })

  it('no, when each of us finished a task, but with someone else', async () => {
    db.seed('skill_matches', [
      { id: 10, request_id: 3, helper_id: 'me', ...done },
      { id: 11, request_id: 3, helper_id: 'ruth', ...done },
      { id: 12, request_id: 2, helper_id: 'sam', ...done },
    ])
    expect(await canVouch('me', 'ruth')).toBe(false)
  })

  it('no, when we have never worked together', async () => {
    expect(await canVouch('me', 'ruth')).toBe(false)
  })

  it.each([
    ['nobody is signed in', null, 'ruth'],
    ['there is nobody to vouch for', 'me', null],
    ['it is yourself', 'me', 'me'],
  ])('no, without asking the database, when %s', async (_when, voucher, vouchee) => {
    expect(await canVouch(voucher, vouchee)).toBe(false)
    expect(db.calls).toHaveLength(0)
  })

  it('no, when the database cannot be asked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.seed('skill_matches', [{ id: 10, request_id: 1, helper_id: 'me', ...done }])
    db.failNext('skill_matches', 'select')
    db.failNext('skill_matches', 'select')
    expect(await canVouch('me', 'ruth')).toBe(false)
    expect(console.error).toHaveBeenCalledTimes(2)
  })
})
