// Find Help lists and resource reports: people only ever see messages the database wrote
// for them, and "no ID needed" is only claimed when the listing clearly says no.
import { describe, expect, it, vi } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'
import {
  findHelpForMe, friendlyError, reportResource, requestAreaChange, resourceAreas, resourcesForPlace, saysNo,
} from '../../src/utils/resourceReports'

const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

describe('friendlyError', () => {
  it.each(['P0001', 'P0002', '22023', '42501', '28000'])('shows the message the database wrote for people (code %s)', (code) => {
    expect(friendlyError({ code, message: 'You already reported this listing today.' }, 'Something went wrong.')).toBe('You already reported this listing today.')
  })

  it.each([
    ['a technical error', { code: '23505', message: 'duplicate key value violates unique constraint "resource_reports_pkey"' }],
    ['a network error', { message: 'TypeError: Failed to fetch' }],
    ['a known code with no message', { code: 'P0001', message: '' }],
    ['no error at all', null],
  ])('shows the plain fallback for %s', (_what, error) => {
    expect(friendlyError(error, 'Something went wrong.')).toBe('Something went wrong.')
  })
})

describe('saysNo', () => {
  it.each(['no', 'No', 'NO', '  no  '])('%j clearly says no', (v) => {
    expect(saysNo(v)).toBe(true)
  })

  it.each(['', null, undefined, 'Unknown', 'yes', 'No ID, but bring a bill', 'none', 'not sure', false, 0])('%j does not count as a no', (v) => {
    expect(saysNo(v)).toBe(false)
  })
})

describe('lists of resources', () => {
  it('findHelpForMe gives the list the database picked for this member, or an empty list when it has none', async () => {
    expect(await findHelpForMe()).toEqual({ data: [], error: null })
    db.onRpc('find_help_for_me', () => [{ id: 1, name: 'Food pantry' }])
    expect(await findHelpForMe()).toEqual({ data: [{ id: 1, name: 'Food pantry' }], error: null })
  })

  it('resourcesForPlace asks only about the county a visitor chose, and gives an empty list when it has none', async () => {
    expect(await resourcesForPlace('county-dade')).toEqual({ data: [], error: null })
    db.onRpc('resources_for_place', () => [{ id: 1, name: 'Food pantry' }])
    expect(await resourcesForPlace('county-catoosa')).toEqual({ data: [{ id: 1, name: 'Food pantry' }], error: null })
    expect(db.rpcCalls('resources_for_place').map((c) => c.args)).toEqual([{ p_place: 'county-dade' }, { p_place: 'county-catoosa' }])
  })

  it('both give an empty list along with the error when the database fails', async () => {
    quiet()
    db.failNext('find_help_for_me', 'rpc', { message: 'boom' })
    db.failNext('resources_for_place', 'rpc', { message: 'boom' })
    expect(await findHelpForMe()).toEqual({ data: [], error: { message: 'boom' } })
    expect(await resourcesForPlace('county-catoosa')).toEqual({ data: [], error: { message: 'boom' } })
  })
})

describe('reportResource', () => {
  it('sends the kind and the details, and hands back the thank-you the database wrote', async () => {
    db.onRpc('report_resource', () => 'Thank you. A Hope Ambassador will check.')
    expect(await reportResource(42, 'not_there', 'The number is disconnected')).toEqual({ message: 'Thank you. A Hope Ambassador will check.', error: null })
    expect(db.rpcCalls('report_resource')[0].args).toEqual({ p_resource: 42, p_kind: 'not_there', p_details: 'The number is disconnected' })
  })

  it('sends "no details" as empty, not as blank text', async () => {
    await reportResource(42, 'safety', '')
    expect(db.rpcCalls('report_resource')[0].args.p_details).toBeNull()
  })

  it('hands back the error when the report could not be filed', async () => {
    quiet()
    db.failNext('report_resource', 'rpc', { code: 'P0001', message: 'You already reported this listing today.' })
    expect(await reportResource(42, 'safety')).toEqual({ message: null, error: { code: 'P0001', message: 'You already reported this listing today.' } })
  })
})

