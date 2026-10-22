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
// Layout (Oct 22): the painted village path (public/art/village-path/village-path.webp).
// Each spot sits on a clearing beside the path; x, y = percent of the picture.
// Everyday spots sit low, by your thumb. Four clearings are left empty, room to grow.
// art: the painted building for this spot (public/art/village-path). Until the
// file is there, the round badge picture shows instead (the Keeper's house still does).
export const VILLAGE_SPOTS = [
  { k: 'charter', art: '/art/village-path/spot-charter.webp', icon: 'scroll', label: 'Our charter', short: 'Charter', em: '\u{1F4DC}', x: 38, y: 9 },
  { k: 'chat', art: '/art/village-path/spot-chat.webp', icon: 'megaphone', label: 'Village chat', short: 'Village chat', em: '\u{1F4E3}', x: 21, y: 45 },
  { k: 'keeper', art: '/art/village-path/spot-keeper.webp', icon: 'key', label: "Keeper's house", short: 'Keeper', em: '\u{1F5DD}️', x: 20, y: 22 },
  { k: 'sisters', art: '/art/village-path/spot-sisters.webp', icon: 'bridge', label: 'Sister villages', short: 'Sisters', em: '\u{1F309}', x: 87, y: 18 },
  { k: 'orgs', art: '/art/village-path/spot-orgs.webp', icon: 'people', label: 'Organizations here', short: 'Organizations', em: '\u{1F465}', x: 67, y: 8 },
  { k: 'sidechats', art: '/art/village-path/spot-sidechats.webp', icon: 'sidechats', label: 'Sidechats', short: 'Sidechats', em: '\u{1F4AC}', x: 27, y: 33 },
  { k: 'campfires', icon: 'campfire', label: 'Campfires', short: 'Campfires', em: '\u{1F525}', x: 57, y: 48 },
  { k: 'cottage', art: '/art/village-path/spot-cottage.webp', icon: 'cottage', label: 'Cottage Chats', short: 'Cottage Chats', em: '\u{1F3E1}', x: 76, y: 37 },
  { k: 'skillshare', art: '/art/village-path/spot-skillshare.webp', icon: 'basket', label: 'SkillShare', short: 'SkillShare', em: '\u{1F9FA}', x: 27, y: 60 },
  { k: 'neighbors', icon: 'wave', label: 'Neighbors', short: 'Neighbors', em: '\u{1F44B}', x: 69, y: 63 },
  { k: 'groups', art: '/art/village-path/spot-groups.webp', icon: 'tent', label: 'Groups here', short: 'Groups', em: '⛺', x: 64, y: 25 },
  { k: 'me', art: '/art/village-path/spot-me.webp', icon: 'house', label: 'Your corner', short: 'You', em: '\u{1F3E0}', x: 26, y: 89, s: 1.1 },
  { k: 'messages', art: '/art/village-path/spot-messages.webp', icon: 'mailbox', label: 'Messages', short: 'Messages', em: '\u{1F4EE}', x: 71, y: 87, s: 1.1 },
]

// The Organization page (OrgPage.jsx). Same roadmap.
// members: only members can open it (others see it faded with a lock).
// organizers: only Heads and organizers see it at all.
export const ORG_SPOTS = [
  { k: 'rules', icon: 'scroll', label: 'Our rules', short: 'Rules', em: '\u{1F4DC}', x: 14, y: 27, members: true },
  { k: 'where', icon: 'houses', label: 'Where we work', short: 'Where', em: '\u{1F3D8}️', x: 32, y: 17 },
  { k: 'links', icon: 'chain', label: 'Connections', short: 'Connections', em: '\u{1F517}', x: 49, y: 27 },
  { k: 'events', icon: 'calendar', label: 'Coming up', short: 'Coming up', em: '\u{1F4C5}', x: 86, y: 22 },
  { k: 'news', icon: 'megaphone', label: 'Announcements', short: 'News', em: '\u{1F4E3}', x: 12, y: 51, members: true },
  { k: 'fires', icon: 'campfire', label: 'Campfires', short: 'Campfires', em: '\u{1F525}', x: 42, y: 52, members: true },
  { k: 'members', icon: 'card', label: 'Members', short: 'Members', em: '\u{1F4C7}', x: 74, y: 53, members: true },
  { k: 'needs', icon: 'heart-hands', label: 'Needs and offers', short: 'Needs', em: '\u{1F91D}', x: 15, y: 74, members: true },
  { k: 'share', icon: 'box', label: 'What we share', short: 'Share', em: '\u{1F4E6}', x: 41, y: 74 },
  { k: 'involved', icon: 'raise-hand', label: 'Get involved', short: 'Get involved', em: '\u{1F64B}', x: 27, y: 90, s: 1.1 },
  { k: 'tools', icon: 'toolbox', label: 'Organizer tools', short: 'Tools', em: '\u{1F9F0}', x: 85, y: 90, s: 1.1, organizers: true },
]

