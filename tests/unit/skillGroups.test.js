// Skill chips sit under a few plain headers. A skill the database adds later must still
// show up, and Ask for Help has to keep working with no signal.
import { describe, expect, it, vi } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'
import {
  OFFER_ITEM_CATEGORIES, OTHER_GROUP, SKILL_GROUPS,
  groupSkills, loadSkillCategories, offerSkillRows,
} from '../../src/utils/skillGroups'

const goOffline = () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
const builtInCount = SKILL_GROUPS.reduce((n, g) => n + g.skills.length, 0)

describe('SKILL_GROUPS', () => {
  it('lists each skill under exactly one header', () => {
    const all = SKILL_GROUPS.flatMap((g) => g.skills)
    expect(new Set(all).size).toBe(all.length)
    const headers = SKILL_GROUPS.map((g) => g.name)
    expect(new Set(headers).size).toBe(headers.length)
    expect(headers).not.toContain(OTHER_GROUP)
  })
})

describe('loadSkillCategories', () => {
  it('sorts the database\'s skills by header, then in the order the headers list them', async () => {
    db.seed('skill_categories', [
      { title: 'Plumbing' },
      { title: 'Caregiving' },
      { title: 'Tech Help' },
      { title: 'Home Repair' },
      { title: 'Food and Meals' },
      { title: 'Childcare' },
    ])
    expect(await loadSkillCategories()).toEqual([
      { title: 'Food and Meals', group: 'Everyday Help' },
      { title: 'Tech Help', group: 'Everyday Help' },
      { title: 'Home Repair', group: 'Home and Storm Help' },
      { title: 'Childcare', group: 'Care and Support' },
      { title: 'Caregiving', group: 'Care and Support' },
      { title: 'Plumbing', group: 'Trades and Trained Skills' },
    ])
  })

  it('treats "&" and "and" as the same skill, keeping the database\'s spelling', async () => {
    db.seed('skill_categories', [{ title: 'Tree & Yard Work' }, { title: 'Food & Meals' }])
    expect(await loadSkillCategories()).toEqual([
      { title: 'Food & Meals', group: 'Everyday Help' },
      { title: 'Tree & Yard Work', group: 'Home and Storm Help' },
    ])
  })

  it('still shows a skill it has never heard of, last, under "More Ways to Help"', async () => {
    db.seed('skill_categories', [{ title: 'Sewing' }, { title: 'Beekeeping' }, { title: 'Legal Help' }])
    expect(await loadSkillCategories()).toEqual([
      { title: 'Legal Help', group: 'Trades and Trained Skills' },
      { title: 'Beekeeping', group: OTHER_GROUP },
      { title: 'Sewing', group: OTHER_GROUP },
    ])
  })

  it('lets a header set in the database win over the built-in one', async () => {
    db.seed('skill_categories', [{ title: 'Plumbing', group_name: 'Everyday Help' }, { title: 'Food and Meals', group_name: null }])
    expect(await loadSkillCategories()).toEqual([
      { title: 'Food and Meals', group: 'Everyday Help' },
      { title: 'Plumbing', group: 'Everyday Help' },
    ])
  })

  it('drops rows that have no title', async () => {
    db.seed('skill_categories', [{ title: '' }, { title: null }, { title: 'Plumbing' }])
    expect(await loadSkillCategories()).toEqual([{ title: 'Plumbing', group: 'Trades and Trained Skills' }])
  })

  it('uses the list kept on this phone when the database cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.seed('skill_categories', [{ title: 'Sewing', group_name: 'Care and Support' }, { title: 'Plumbing' }])
    const loaded = await loadSkillCategories()

    db.failNext('skill_categories', 'select', { message: 'Failed to fetch' })
    expect(await loadSkillCategories()).toEqual(loaded)
    expect(console.error).toHaveBeenCalled()
  })

  it('does not even try the database with no signal, and says nothing in the log', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.seed('skill_categories', [{ title: 'Sewing' }])
    await loadSkillCategories()
    const callsBefore = db.calls.length

    goOffline()
    expect(await loadSkillCategories()).toEqual([{ title: 'Sewing', group: OTHER_GROUP }])
    expect(db.calls).toHaveLength(callsBefore)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('uses the built-in list when there is no signal and nothing was ever kept', async () => {
    goOffline()
    const rows = await loadSkillCategories()
    expect(rows).toHaveLength(builtInCount)
    expect(groupSkills(rows)).toEqual(SKILL_GROUPS.map((g) => ({ group: g.name, skills: g.skills })))
  })

  it('uses the built-in list when what was kept on the phone is damaged', async () => {
    localStorage.setItem('vwb_skill_list', '{not json')
    goOffline()
    expect(await loadSkillCategories()).toHaveLength(builtInCount)
  })

  it('does not overwrite the kept list with an empty answer', async () => {
    db.seed('skill_categories', [{ title: 'Sewing' }])
    await loadSkillCategories()
    db.rows('skill_categories').length = 0
    expect(await loadSkillCategories()).toEqual([])

    goOffline()
    expect(await loadSkillCategories()).toEqual([{ title: 'Sewing', group: OTHER_GROUP }])
  })
})

describe('groupSkills', () => {
  it('gathers skills under their headers in the order they arrive, with no empty headers', () => {
    const rows = [
      { title: 'Food and Meals', group: 'Everyday Help' },
      { title: 'Tech Help', group: 'Everyday Help' },
      { title: 'Plumbing', group: 'Trades and Trained Skills' },
      { title: 'Sewing', group: OTHER_GROUP },
    ]
    expect(groupSkills(rows)).toEqual([
      { group: 'Everyday Help', skills: ['Food and Meals', 'Tech Help'] },
      { group: 'Trades and Trained Skills', skills: ['Plumbing'] },
      { group: OTHER_GROUP, skills: ['Sewing'] },
    ])
    expect(groupSkills([])).toEqual([])
  })
})

describe('offerSkillRows', () => {
  it('leaves out skills already listed as things to give, so "Food and Meals" shows once', () => {
    const rows = [
      { title: 'Food & Meals', group: 'Everyday Help' },
      { title: 'Supplies and Lending', group: 'Everyday Help' },
      { title: 'furniture', group: OTHER_GROUP },
      { title: 'Plumbing', group: 'Trades and Trained Skills' },
    ]
    expect(OFFER_ITEM_CATEGORIES).toContain('Food and Meals')
    expect(offerSkillRows(rows).map((r) => r.title)).toEqual(['Supplies and Lending', 'Plumbing'])
  })
})
