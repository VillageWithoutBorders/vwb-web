// The clickable elements of the VWB world. Names follow the VWB Vocabulary
// sheet (project doc claude/VWB-Vocabulary.md). x and y are percent positions
// on the village scene. "soon" marks things decided but not built yet.

export const VILLAGE_SPOTS = [
  { k: 'guidelines', label: 'Community Guidelines', short: 'Guidelines', em: '\u{1FAA7}', x: 50, y: 13 },
  { k: 'sisters', label: 'Sister villages', short: 'Sisters', em: '\u{1F309}', x: 17, y: 22 },
  { k: 'keeper', label: "Keeper's house", short: 'Keeper', em: '\u{1F5DD}️', x: 83, y: 22 },
  { k: 'chat', label: 'Village chat', short: 'Village chat', em: '\u{1F4E3}', x: 50, y: 33 },
  { k: 'campfires', label: 'Campfires', short: 'Campfires', em: '\u{1F525}', x: 20, y: 42, soon: true },
  { k: 'sidechats', label: 'Sidechats', short: 'Sidechats', em: '\u{1F4AC}', x: 80, y: 42, soon: true },
  { k: 'skillshare', label: 'SkillShare', short: 'SkillShare', em: '\u{1F9FA}', x: 50, y: 51 },
  { k: 'neighbors', label: 'Neighbors', short: 'Neighbors', em: '\u{1F44B}', x: 18, y: 60 },
  { k: 'cottage', label: 'Cottage Chats', short: 'Cottage Chats', em: '\u{1F3E1}', x: 82, y: 60 },
  { k: 'me', label: 'Your corner', short: 'You', em: '\u{1F3E0}', x: 50, y: 69 },
  { k: 'messages', label: 'Messages', short: 'Messages', em: '\u{1F4EE}', x: 20, y: 79 },
  { k: 'orgs', label: 'Organizations here', short: 'Organizations', em: '\u{1F465}', x: 80, y: 79 },
  { k: 'groups', label: 'Groups here', short: 'Groups', em: '⛺', x: 50, y: 88, soon: true },
]

export const VILLAGE_DECOR = [
  ['\u{1F337}', 34, 38], ['\u{1F33C}', 66, 47], ['\u{1F344}', 33, 65], ['\u{1F337}', 67, 74],
  ['\u{1F33C}', 35, 90], ['\u{1F344}', 68, 92], ['\u{1FAA8}', 8, 72], ['\u{1F33C}', 92, 70],
]

// The Organization page (OrgPage.jsx). Same hills and path as a village.
// members: only members can open it (others see it faded with a lock).
// organizers: only Heads and organizers see it at all.
export const ORG_SPOTS = [
  { k: 'rules', label: 'Our rules', short: 'Rules', em: '\u{1F4DC}', x: 50, y: 13, members: true },
  { k: 'where', label: 'Where we work', short: 'Where', em: '\u{1F3D8}️', x: 17, y: 22 },
  { k: 'links', label: 'Connections', short: 'Connections', em: '\u{1F517}', x: 83, y: 22 },
  { k: 'news', label: 'Announcements', short: 'News', em: '\u{1F4E3}', x: 50, y: 33, members: true, soon: true },
  { k: 'fires', label: 'Campfires', short: 'Campfires', em: '\u{1F525}', x: 20, y: 43, members: true },
  { k: 'events', label: 'Coming up', short: 'Coming up', em: '\u{1F4C5}', x: 80, y: 43 },
  { k: 'needs', label: 'Needs and offers', short: 'Needs', em: '\u{1F91D}', x: 50, y: 53, members: true },
  { k: 'share', label: 'What we share', short: 'Share', em: '\u{1F4E6}', x: 18, y: 63 },
  { k: 'members', label: 'Members', short: 'Members', em: '\u{1F4C7}', x: 82, y: 63, members: true },
  { k: 'involved', label: 'Get involved', short: 'Get involved', em: '\u{1F64B}', x: 50, y: 74 },
  { k: 'tools', label: 'Organizer tools', short: 'Tools', em: '\u{1F9F0}', x: 50, y: 87, organizers: true },
]

export const ORG_DECOR = [
  ['\u{1F33B}', 34, 37], ['\u{1F33F}', 66, 48], ['\u{1F344}', 33, 68], ['\u{1F33B}', 67, 79],
  ['\u{1FAA8}', 8, 74], ['\u{1F33F}', 92, 72],
]
