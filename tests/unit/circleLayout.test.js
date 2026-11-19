// The village map draws each village as a circle. Circles overlap only where villages
// really share zip codes, and no name may sit on top of another, or the map tells a lie.
import { describe, expect, it } from 'vitest'
import { circleLayout, labelWidth } from '../../src/utils/circleLayout'

const RINGGOLD = { id: 1, name: 'Ringgold', latitude: 34.916, longitude: -85.109 }
const FORT_O = { id: 2, name: 'Fort Oglethorpe', latitude: 34.949, longitude: -85.257 }
const DALTON = { id: 3, name: 'Dalton', latitude: 34.77, longitude: -84.97 }
const CHATTANOOGA = { id: 4, name: 'Chattanooga', latitude: 35.045, longitude: -85.31, zip_count: 9 }
const VILLAGES = [RINGGOLD, FORT_O, DALTON, CHATTANOOGA]
// Ringgold and Fort Oglethorpe share one zip code. Nobody else shares any.
const ZIPS = {
  1: [{ zip: '30736' }, { zip: '30742' }],
  2: [{ zip: '30742' }, { zip: '30741' }],
  3: [{ zip: '30720' }, { zip: '30721' }, { zip: '30722' }],
}

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r
const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

describe('labelWidth', () => {
  it('makes room for longer names', () => {
    expect(labelWidth('Ringgold')).toBe(78)
    expect(labelWidth('Fort Oglethorpe')).toBeGreaterThan(labelWidth('Ringgold'))
    expect(labelWidth('')).toBe(22)
    expect(labelWidth(null)).toBe(22)
  })
})

describe('circleLayout', () => {
  const map = circleLayout(VILLAGES, ZIPS)

  it('draws one circle and one name per village, in the order given', () => {
    expect(map.nodes).toHaveLength(4)
    expect(map.labels).toHaveLength(4)
    for (const n of map.nodes) expect([n.x, n.y, n.r].every(Number.isFinite)).toBe(true)
  })

  it('sizes a circle by how many zip codes the village covers, within a smallest and largest size', () => {
    const radius = (zipCount) => circleLayout([{ ...RINGGOLD, zip_count: zipCount }], {}).nodes[0].r
    expect(radius(1)).toBe(35)
    expect(radius(4)).toBe(42)
    expect(radius(9)).toBe(49)
    expect(radius(400)).toBe(62) // never bigger than this
    expect(radius(0)).toBe(35) // a village with no zip codes yet still gets a circle
    expect(radius(undefined)).toBe(35)
    for (const n of map.nodes) {
      expect(n.r).toBeGreaterThanOrEqual(32)
      expect(n.r).toBeLessThanOrEqual(62)
    }
  })

  it('counts the zip codes from the map points when it has them, not the saved number', () => {
    const one = circleLayout([{ ...RINGGOLD, zip_count: 9 }], { 1: [{ zip: '30736' }, { zip: '30736' }, { zip: '30742' }] })
    // Two different zip codes, even though one has two points.
    expect(one.nodes[0].r).toBeCloseTo(28 + 7 * Math.sqrt(2), 10)
  })

  it('overlaps the two villages that share a zip code, and marks the shared border once', () => {
    const [ringgold, fortO] = map.nodes
    expect(gap(ringgold, fortO)).toBeLessThan(0)
    expect(map.links).toHaveLength(1)
    expect(map.links[0]).toMatchObject({ i: 0, j: 1, shared: 1 })
    // The dot sits inside both circles.
    const dot = { x: map.links[0].mx, y: map.links[0].my, r: 0 }
    expect(gap(dot, ringgold)).toBeLessThan(0)
    expect(gap(dot, fortO)).toBeLessThan(0)
  })

  it('never lets villages that share nothing touch', () => {
    const pairs = [[0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]
    for (const [i, j] of pairs) expect(gap(map.nodes[i], map.nodes[j])).toBeGreaterThan(0)
  })

  it('pushes apart villages that sit on the very same spot', () => {
    const twins = circleLayout([{ id: 1, name: 'North', latitude: 34.9, longitude: -85.1 }, { id: 2, name: 'South', latitude: 34.9, longitude: -85.1 }], {})
    expect(gap(twins.nodes[0], twins.nodes[1])).toBeGreaterThan(30)
    expect(twins.links).toEqual([])
  })

  it('keeps every name clear of the other names, even in a crowded map', () => {
    const crowd = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      name: 'Village number ' + (i + 1),
      latitude: 34.9 + (i % 4) * 0.01,
      longitude: -85.1 + Math.floor(i / 4) * 0.01,
    }))
    for (const layout of [map, circleLayout(crowd, {})]) {
      layout.labels.forEach((a, i) => layout.labels.forEach((b, j) => {
        if (j > i) expect(overlap(a, b)).toBe(false)
      }))
    }
  })

  it('makes each name pill wide enough for its name', () => {
    map.labels.forEach((label, i) => {
      expect(label.right - label.left).toBeCloseTo(labelWidth(VILLAGES[i].name), 6)
    })
  })

  it('frames the picture so every circle and every name fits inside', () => {
    const [x, y, w, h] = map.vb
    for (const n of map.nodes) {
      expect(n.x - n.r).toBeGreaterThanOrEqual(x)
      expect(n.x + n.r).toBeLessThanOrEqual(x + w)
      expect(n.y - n.r).toBeGreaterThanOrEqual(y)
      expect(n.y + n.r).toBeLessThanOrEqual(y + h)
    }
    for (const l of map.labels) {
      expect(l.left).toBeGreaterThanOrEqual(x)
      expect(l.right).toBeLessThanOrEqual(x + w)
      expect(l.top).toBeGreaterThanOrEqual(y)
      expect(l.bottom).toBeLessThanOrEqual(y + h)
    }
  })

  it('draws a single village in the middle of a frame that is never tiny', () => {
    const solo = circleLayout([RINGGOLD], {})
    const [x, , w, h] = solo.vb
    expect(solo.nodes).toHaveLength(1)
    expect(solo.links).toEqual([])
    expect([w, h]).toEqual([280, 220])
    expect(solo.nodes[0].x).toBeCloseTo(x + w / 2, 6)
    // The name goes under the circle when nothing is in the way.
    expect(solo.labels[0].ty).toBeGreaterThan(solo.nodes[0].y + solo.nodes[0].r)
    expect(solo.labels[0].tx).toBe(solo.nodes[0].x)
  })

  it('gives the same picture every time for the same villages', () => {
    expect(circleLayout(VILLAGES, ZIPS)).toEqual(map)
  })
})
