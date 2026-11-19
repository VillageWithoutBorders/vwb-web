// "I'm safe" and sign-ups made with no signal: kept on this phone, sent once when the
// signal is back, and only the newest unsent check-in for an emergency is kept.
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { db } from '../helpers/fakeSupabase.js'
import * as client from '../../src/supabaseClient'
import {
  clearAllPendingEventActions, pendingEventActions, removeEventAction, saveEventAction, sendPendingEventActions, usePendingEventActions,
} from '../../src/utils/pendingEventActions'

const ME = 'me'
const KEY = 'vwb_pending_event_actions_'
const NO_SIGNAL = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }
const NOON = new Date('2026-11-19T12:00:00-05:00')

const safe = (more = {}) => ({ event_id: 7, status: 'safe', note: '', ...more })
const signup = (more = {}) => ({ event_id: 7, role: 'volunteer', skills: ['First aid'], availability: 'Evenings', notes: 'Have a truck', ...more })
const checkIns = () => db.rows('event_check_ins')
const signups = () => db.rows('event_signups')
const saved = () => pendingEventActions(ME)
const phoneIsOffline = () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})
function clockAt(date) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(date)
}

describe('saving a check-in or sign-up on the phone', () => {
  it('keeps an "I am safe" check-in on the phone when there is no signal, and hands back what it kept', () => {
    clockAt(NOON)
    const item = saveEventAction(ME, 'checkin', safe(), 'Tree down on Main Street')
    expect(item).toEqual({ key: expect.any(String), kind: 'checkin', saved_at: NOON.toISOString(), row: safe(), event_title: 'Tree down on Main Street', problem: '' })
    expect(saved()).toEqual([item])
  })

  it('keeps going when the emergency has no title to show', () => {
    expect(saveEventAction(ME, 'signup', signup()).event_title).toBe('')
  })

  it('a newer check-in on the same emergency replaces the one that has not gone out yet', () => {
    saveEventAction(ME, 'checkin', safe({ status: 'need_help' }))
    saveEventAction(ME, 'checkin', safe({ event_id: '7', status: 'safe' }))
    expect(saved().map((a) => a.row.status)).toEqual(['safe'])
  })

  it('keeps check-ins for different emergencies, and never replaces a sign-up', () => {
    saveEventAction(ME, 'signup', signup())
    saveEventAction(ME, 'checkin', safe({ event_id: 7 }))
    saveEventAction(ME, 'checkin', safe({ event_id: 8 }))
    saveEventAction(ME, 'signup', signup({ role: 'driver' }))
    expect(saved().map((a) => [a.kind, a.row.event_id])).toEqual([['signup', 7], ['checkin', 7], ['checkin', 8], ['signup', 7]])
  })

  it("keeps each account's actions apart, and gives nobody an empty list", () => {
    saveEventAction(ME, 'checkin', safe())
    saveEventAction('neighbor', 'checkin', safe({ status: 'need_help' }))
    expect(saved().map((a) => a.row.status)).toEqual(['safe'])
    expect(pendingEventActions('neighbor').map((a) => a.row.status)).toEqual(['need_help'])
    expect(pendingEventActions(null)).toEqual([])
  })

  it('with "Keep me signed in" off, it is kept for this browser session only', () => {
    vi.spyOn(client, 'keepSignedIn').mockReturnValue(false)
    saveEventAction(ME, 'checkin', safe())
    expect(sessionStorage.getItem(KEY + ME)).not.toBeNull()
    expect(localStorage.getItem(KEY + ME)).toBeNull()
  })

  it("hands back null when this phone can't save it", () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    expect(saveEventAction(ME, 'checkin', safe())).toBeNull()
  })

  it('reads damaged saved data as an empty list', () => {
    localStorage.setItem(KEY + ME, '{not json')
    expect(saved()).toEqual([])
  })

  it('removeEventAction takes out just that one, and leaves nothing behind after the last', () => {
    const first = saveEventAction(ME, 'checkin', safe())
    const second = saveEventAction(ME, 'signup', signup())
    removeEventAction(ME, first.key)
    expect(saved().map((a) => a.kind)).toEqual(['signup'])
    removeEventAction(ME, second.key)
    expect(localStorage.getItem(KEY + ME)).toBeNull()
  })

  it("signing out clears every account's saved actions from this phone, and nothing else", () => {
    saveEventAction(ME, 'checkin', safe())
    saveEventAction('neighbor', 'checkin', safe())
    sessionStorage.setItem(KEY + 'guest', '[]')
    localStorage.setItem('vwb_pending_reports_me', '[]')
    clearAllPendingEventActions()
    expect(Object.keys(localStorage)).toEqual(['vwb_pending_reports_me'])
    expect(Object.keys(sessionStorage)).toEqual([])
  })
})

