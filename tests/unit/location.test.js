// Location, privacy first: VWB never guesses where someone is and never asks the phone.
// Places come only from a town picked for today, a zip for this visit, or the saved zip.
import { describe, expect, it, vi } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'
import {
  distanceMiles, forgetVisitLocation, getMyLocation, getTownToday, lookupZip, saveZip, setTownToday, setVisitZip,
} from '../../src/utils/location'

const RINGGOLD = { zip: '30736', city: 'Ringgold', state: 'GA', latitude: 34.916, longitude: -85.109, label: 'Ringgold, GA' }
const DALTON_TODAY = { lat: 34.77, lng: -84.97, label: 'Dalton, GA', zip: '30720', alerts: 1, expires_at: '2026-11-20T05:00:00.000Z' }
const ZIP_PROFILE = { location_source: 'zip', zip_code: '30741', latitude: '34.95', longitude: '-85.26' }

function blockSessionStorage() {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
}

describe('getMyLocation', () => {
  it('is null when VWB does not know, so the page asks for a zip instead of guessing', () => {
    expect(getMyLocation(null)).toBeNull()
    expect(getMyLocation({})).toBeNull()
  })

  it('uses the center of the zip saved on the profile, as numbers', () => {
    expect(getMyLocation(ZIP_PROFILE)).toEqual({ lat: 34.95, lng: -85.26, source: 'zip', label: '30741' })
  })

  it('ignores a profile place that did not come from a zip', () => {
    expect(getMyLocation({ ...ZIP_PROFILE, location_source: 'device' })).toBeNull()
  })

  it('ignores a saved zip that has no center point yet', () => {
    expect(getMyLocation({ location_source: 'zip', zip_code: '30741', latitude: null, longitude: null })).toBeNull()
  })

  it('a zip chosen for this visit comes before the saved zip', () => {
    setVisitZip(RINGGOLD)
    expect(getMyLocation(ZIP_PROFILE)).toEqual({ lat: 34.916, lng: -85.109, source: 'visit-zip', label: 'Ringgold, GA' })
  })

  it('the town picked for today comes before everything else', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-19T15:00:00-05:00'))
    setVisitZip(RINGGOLD)
    setTownToday(DALTON_TODAY)
    expect(getMyLocation(ZIP_PROFILE)).toEqual({ lat: 34.77, lng: -84.97, source: 'town-today', label: 'Dalton, GA' })
  })

  it('throws away any phone location left over from before, and never uses it', () => {
    sessionStorage.setItem('vwb_device_location', JSON.stringify({ lat: 34.123456, lng: -85.123456 }))
    expect(getMyLocation(null)).toBeNull()
    expect(sessionStorage.getItem('vwb_device_location')).toBeNull()
  })

  it('still finds the saved zip when the browser blocks storage', () => {
    blockSessionStorage()
    expect(getMyLocation(ZIP_PROFILE)).toEqual({ lat: 34.95, lng: -85.26, source: 'zip', label: '30741' })
  })
})

describe('a zip for this visit only', () => {
  it('is kept for this visit (session), never in long-term storage', () => {
    setVisitZip(RINGGOLD)
    expect(sessionStorage.getItem('vwb_session_zip')).not.toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('forgetVisitLocation forgets it', () => {
    setVisitZip(RINGGOLD)
    forgetVisitLocation()
    expect(getMyLocation(null)).toBeNull()
    expect(sessionStorage.getItem('vwb_session_zip')).toBeNull()
  })
})

describe('the town picked for today ("I am in town today")', () => {
  it('keeps a copy of the town for this tab', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-19T15:00:00-05:00'))
    setTownToday(DALTON_TODAY)
    expect(getTownToday()).toEqual({ lat: 34.77, lng: -84.97, label: 'Dalton, GA', zip: '30720', alerts: true, expires_at: '2026-11-20T05:00:00.000Z' })
    expect(localStorage.length).toBe(0)
  })

  it('is gone once midnight Eastern has passed', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-19T23:59:59-05:00'))
    setTownToday(DALTON_TODAY)
    expect(getTownToday()).not.toBeNull()
    vi.setSystemTime(new Date('2026-11-20T00:00:00-05:00'))
    expect(getTownToday()).toBeNull()
    expect(sessionStorage.getItem('vwb_town_today')).toBeNull()
    expect(getMyLocation(ZIP_PROFILE).source).toBe('zip')
  })

  it('forgets the town when told null', () => {
    setTownToday({ ...DALTON_TODAY, expires_at: null })
    setTownToday(null)
    expect(getTownToday()).toBeNull()
  })

  it('does not keep a town the database says is no longer active', () => {
    setTownToday({ ...DALTON_TODAY, expires_at: null })
    setTownToday({ ...DALTON_TODAY, expires_at: null, active: false })
    expect(getTownToday()).toBeNull()
  })

  it('does not keep a town with no point on the map', () => {
    setTownToday({ label: 'Somewhere', lat: null, lng: null })
    expect(getTownToday()).toBeNull()
  })
})

