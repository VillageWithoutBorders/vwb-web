// Asks saved with no signal: an ask made offline stays on this phone, goes out by itself
// (once, in order) when the signal is back, and never stays behind for the next person.
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { db } from '../helpers/fakeSupabase.js'
import * as client from '../../src/supabaseClient'
import {
  clearAllPendingAsks, isNoSignal, pendingAsks, removePendingAsk, savePendingAsk, sendPendingAsks, usePendingAsks,
} from '../../src/utils/pendingAsks'

const ME = 'me'
const KEY = 'vwb_pending_asks_'
const NO_SIGNAL = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }
const NOON = new Date('2026-11-19T12:00:00-05:00')

const ask = (description, more = {}) => ({ skill_needed: 'Rides', description, urgency: 'today', audience: 'everyone', open_hours: 24, ...more })
const posted = () => db.rows('help_requests')
const tries = () => db.callsTo('help_requests', 'insert').length
const phoneIsOffline = () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})
function clockAt(date) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(date)
}

describe('saving an ask on the phone', () => {
  it('keeps an ask on the phone when there is no signal', () => {
    clockAt(NOON)
    expect(savePendingAsk(ME, ask('Ride to the clinic'))).toBe(true)
    expect(pendingAsks(ME)).toEqual([
      { key: expect.any(String), saved_at: NOON.toISOString(), row: ask('Ride to the clinic'), problem: '' },
    ])
  })

  it('keeps several asks in the order they were made, each with its own key', () => {
    savePendingAsk(ME, ask('first'))
    savePendingAsk(ME, ask('second'))
    savePendingAsk(ME, ask('third'))
    const saved = pendingAsks(ME)
    expect(saved.map((a) => a.row.description)).toEqual(['first', 'second', 'third'])
    expect(new Set(saved.map((a) => a.key)).size).toBe(3)
  })

  it("keeps each account's asks apart", () => {
    savePendingAsk(ME, ask('mine'))
    savePendingAsk('neighbor', ask('theirs'))
    expect(pendingAsks(ME).map((a) => a.row.description)).toEqual(['mine'])
    expect(pendingAsks('neighbor').map((a) => a.row.description)).toEqual(['theirs'])
  })

  it('is an empty list when nobody is signed in', () => {
    savePendingAsk(ME, ask('mine'))
    expect(pendingAsks(null)).toEqual([])
    expect(pendingAsks(undefined)).toEqual([])
  })

  it('with "Keep me signed in" on, the ask outlives the browser session', () => {
    savePendingAsk(ME, ask('mine'))
    expect(localStorage.getItem(KEY + ME)).not.toBeNull()
    expect(sessionStorage.getItem(KEY + ME)).toBeNull()
  })

  it('with "Keep me signed in" off, the ask is kept for this browser session only', () => {
    vi.spyOn(client, 'keepSignedIn').mockReturnValue(false)
    savePendingAsk(ME, ask('mine'))
    expect(sessionStorage.getItem(KEY + ME)).not.toBeNull()
    expect(localStorage.getItem(KEY + ME)).toBeNull()
    expect(pendingAsks(ME)).toHaveLength(1)
  })

  it("says so when this phone can't save it (a private window, for one)", () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    expect(savePendingAsk(ME, ask('mine'))).toBe(false)
    expect(pendingAsks(ME)).toEqual([])
  })

  it('reads damaged saved data as an empty list instead of breaking the page', () => {
    localStorage.setItem(KEY + ME, '{not json')
    expect(pendingAsks(ME)).toEqual([])
    localStorage.setItem(KEY + ME, 'null')
    expect(pendingAsks(ME)).toEqual([])
  })
})

describe('removing saved asks', () => {
  it('removePendingAsk takes out just that one', () => {
    savePendingAsk(ME, ask('first'))
    savePendingAsk(ME, ask('second'))
    removePendingAsk(ME, pendingAsks(ME)[0].key)
    expect(pendingAsks(ME).map((a) => a.row.description)).toEqual(['second'])
  })

  it('leaves nothing behind on the phone once the last one is removed', () => {
    savePendingAsk(ME, ask('only'))
    removePendingAsk(ME, pendingAsks(ME)[0].key)
    expect(localStorage.getItem(KEY + ME)).toBeNull()
  })

  it("signing out clears every account's saved asks from this phone, and nothing else", () => {
    savePendingAsk(ME, ask('mine'))
    savePendingAsk('neighbor', ask('theirs'))
    sessionStorage.setItem(KEY + 'guest', JSON.stringify([{ key: 'k', row: ask('session only'), problem: '' }]))
    localStorage.setItem('vwb_lang', 'es')
    clearAllPendingAsks()
    expect(Object.keys(localStorage)).toEqual(['vwb_lang'])
    expect(Object.keys(sessionStorage)).toEqual([])
    expect(pendingAsks(ME)).toEqual([])
  })
})

