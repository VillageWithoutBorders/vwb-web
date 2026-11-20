// Sidechats sit under the chat they belong to: this is the map of each sidechat to its
// parent. It stays empty, quietly, if the database cannot answer.
import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { db } from '../helpers/fakeSupabase.js'
import { useSidechatParents } from '../../src/hooks/useSidechatParents'

describe('useSidechatParents', () => {
  it('maps each sidechat to the chat it sits under, and leaves top-level chats out', async () => {
    db.seed('community_groups', [
      { id: 'main', parent_group_id: null },
      { id: 'side-a', parent_group_id: 'main' },
      { id: 'side-b', parent_group_id: 'main' },
      { id: 'other', parent_group_id: null },
      { id: 'other-side', parent_group_id: 'other' },
    ])
    const { result } = renderHook(() => useSidechatParents())
    expect(result.current.size).toBe(0)
    await waitFor(() => expect(result.current.size).toBe(3))
    expect(Object.fromEntries(result.current)).toEqual({ 'side-a': 'main', 'side-b': 'main', 'other-side': 'other' })
  })

  it('is an empty map when the database has not been updated yet', async () => {
    db.seed('community_groups', [{ id: 'side-a', parent_group_id: 'main' }])
    db.failNext('community_groups', 'select', { code: '42703', message: 'column community_groups.parent_group_id does not exist' })
    const { result } = renderHook(() => useSidechatParents())
    await waitFor(() => expect(db.callsTo('community_groups')).toHaveLength(1))
    await act(async () => {})
    expect(result.current.size).toBe(0)
  })
})