describe('lookupZip', () => {
  it('asks our own database and gives back the place with a "City, ST" label', async () => {
    db.onRpc('lookup_zip', ({ p_zip }) => [{ zip: p_zip, city: 'Ringgold', state: 'GA', latitude: '34.916', longitude: '-85.109' }])
    expect(await lookupZip('30736')).toEqual(RINGGOLD)
    expect(db.rpcCalls('lookup_zip')[0].args).toEqual({ p_zip: '30736' })
  })

  it('reads a zip typed with spaces or a +4 ending', async () => {
    db.onRpc('lookup_zip', ({ p_zip }) => ({ zip: p_zip, city: 'Ringgold', state: 'GA', latitude: 34.916, longitude: -85.109 }))
    expect((await lookupZip(' 30736-1234 ')).zip).toBe('30736')
  })

  it.each(['', null, undefined, '3073', 'abcde'])('does not ask the database about %j', async (raw) => {
    expect(await lookupZip(raw)).toBeNull()
    expect(db.calls).toHaveLength(0)
  })

  it('is null for a zip the database does not know', async () => {
    db.onRpc('lookup_zip', () => [])
    expect(await lookupZip('00000')).toBeNull()
  })

  it('labels the place with the zip when the town name is missing', async () => {
    db.onRpc('lookup_zip', () => [{ zip: '30736', city: null, state: null, latitude: 34.9, longitude: -85.1 }])
    expect((await lookupZip('30736')).label).toBe('30736')
  })

  it('is null when the database cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('lookup_zip', 'rpc')
    expect(await lookupZip('30736')).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  it('lets the saved zip show its town name afterwards, but only for that same zip', async () => {
    db.onRpc('lookup_zip', () => [{ zip: '30741', city: 'Rossville', state: 'GA', latitude: 34.95, longitude: -85.26 }])
    await lookupZip('30741')
    expect(getMyLocation(ZIP_PROFILE).label).toBe('Rossville, GA')
    expect(getMyLocation({ ...ZIP_PROFILE, zip_code: '30736' }).label).toBe('30736')
  })
})

describe('saveZip', () => {
  it("saves the zip on the person's own profile only, and drops the visit zip", async () => {
    db.seed('helper_profiles', [{ user_id: 'me', zip_code: null }, { user_id: 'other', zip_code: '30720' }])
    setVisitZip(RINGGOLD)
    expect(await saveZip('me', '30736')).toBeNull()
    expect(db.rows('helper_profiles')).toEqual([{ user_id: 'me', zip_code: '30736' }, { user_id: 'other', zip_code: '30720' }])
    expect(sessionStorage.getItem('vwb_session_zip')).toBeNull()
  })

  it("shows the database's own words when it turns the zip down", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('helper_profiles', 'update', { code: '22023', message: 'We do not know that zip code yet.' })
    expect(await saveZip('me', '99999')).toBe('We do not know that zip code yet.')
  })

  it('shows a plain sentence, not the technical error, for any other failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('helper_profiles', 'update', { code: '42501', message: 'new row violates row-level security policy' })
    expect(await saveZip('me', '30736')).toBe('Could not save your zip code. Try again.')
  })

  it('keeps the visit zip when saving fails, so the person is not left without a place', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setVisitZip(RINGGOLD)
    db.failNext('helper_profiles', 'update')
    await saveZip('me', '30736')
    expect(getMyLocation(null).source).toBe('visit-zip')
  })
})

describe('distanceMiles', () => {
  it('is zero from a place to itself', () => {
    expect(distanceMiles(34.9, -85.1, 34.9, -85.1)).toBe(0)
  })

  it('measures one degree of latitude as about 69 miles', () => {
    expect(distanceMiles(34, -85, 35, -85)).toBeCloseTo(69.1, 1)
  })

  it('is the same in both directions', () => {
    expect(distanceMiles(34.916, -85.109, 34.77, -84.97)).toBeCloseTo(distanceMiles(34.77, -84.97, 34.916, -85.109), 10)
  })

  it('puts Ringgold and Dalton about 13 miles apart', () => {
    const miles = distanceMiles(34.916, -85.109, 34.7698, -84.9702)
    expect(miles).toBeGreaterThan(12)
    expect(miles).toBeLessThan(14)
  })
})
