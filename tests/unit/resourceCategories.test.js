// Every listing sits under one of a fixed set of kinds of help, however it was spelled
// when it came in. Asking for a kind of help has to reach neighbors with the matching skill.
import { describe, expect, it } from 'vitest'
import { SKILL_GROUPS } from '../../src/utils/skillGroups'
import {
  CATEGORIES, CATEGORY_SKILLS, CAT_ICON_FILES, OLD_CATEGORY_NAMES,
  categoriesForSkill, currentCategory, resourceCats, resourceMatches, skillsForCategory,
} from '../../src/utils/resourceCategories'

describe('the list of kinds of help', () => {
  it('has no repeats and ends with the two that are not kinds of help', () => {
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length)
    expect(CATEGORIES.slice(-2)).toEqual(['Give and Get Involved', 'Other'])
  })

  it('has a picture for every kind, and no picture for a kind that does not exist', () => {
    expect(Object.keys(CAT_ICON_FILES).sort()).toEqual([...CATEGORIES].sort())
  })

  it('points every old name at a kind that exists today', () => {
    for (const [oldName, newName] of Object.entries(OLD_CATEGORY_NAMES)) {
      expect(CATEGORIES).toContain(newName)
      expect(CATEGORIES).not.toContain(oldName)
    }
  })
})

describe('currentCategory', () => {
  it('keeps a current name, whatever the capitals or spaces around it', () => {
    expect(currentCategory('Bills and Utilities')).toBe('Bills and Utilities')
    expect(currentCategory('  bills AND utilities ')).toBe('Bills and Utilities')
  })

  it.each([
    ['Tenant Rights', 'Legal and Tenant Help'],
    ['recovery support', 'Mental Health and Recovery'],
    ['Donation Points', 'Give and Get Involved'],
    ['Advocacy and Organizing', 'Give and Get Involved'],
    ['Government', 'Money and Benefits'],
  ])('moves the old name "%s" to "%s"', (oldName, newName) => {
    expect(currentCategory(oldName)).toBe(newName)
  })

  it.each([
    ['food', 'Food'],
    ['Transportation', 'Rides'],
    ['shelter', 'Housing'],
    ['Child Care', 'Family and Child Care'],
    ['SENIORS', 'Disability and Aging'],
    ['211', 'Help Finding Help'],
    ['pet food', 'Pets'],
  ])('files the loose name "%s" under "%s"', (loose, name) => {
    expect(currentCategory(loose)).toBe(name)
  })

  it('files a name it does not know under Other, so no kind ever shows twice', () => {
    expect(currentCategory('Basket weaving')).toBe('Other')
    expect(currentCategory('Food and Meals and More')).toBe('Other')
  })

  it.each([[''], ['   '], [null], [undefined]])('gives nothing for the empty value %j', (value) => {
    expect(currentCategory(value)).toBe('')
  })
})

describe('resourceCats', () => {
  it('lists each kind of help once, in today\'s names', () => {
    expect(resourceCats({ categories: ['Tenant Rights', 'legal', 'Housing'] })).toEqual(['Legal and Tenant Help', 'Housing'])
  })

  it('falls back to the old single-category field, then to Other', () => {
    expect(resourceCats({ category: 'Government' })).toEqual(['Money and Benefits'])
    expect(resourceCats({ categories: [], category: 'food' })).toEqual(['Food'])
    expect(resourceCats({})).toEqual(['Other'])
  })
})

describe('kinds of help and neighbors\' skills', () => {
  it('only links kinds of help that exist, and leaves out the three that should not ask neighbors', () => {
    for (const cat of Object.keys(CATEGORY_SKILLS)) expect(CATEGORIES).toContain(cat)
    // Safety needs trained help first. The other two are not asks.
    for (const cat of ['Safety', 'Give and Get Involved', 'Other']) {
      expect(CATEGORY_SKILLS[cat]).toBeUndefined()
      expect(skillsForCategory(cat, ['Food and Meals', 'Legal Help'])).toEqual([])
    }
  })

  it('only names skills that are in the app\'s built-in skill list', () => {
    const builtIn = SKILL_GROUPS.flatMap((g) => g.skills)
    for (const skills of Object.values(CATEGORY_SKILLS)) {
      for (const skill of skills) expect(builtIn).toContain(skill)
    }
  })

  it('picks the skills for a kind of help, best fit first, spelled the way the database spells them', () => {
    const fromDatabase = ['Car Repair & Mechanics', 'Food & Meals', 'Rides & Transportation', 'Legal Help']
    expect(skillsForCategory('Rides', fromDatabase)).toEqual(['Rides & Transportation', 'Car Repair & Mechanics'])
    expect(skillsForCategory('Food', fromDatabase)).toEqual(['Food & Meals'])
  })

  it('accepts an old or loose name for the kind of help', () => {
    expect(skillsForCategory('Tenant Rights', ['Legal Help', 'Paperwork and Benefits'])).toEqual(['Legal Help', 'Paperwork and Benefits'])
    expect(skillsForCategory('transportation', ['Transportation'])).toEqual(['Transportation'])
  })

  it('gives no skills when the skill list has not loaded or nothing fits', () => {
    expect(skillsForCategory('Food', null)).toEqual([])
    expect(skillsForCategory('Food', ['Plumbing'])).toEqual([])
    expect(skillsForCategory('Basket weaving', ['Plumbing'])).toEqual([])
  })

  it('tells a helper which kinds of help their skill answers', () => {
    expect(categoriesForSkill('Food & Meals')).toEqual(['Food'])
    expect(categoriesForSkill('caregiving')).toEqual(['Health', 'Family and Child Care', 'Disability and Aging'])
    expect(categoriesForSkill('Welding and Metalwork')).toEqual([])
  })
})

describe('resourceMatches (plain word search)', () => {
  const pantry = {
    name: 'Ringgold Food Pantry',
    description: 'Groceries every Tuesday',
    category: 'Donation Points',
    organizations: { name: 'Northside Church' },
    serves: ['Seniors'],
    zips: ['30736'],
  }

  it('matches when every typed word shows up somewhere in the listing', () => {
    expect(resourceMatches(pantry, 'ringgold tuesday')).toBe(true)
    expect(resourceMatches(pantry, 'RINGGOLD  friday')).toBe(false)
  })

  it('looks in the group name, who it serves, zip codes, and today\'s name for its kind of help', () => {
    expect(resourceMatches(pantry, 'northside')).toBe(true)
    expect(resourceMatches(pantry, 'seniors')).toBe(true)
    expect(resourceMatches(pantry, '30736')).toBe(true)
    expect(resourceMatches(pantry, 'get involved')).toBe(true)
  })

  it('matches everything when nothing is typed', () => {
    expect(resourceMatches(pantry, '')).toBe(true)
    expect(resourceMatches(pantry, '   ')).toBe(true)
    expect(resourceMatches({}, null)).toBe(true)
  })
})