describe('isNoSignal', () => {
  it.each([
    ['a failed fetch', { message: 'TypeError: Failed to fetch', code: '' }],
    ['a network error', { message: 'NetworkError when attempting to fetch resource.' }],
    ['the "Load failed" that Safari gives', { message: 'Load failed' }],
    ['a time out', { message: 'The request timed out' }],
    ['a timeout', { message: 'timeout exceeded' }],
    ['an aborted request', { name: 'AbortError', message: 'The operation was stopped' }],
    ['a sign-in pass that ran out', { code: 'PGRST301', message: 'JWT expired' }],
    ['a 401', { status: 401, message: 'Unauthorized', code: 'whatever' }],
  ])('%s is worth trying again later', (_what, error) => {
    expect(isNoSignal(error)).toBe(true)
  })

  it.each([
    ['no error at all', null],
    ['a rule the database enforced', { code: 'P0001', message: 'You can post 5 requests a day.' }],
    ['a permission error', { code: '42501', message: 'new row violates row-level security policy' }],
    ['a database error that only mentions the network', { code: 'P0001', message: 'Your network of villages is full.' }],
  ])('%s is not a signal problem', (_what, error) => {
    expect(isNoSignal(error)).toBe(false)
  })

  it('treats any error as no signal while the phone says it is offline', () => {
    phoneIsOffline()
    expect(isNoSignal({ code: 'P0001', message: 'You can post 5 requests a day.' })).toBe(true)
    expect(isNoSignal(null)).toBe(false)
  })
})

describe('sending saved asks when the signal is back', () => {
  it('posts each saved ask as the signed-in person, in the order they were made, and clears them from the phone', async () => {
    savePendingAsk(ME, ask('first'))
    savePendingAsk(ME, ask('second'))
    savePendingAsk(ME, ask('third', { requester_id: 'someone-else' }))
    expect(await sendPendingAsks(ME)).toBe(3)
    expect(posted().map((r) => [r.description, r.requester_id])).toEqual([['first', ME], ['second', ME], ['third', ME]])
    expect(pendingAsks(ME)).toEqual([])
    expect(localStorage.getItem(KEY + ME)).toBeNull()
  })

  it('posts what the person wrote, without the phone-only "open_hours" note', async () => {
    savePendingAsk(ME, ask('Ride to the clinic', { skill_needed: 'Rides', urgency: 'now', max_helpers: 1, for_name: 'Ruth' }))
    await sendPendingAsks(ME)
    expect(posted()[0]).toMatchObject({ skill_needed: 'Rides', description: 'Ride to the clinic', urgency: 'now', max_helpers: 1, for_name: 'Ruth', audience: 'everyone' })
    expect(posted()[0]).not.toHaveProperty('open_hours')
  })

  it('starts the "group first" clock when it sends, not when it was saved', async () => {
    clockAt(NOON)
    savePendingAsk(ME, ask('for my group', { audience: 'group', open_hours: 48 }))
    savePendingAsk(ME, ask('no hours given', { audience: 'group', open_hours: undefined }))
    savePendingAsk(ME, ask('for everyone', { audience: 'everyone', open_hours: 48 }))
    const threeHoursLater = new Date(NOON.getTime() + 3 * 3600 * 1000)
    vi.setSystemTime(threeHoursLater)
    await sendPendingAsks(ME)
    expect(posted().map((r) => r.opens_to_all_at)).toEqual([
      new Date(threeHoursLater.getTime() + 48 * 3600 * 1000).toISOString(),
      new Date(threeHoursLater.getTime() + 24 * 3600 * 1000).toISOString(),
      null,
    ])
  })

  it('sends nothing for nobody', async () => {
    savePendingAsk(ME, ask('mine'))
    expect(await sendPendingAsks(null)).toBe(0)
    expect(db.calls).toHaveLength(0)
    expect(pendingAsks(ME)).toHaveLength(1)
  })

  it("only sends the signed-in person's asks, never another account's", async () => {
    savePendingAsk(ME, ask('mine'))
    savePendingAsk('neighbor', ask('theirs'))
    expect(await sendPendingAsks(ME)).toBe(1)
    expect(posted().map((r) => r.description)).toEqual(['mine'])
    expect(pendingAsks('neighbor')).toHaveLength(1)
  })

  it('does not even try while the phone says it is offline', async () => {
    savePendingAsk(ME, ask('mine'))
    phoneIsOffline()
    expect(await sendPendingAsks(ME)).toBe(0)
    expect(db.calls).toHaveLength(0)
    expect(pendingAsks(ME)).toHaveLength(1)
  })

  it('two sends at the same moment share one pass, so nothing posts twice', async () => {
    savePendingAsk(ME, ask('mine'))
    const first = sendPendingAsks(ME)
    const second = sendPendingAsks(ME)
    expect(second).toBe(first)
    expect(await first).toBe(1)
    expect(posted()).toHaveLength(1)
  })

  it('can send again later, after one pass has finished', async () => {
    savePendingAsk(ME, ask('morning'))
    await sendPendingAsks(ME)
    savePendingAsk(ME, ask('evening'))
    expect(await sendPendingAsks(ME)).toBe(1)
    expect(posted().map((r) => r.description)).toEqual(['morning', 'evening'])
  })
})

