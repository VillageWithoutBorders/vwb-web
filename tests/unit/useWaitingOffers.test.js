// The number on the Help door: neighbors who offered to help on your open requests
// and are still waiting for your yes. Nobody else's, and nothing already answered.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { db } from '../helpers/fakeSupabase.js'
import { useWaitingOffers } from '../../src/hooks/useWaitingOffers'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => auth }))

beforeEach(() => {
  auth.user = { id: 'me' }
})

function seedOffers() {
  db.seed('help_requests', [
    { id: 1, requester_id: 'me', status: 'open' },
    { id: 2, requester_id: 'me', status: 'open' },
    { id: 3, requester_id: 'me', status: 'completed' },
    { id: 4, requester_id: 'neighbor', status: 'open' },
  ])
  db.seed('skill_matches', [
    { id: 10, request_id: 1, accepted: null },
    { id: 11, request_id: 1, accepted: null },
    { id: 12, request_id: 2, accepted: null },
    { id: 13, request_id: 1, accepted: true },
    { id: 14, request_id: 2, accepted: false },
    { id: 15, request_id: 3, accepted: null },
    { id: 16, request_id: 4, accepted: null },
  ])
}

describe('useWaitingOffers', () => {
  it('counts only the unanswered offers on my open requests', async () => {
    seedOffers()
    const { result } = renderHook(() => useWaitingOffers())
    expect(result.current).toBe(0)
    await waitFor(() => expect(result.current).toBe(3))
  })

  it('is zero, and does not count offers at all, when I have no open requests', async () => {
    db.seed('help_requests', [{ id: 3, requester_id: 'me', status: 'completed' }])
    db.seed('skill_matches', [{ id: 15, request_id: 3, accepted: null }])
    const { result } = renderHook(() => useWaitingOffers())
    await waitFor(() => expect(db.callsTo('help_requests', 'select')).toHaveLength(1))
    await act(async () => {})
    expect(result.current).toBe(0)
    expect(db.callsTo('skill_matches')).toHaveLength(0)
  })

  it('is zero, without asking the database, when nobody is signed in', async () => {
    auth.user = null
    seedOffers()
    const { result } = renderHook(() => useWaitingOffers())
    await act(async () => {})
    expect(result.current).toBe(0)
    expect(db.calls).toHaveLength(0)
  })

  it.each([
    ['my requests', 'help_requests'],
    ['the offers', 'skill_matches'],
  ])('stays at zero when %s cannot load', async (_what, table) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    seedOffers()
    db.failNext(table, 'select')
    const { result } = renderHook(() => useWaitingOffers())
    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(result.current).toBe(0)
  })

  it('counts again for the next person who signs in', async () => {
    seedOffers()
    const { result, rerender } = renderHook(() => useWaitingOffers())
    await waitFor(() => expect(result.current).toBe(3))
    auth.user = { id: 'neighbor' }
    rerender()
    await waitFor(() => expect(result.current).toBe(1))
  })
})
