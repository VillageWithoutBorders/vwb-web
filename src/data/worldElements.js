// The clickable elements of the VWB world. Names follow the VWB Vocabulary
// sheet (project doc claude/VWB-Vocabulary.md). x and y are percent positions
// on the village scene. "soon" marks things decided but not built yet.

// Layout: roadmap (Jade's art, Oct 14). Spots sit on the green lots
// beside the roads in public/art/village-roads.webp. x, y = percent.
// icon = picture in public/art/icons (same name .svg); em stays as a text fallback.
// s = size (1 is normal). Everyday spots sit low, by your thumb.
// Lots: top-left (town square), top-right (beyond the village),
// middle-left small, middle-right, bottom-left (main street),
// bottom-right small, bottom-right corner.
export const VILLAGE_SPOTS = [
  { k: 'guidelines', icon: 'guidelines', label: 'Community Guidelines', short: 'Guidelines', em: '\u{1FAA7}', x: 14, y: 27 },
  { k: 'chat', icon: 'megaphone', label: 'Village chat', short: 'Village chat', em: '\u{1F4E3}', x: 32, y: 17 },
  { k: 'keeper', icon: 'key', label: "Keeper's house", short: 'Keeper', em: '\u{1F5DD}️', x: 49, y: 27 },
  { k: 'sisters', icon: 'bridge', label: 'Sister villages', short: 'Sisters', em: '\u{1F309}', x: 86, y: 14 },
  { k: 'orgs', icon: 'people', label: 'Organizations here', short: 'Organizations', em: '\u{1F465}', x: 84, y: 30 },
  { k: 'sidechats', icon: 'sidechats', label: 'Sidechats', short: 'Sidechats', em: '\u{1F4AC}', x: 12, y: 51 },
  { k: 'campfires', icon: 'campfire', label: 'Campfires', short: 'Campfires', em: '\u{1F525}', x: 42, y: 52 },
  { k: 'cottage', icon: 'cottage', label: 'Cottage Chats', short: 'Cottage Chats', em: '\u{1F3E1}', x: 74, y: 53 },
  { k: 'skillshare', icon: 'basket', label: 'SkillShare', short: 'SkillShare', em: '\u{1F9FA}', x: 15, y: 74 },
  { k: 'neighbors', icon: 'wave', label: 'Neighbors', short: 'Neighbors', em: '\u{1F44B}', x: 41, y: 74 },
  { k: 'groups', icon: 'tent', label: 'Groups here', short: 'Groups', em: '⛺', x: 84, y: 68, soon: true },
  { k: 'me', icon: 'house', label: 'Your corner', short: 'You', em: '\u{1F3E0}', x: 27, y: 90, s: 1.1 },
  { k: 'messages', icon: 'mailbox', label: 'Messages', short: 'Messages', em: '\u{1F4EE}', x: 85, y: 90, s: 1.1 },
]

// The Organization page (OrgPage.jsx). Same roadmap.
// members: only members can open it (others see it faded with a lock).
// organizers: only Heads and organizers see it at all.
export const ORG_SPOTS = [
  { k: 'rules', icon: 'scroll', label: 'Our rules', short: 'Rules', em: '\u{1F4DC}', x: 14, y: 27, members: true },
  { k: 'where', icon: 'houses', label: 'Where we work', short: 'Where', em: '\u{1F3D8}️', x: 32, y: 17 },
  { k: 'links', icon: 'chain', label: 'Connections', short: 'Connections', em: '\u{1F517}', x: 49, y: 27 },
  { k: 'events', icon: 'calendar', label: 'Coming up', short: 'Coming up', em: '\u{1F4C5}', x: 86, y: 22 },
  { k: 'news', icon: 'megaphone', label: 'Announcements', short: 'News', em: '\u{1F4E3}', x: 12, y: 51, members: true, soon: true },
  { k: 'fires', icon: 'campfire', label: 'Campfires', short: 'Campfires', em: '\u{1F525}', x: 42, y: 52, members: true },
  { k: 'members', icon: 'card', label: 'Members', short: 'Members', em: '\u{1F4C7}', x: 74, y: 53, members: true },
  { k: 'needs', icon: 'heart-hands', label: 'Needs and offers', short: 'Needs', em: '\u{1F91D}', x: 15, y: 74, members: true },
  { k: 'share', icon: 'box', label: 'What we share', short: 'Share', em: '\u{1F4E6}', x: 41, y: 74 },
  { k: 'involved', icon: 'raise-hand', label: 'Get involved', short: 'Get involved', em: '\u{1F64B}', x: 27, y: 90, s: 1.1 },
  { k: 'tools', icon: 'toolbox', label: 'Organizer tools', short: 'Tools', em: '\u{1F9F0}', x: 85, y: 90, s: 1.1, organizers: true },
]