describe('requestAreaChange', () => {
  it('sends the places to add and drop', async () => {
    expect(await requestAreaChange(42, ['county-walker'], ['county-dade'], undefined)).toEqual({ error: null })
    expect(db.rpcCalls('request_area_change')[0].args).toEqual({ p_resource: 42, p_add: ['county-walker'], p_drop: ['county-dade'], p_details: null })
  })

  it('hands back the error when it fails', async () => {
    quiet()
    db.failNext('request_area_change', 'rpc', { message: 'boom' })
    expect(await requestAreaChange(42, [], [], 'why')).toEqual({ error: { message: 'boom' } })
  })
})

describe('resourceAreas (where a resource serves)', () => {
  function seedAreas() {
    db.seed('resource_service_areas', [
      { resource_id: 42, place_id: 'county-catoosa', status: 'verified' },
      { resource_id: 42, place_id: 'county-hamilton', status: 'verified' },
      { resource_id: 42, place_id: 'state-al', status: 'verified' },
      { resource_id: 42, place_id: 'county-walker', status: 'pending' },
      { resource_id: 99, place_id: 'county-dade', status: 'verified' },
    ])
    db.seed('places', [
      { id: 'state-ga', name: 'Georgia', short_name: 'GA', parent_id: null },
      { id: 'state-tn', name: 'Tennessee', short_name: null, parent_id: null },
      { id: 'state-al', name: 'Alabama', short_name: 'AL', parent_id: null },
      { id: 'county-catoosa', name: 'Catoosa County', parent_id: 'state-ga' },
      { id: 'county-hamilton', name: 'Hamilton County', parent_id: 'state-tn' },
      { id: 'county-walker', name: 'Walker County', parent_id: 'state-ga' },
      { id: 'county-dade', name: 'Dade County', parent_id: 'state-ga' },
    ])
  }
  const byId = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id))

  it('lists only the verified areas of that resource, named "County, ST"', async () => {
    seedAreas()
    const { data, error } = await resourceAreas(42)
    expect(error).toBeNull()
    expect(byId(data)).toEqual([
      { id: 'county-catoosa', label: 'Catoosa County, GA' },
      { id: 'county-hamilton', label: 'Hamilton County, Tennessee' },
      { id: 'state-al', label: 'Alabama' },
    ])
  })

  it('is an empty list, without looking up names, for a resource with no verified areas', async () => {
    seedAreas()
    expect(await resourceAreas(7)).toEqual({ data: [], error: null })
    expect(db.callsTo('places')).toHaveLength(0)
  })

  it('gives an empty list along with the error when the areas cannot load', async () => {
    quiet()
    seedAreas()
    db.failNext('resource_service_areas', 'select', { message: 'boom' })
    expect(await resourceAreas(42)).toEqual({ data: [], error: { message: 'boom' } })
  })

  it('still lists the areas, by id, when their names cannot load', async () => {
    quiet()
    seedAreas()
    db.failNext('places', 'select')
    const { data, error } = await resourceAreas(42)
    expect(error).toBeNull()
    expect(byId(data)).toEqual([
      { id: 'county-catoosa', label: 'county-catoosa' },
      { id: 'county-hamilton', label: 'county-hamilton' },
      { id: 'state-al', label: 'state-al' },
    ])
  })

  it('still lists the areas, without the state, when the state names cannot load', async () => {
    quiet()
    seedAreas()
    // Let the first look at places through (the area names) and fail the second (the states).
    db.failNext('places', 'select', undefined, { skip: 1 })
    const { data } = await resourceAreas(42)
    expect(byId(data).map((a) => a.label)).toEqual(['Catoosa County', 'Hamilton County', 'Alabama'])
  })
})