describe('sending a saved check-in', () => {
  it('posts it as the signed-in person and clears it from the phone', async () => {
    const item = saveEventAction(ME, 'checkin', safe({ event_id: '7', note: 'At the church' }), 'Tree down')
    expect(await sendPendingEventActions(ME)).toEqual([item])
    expect(checkIns()).toEqual([expect.objectContaining({ event_id: 7, user_id: ME, status: 'safe', note: 'At the church' })])
    expect(saved()).toEqual([])
  })

  it('saves an empty note as no note', async () => {
    saveEventAction(ME, 'checkin', safe({ note: '' }))
    await sendPendingEventActions(ME)
    expect(checkIns()[0].note).toBeNull()
  })

  it('is not posted twice when the first try reached VWB after all', async () => {
    clockAt(NOON)
    saveEventAction(ME, 'checkin', safe())
    db.seed('event_check_ins', [{ id: 90, event_id: 7, user_id: ME, status: 'safe', created_at: new Date(NOON.getTime() - 60 * 1000).toISOString() }])
    expect(await sendPendingEventActions(ME)).toHaveLength(1)
    expect(db.callsTo('event_check_ins', 'insert')).toHaveLength(0)
    expect(saved()).toEqual([])
  })

  it("is posted when the earlier check-in said something different, was long before, or was a neighbor's", async () => {
    clockAt(NOON)
    saveEventAction(ME, 'checkin', safe())
    db.seed('event_check_ins', [
      { id: 90, event_id: 7, user_id: ME, status: 'need_help', created_at: NOON.toISOString() },
      { id: 91, event_id: 7, user_id: ME, status: 'safe', created_at: new Date(NOON.getTime() - 6 * 60 * 1000).toISOString() },
      { id: 92, event_id: 7, user_id: 'neighbor', status: 'safe', created_at: NOON.toISOString() },
      { id: 93, event_id: 8, user_id: ME, status: 'safe', created_at: NOON.toISOString() },
    ])
    await sendPendingEventActions(ME)
    expect(checkIns()).toHaveLength(5)
  })
})

describe('sending a saved sign-up', () => {
  it('posts it as the signed-in person with what they offered', async () => {
    saveEventAction(ME, 'signup', signup())
    expect(await sendPendingEventActions(ME)).toHaveLength(1)
    expect(signups()).toEqual([expect.objectContaining({ event_id: 7, user_id: ME, role: 'volunteer', skills: ['First aid'], availability: 'Evenings', notes: 'Have a truck' })])
  })

  it('fills the blanks the same way the form does with signal', async () => {
    saveEventAction(ME, 'signup', { event_id: 7, role: 'volunteer' })
    await sendPendingEventActions(ME)
    expect(signups()[0]).toMatchObject({ skills: [], availability: null, notes: null })
  })

  it('is cleared, not posted again, when the person is already signed up', async () => {
    saveEventAction(ME, 'signup', signup())
    db.seed('event_signups', [{ id: 40, event_id: 7, user_id: ME, role: 'coordinator' }])
    expect(await sendPendingEventActions(ME)).toHaveLength(1)
    expect(signups()).toEqual([{ id: 40, event_id: 7, user_id: ME, role: 'coordinator' }])
    expect(saved()).toEqual([])
  })

  it('is cleared with no fuss when the database says "already signed up"', async () => {
    saveEventAction(ME, 'signup', signup())
    db.failNext('event_signups', 'insert', { code: '23505', message: 'duplicate key value violates unique constraint' })
    expect(await sendPendingEventActions(ME)).toHaveLength(1)
    expect(saved()).toEqual([])
  })
})