describe('an ask that may already have reached VWB', () => {
  it('is not posted a second time: it is just cleared from the phone and counted as sent', async () => {
    clockAt(NOON)
    savePendingAsk(ME, ask('Ride to the clinic'))
    db.seed('help_requests', [{ id: 900, requester_id: ME, description: 'Ride to the clinic', created_at: new Date(NOON.getTime() - 2 * 60 * 1000).toISOString() }])
    expect(await sendPendingAsks(ME)).toBe(1)
    expect(tries()).toBe(0)
    expect(posted()).toHaveLength(1)
    expect(pendingAsks(ME)).toEqual([])
  })

  it('is posted when the look-alike is an older ask (more than five minutes before it was saved)', async () => {
    clockAt(NOON)
    savePendingAsk(ME, ask('Ride to the clinic'))
    db.seed('help_requests', [{ id: 900, requester_id: ME, description: 'Ride to the clinic', created_at: new Date(NOON.getTime() - 6 * 60 * 1000).toISOString() }])
    expect(await sendPendingAsks(ME)).toBe(1)
    expect(posted()).toHaveLength(2)
  })

  it("is posted when the look-alike is a neighbor's ask or has different words", async () => {
    clockAt(NOON)
    savePendingAsk(ME, ask('Ride to the clinic'))
    db.seed('help_requests', [
      { id: 900, requester_id: 'neighbor', description: 'Ride to the clinic', created_at: NOON.toISOString() },
      { id: 901, requester_id: ME, description: 'Ride to the store', created_at: NOON.toISOString() },
    ])
    expect(await sendPendingAsks(ME)).toBe(1)
    expect(posted()).toHaveLength(3)
  })

  it('is still posted when the look for a copy fails for a reason other than signal', async () => {
    quiet()
    savePendingAsk(ME, ask('mine'))
    db.failNext('help_requests', 'select', { code: '42P01', message: 'relation does not exist' })
    expect(await sendPendingAsks(ME)).toBe(1)
    expect(posted()).toHaveLength(1)
  })
})

