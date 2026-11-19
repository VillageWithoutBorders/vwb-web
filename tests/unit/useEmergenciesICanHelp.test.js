// The emergency banner: open emergencies this person can act on. The database decides
// who, the list is never shown to a different account, and no signal keeps the last list.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { db } from '../helpers/fakeSupabase.js'
import { useEmergenciesICanHelp } from '../../src/hooks/useEmergenciesICanHelp'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => auth }))

const FLOOD = { id: 1, title: 'Creek over the bridge' }
const STORM = { id: 2, title: 'Tree down on Main Street' }
const asked = () => db.rpcCalls('emergencies_i_can_help').length
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))
const phoneIsOffline = (yes) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(!yes)
const appIsHidden = (yes) => vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(yes ? 'hidden' : 'visible')

beforeEach(() => {
  vi.useFakeTimers()
  auth.user = { id: 'me' }
})

describe('useEmergenciesICanHelp', () => {
  it('gives the emergencies the database says this person can help with', async () => {
    db.onRpc('emergencies_i_can_help', () => [FLOOD, STORM])
    const { result } = renderHook(() => useEmergenciesICanHelp())
    expect(result.current).toEqual([])
    await tick()
    expect(result.current).toEqual([FLOOD, STORM])
  })

  it('is empty, without asking the database, when nobody is signed in', async () => {
    auth.user = null
    db.onRpc('emergencies_i_can_help', () => [FLOOD])
    const { result } = renderHook(() => useEmergenciesICanHelp())
    await tick(120000)
    expect(result.current).toEqual([])
    expect(asked()).toBe(0)
  })

  it('checks again once a minute', async () => {
    db.onRpc('emergencies_i_can_help', () => [])
    const { result } = renderHook(() => useEmergenciesICanHelp())
    await tick()
    db.onRpc('emergencies_i_can_help', () => [FLOOD])
    await tick(59999)
    expect(result.current).toEqual([])
    await tick(1)
    expect(result.current).toEqual([FLOOD])
    expect(asked()).toBe(2)
  })

  it('checks right away when the signal comes back', async () => {
    phoneIsOffline(true)
    db.onRpc('emergencies_i_can_help', () => [FLOOD])
    const { result } = renderHook(() => useEmergenciesICanHelp())
    await tick()
    expect(asked()).toBe(0)
    phoneIsOffline(false)
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(result.current).toEqual([FLOOD])
  })

  it('checks right away when the person comes back to the app, and not while it is hidden', async () => {
    appIsHidden(true)
    db.onRpc('emergencies_i_can_help', () => [FLOOD])
    const { result } = renderHook(() => useEmergenciesICanHelp())
    await tick(180000)
    expect(asked()).toBe(0)
    appIsHidden(false)
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(result.current).toEqual([FLOOD])
    expect(asked()).toBe(1)
  })

  it('keeps the last list on screen while there is no signal', async () => {
    db.onRpc('emergencies_i_can_help', () => [FLOOD])
    const { result } = renderHook(() => useEmergenciesICanHelp())
    await tick()
    phoneIsOffline(true)
    await tick(120000)
    expect(result.current).toEqual([FLOOD])
    expect(asked()).toBe(1)
  })

  it('keeps the last list, and keeps checking, when one check fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.onRpc('emergencies_i_can_help', () => [FLOOD])
    const { result } = renderHook(() => useEmergenciesICanHelp())
    await tick()
    db.failNext('emergencies_i_can_help', 'rpc', { message: 'TypeError: Failed to fetch' })
    await tick(60000)
    expect(result.current).toEqual([FLOOD])
    db.onRpc('emergencies_i_can_help', () => [FLOOD, STORM])
    await tick(60000)
    expect(result.current).toEqual([FLOOD, STORM])
  })

  it.each(['PGRST202', '42883'])('stops asking when the database part is not there yet (%s)', async (code) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('emergencies_i_can_help', 'rpc', { code, message: 'function does not exist' })
    const { result } = renderHook(() => useEmergenciesICanHelp())
    await tick()
    await tick(180000)
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(asked()).toBe(1)
    expect(result.current).toEqual([])
  })

  it("never shows one person's list to the next person who signs in", async () => {
    db.onRpc('emergencies_i_can_help', () => [FLOOD])
    const { result, rerender } = renderHook(() => useEmergenciesICanHelp())
    await tick()
    expect(result.current).toEqual([FLOOD])
    auth.user = { id: 'neighbor' }
    db.onRpc('emergencies_i_can_help', () => [STORM])
    rerender()
    expect(result.current).toEqual([])
    await tick()
    expect(result.current).toEqual([STORM])
  })

  it('shows nothing after sign out', async () => {
    db.onRpc('emergencies_i_can_help', () => [FLOOD])
    const { result, rerender } = renderHook(() => useEmergenciesICanHelp())
    await tick()
    auth.user = null
    rerender()
    expect(result.current).toEqual([])
  })

  it('stops checking when the banner goes away', async () => {
    db.onRpc('emergencies_i_can_help', () => [FLOOD])
    const { unmount } = renderHook(() => useEmergenciesICanHelp())
    await tick()
    unmount()
    await vi.advanceTimersByTimeAsync(180000)
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(asked()).toBe(1)
  })
})
