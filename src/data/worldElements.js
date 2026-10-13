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
