// People in a hard spot type everyday words ("rides", "power bill"). The library search
// has to find the help even when the listing uses the official words for it.
import { describe, expect, it } from 'vitest'
import { resourceMatches, searchResources, searchScore, stem, WORD_FAMILIES } from '../../src/utils/resourceSearch'

const TRANSIT = { name: 'Catoosa Trans-Aid', description: 'Free transportation to medical appointments.' }
const LIHEAP = { name: 'LIHEAP', description: 'Energy assistance for heating and cooling costs.' }
const PANTRY = { name: 'Ringgold Food Pantry', categories: ['Food'], description: 'Groceries every Tuesday.', neighborhood: 'Ringgold' }
const DALTON_MEALS = { name: 'Dalton Community Kitchen', categories: ['Food'], description: 'Hot meals on weekdays.', neighborhood: 'Dalton' }
const ALL = [TRANSIT, LIHEAP, PANTRY, DALTON_MEALS]

const names = (list) => list.map((r) => r.name)

describe('stem', () => {
  it.each([
    ['rides', 'ride'],
    ['Bills', 'bill'],
    ['families', 'family'],
    ['classes', 'class'],
    ['boxes', 'box'],
    ['tutoring', 'tutor'],
    ['glass', 'glass'],
    ['bus', 'bus'],
    ['food', 'food'],
  ])('turns "%s" into "%s"', (word, expected) => {
    expect(stem(word)).toBe(expected)
  })
})

describe('searching with everyday words', () => {
  it('finds a listing that says "transportation" when someone types "rides"', () => {
    expect(names(searchResources(ALL, 'rides'))).toEqual(['Catoosa Trans-Aid'])
    expect(names(searchResources(ALL, 'bus'))).toEqual(['Catoosa Trans-Aid'])
  })

  it('finds a listing that says "energy assistance" when someone types "power bill"', () => {
    expect(names(searchResources(ALL, 'power bill'))).toEqual(['LIHEAP'])
    expect(names(searchResources(ALL, 'light bill'))).toEqual(['LIHEAP'])
  })

  it('matches one and many of a word either way round', () => {
    expect(resourceMatches({ name: 'Rides to the doctor' }, 'ride')).toBe(true)
    expect(resourceMatches({ name: 'Help with a bill' }, 'bills')).toBe(true)
    expect(resourceMatches({ name: 'Senior center' }, 'seniors')).toBe(true)
  })

  it('ignores capitals and punctuation', () => {
    expect(names(searchResources(ALL, '  FOOD!!! '))).toEqual(names(searchResources(ALL, 'food')))
    expect(resourceMatches(PANTRY, "what's for dinner?")).toBe(true)
  })

  it('ignores filler words like "help with" and "near me"', () => {
    expect(names(searchResources(ALL, 'I need help with food near me'))).toEqual(names(searchResources(ALL, 'food')))
    expect(searchScore(PANTRY, 'help with food')).toBe(searchScore(PANTRY, 'food'))
  })

  it('matches a whole family word, not the start of some other word', () => {
    // "va" is in the veterans family. It must not find a van.
    expect(resourceMatches({ name: 'Van rides for seniors' }, 'va')).toBe(false)
    expect(resourceMatches({ name: 'VA clinic' }, 'va')).toBe(true)
  })

  it('finds nothing for a need no listing speaks to', () => {
    expect(searchResources(ALL, 'diapers')).toEqual([])
    expect(searchScore(PANTRY, 'diapers')).toBe(0)
  })
})

describe('searching with a name or a place', () => {
  it('narrows the list by a word that is not in any family, like a town', () => {
    expect(names(searchResources(ALL, 'ringgold'))).toEqual(['Ringgold Food Pantry'])
  })

  it('matches on the start of a word, so a half-typed town still works', () => {
    expect(names(searchResources(ALL, 'ring'))).toEqual(['Ringgold Food Pantry'])
    expect(names(searchResources(ALL, 'cato'))).toEqual(['Catoosa Trans-Aid'])
  })

  it('needs every such word to appear', () => {
    expect(resourceMatches(PANTRY, 'ringgold tuesday')).toBe(true)
    expect(resourceMatches(PANTRY, 'ringgold friday')).toBe(false)
  })

  it('looks in the group name, who it serves, and the zip codes too', () => {
    const r = { name: 'Warm coats', organizations: { name: 'Northside Church' }, serves: ['Veterans'], zips: ['30736', '30741'] }
    expect(resourceMatches(r, 'northside')).toBe(true)
    expect(resourceMatches(r, '30741')).toBe(true)
    expect(resourceMatches(r, '30720')).toBe(false)
  })

  it('keeps food help from other towns when a town is typed with a need, and lists that town\'s first when the listings are alike', () => {
    const inRinggold = { name: 'Northside Food Pantry', neighborhood: 'Ringgold' }
    const inDalton = { name: 'Eastside Food Pantry', neighborhood: 'Dalton' }
    expect(names(searchResources([inRinggold, inDalton], 'food dalton'))).toEqual(['Eastside Food Pantry', 'Northside Food Pantry'])
    // The extra word only adds. It never hides a listing that matches the need.
    expect(names(searchResources(ALL, 'food dalton')).sort()).toEqual(['Dalton Community Kitchen', 'Ringgold Food Pantry'])
  })
})

describe('what counts most', () => {
  it('lists a match in the name first, then the kind of help, then the description', () => {
    const inDescription = { name: 'Northside Church', description: 'Food boxes on request.' }
    const inCategory = { name: 'Helping Hands', categories: ['Food'] }
    const inName = { name: 'Food Pantry' }
    expect(names(searchResources([inDescription, inCategory, inName], 'food'))).toEqual(['Food Pantry', 'Helping Hands', 'Northside Church'])
  })

  it('counts search keywords on a listing as strongly as its name', () => {
    const tagged = { name: 'Helping Hands', keywords: ['diapers', 'formula'] }
    const taggedText = { name: 'Open Door', keywords: 'diapers wipes' }
    const mentioned = { name: 'Northside Church', description: 'We sometimes have diapers.' }
    expect(names(searchResources([mentioned, tagged], 'baby'))).toEqual(['Helping Hands', 'Northside Church'])
    expect(searchScore(taggedText, 'diapers')).toBe(searchScore({ name: 'Diapers' }, 'diapers'))
  })

  it('finds a listing filed under an old kind-of-help name by the new name', () => {
    const old = { name: 'Coat drop box', category: 'Donation Points' } // now "Give and Get Involved"
    expect(resourceMatches(old, 'involved')).toBe(true)
    expect(resourceMatches({ name: 'Coat drop box', category: 'Clothing and Household' }, 'involved')).toBe(false)
  })
})

describe('an empty search', () => {
  it('gives back the same list, untouched', () => {
    expect(searchResources(ALL, '')).toBe(ALL)
    expect(searchResources(ALL, '   ')).toBe(ALL)
    expect(searchResources(ALL, null)).toBe(ALL)
    expect(resourceMatches(PANTRY, undefined)).toBe(true)
  })

  it('shows everything when only filler words or punctuation were typed', () => {
    expect(names(searchResources(ALL, 'help near me'))).toEqual(names(ALL))
    expect(names(searchResources(ALL, '???'))).toEqual(names(ALL))
  })
})

describe('WORD_FAMILIES', () => {
  it('holds only lowercase words with no stray spaces, so typed words can line up with them', () => {
    for (const family of WORD_FAMILIES) {
      expect(family.length).toBeGreaterThan(1)
      for (const word of family) expect(word).toBe(word.toLowerCase().trim())
    }
  })
})
