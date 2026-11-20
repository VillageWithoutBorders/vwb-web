// The copy of an emergency page kept on this phone so it opens with no signal: only this
// person's last five, only while signed in, and never left behind for the next person.
import { describe, expect, it, vi } from 'vitest'
import * as client from '../../src/supabaseClient'
import { clearEventCopies, readEventCopy, saveEventCopy } from '../../src/utils/eventCopy'

const ME = 'me'
const START = new Date('2026-11-19T12:00:00-05:00')
function clockAt(date) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(date)
}
// Saves one copy per minute, so each is newer than the one before.
function saveInTurn(userId, eventIds) {
  for (const id of eventIds) {
    saveEventCopy(userId, id, { event: { id, title: 'Emergency ' + id } })
    vi.setSystemTime(new Date(Date.now() + 60 * 1000))
  }
}

describe('saveEventCopy and readEventCopy', () => {
  it('gives back what the page showed, with the time it was saved', () => {
    clockAt(START)
    saveEventCopy(ME, 7, { event: { id: 7, title: 'Tree down' }, checkIns: [{ status: 'safe' }] })
    expect(readEventCopy(ME, 7)).toEqual({ event: { id: 7, title: 'Tree down' }, checkIns: [{ status: 'safe' }], saved_at: START.toISOString() })
  })

  it('a newer copy of the same emergency replaces the old one', () => {
    saveEventCopy(ME, 7, { event: { title: 'Tree down' } })
    saveEventCopy(ME, 7, { event: { title: 'Tree down, road closed' } })
    expect(readEventCopy(ME, 7).event.title).toBe('Tree down, road closed')
    expect(Object.keys(localStorage)).toHaveLength(1)
  })

  it('is null for an emergency this person never opened', () => {
    saveEventCopy(ME, 7, { event: {} })
    expect(readEventCopy(ME, 8)).toBeNull()
  })

  it("never shows one person's copy to another person on the same phone", () => {
    saveEventCopy(ME, 7, { event: { title: 'Tree down' } })
    expect(readEventCopy('neighbor', 7)).toBeNull()
  })

  it('keeps nothing when nobody is signed in or there is no emergency', () => {
    saveEventCopy(null, 7, { event: {} })
    saveEventCopy(ME, null, { event: {} })
    expect(localStorage.length).toBe(0)
    expect(readEventCopy(null, 7)).toBeNull()
    expect(readEventCopy(ME, undefined)).toBeNull()
  })

  it('reads a damaged copy as nothing instead of breaking the page', () => {
    localStorage.setItem('vwb_event_copy_me_7', '{not json')
    expect(readEventCopy(ME, 7)).toBeNull()
  })
})

describe('only the last five', () => {
  it('drops the oldest copy when a sixth emergency is opened', () => {
    clockAt(START)
    saveInTurn(ME, [1, 2, 3, 4, 5, 6])
    expect(readEventCopy(ME, 1)).toBeNull()
    expect([2, 3, 4, 5, 6].map((id) => readEventCopy(ME, id)?.event.id)).toEqual([2, 3, 4, 5, 6])
  })

  it('opening an old one again makes it new, so a different one is dropped', () => {
    clockAt(START)
    saveInTurn(ME, [1, 2, 3, 4, 5, 1, 6])
    expect(readEventCopy(ME, 1)).not.toBeNull()
    expect(readEventCopy(ME, 2)).toBeNull()
  })

  it("counts each person's copies by themselves", () => {
    clockAt(START)
    saveInTurn('neighbor', [1, 2, 3])
    saveInTurn(ME, [11, 12, 13, 14, 15, 16])
    expect([1, 2, 3].map((id) => readEventCopy('neighbor', id) !== null)).toEqual([true, true, true])
    expect(readEventCopy(ME, 11)).toBeNull()
  })
})

describe('where the copy is kept', () => {
  it('with "Keep me signed in" on, it outlives the browser session', () => {
    saveEventCopy(ME, 7, { event: {} })
    expect(Object.keys(localStorage)).toEqual(['vwb_event_copy_me_7'])
    expect(sessionStorage.length).toBe(0)
  })

  it('with "Keep me signed in" off, it is kept for this browser session only', () => {
    vi.spyOn(client, 'keepSignedIn').mockReturnValue(false)
    saveEventCopy(ME, 7, { event: { title: 'Tree down' } })
    expect(Object.keys(sessionStorage)).toEqual(['vwb_event_copy_me_7'])
    expect(localStorage.length).toBe(0)
    expect(readEventCopy(ME, 7).event.title).toBe('Tree down')
  })

  it('drops the copy, without breaking the page, when the phone is full', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    saveEventCopy(ME, 7, { event: { title: 'older copy' } })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    expect(() => saveEventCopy(ME, 7, { event: { title: 'newer copy' } })).not.toThrow()
    expect(readEventCopy(ME, 7)).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  it('does nothing, without breaking the page, when storage cannot be reached at all', () => {
    vi.spyOn(client, 'keepSignedIn').mockImplementation(() => { throw new Error('blocked') })
    expect(() => saveEventCopy(ME, 7, { event: {} })).not.toThrow()
    expect(readEventCopy(ME, 7)).toBeNull()
  })
})

describe('clearEventCopies (sign out)', () => {
  it("removes every person's copies from this phone, and nothing else", () => {
    saveEventCopy(ME, 7, { event: {} })
    saveEventCopy('neighbor', 8, { event: {} })
    sessionStorage.setItem('vwb_event_copy_guest_9', '{}')
    localStorage.setItem('vwb_theme', 'dark')
    sessionStorage.setItem('vwb_session_zip', '{}')
    clearEventCopies()
    expect(Object.keys(localStorage)).toEqual(['vwb_theme'])
    expect(Object.keys(sessionStorage)).toEqual(['vwb_session_zip'])
  })
})