describe('when the signal drops again while sending', () => {
  it('stops at the look for a copy and keeps every ask for next time', async () => {
    savePendingAsk(ME, ask('first'))
    savePendingAsk(ME, ask('second'))
    db.failNext('help_requests', 'select', NO_SIGNAL)
    expect(await sendPendingAsks(ME)).toBe(0)
    expect(tries()).toBe(0)
    expect(pendingAsks(ME).map((a) => [a.row.description, a.problem])).toEqual([['first', ''], ['second', '']])
  })

  it('stops at the first ask that cannot get through and keeps it and the rest, in order, with no blame', async () => {
    quiet()
    savePendingAsk(ME, ask('first'))
    savePendingAsk(ME, ask('second'))
    db.failNext('help_requests', 'insert', NO_SIGNAL)
    expect(await sendPendingAsks(ME)).toBe(0)
    expect(tries()).toBe(1)
    expect(posted()).toEqual([])
    expect(pendingAsks(ME).map((a) => [a.row.description, a.problem])).toEqual([['first', ''], ['second', '']])
  })

  it('counts the ones that went out before the signal dropped, and sends the rest on the next pass', async () => {
    clockAt(NOON)
    savePendingAsk(ME, ask('already there'))
    savePendingAsk(ME, ask('still waiting'))
    db.seed('help_requests', [{ id: 900, requester_id: ME, description: 'already there', created_at: NOON.toISOString() }])
    db.failNext('help_requests', 'insert', NO_SIGNAL)
    expect(await sendPendingAsks(ME)).toBe(1)
    expect(pendingAsks(ME).map((a) => a.row.description)).toEqual(['still waiting'])
    expect(await sendPendingAsks(ME)).toBe(1)
    expect(posted().map((r) => r.description)).toEqual(['already there', 'still waiting'])
    expect(pendingAsks(ME)).toEqual([])
  })

  it('keeps the ask, to try again, when the sign-in pass ran out while offline', async () => {
    quiet()
    savePendingAsk(ME, ask('mine'))
    db.failNext('help_requests', 'insert', { code: 'PGRST301', message: 'JWT expired' })
    expect(await sendPendingAsks(ME)).toBe(0)
    expect(pendingAsks(ME).map((a) => a.problem)).toEqual([''])
  })
})

describe('when VWB says no to a saved ask', () => {
  it('keeps it with the plain reason, and still sends the ones after it', async () => {
    quiet()
    savePendingAsk(ME, ask('too many today'))
    savePendingAsk(ME, ask('this one is fine'))
    db.failNext('help_requests', 'insert', { code: 'P0001', message: 'You can post 5 requests a day.' })
    expect(await sendPendingAsks(ME)).toBe(1)
    expect(posted().map((r) => r.description)).toEqual(['this one is fine'])
    expect(pendingAsks(ME).map((a) => [a.row.description, a.problem])).toEqual([['too many today', 'You can post 5 requests a day.']])
  })

  it('does not keep trying an ask VWB already said no to', async () => {
    quiet()
    savePendingAsk(ME, ask('too many today'))
    db.failNext('help_requests', 'insert', { code: 'P0001', message: 'You can post 5 requests a day.' })
    await sendPendingAsks(ME)
    const callsSoFar = db.calls.length
    expect(await sendPendingAsks(ME)).toBe(0)
    expect(db.calls).toHaveLength(callsSoFar)
    expect(pendingAsks(ME)).toHaveLength(1)
  })

  it.each([
    ['a permission rule with a short message', { code: '42501', message: 'Only members of this village can post here.' }, 'Only members of this village can post here.'],
    ['a message about a group, whatever the code', { code: '23514', message: 'Choose a group to post to.' }, 'Choose a group to post to.'],
    ['a technical database error', { code: '23502', message: 'null value in column "latitude" violates not-null constraint' }, 'VWB could not post this one.'],
    ['a rule with a very long message', { code: 'P0001', message: 'x'.repeat(140) }, 'VWB could not post this one.'],
    ['an error with no message', { code: 'P0001' }, 'VWB could not post this one.'],
  ])('for %s, the note on the saved ask is safe to show', async (_what, error, problem) => {
    quiet()
    savePendingAsk(ME, ask('mine'))
    db.failNext('help_requests', 'insert', error)
    expect(await sendPendingAsks(ME)).toBe(0)
    expect(pendingAsks(ME).map((a) => a.problem)).toEqual([problem])
  })
})

describe('usePendingAsks', () => {
  it('re-draws the screen when an ask is saved, sent, or cleared', async () => {
    const { result } = renderHook(() => usePendingAsks(ME))
    expect(result.current).toEqual([])
    act(() => { savePendingAsk(ME, ask('mine')) })
    expect(result.current.map((a) => a.row.description)).toEqual(['mine'])
    await act(() => sendPendingAsks(ME))
    expect(result.current).toEqual([])
    act(() => { savePendingAsk(ME, ask('again')) })
    act(() => clearAllPendingAsks())
    expect(result.current).toEqual([])
  })

  it('re-draws when another tab saved one', () => {
    const { result } = renderHook(() => usePendingAsks(ME))
    localStorage.setItem(KEY + ME, JSON.stringify([{ key: 'k1', saved_at: NOON.toISOString(), row: ask('from the other tab'), problem: '' }]))
    expect(result.current).toEqual([])
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY + ME })) })
    expect(result.current.map((a) => a.row.description)).toEqual(['from the other tab'])
  })
})
