// Reporting a person to the admins: the report is filed under the reporter, long text is
// trimmed to what the database takes, and a failure shows a plain sentence.
import { describe, expect, it, vi } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'
import { submitUserReport } from '../../src/utils/submitUserReport'

const reports = () => db.rows('user_reports')

describe('submitUserReport', () => {
  it('files the report with who made it, who it is about, where, and why', async () => {
    const out = await submitUserReport({ reporterId: 'me', reportedUserId: 'them', source: 'profile', reason: 'Harassment', details: 'Kept messaging after I said stop.' })
    expect(out).toEqual({})
    expect(reports()).toEqual([expect.objectContaining({
      reporter_id: 'me', reported_user_id: 'them', source: 'profile', reason: 'Harassment', details: 'Kept messaging after I said stop.',
    })])
  })

  it('files a report with no reason, details, or named person as empty, not as blank text', async () => {
    await submitUserReport({ reporterId: 'me', source: 'campfire', reason: '', details: '' })
    expect(reports()[0]).toMatchObject({ reported_user_id: null, reason: null, details: null })
  })

  it('adds the village or group it happened in when both the kind and the id are known', async () => {
    await submitUserReport({ reporterId: 'me', reportedUserId: 'them', source: 'campfire', place: { kind: 'village', id: 12 } })
    expect(reports()[0]).toMatchObject({ place_kind: 'village', place_id: 12 })
  })

  it.each([
    ['no place', null],
    ['a place with no id', { kind: 'village' }],
    ['a place with no kind', { id: 12 }],
  ])('leaves the place out for %s', async (_what, place) => {
    await submitUserReport({ reporterId: 'me', reportedUserId: 'them', source: 'event', place })
    expect(reports()[0]).not.toHaveProperty('place_kind')
    expect(reports()[0]).not.toHaveProperty('place_id')
  })

  it('trims the reason to 200 characters and the details to 1000', async () => {
    await submitUserReport({ reporterId: 'me', reportedUserId: 'them', source: 'messages', reason: 'r'.repeat(250), details: 'd'.repeat(1200) })
    expect(reports()[0].reason).toBe('r'.repeat(200))
    expect(reports()[0].details).toBe('d'.repeat(1000))
  })

  it('does not file anything when nobody is signed in', async () => {
    expect(await submitUserReport({ reporterId: null, reportedUserId: 'them', source: 'profile' })).toEqual({ error: 'Could not submit your report. Try again.' })
    expect(db.calls).toHaveLength(0)
  })

  it('shows a plain sentence, never the technical error, when the database says no', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('user_reports', 'insert', { code: '42501', message: 'new row violates row-level security policy for table "user_reports"' })
    expect(await submitUserReport({ reporterId: 'me', reportedUserId: 'them', source: 'profile' })).toEqual({ error: 'Could not submit your report. Try again.' })
    expect(console.error).toHaveBeenCalled()
  })
})