describe('sending when the signal is back', () => {
  it('sends everything in the order it was saved', async () => {
    const a = saveEventAction(ME, 'signup', signup())
    const b = saveEventAction(ME, 'checkin', safe())
    const c = saveEventAction(ME, 'checkin', safe({ event_id: 8, status: 'need_help' }))
    const sent = await sendPendingEventActions(ME)
    expect(sent.map((s) => s.key)).toEqual([a.key, b.key, c.key])
    expect(db.calls.filter((call) => call.op === 'insert').map((call) => [call.table, call.payload.event_id])).toEqual([
      ['event_signups', 7], ['event_check_ins', 7], ['event_check_ins', 8],
    ])
  })

  it('sends nothing for nobody, and does not even try while the phone says it is offline', async () => {
    saveEventAction(ME, 'checkin', safe())
    expect(await sendPendingEventActions(null)).toEqual([])
    phoneIsOffline()
    expect(await sendPendingEventActions(ME)).toEqual([])
    expect(db.calls).toHaveLength(0)
    expect(saved()).toHaveLength(1)
  })

  it('two sends at the same moment share one pass, so nothing posts twice', async () => {
    saveEventAction(ME, 'checkin', safe())
    const first = sendPendingEventActions(ME)
    const second = sendPendingEventActions(ME)
    expect(second).toBe(first)
    await first
    expect(checkIns()).toHaveLength(1)
  })

  it.each([
    ['check-in', 'checkin', 'event_check_ins'],
    ['sign-up', 'signup', 'event_signups'],
  ])('stops at the look for a copy of a %s when the signal drops, and keeps everything', async (_name, kind, table) => {
    saveEventAction(ME, kind, kind === 'checkin' ? safe() : signup())
    saveEventAction(ME, 'checkin', safe({ event_id: 8 }))
    db.failNext(table, 'select', NO_SIGNAL)
    expect(await sendPendingEventActions(ME)).toEqual([])
    expect(db.calls.filter((call) => call.op === 'insert')).toHaveLength(0)
    expect(saved().map((a) => a.problem)).toEqual(['', ''])
  })

  it('stops when a check-in cannot get through, and keeps it and the rest with no blame', async () => {
    quiet()
    saveEventAction(ME, 'checkin', safe())
    saveEventAction(ME, 'signup', signup({ event_id: 8 }))
    db.failNext('event_check_ins', 'insert', NO_SIGNAL)
    expect(await sendPendingEventActions(ME)).toEqual([])
    expect(signups()).toEqual([])
    expect(saved().map((a) => [a.kind, a.problem])).toEqual([['checkin', ''], ['signup', '']])
  })

  it('still posts when the look for a copy fails for a reason other than signal', async () => {
    quiet()
    saveEventAction(ME, 'checkin', safe())
    db.failNext('event_check_ins', 'select', { code: '42P01', message: 'relation does not exist' })
    expect(await sendPendingEventActions(ME)).toHaveLength(1)
    expect(checkIns()).toHaveLength(1)
  })
})

describe('when VWB says no to a saved action', () => {
  it('keeps it with the plain reason, and still sends the ones after it', async () => {
    quiet()
    saveEventAction(ME, 'checkin', safe())
    saveEventAction(ME, 'signup', signup({ event_id: 8 }))
    db.failNext('event_check_ins', 'insert', { code: 'P0001', message: 'This emergency is closed.' })
    const sent = await sendPendingEventActions(ME)
    expect(sent.map((s) => s.kind)).toEqual(['signup'])
    expect(saved().map((a) => [a.kind, a.problem])).toEqual([['checkin', 'This emergency is closed.']])
  })

  it('does not keep trying one VWB already said no to, and a new check-in does not erase it', async () => {
    quiet()
    saveEventAction(ME, 'checkin', safe())
    db.failNext('event_check_ins', 'insert', { code: 'P0001', message: 'This emergency is closed.' })
    await sendPendingEventActions(ME)
    const callsSoFar = db.calls.length
    expect(await sendPendingEventActions(ME)).toEqual([])
    expect(db.calls).toHaveLength(callsSoFar)
    saveEventAction(ME, 'checkin', safe({ status: 'need_help' }))
    expect(saved().map((a) => [a.row.status, a.problem])).toEqual([['safe', 'This emergency is closed.'], ['need_help', '']])
  })

  it.each([
    ['a technical database error', { code: '23503', message: 'insert or update on table "event_check_ins" violates foreign key constraint' }],
    ['a permission error', { code: '42501', message: 'new row violates row-level security policy' }],
    ['a rule with a very long message', { code: 'P0001', message: 'x'.repeat(140) }],
  ])('for %s, the note is a plain sentence', async (_what, error) => {
    quiet()
    saveEventAction(ME, 'checkin', safe())
    db.failNext('event_check_ins', 'insert', error)
    expect(await sendPendingEventActions(ME)).toEqual([])
    expect(saved().map((a) => a.problem)).toEqual(['VWB could not post this one.'])
  })
})

describe('usePendingEventActions', () => {
  it('re-draws the screen when an action is saved or sent', async () => {
    const { result } = renderHook(() => usePendingEventActions(ME))
    expect(result.current).toEqual([])
    act(() => { saveEventAction(ME, 'checkin', safe()) })
    expect(result.current).toHaveLength(1)
    await act(() => sendPendingEventActions(ME))
    expect(result.current).toEqual([])
  })

  it('re-draws when another tab saved one', () => {
    const { result } = renderHook(() => usePendingEventActions(ME))
    localStorage.setItem(KEY + ME, JSON.stringify([{ key: 'k1', kind: 'checkin', saved_at: NOON.toISOString(), row: safe(), event_title: '', problem: '' }]))
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY + ME })) })
    expect(result.current.map((a) => a.key)).toEqual(['k1'])
  })
})
