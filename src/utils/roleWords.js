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

// Coach -> Coaches, Deputy -> Deputies, Director -> Directors.
export function plural(word) {
  if (/(s|sh|ch|x|z)$/i.test(word)) return word + 'es'
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies'
  return word + 's'
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
  return {
    isGroup,
    head,                          // 'Keeper' / 'Head'
    heads: plural(head),
    aHead: aOrAn(head),
    organizer: lowOrg,             // 'helper' / 'organizer' (inside a sentence)
    Organizer: organizer,          // 'Helper' / 'Organizer' (a label)
    organizers: plural(lowOrg),
    anOrganizer: aOrAn(lowOrg),
    // Groups name both roles with capitals, like villages: 'Keepers and Helpers'.
    // Organizations keep 'Heads and organizers'.
    leads: plural(head) + ' and ' + plural(isGroup ? organizer : lowOrg),
    leadsLower: plural(head) + ' and ' + plural(isGroup ? organizer : lowOrg),  // kept for older callers; same as leads
    tools: isGroup ? 'Keeper tools' : 'Organizer tools',
    settings: isGroup ? 'Keeper settings' : 'Organizer settings',
    // Labels that also name the shared step, for safety screens: 'Director (keeper)'.
    // Only for titles an organization chose itself; the usual Head and Organizer need no extra word (Oct 22).
    stepLabel: { admin: ['Keeper', 'Head'].includes(head) ? head : head + ' (keeper)', organizer: ['Helper', 'Organizer'].includes(organizer) ? organizer : organizer + ' (helper)', member: 'Member' },
    roleLabel: { admin: head, organizer, member: 'Member' },
  }
}
