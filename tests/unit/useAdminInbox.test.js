// The shared Admin inbox: only admins load it, the number counts only things someone
// can finish, and a row an admin cleared stays hidden until more come in.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { db } from '../helpers/fakeSupabase.js'
import { refreshAdminInbox, useAdminInbox } from '../../src/hooks/useAdminInbox'

const auth = vi.hoisted(() => ({ user: null, isAdmin: false }))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => auth }))

const REPORTS = { kind: 'user_reports', how_many: 3, urgent: true }
const APPLICATIONS = { kind: 'ambassador_applications', how_many: 2, urgent: false }
const NO_KEEPER = { kind: 'village_no_keeper', how_many: 4, urgent: false }

const inbox = (rows) => db.onRpc('admin_inbox', () => rows)
const marks = (rows) => db.onRpc('admin_inbox_marks_now', () => rows)
const loads = () => db.rpcCalls('admin_inbox').length
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))
const kinds = (items) => items.map((i) => i.kind)

beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(auth, { user: { id: 'admin-1' }, isAdmin: true })
})

async function openInbox() {
  const hook = renderHook(() => useAdminInbox())
  await tick()
  return hook
}

describe('useAdminInbox', () => {
  it('loads nothing for someone who is not an admin', async () => {
    auth.isAdmin = false
    inbox([REPORTS])
    const { result } = await openInbox()
    await tick(120000)
    expect(result.current).toMatchObject({ items: [], total: 0, urgent: false, loaded: false })
    expect(db.calls).toHaveLength(0)
  })

  it('shows an admin everything waiting, with the total and whether any of it is urgent', async () => {
    inbox([REPORTS, APPLICATIONS])
    const { result } = await openInbox()
    expect(result.current).toMatchObject({ items: [REPORTS, APPLICATIONS], total: 5, urgent: true, loaded: true, failed: false, clearedCount: 0 })
  })

  it('is not urgent when nothing waiting is urgent', async () => {
    inbox([APPLICATIONS])
    const { result } = await openInbox()
    expect(result.current).toMatchObject({ total: 2, urgent: false })
  })

  it('keeps "good to know" rows out of the number, since nobody can finish them', async () => {
    inbox([APPLICATIONS, NO_KEEPER, { kind: 'quiet_admin', how_many: 1, urgent: true }])
    const { result } = await openInbox()
    expect(result.current.items.map((i) => [i.kind, !!i.info])).toEqual([['ambassador_applications', false], ['village_no_keeper', true], ['quiet_admin', true]])
    expect(result.current).toMatchObject({ total: 2, urgent: false })
  })

  describe('rows an admin cleared or flagged for later', () => {
    it('hides a cleared row for every admin while no more have come in', async () => {
      inbox([REPORTS, APPLICATIONS])
      marks([{ kind: 'user_reports', mark: 'cleared', how_many: 3 }])
      const { result } = await openInbox()
      expect(kinds(result.current.items)).toEqual(['ambassador_applications'])
      expect(result.current).toMatchObject({ total: 2, urgent: false, clearedCount: 1 })
    })

    it('brings a cleared row back when more come in than when it was cleared', async () => {
      inbox([{ ...REPORTS, how_many: 4 }])
      marks([{ kind: 'user_reports', mark: 'cleared', how_many: 3 }])
      const { result } = await openInbox()
      expect(kinds(result.current.items)).toEqual(['user_reports'])
      expect(result.current).toMatchObject({ total: 4, clearedCount: 0 })
    })

    it('moves a row flagged for later out of the number, and says who flagged it', async () => {
      inbox([REPORTS, APPLICATIONS])
      marks([{ kind: 'user_reports', mark: 'later', how_many: 3, marked_by_name: 'Jade', mine: false, marked_at: '2026-11-19T15:00:00.000Z' }])
      const { result } = await openInbox()
      expect(result.current.items[0]).toEqual({ ...REPORTS, later: true, laterBy: 'Jade', laterMine: false, laterAt: '2026-11-19T15:00:00.000Z' })
      expect(result.current).toMatchObject({ total: 2, urgent: false, clearedCount: 0 })
    })

    it('a "good to know" row flagged for later is listed as later', async () => {
      inbox([NO_KEEPER])
      marks([{ kind: 'village_no_keeper', mark: 'later', how_many: 4, marked_by_name: 'Jade', mine: true }])
      const { result } = await openInbox()
      expect(result.current.items[0]).toMatchObject({ later: true })
      expect(result.current.items[0].info).toBeUndefined()
    })

    it('shows the whole inbox, quietly, before the marks part of the database exists', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      inbox([REPORTS])
      db.failNext('admin_inbox_marks_now', 'rpc', { code: 'PGRST202', message: 'Could not find the function' })
      const { result } = await openInbox()
      expect(result.current).toMatchObject({ items: [REPORTS], total: 3, failed: false })
      expect(console.error).not.toHaveBeenCalled()
    })

    it('shows the whole inbox when the marks cannot load for another reason', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      inbox([REPORTS])
      marks([{ kind: 'user_reports', mark: 'cleared', how_many: 3 }])
      db.failNext('admin_inbox_marks_now', 'rpc', { message: 'TypeError: Failed to fetch' })
      const { result } = await openInbox()
      expect(kinds(result.current.items)).toEqual(['user_reports'])
      expect(console.error).toHaveBeenCalled()
    })

    it('mark() saves the choice with the count at that moment, reloads, and tells other open copies', async () => {
      inbox([REPORTS])
      db.onRpc('admin_inbox_mark', ({ p_kind, p_mark, p_how_many }) => { marks([{ kind: p_kind, mark: p_mark, how_many: p_how_many }]) })
      const { result } = await openInbox()
      const heard = vi.fn()
      window.addEventListener('vwb-admin-inbox', heard)
      let answer
      await act(async () => { answer = await result.current.mark(REPORTS, 'cleared') })
      window.removeEventListener('vwb-admin-inbox', heard)
      expect(answer).toBeNull()
      expect(db.rpcCalls('admin_inbox_mark')[0].args).toEqual({ p_kind: 'user_reports', p_mark: 'cleared', p_how_many: 3 })
      expect(result.current).toMatchObject({ items: [], total: 0, clearedCount: 1 })
      expect(heard).toHaveBeenCalled()
    })

    it('mark() hands back the error, and leaves the inbox as it was, when it cannot save', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      inbox([REPORTS])
      const { result } = await openInbox()
      db.failNext('admin_inbox_mark', 'rpc', { code: '42501', message: 'admins only' })
      let answer
      await act(async () => { answer = await result.current.mark(REPORTS, 'cleared') })
      expect(answer).toEqual({ code: '42501', message: 'admins only' })
      expect(kinds(result.current.items)).toEqual(['user_reports'])
      expect(loads()).toBe(1)
    })
  })

  describe('keeping the list current', () => {
    it('checks again every minute', async () => {
      inbox([REPORTS])
      const { result } = await openInbox()
      inbox([])
      await tick(59999)
      expect(result.current.total).toBe(3)
      await tick(1)
      expect(result.current).toMatchObject({ items: [], total: 0 })
    })

    it('checks when the app comes back into view, but not when it goes out of view', async () => {
      inbox([REPORTS])
      await openInbox()
      const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
      expect(loads()).toBe(1)
      state.mockReturnValue('visible')
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
      expect(loads()).toBe(2)
    })

    it('checks when refreshAdminInbox() is called after an admin acts', async () => {
      inbox([REPORTS])
      const { result } = await openInbox()
      inbox([{ ...REPORTS, how_many: 2 }])
      await act(async () => { refreshAdminInbox() })
      expect(result.current.total).toBe(2)
    })

    it('says it failed, and keeps the last list on screen, when a check fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      inbox([REPORTS])
      const { result } = await openInbox()
      db.failNext('admin_inbox', 'rpc', { message: 'TypeError: Failed to fetch' })
      await tick(60000)
      expect(result.current).toMatchObject({ failed: true, loaded: true, total: 3 })
      await tick(60000)
      expect(result.current.failed).toBe(false)
    })

    it('stops checking when the page goes away', async () => {
      inbox([REPORTS])
      const { unmount } = await openInbox()
      unmount()
      await vi.advanceTimersByTimeAsync(180000)
      refreshAdminInbox()
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
      expect(loads()).toBe(1)
    })
  })
})