// An emergency response Group's page (OrgPage.jsx with kind 'group'). Same roadmap
// and lots as ORG_SPOTS. Groups say Keeper and Helper where organizations say Head and Organizer.
export const GROUP_SPOTS = [
  { k: 'rules', icon: 'scroll', label: 'Our rules', short: 'Rules', em: '\u{1F4DC}', x: 14, y: 27, members: true },
  { k: 'where', icon: 'houses', label: 'Where we cover', short: 'Where', em: '\u{1F3D8}', x: 32, y: 17 },
  { k: 'links', icon: 'chain', label: 'Connections', short: 'Connections', em: '\u{1F517}', x: 49, y: 27 },
  { k: 'events', icon: 'calendar', label: 'Coming up', short: 'Coming up', em: '\u{1F4C5}', x: 86, y: 22 },
  { k: 'news', icon: 'megaphone', label: 'Announcements', short: 'News', em: '\u{1F4E3}', x: 12, y: 51, members: true },
  { k: 'fires', icon: 'campfire', label: 'Campfires', short: 'Campfires', em: '\u{1F525}', x: 42, y: 52, members: true },
  { k: 'members', icon: 'card', label: 'Members and what we bring', short: 'Members', em: '\u{1F4C7}', x: 74, y: 53, members: true },
  { k: 'ready', icon: 'siren', label: 'Ready to respond', short: 'Respond', em: '\u{1F6A8}', x: 15, y: 74 },
  { k: 'share', icon: 'box', label: 'Supplies we keep', short: 'Supplies', em: '\u{1F4E6}', x: 41, y: 74 },
  { k: 'involved', icon: 'raise-hand', label: 'Get involved', short: 'Get involved', em: '\u{1F64B}', x: 27, y: 90, s: 1.1 },
  { k: 'tools', icon: 'toolbox', label: 'Keeper tools', short: 'Tools', em: '\u{1F9F0}', x: 85, y: 90, s: 1.1, organizers: true },
]

// The living village scene (vwb-village-life.sql). Painted art made in
// Canva (Oct 21), kept in public/art/life as small webp files. The full-size
// originals are in vwb-art/life-processed. To change a picture, replace the
// file with the same name.
export const LIFE_ART = {
  cottageDark: '/art/life/life-cottage-dark.webp',
  cottageLit: '/art/life/life-cottage-lit.webp',
  lantern: '/art/life/life-lantern.webp',
  sign: '/art/life/life-sign.webp',
  // fire_level 0 (embers) and 1 share the small fire; 0 is shown dimmer.
  fire: ['/art/life/life-fire-1.webp', '/art/life/life-fire-1.webp', '/art/life/life-fire-2.webp', '/art/life/life-fire-3.webp'],
}
// How big the campfire burns for each step (0 = embers, 3 = a busy week).
export const FIRE_SIZE = [0.9, 1, 1.1, 1.2]
export const FIRE_WORDS = ['Embers. Spark a message to warm it up.', 'A small fire this week', 'A warm fire this week', 'A big, bright fire this week']
