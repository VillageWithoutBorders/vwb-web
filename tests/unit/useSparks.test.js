// Sparks on messages: counts only (nobody sees who else sparked), the tap shows right
// away, and it is put back if the database says no.
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { db } from '../helpers/fakeSupabase.js'
import { useSparks } from '../../src/hooks/useSparks'

const ME = 'me'
const counts = (rows) => db.onRpc('message_sparks', () => rows)
const sparksFor = (ids) => renderHook((props) => useSparks(props), { initialProps: { fn: 'message_sparks', table: 'message_spark_rows', ids, userId: ME } })
const mySparks = () => db.rows('message_spark_rows')

describe('useSparks', () => {
  it('loads the count for each message, and whether I sparked it', async () => {
    counts([{ message_id: 1, sparks: '3', mine: true }, { message_id: 2, sparks: 1, mine: false }])
    const { result } = sparksFor([1, 2])
    await waitFor(() => expect(result.current.sparks).toEqual({ 1: { n: 3, mine: true }, 2: { n: 1, mine: false } }))
    expect(db.rpcCalls('message_sparks')[0].args).toEqual({ p_ids: [1, 2] })
  })

  it('asks nothing when there are no messages on screen', async () => {
    const { result } = sparksFor([])
    await act(async () => {})
    expect(result.current.sparks).toEqual({})
    expect(db.calls).toHaveLength(0)
  })

  it('loads again when the list of messages changes', async () => {
    counts([{ message_id: 1, sparks: 1, mine: false }])
    const { result, rerender } = sparksFor([1])
    await waitFor(() => expect(result.current.sparks[1]).toEqual({ n: 1, mine: false }))
    counts([{ message_id: 1, sparks: 1, mine: false }, { message_id: 2, sparks: 5, mine: false }])
    rerender({ fn: 'message_sparks', table: 'message_spark_rows', ids: [1, 2], userId: ME })
    await waitFor(() => expect(result.current.sparks[2]).toEqual({ n: 5, mine: false }))
    expect(db.rpcCalls('message_sparks').map((c) => c.args.p_ids)).toEqual([[1], [1, 2]])
  })

  it('checks again every 15 seconds while the chat is open, and stops when it closes', async () => {
    vi.useFakeTimers()
    counts([{ message_id: 1, sparks: 1, mine: false }])
    const { result, unmount } = sparksFor([1])
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(result.current.sparks[1].n).toBe(1)
    counts([{ message_id: 1, sparks: 2, mine: false }])
    await act(() => vi.advanceTimersByTimeAsync(15000))
    expect(result.current.sparks[1].n).toBe(2)
    unmount()
    await vi.advanceTimersByTimeAsync(60000)
    expect(db.rpcCalls('message_sparks')).toHaveLength(2)
  })

  it('keeps the counts on screen when a re-check fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
    counts([{ message_id: 1, sparks: 4, mine: true }])
    const { result } = sparksFor([1])
    await act(() => vi.advanceTimersByTimeAsync(0))
    db.failNext('message_sparks', 'rpc')
    await act(() => vi.advanceTimersByTimeAsync(15000))
    expect(result.current.sparks).toEqual({ 1: { n: 4, mine: true } })
    expect(console.error).toHaveBeenCalled()
  })

  it('adding a spark shows at once and is saved as mine', async () => {
    counts([{ message_id: 1, sparks: 2, mine: false }])
    const { result } = sparksFor([1])
    await waitFor(() => expect(result.current.sparks[1]).toBeDefined())
    await act(() => result.current.toggle(1))
    expect(result.current.sparks[1]).toEqual({ n: 3, mine: true })
    expect(mySparks()).toEqual([expect.objectContaining({ message_id: 1, user_id: ME })])
  })

  it('can spark a message nobody has sparked yet', async () => {
    const { result } = sparksFor([7])
    await act(async () => {})
    await act(() => result.current.toggle(7))
    expect(result.current.sparks[7]).toEqual({ n: 1, mine: true })
  })

  it("taking a spark back removes only my spark on that message, never a neighbor's", async () => {
    counts([{ message_id: 1, sparks: 2, mine: true }])
    db.seed('message_spark_rows', [
      { id: 1, message_id: 1, user_id: ME },
      { id: 2, message_id: 1, user_id: 'neighbor' },
      { id: 3, message_id: 2, user_id: ME },
    ])
    const { result } = sparksFor([1])
    await waitFor(() => expect(result.current.sparks[1]).toBeDefined())
    await act(() => result.current.toggle(1))
    expect(result.current.sparks[1]).toEqual({ n: 1, mine: false })
    expect(mySparks().map((r) => r.id)).toEqual([2, 3])
  })

  it('never shows a count below zero', async () => {
    counts([{ message_id: 1, sparks: 0, mine: true }])
    const { result } = sparksFor([1])
    await waitFor(() => expect(result.current.sparks[1]).toBeDefined())
    await act(() => result.current.toggle(1))
    expect(result.current.sparks[1]).toEqual({ n: 0, mine: false })
  })

  it('puts the spark back the way it was when the database says no', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    counts([{ message_id: 1, sparks: 2, mine: false }])
    const { result } = sparksFor([1])
    await waitFor(() => expect(result.current.sparks[1]).toBeDefined())
    db.failNext('message_spark_rows', 'insert', { message: 'permission denied' })
    await act(() => result.current.toggle(1))
    expect(result.current.sparks[1]).toEqual({ n: 2, mine: false })
  })

  it('keeps the spark lit when the database says it was already there', async () => {
    counts([{ message_id: 1, sparks: 2, mine: false }])
    const { result } = sparksFor([1])
    await waitFor(() => expect(result.current.sparks[1]).toBeDefined())
    db.failNext('message_spark_rows', 'insert', { code: '23505', message: 'duplicate key value violates unique constraint' })
    await act(() => result.current.toggle(1))
    expect(result.current.sparks[1]).toEqual({ n: 3, mine: true })
  })
})
