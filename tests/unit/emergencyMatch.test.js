// Before a new emergency report goes out, the app asks "Is this the same one?" when a
// very similar report is already active, so neighbors are not alerted twice for one flood.
import { describe, expect, it } from 'vitest'
import { bestMatch, eventSimilarity } from '../../src/utils/emergencyMatch'

const FLOOD = {
  id: 1,
  event_type: 'flood',
  title: 'Flooding on Main Street',
  description: 'Water over the road near the bridge',
  location_name: 'Main Street bridge',
}
const TREE = {
  id: 2,
  event_type: 'storm',
  title: 'Tree down on Oak Road',
  description: 'Big oak across both lanes',
  location_name: 'Oak Road',
}

describe('eventSimilarity', () => {
  it('scores a word-for-word repeat as the same event', () => {
    const draft = { eventType: 'flood', title: 'Flooding on Main Street', description: 'Water over the road near the bridge', locationName: 'Main Street bridge' }
    expect(eventSimilarity(draft, FLOOD)).toBeCloseTo(1, 10)
  })

  it('ignores capitals and spaces around the words', () => {
    const draft = { eventType: 'flood', title: '  flooding on main street ', description: 'WATER OVER THE ROAD NEAR THE BRIDGE', locationName: 'main street bridge' }
    expect(eventSimilarity(draft, FLOOD)).toBeCloseTo(1, 10)
  })

  it('weighs the kind of emergency 30%, the title 35%, the place 20% and the description 15%', () => {
    const other = { eventType: 'fire', title: 'smoke', description: 'chimney', locationName: 'elm' }
    const score = (change) => eventSimilarity({ ...other, ...change }, FLOOD)
    expect(score({})).toBe(0)
    expect(score({ eventType: 'flood' })).toBeCloseTo(0.30, 10)
    expect(score({ title: FLOOD.title })).toBeCloseTo(0.35, 10)
    expect(score({ locationName: FLOOD.location_name })).toBeCloseTo(0.20, 10)
    expect(score({ description: FLOOD.description })).toBeCloseTo(0.15, 10)
  })

  it('gives part credit for a title that shares some of its words', () => {
    // "tree down oak road" shares 4 of the 5 different words in "Tree down on Oak Road".
    const draft = { eventType: 'fire', title: 'tree down oak road', description: 'x', locationName: 'y' }
    expect(eventSimilarity(draft, TREE)).toBeCloseTo(0.35 * 4 / 5, 10)
  })

  it('counts a part both reports left blank as the same, and a part only one filled in as different', () => {
    const bare = { event_type: 'flood', title: 'Flood', description: null, location_name: null }
    expect(eventSimilarity({ eventType: 'flood', title: 'Flood', description: '', locationName: undefined }, bare)).toBeCloseTo(1, 10)
    expect(eventSimilarity({ eventType: 'flood', title: 'Flood', description: 'Creek is rising', locationName: '' }, bare)).toBeCloseTo(0.85, 10)
  })
})

describe('bestMatch', () => {
  it('finds the active report that a new one repeats', () => {
    const draft = { eventType: 'flood', title: 'flooding on main street', description: '', locationName: 'Main Street bridge' }
    expect(bestMatch(draft, [TREE, FLOOD])).toBe(FLOOD)
  })

  it('picks the closest one when more than one is similar', () => {
    const nearby = { ...FLOOD, id: 3, title: 'Flooding on Main Street by the school', location_name: 'Main Street school' }
    const draft = { eventType: 'flood', title: 'Flooding on Main Street', description: 'Water over the road near the bridge', locationName: 'Main Street bridge' }
    expect(bestMatch(draft, [nearby, FLOOD]).id).toBe(1)
    expect(bestMatch(draft, [FLOOD, nearby]).id).toBe(1)
  })

  it('does not ask about a different emergency of the same kind', () => {
    const draft = { eventType: 'flood', title: 'Creek over its banks', description: 'Yards under water', locationName: 'Mill Creek Road' }
    expect(bestMatch(draft, [FLOOD, TREE])).toBeNull()
  })

  it('does not match on the same kind and title alone when the place and details differ', () => {
    const draft = { eventType: 'flood', title: 'Flooding on Main Street', description: 'Basement filling up', locationName: 'Dalton' }
    expect(eventSimilarity(draft, FLOOD)).toBeLessThan(0.70)
    expect(bestMatch(draft, [FLOOD])).toBeNull()
  })

  it('finds nothing when there are no active emergencies', () => {
    const draft = { eventType: 'flood', title: 'Flood', description: '', locationName: '' }
    expect(bestMatch(draft, [])).toBeNull()
    expect(bestMatch(draft, null)).toBeNull()
    expect(bestMatch(draft, undefined)).toBeNull()
  })
})
