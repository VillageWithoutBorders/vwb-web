// People who blocked you: the app leaves out links to them. The list loads once per
// sign-in, is shared by every screen, and is never shown to the next person on the phone.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { db } from '../helpers/fakeSupabase.js'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => auth }))

// The list is remembered in the module, so each test loads a fresh copy.
let useBlockedBy
beforeEach(async () => {
  auth.user = null
  vi.resetModules()
  ;({ useBlockedBy } = await import('../../src/utils/blockedBy'))
})

describe('useBlockedBy', () => {
  it('gives the ids of the people who blocked the signed-in member', async () => {
    auth.user = { id: 'me' }
    db.onRpc('blocked_by_ids', () => ['ann', 'bo'])
    const { result } = renderHook(() => useBlockedBy())
    await waitFor(() => expect(result.current.size).toBe(2))
    expect(result.current.has('ann')).toBe(true)
    expect(result.current.has('bo')).toBe(true)
    expect(result.current.has('cy')).toBe(false)
  })

  it('is empty, without asking the database, when nobody is signed in', async () => {
    db.onRpc('blocked_by_ids', () => ['ann'])
    const { result } = renderHook(() => useBlockedBy())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current.size).toBe(0)
    expect(db.calls).toHaveLength(0)
  })

  it('loads once and shares the list with every screen', async () => {
    auth.user = { id: 'me' }
    db.onRpc('blocked_by_ids', () => ['ann'])
    const first = renderHook(() => useBlockedBy())
    const second = renderHook(() => useBlockedBy())
    await waitFor(() => expect(first.result.current.has('ann')).toBe(true))
    await waitFor(() => expect(second.result.current.has('ann')).toBe(true))
    // A screen opened later has the list from its first draw, with no new load.
    const later = renderHook(() => useBlockedBy())
    expect(later.result.current.has('ann')).toBe(true)
    expect(db.rpcCalls('blocked_by_ids')).toHaveLength(1)
  })

  it('is empty when the list cannot load, and tries again on the next screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    auth.user = { id: 'me' }
    db.onRpc('blocked_by_ids', () => ['ann'])
    db.failNext('blocked_by_ids', 'rpc')
    const first = renderHook(() => useBlockedBy())
    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(first.result.current.size).toBe(0)
    const next = renderHook(() => useBlockedBy())
    await waitFor(() => expect(next.result.current.has('ann')).toBe(true))
  })

  it('loads a fresh list for the next person who signs in on this phone', async () => {
    auth.user = { id: 'me' }
    db.onRpc('blocked_by_ids', () => ['ann'])
    const mine = renderHook(() => useBlockedBy())
    await waitFor(() => expect(mine.result.current.has('ann')).toBe(true))
    mine.unmount()

    auth.user = { id: 'someone-else' }
    db.onRpc('blocked_by_ids', () => ['zed'])
    const theirs = renderHook(() => useBlockedBy())
    expect(theirs.result.current.size).toBe(0)
    await waitFor(() => expect(theirs.result.current.has('zed')).toBe(true))
    expect(theirs.result.current.has('ann')).toBe(false)
  })

  it('empties the list on sign out', async () => {
    auth.user = { id: 'me' }
    db.onRpc('blocked_by_ids', () => ['ann'])
    const { result, rerender } = renderHook(() => useBlockedBy())
    await waitFor(() => expect(result.current.has('ann')).toBe(true))
    auth.user = null
    rerender()
    expect(result.current.size).toBe(0)
  })
})
