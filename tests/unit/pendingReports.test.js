// Emergency reports saved with no signal: kept on this phone, sent once when the signal
// is back, and held to ask "Is this the same one?" if a neighbor already reported it.
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { db } from '../helpers/fakeSupabase.js'
import * as client from '../../src/supabaseClient'
import {
  clearAllPendingReports, pendingReports, removePendingReport, savePendingReport, sendPendingReports, sendReportAnyway, usePendingReports,
} from '../../src/utils/pendingReports'

const ME = 'me'
const KEY = 'vwb_pending_reports_'
const NO_SIGNAL = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }
const NOON = new Date('2026-11-19T12:00:00-05:00')

const report = (title = 'Tree down on Main Street', more = {}) => ({
  title, description: 'Blocking both lanes', event_type: 'storm', location_name: 'Main Street', status: 'active', ...more,
})
// The same emergency, already reported by a neighbor.
const theirs = (more = {}) => ({ id: 500, ...report(), created_by: 'neighbor', verified: null, created_at: NOON.toISOString(), ...more })
const events = () => db.rows('emergency_events')
const tries = () => db.callsTo('emergency_events', 'insert').length
const phoneIsOffline = () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})
function clockAt(date) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(date)
}

describe('saving a report on the phone', () => {
  it('keeps a report on the phone when there is no signal', () => {
    clockAt(NOON)
    expect(savePendingReport(ME, report())).toBe(true)
    expect(pendingReports(ME)).toEqual([
      { key: expect.any(String), saved_at: NOON.toISOString(), row: report(), problem: '', match: null, anyway: false },
    ])
  })

  it("keeps each account's reports apart, and gives nobody an empty list", () => {
    savePendingReport(ME, report('mine'))
    savePendingReport('neighbor', report('theirs'))
    expect(pendingReports(ME).map((r) => r.row.title)).toEqual(['mine'])
    expect(pendingReports('neighbor').map((r) => r.row.title)).toEqual(['theirs'])
    expect(pendingReports(null)).toEqual([])
  })

  it('with "Keep me signed in" off, the report is kept for this browser session only', () => {
    vi.spyOn(client, 'keepSignedIn').mockReturnValue(false)
    savePendingReport(ME, report())
    expect(sessionStorage.getItem(KEY + ME)).not.toBeNull()
    expect(localStorage.getItem(KEY + ME)).toBeNull()
  })

  it("says so when this phone can't save it", () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    expect(savePendingReport(ME, report())).toBe(false)
  })

  it('reads damaged saved data as an empty list', () => {
    localStorage.setItem(KEY + ME, '{not json')
    expect(pendingReports(ME)).toEqual([])
  })

  it('removePendingReport takes out just that one, and leaves nothing behind after the last', () => {
    savePendingReport(ME, report('first'))
    savePendingReport(ME, report('second'))
    removePendingReport(ME, pendingReports(ME)[0].key)
    expect(pendingReports(ME).map((r) => r.row.title)).toEqual(['second'])
    removePendingReport(ME, pendingReports(ME)[0].key)
    expect(localStorage.getItem(KEY + ME)).toBeNull()
  })

  it("signing out clears every account's saved reports from this phone, and nothing else", () => {
    savePendingReport(ME, report('mine'))
    savePendingReport('neighbor', report('theirs'))
    sessionStorage.setItem(KEY + 'guest', '[]')
    localStorage.setItem('vwb_pending_asks_me', '[]')
    clearAllPendingReports()
    expect(Object.keys(localStorage)).toEqual(['vwb_pending_asks_me'])
    expect(Object.keys(sessionStorage)).toEqual([])
  })
})

