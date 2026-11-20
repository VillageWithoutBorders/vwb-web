// The fire icon belongs only to Campfires: chats started by an organization, nonprofit
// or church, and a village's own Campfires. Chats people make themselves never get it.
import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { db } from '../helpers/fakeSupabase.js'
import { useCampfireIds } from '../../src/hooks/useCampfireIds'

beforeEach(() => {
  db.seed('community_groups', [
    { id: 'org-general', organization_id: 'church-1', village_kind: null },
    { id: 'org-sidechat', organization_id: 'church-1', village_kind: null, parent_group_id: 'org-general' },
    { id: 'village-campfire', organization_id: null, village_kind: 'campfire' },
    { id: 'village-chat', organization_id: null, village_kind: 'village' },
    { id: 'cottage-chat', organization_id: null, village_kind: null },
  ])
})

describe('useCampfireIds', () => {
  it('gives the chats started by an organization and the village Campfires, and no others', async () => {
    const { result } = renderHook(() => useCampfireIds())
    expect(result.current.size).toBe(0)
    await waitFor(() => expect(result.current.size).toBe(3))
    expect([...result.current].sort()).toEqual(['org-general', 'org-sidechat', 'village-campfire'])
  })

  it('marks nothing as a Campfire when the list cannot load', async () => {
    db.failNext('community_groups', 'select')
    const { result } = renderHook(() => useCampfireIds())
    await waitFor(() => expect(db.callsTo('community_groups')).toHaveLength(1))
    await act(async () => {})
    expect(result.current.size).toBe(0)
  })
})
