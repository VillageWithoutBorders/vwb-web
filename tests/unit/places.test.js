// Places: named areas instead of ZIP codes. A signed-out visitor's area stays on their
// own device (only its id and name), and a failed lookup gives an empty list, not a crash.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'
import { getMyPlaces, getVisitorArea, nearestPlaces, saveMyPlaces, searchPlaces, setVisitorArea } from '../../src/utils/places'

const CATOOSA = { id: 'county-catoosa', name: 'Catoosa County' }

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('searchPlaces', () => {
  it('asks for up to 8 places that match the typed words, without the spaces around them', async () => {
    db.onRpc('search_places', () => [CATOOSA])
    expect(await searchPlaces('  Catoosa ')).toEqual({ data: [CATOOSA], error: null })
    expect(db.rpcCalls('search_places')[0].args).toEqual({ p_query: 'Catoosa', p_limit: 8 })
  })

  it.each(['', ' ', 'C', ' C ', null, undefined])('does not search for %j (too short to mean anything)', async (text) => {
    expect(await searchPlaces(text)).toEqual({ data: [], error: null })
    expect(db.calls).toHaveLength(0)
  })

  it('gives an empty list along with the error when the search fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('search_places', 'rpc', { message: 'boom' })
    expect(await searchPlaces('Catoosa')).toEqual({ data: [], error: { message: 'boom' } })
  })
})

describe('nearestPlaces', () => {
  it('asks for the 3 places closest to a point', async () => {
    db.onRpc('nearest_places', () => [CATOOSA])
    expect(await nearestPlaces(34.9, -85.1)).toEqual({ data: [CATOOSA], error: null })
    expect(db.rpcCalls('nearest_places')[0].args).toEqual({ p_lat: 34.9, p_lng: -85.1, p_limit: 3 })
  })

  it('gives an empty list along with the error when it fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('nearest_places', 'rpc', { message: 'boom' })
    expect(await nearestPlaces(34.9, -85.1)).toEqual({ data: [], error: { message: 'boom' } })
  })
})

describe('my places (signed in)', () => {
  it('getMyPlaces gives the saved places, or an empty list when there are none', async () => {
    expect(await getMyPlaces()).toEqual({ data: [], error: null })
    db.onRpc('my_places', () => [CATOOSA])
    expect(await getMyPlaces()).toEqual({ data: [CATOOSA], error: null })
  })

  it('getMyPlaces gives an empty list along with the error when it fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('my_places', 'rpc', { message: 'boom' })
    expect(await getMyPlaces()).toEqual({ data: [], error: { message: 'boom' } })
  })

  it('saveMyPlaces sends the chosen place ids and reports whether it worked', async () => {
    expect(await saveMyPlaces(['county-catoosa', 'county-walker'])).toEqual({ error: null })
    expect(db.rpcCalls('set_my_places')[0].args).toEqual({ p_place_ids: ['county-catoosa', 'county-walker'] })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('set_my_places', 'rpc', { message: 'boom' })
    expect(await saveMyPlaces([])).toEqual({ error: { message: 'boom' } })
  })
})

describe("a signed-out visitor's area", () => {
  it('is nothing until they choose one', () => {
    expect(getVisitorArea()).toBeNull()
  })

  it('stays on this device and is never sent to VWB', () => {
    setVisitorArea({ id: 'county-catoosa', label: 'Catoosa County, GA' })
    expect(getVisitorArea()).toEqual({ id: 'county-catoosa', label: 'Catoosa County, GA' })
    expect(db.calls).toHaveLength(0)
  })

  it('keeps only the id and the name of the area, nothing else about the visitor', () => {
    setVisitorArea({ id: 'county-catoosa', label: 'Catoosa County, GA', latitude: 34.9, longitude: -85.1, zip: '30736' })
    expect(JSON.parse(localStorage.getItem('vwb-visitor-area'))).toEqual({ id: 'county-catoosa', label: 'Catoosa County, GA' })
  })

  it('is forgotten when cleared', () => {
    setVisitorArea({ id: 'county-catoosa', label: 'Catoosa County, GA' })
    setVisitorArea(null)
    expect(getVisitorArea()).toBeNull()
    expect(localStorage.getItem('vwb-visitor-area')).toBeNull()
  })

  it.each([
    ['damaged data', '{not json'],
    ['an area with no name', JSON.stringify({ id: 'county-catoosa' })],
    ['an id that is not text', JSON.stringify({ id: 12, label: 'Catoosa County, GA' })],
    ['something that is not an area', JSON.stringify('county-catoosa')],
  ])('ignores %s saved on the device', (_what, raw) => {
    localStorage.setItem('vwb-visitor-area', raw)
    expect(getVisitorArea()).toBeNull()
  })

  it('works for this page only, without breaking, when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => setVisitorArea({ id: 'county-catoosa', label: 'Catoosa County, GA' })).not.toThrow()
    expect(getVisitorArea()).toBeNull()
  })
})

describe('placesEnabled (the CRN preview switch)', () => {
  it('is off unless the build turns it on', async () => {
    vi.stubEnv('VITE_CRN_PREVIEW', '')
    vi.resetModules()
    expect((await import('../../src/utils/places')).placesEnabled).toBe(false)
  })

  it('is on only for the exact value "1"', async () => {
    vi.stubEnv('VITE_CRN_PREVIEW', '1')
    vi.resetModules()
    expect((await import('../../src/utils/places')).placesEnabled).toBe(true)
    vi.stubEnv('VITE_CRN_PREVIEW', 'true')
    vi.resetModules()
    expect((await import('../../src/utils/places')).placesEnabled).toBe(false)
  })
})