describe('sending saved reports when the signal is back', () => {
  it('posts the report as the signed-in person and clears it from the phone', async () => {
    savePendingReport(ME, report('Tree down on Main Street', { created_by: 'someone-else' }))
    const sent = await sendPendingReports(ME)
    expect(events()).toEqual([expect.objectContaining({ ...report(), created_by: ME })])
    expect(sent).toEqual([{ id: events()[0].id, title: 'Tree down on Main Street' }])
    expect(pendingReports(ME)).toEqual([])
  })

  it('makes the reporter the first coordinator, same as reporting with signal', async () => {
    savePendingReport(ME, report())
    const [sent] = await sendPendingReports(ME)
    expect(db.rows('event_signups')).toEqual([expect.objectContaining({ event_id: sent.id, user_id: ME, role: 'coordinator' })])
  })

  it('still counts the report as sent when only the coordinator step fails', async () => {
    quiet()
    savePendingReport(ME, report())
    db.failNext('event_signups', 'insert')
    expect(await sendPendingReports(ME)).toHaveLength(1)
    expect(events()).toHaveLength(1)
    expect(pendingReports(ME)).toEqual([])
  })

  it('sends different reports in the order they were made', async () => {
    savePendingReport(ME, report('Tree down on Main Street'))
    savePendingReport(ME, report('Creek over the bridge', { event_type: 'flood', location_name: 'Mill Road', description: 'Water rising' }))
    const sent = await sendPendingReports(ME)
    expect(sent.map((s) => s.title)).toEqual(['Tree down on Main Street', 'Creek over the bridge'])
    expect(events().map((e) => e.title)).toEqual(['Tree down on Main Street', 'Creek over the bridge'])
  })

  it('sends nothing for nobody, and does not even try while the phone says it is offline', async () => {
    savePendingReport(ME, report())
    expect(await sendPendingReports(null)).toEqual([])
    phoneIsOffline()
    expect(await sendPendingReports(ME)).toEqual([])
    expect(db.calls).toHaveLength(0)
    expect(pendingReports(ME)).toHaveLength(1)
  })

  it('two sends at the same moment share one pass, so nothing posts twice', async () => {
    savePendingReport(ME, report())
    const first = sendPendingReports(ME)
    const second = sendPendingReports(ME)
    expect(second).toBe(first)
    await first
    expect(events()).toHaveLength(1)
  })
})

describe('a report that may already have reached VWB', () => {
  it('is not posted a second time: it is cleared from the phone and the one already there is handed back', async () => {
    clockAt(NOON)
    savePendingReport(ME, report())
    db.seed('emergency_events', [{ id: 321, ...report(), created_by: ME, created_at: new Date(NOON.getTime() - 60 * 1000).toISOString() }])
    expect(await sendPendingReports(ME)).toEqual([{ id: 321, title: 'Tree down on Main Street' }])
    expect(tries()).toBe(0)
    expect(pendingReports(ME)).toEqual([])
  })

  it('does not mistake a report of mine from earlier in the day for a copy', async () => {
    clockAt(NOON)
    savePendingReport(ME, report())
    db.seed('emergency_events', [{ id: 321, ...report(), status: 'resolved', created_by: ME, created_at: new Date(NOON.getTime() - 6 * 60 * 1000).toISOString() }])
    const sent = await sendPendingReports(ME)
    expect(sent).toHaveLength(1)
    expect(sent[0].id).not.toBe(321)
    expect(events()).toHaveLength(2)
  })
})

describe('"Is this the same one?"', () => {
  it('holds the report when a neighbor reported the same emergency while this phone had no signal', async () => {
    savePendingReport(ME, report())
    db.seed('emergency_events', [theirs({ verified: 1 })])
    expect(await sendPendingReports(ME)).toEqual([])
    expect(tries()).toBe(0)
    expect(pendingReports(ME)).toEqual([expect.objectContaining({
      problem: 'similar',
      match: { id: 500, title: 'Tree down on Main Street', event_type: 'storm', location_name: 'Main Street', verified: true },
    })])
  })

  it('keeps holding it, without asking the database again, until the person decides', async () => {
    savePendingReport(ME, report())
    db.seed('emergency_events', [theirs()])
    await sendPendingReports(ME)
    const callsSoFar = db.calls.length
    expect(await sendPendingReports(ME)).toEqual([])
    expect(db.calls).toHaveLength(callsSoFar)
    expect(pendingReports(ME)[0].problem).toBe('similar')
  })

  it('"No, it is different" sends it anyway on the next pass', async () => {
    savePendingReport(ME, report())
    db.seed('emergency_events', [theirs()])
    await sendPendingReports(ME)
    sendReportAnyway(ME, pendingReports(ME)[0].key)
    expect(pendingReports(ME)[0]).toMatchObject({ anyway: true, problem: '', match: null })
    const sent = await sendPendingReports(ME)
    expect(sent).toHaveLength(1)
    expect(events().map((e) => e.created_by)).toEqual(['neighbor', ME])
    expect(pendingReports(ME)).toEqual([])
  })

  it('still sends the reports after a held one', async () => {
    savePendingReport(ME, report())
    savePendingReport(ME, report('Creek over the bridge', { event_type: 'flood', location_name: 'Mill Road', description: 'Water rising' }))
    db.seed('emergency_events', [theirs()])
    const sent = await sendPendingReports(ME)
    expect(sent.map((s) => s.title)).toEqual(['Creek over the bridge'])
    expect(pendingReports(ME).map((r) => [r.row.title, r.problem])).toEqual([['Tree down on Main Street', 'similar']])
  })

  it('does not hold a report for an emergency that is already over', async () => {
    savePendingReport(ME, report())
    db.seed('emergency_events', [theirs({ status: 'resolved' })])
    expect(await sendPendingReports(ME)).toHaveLength(1)
  })

  it('does not hold a report for a different kind of emergency somewhere else', async () => {
    savePendingReport(ME, report())
    db.seed('emergency_events', [theirs({ title: 'Creek over the bridge', event_type: 'flood', location_name: 'Mill Road', description: 'Water rising' })])
    expect(await sendPendingReports(ME)).toHaveLength(1)
  })

  it('sends the report when the looks fail for a reason other than signal', async () => {
    quiet()
    savePendingReport(ME, report())
    db.seed('emergency_events', [theirs()])
    // Both looks fail: the one for my own copy, then the one for a neighbor's match.
    db.failNext('emergency_events', 'select', { code: '42P01', message: 'relation does not exist' })
    db.failNext('emergency_events', 'select', { code: '42P01', message: 'relation does not exist' })
    expect(await sendPendingReports(ME)).toHaveLength(1)
    expect(events().map((e) => e.created_by)).toEqual(['neighbor', ME])
  })
})

