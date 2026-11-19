// Visiting a cottage: each person picks who may visit, and the database decides.
// If anything goes wrong the answer is "nobody", so no Visit button shows by mistake.
import { describe, expect, it, vi } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'
import { cottagesICanVisit } from '../../src/utils/cottageVisits'

describe('cottagesICanVisit', () => {
  it('gives the ids of the people whose cottages are open to me', async () => {
    db.onRpc('cottages_i_can_visit', ({ p_users }) => p_users.filter((id) => id !== 'private-person'))
    const open = await cottagesICanVisit(['ruth', 'private-person', 'sam'])
    expect([...open].sort()).toEqual(['ruth', 'sam'])
  })

  it('asks about each person once, and skips blanks', async () => {
    await cottagesICanVisit(['ruth', null, 'sam', 'ruth', undefined, ''])
    expect(db.rpcCalls('cottages_i_can_visit').map((c) => c.args)).toEqual([{ p_users: ['ruth', 'sam'] }])
  })

  it.each([[[]], [null], [undefined], [[null, '']]])('is nobody, without asking the database, for %j', async (ids) => {
    expect((await cottagesICanVisit(ids)).size).toBe(0)
    expect(db.calls).toHaveLength(0)
  })

  it('reads the answer in each shape the database may send it', async () => {
    db.onRpc('cottages_i_can_visit', () => ['ruth', { cottages_i_can_visit: 'sam' }, { user_id: 'tess' }])
    expect([...(await cottagesICanVisit(['ruth', 'sam', 'tess']))].sort()).toEqual(['ruth', 'sam', 'tess'])
  })

  it('is nobody when the database has no answer', async () => {
    expect((await cottagesICanVisit(['ruth'])).size).toBe(0)
  })

  it('is nobody when the check fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.onRpc('cottages_i_can_visit', () => ['ruth'])
    db.failNext('cottages_i_can_visit', 'rpc', { code: '42501', message: 'permission denied' })
    expect((await cottagesICanVisit(['ruth'])).size).toBe(0)
    expect(console.error).toHaveBeenCalled()
  })

  it('is nobody, quietly, when the database part is not there yet', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('cottages_i_can_visit', 'rpc', { code: 'PGRST202', message: 'Could not find the function' })
    expect((await cottagesICanVisit(['ruth'])).size).toBe(0)
    expect(console.error).not.toHaveBeenCalled()
  })
})
