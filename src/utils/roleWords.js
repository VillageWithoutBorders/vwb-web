// One place for the words VWB uses for roles, so every screen says the same thing.
// The ladder is the same everywhere: everyone, helpers, keepers.
// The database names stay the same: organization role 'admin' is the top step
// (Head or Keeper), 'organizer' is the middle step (Organizer or Helper).
//
//   Villages and groups:  Neighbor or Member, Helper, Keeper
//   Organizations:        Member, Organizer, Head (an organization can pick its
//                         own two titles later; empty means these defaults)

export const VILLAGE_WORDS = {
  member: 'Neighbor', helper: 'Helper', keeper: 'Keeper',
  helpers: 'Helpers', keepers: 'Keepers', tools: 'Keeper tools',
}

function aOrAn(word) {
  return (/^[aeiou]/i.test(word) ? 'an ' : 'a ') + word
}

// Words for one organization or group. Pass the organization row (needs `kind`,
// and may carry `head_title` / `organizer_title` once those exist).
export function orgWords(org) {
  const isGroup = org?.kind === 'group'
  const head = (!isGroup && org?.head_title?.trim()) || (isGroup ? 'Keeper' : 'Head')
  const organizer = (!isGroup && org?.organizer_title?.trim()) || (isGroup ? 'Helper' : 'Organizer')
  const lowOrg = organizer.toLowerCase()
  const lowHead = head.toLowerCase()
  return {
    isGroup,
    head,                          // 'Keeper' / 'Head'
    heads: head + 's',
    aHead: aOrAn(head),
    organizer: lowOrg,             // 'helper' / 'organizer' (inside a sentence)
    Organizer: organizer,          // 'Helper' / 'Organizer' (a label)
    organizers: lowOrg + 's',
    anOrganizer: aOrAn(lowOrg),
    // Groups name both roles with capitals, like villages: 'Keepers and Helpers'.
    // Organizations keep 'Heads and organizers'.
    leads: head + 's and ' + (isGroup ? organizer : lowOrg) + 's',
    leadsLower: (isGroup ? head : lowHead) + 's and ' + (isGroup ? organizer : lowOrg) + 's',
    tools: isGroup ? 'Keeper tools' : 'Organizer tools',
    settings: isGroup ? 'Keeper settings' : 'Organizer settings',
    roleLabel: { admin: head, organizer, member: 'Member' },
  }
}
