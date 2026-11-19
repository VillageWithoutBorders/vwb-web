// One place for the words VWB uses for roles, so every screen says the same thing:
// Keeper and Helper in villages and groups, Head and Organizer in organizations.
import { describe, expect, it } from 'vitest'
import { VILLAGE_WORDS, orgWords, plural } from '../../src/utils/roleWords'

describe('plural', () => {
  it.each([
    ['Helper', 'Helpers'],
    ['Director', 'Directors'],
    ['Coach', 'Coaches'],
    ['Boss', 'Bosses'],
    ['Deputy', 'Deputies'],
    ['Attorney', 'Attorneys'],
    ['coach', 'coaches'],
  ])('%s becomes %s', (one, many) => {
    expect(plural(one)).toBe(many)
  })
})

describe('orgWords', () => {
  it('calls a group\'s roles Keeper and Helper, the same words villages use', () => {
    const w = orgWords({ kind: 'group' })
    expect(w).toMatchObject({
      isGroup: true,
      head: 'Keeper',
      heads: 'Keepers',
      aHead: 'a Keeper',
      Organizer: 'Helper',
      organizer: 'helper',
      organizers: 'helpers',
      anOrganizer: 'a helper',
      leads: 'Keepers and Helpers',
      tools: 'Keeper tools',
      settings: 'Keeper settings',
      roleLabel: { admin: 'Keeper', organizer: 'Helper', member: 'Member' },
      stepLabel: { admin: 'Keeper', organizer: 'Helper', member: 'Member' },
    })
    expect(w.head).toBe(VILLAGE_WORDS.keeper)
    expect(w.heads).toBe(VILLAGE_WORDS.keepers)
    expect(w.Organizer).toBe(VILLAGE_WORDS.helper)
    expect(w.tools).toBe(VILLAGE_WORDS.tools)
  })

  it('calls an organization\'s roles Head and Organizer', () => {
    expect(orgWords({ kind: 'organization' })).toMatchObject({
      isGroup: false,
      head: 'Head',
      heads: 'Heads',
      aHead: 'a Head',
      Organizer: 'Organizer',
      organizer: 'organizer',
      organizers: 'organizers',
      anOrganizer: 'an organizer',
      leads: 'Heads and organizers',
      tools: 'Organizer tools',
      settings: 'Organizer settings',
      roleLabel: { admin: 'Head', organizer: 'Organizer', member: 'Member' },
      stepLabel: { admin: 'Head', organizer: 'Organizer', member: 'Member' },
    })
  })

  it('uses the titles an organization chose for itself', () => {
    const w = orgWords({ kind: 'organization', head_title: ' Director ', organizer_title: 'Coach' })
    expect(w).toMatchObject({
      head: 'Director',
      heads: 'Directors',
      aHead: 'a Director',
      Organizer: 'Coach',
      organizer: 'coach',
      organizers: 'coaches',
      anOrganizer: 'a coach',
      leads: 'Directors and coaches',
      roleLabel: { admin: 'Director', organizer: 'Coach', member: 'Member' },
    })
  })

  it('adds the shared step name to a chosen title, so safety screens stay clear', () => {
    const w = orgWords({ kind: 'organization', head_title: 'Director', organizer_title: 'Coach' })
    expect(w.stepLabel).toEqual({ admin: 'Director (keeper)', organizer: 'Coach (helper)', member: 'Member' })
  })

  it('says "an" before a title that starts with a vowel', () => {
    const w = orgWords({ kind: 'organization', head_title: 'Elder', organizer_title: 'Usher' })
    expect(w.aHead).toBe('an Elder')
    expect(w.anOrganizer).toBe('an usher')
  })

  it('ignores chosen titles on a group: groups always say Keeper and Helper', () => {
    const w = orgWords({ kind: 'group', head_title: 'Boss', organizer_title: 'Deputy' })
    expect(w.head).toBe('Keeper')
    expect(w.Organizer).toBe('Helper')
  })

  it('falls back to Head and Organizer when a title is blank or nothing is known yet', () => {
    for (const org of [{ kind: 'organization', head_title: '   ', organizer_title: '' }, {}, null, undefined]) {
      const w = orgWords(org)
      expect(w.head).toBe('Head')
      expect(w.Organizer).toBe('Organizer')
      expect(w.isGroup).toBe(false)
    }
  })
})