describe('when the signal drops again while sending', () => {
  it('stops at the look for a copy and keeps every report for next time', async () => {
    savePendingReport(ME, report('first'))
    savePendingReport(ME, report('second'))
    db.failNext('emergency_events', 'select', NO_SIGNAL)
    expect(await sendPendingReports(ME)).toEqual([])
    expect(tries()).toBe(0)
    expect(pendingReports(ME).map((r) => [r.row.title, r.problem])).toEqual([['first', ''], ['second', '']])
  })

  it('stops when the report itself cannot get through, and keeps it with no blame', async () => {
    quiet()
    savePendingReport(ME, report('first'))
    savePendingReport(ME, report('second'))
    db.failNext('emergency_events', 'insert', NO_SIGNAL)
    expect(await sendPendingReports(ME)).toEqual([])
    expect(tries()).toBe(1)
    expect(events()).toEqual([])
    expect(pendingReports(ME).map((r) => [r.row.title, r.problem])).toEqual([['first', ''], ['second', '']])
  })
})

describe('when VWB says no to a saved report', () => {
  it('keeps it with the plain reason, and still sends the ones after it', async () => {
    quiet()
    savePendingReport(ME, report('Tree down on Main Street'))
    savePendingReport(ME, report('Creek over the bridge', { event_type: 'flood', location_name: 'Mill Road', description: 'Water rising' }))
    db.failNext('emergency_events', 'insert', { code: 'P0001', message: 'You can report 3 emergencies a day.' })
    const sent = await sendPendingReports(ME)
    expect(sent.map((s) => s.title)).toEqual(['Creek over the bridge'])
    expect(pendingReports(ME).map((r) => [r.row.title, r.problem])).toEqual([['Tree down on Main Street', 'You can report 3 emergencies a day.']])
  })

  it.each([
    ['a technical database error', { code: '23502', message: 'null value in column "title" violates not-null constraint' }],
    ['a permission error', { code: '42501', message: 'new row violates row-level security policy' }],
    ['a rule with a very long message', { code: 'P0001', message: 'x'.repeat(140) }],
  ])('for %s, the note on the saved report is a plain sentence', async (_what, error) => {
    quiet()
    savePendingReport(ME, report())
    db.failNext('emergency_events', 'insert', error)
    expect(await sendPendingReports(ME)).toEqual([])
    expect(pendingReports(ME).map((r) => r.problem)).toEqual(['VWB could not post this one.'])
  })
})

describe('usePendingReports', () => {
  it('re-draws the screen when a report is saved, held, or sent', async () => {
    const { result } = renderHook(() => usePendingReports(ME))
    expect(result.current).toEqual([])
    act(() => { savePendingReport(ME, report()) })
    expect(result.current).toHaveLength(1)
    db.seed('emergency_events', [theirs()])
    await act(() => sendPendingReports(ME))
    expect(result.current[0].problem).toBe('similar')
    act(() => sendReportAnyway(ME, result.current[0].key))
    await act(() => sendPendingReports(ME))
    expect(result.current).toEqual([])
  })

  it('re-draws when another tab saved one', () => {
    const { result } = renderHook(() => usePendingReports(ME))
    localStorage.setItem(KEY + ME, JSON.stringify([{ key: 'k1', saved_at: NOON.toISOString(), row: report('from the other tab'), problem: '', match: null, anyway: false }]))
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY + ME })) })
    expect(result.current.map((r) => r.row.title)).toEqual(['from the other tab'])
  })
})
