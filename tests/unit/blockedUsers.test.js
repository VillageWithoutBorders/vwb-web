// Blocking has to work both ways, or the person being escaped from stays visible.
import { describe, expect, it, vi } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'
import { getBlockedUserIds } from '../../src/utils/blockedUsers'

describe('getBlockedUserIds', () => {
  it('hides people you blocked and people who blocked you', async () => {
    db.seed('blocks', [
      { blocker_id: 'me', blocked_id: 'a' },
      { blocker_id: 'b', blocked_id: 'me' },
      { blocker_id: 'x', blocked_id: 'y' },
    ])
    const ids = await getBlockedUserIds('me')
    expect([...ids].sort()).toEqual(['a', 'b'])
  })

  it('gives an empty set when nobody is signed in, without asking the database', async () => {
    const ids = await getBlockedUserIds(null)
    expect(ids.size).toBe(0)
    expect(db.calls).toHaveLength(0)
  })

  it('still returns the half that loaded when one lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.seed('blocks', [{ blocker_id: 'me', blocked_id: 'a' }, { blocker_id: 'b', blocked_id: 'me' }])
    db.failNext('blocks', 'select')
    const ids = await getBlockedUserIds('me')
    expect([...ids]).toEqual(['b'])
    expect(console.error).toHaveBeenCalled()
  })
})
