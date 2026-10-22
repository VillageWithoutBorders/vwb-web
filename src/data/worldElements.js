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
// Layout (Oct 22): the painted village path (public/art/village-path/village-meadow.webp).
// Each spot sits on a clearing beside the path; x, y = percent of the picture.
// Everyday spots sit low, by your thumb. Sisters sits on the painted footbridge.
// art: the painted picture for this spot (public/art/village-path, life, village-build).
// Every map place has one (Oct 22), so maps don't mix paintings and round badges.
// The round badge (icon) still shows in the list under the map, and if a painting fails to load.
export const VILLAGE_SPOTS = [
  { k: 'charter', art: '/art/village-path/spot-charter.webp', icon: 'scroll', label: 'Our charter', short: 'Charter', em: '\u{1F4DC}', x: 22, y: 11 },
  { k: 'chat', art: '/art/village-path/spot-chat.webp', icon: 'megaphone', label: 'Village chat', short: 'Village chat', em: '\u{1F4E3}', x: 22, y: 72 },
  { k: 'keeper', art: '/art/village-path/spot-keeper.webp', icon: 'key', label: "Keeper's house", short: 'Keeper', em: '\u{1F5DD}️', x: 22, y: 28 },
  { k: 'sisters', art: '/art/village-path/spot-sisters.webp', icon: 'bridge', label: 'Sister villages', short: 'Sisters', em: '\u{1F309}', x: 63, y: 6 },
  { k: 'orgs', art: '/art/village-path/spot-orgs.webp', icon: 'people', label: 'Organizations here', short: 'Organizations', em: '\u{1F465}', x: 70, y: 20 },
  { k: 'sidechats', art: '/art/village-path/spot-sidechats.webp', icon: 'sidechats', label: 'Sidechats', short: 'Sidechats', em: '\u{1F4AC}', x: 23, y: 44 },
  { k: 'campfires', art: '/art/life/life-fire-2.webp', icon: 'campfire', label: 'Campfires', short: 'Campfires', em: '\u{1F525}', x: 36, y: 60 },
  { k: 'cottage', art: '/art/village-path/spot-cottage.webp', icon: 'cottage', label: 'Cottage Chats', short: 'Cottage Chats', em: '\u{1F3E1}', x: 76, y: 50 },
  { k: 'skillshare', art: '/art/village-path/spot-skillshare.webp', icon: 'basket', label: 'SkillShare', short: 'SkillShare', em: '\u{1F9FA}', x: 73, y: 78 },
  { k: 'neighbors', art: '/art/life/life-cottage-lit.webp', icon: 'wave', label: 'Neighbors', short: 'Neighbors', em: '\u{1F44B}', x: 75, y: 65 },
  { k: 'groups', art: '/art/village-path/spot-groups.webp', icon: 'tent', label: 'Groups here', short: 'Groups', em: '⛺', x: 76, y: 36 },
  { k: 'me', art: '/art/village-path/spot-me.webp', icon: 'house', label: 'Your corner', short: 'You', em: '\u{1F3E0}', x: 24, y: 89, s: 1.1 },
  { k: 'messages', art: '/art/village-path/spot-messages.webp', icon: 'mailbox', label: 'Messages', short: 'Messages', em: '\u{1F4EE}', x: 74, y: 90, s: 1.1 },
]

// Your cottage (Oct 22): your own page, the "My Village" tab. One per person,
// arranged by you, seen only by you. It holds everything you are part of and
// works as a dashboard (dots show where something new is waiting).
// Same painted meadow and clearings as the village page.
export const COTTAGE_SPOTS = [
  { k: 'home', art: '/art/village-path/spot-sisters.webp', icon: 'bridge', label: 'Your home village', short: 'Home village', x: 63, y: 6 },
  { k: 'visits', art: '/art/village-path/spot-visits.webp', icon: 'houses', label: 'Villages you visit', short: 'Visits', x: 22, y: 11 },
  { k: 'calendar', art: '/art/village-path/spot-calendar.webp', icon: 'calendar', label: 'Calendar', short: 'Calendar', x: 22, y: 28 },
  { k: 'orgs', art: '/art/village-path/spot-orgs.webp', icon: 'people', label: 'Your organizations', short: 'Organizations', x: 70, y: 20 },
  { k: 'connections', art: '/art/village-path/spot-connections.webp', icon: 'handshake', label: 'Connections', short: 'Connections', x: 23, y: 44 },
  { k: 'groups', art: '/art/village-path/spot-groups.webp', icon: 'tent', label: 'Your groups', short: 'Groups', x: 76, y: 36 },
  { k: 'cottage', art: '/art/village-path/spot-cottage.webp', icon: 'cottage', label: 'Cottage Chats', short: 'Cottage Chats', x: 76, y: 50 },
  { k: 'campfires', art: '/art/life/life-fire-2.webp', icon: 'campfire', label: 'Your Campfires', short: 'Campfires', x: 36, y: 60 },
  { k: 'chat', art: '/art/village-path/spot-chat.webp', icon: 'megaphone', label: 'Village chats', short: 'Village chats', x: 22, y: 72 },
  { k: 'help', art: '/art/village-path/spot-skillshare.webp', icon: 'heart-hands', label: 'Help', short: 'Help', x: 73, y: 78 },
  { k: 'me', art: '/art/village-path/spot-me.webp', icon: 'house', label: 'Your corner', short: 'You', x: 24, y: 89, s: 1.1 },
  { k: 'messages', art: '/art/village-path/spot-messages.webp', icon: 'mailbox', label: 'Messages', short: 'Messages', x: 74, y: 90, s: 1.1 },
]

// The Organization page (OrgPage.jsx). Same roadmap.
// members: only members can open it (others see it faded with a lock).
// organizers: only Heads and organizers see it at all.
export const ORG_SPOTS = [
  { k: 'rules', art: '/art/village-path/spot-charter.webp', icon: 'scroll', label: 'Our rules', short: 'Rules', em: '\u{1F4DC}', x: 14, y: 27, members: true },
  { k: 'where', art: '/art/village-path/spot-where.webp', icon: 'houses', label: 'Where we work', short: 'Where', em: '\u{1F3D8}️', x: 32, y: 17 },
  { k: 'links', art: '/art/village-path/spot-links.webp', icon: 'chain', label: 'Connections', short: 'Connections', em: '\u{1F517}', x: 49, y: 27 },
  { k: 'events', art: '/art/village-path/spot-calendar.webp', icon: 'calendar', label: 'Coming up', short: 'Coming up', em: '\u{1F4C5}', x: 86, y: 22 },
  { k: 'news', art: '/art/village-path/spot-news.webp', icon: 'megaphone', label: 'Announcements', short: 'News', em: '\u{1F4E3}', x: 12, y: 51, members: true },
  { k: 'fires', art: '/art/life/life-fire-2.webp', icon: 'campfire', label: 'Campfires', short: 'Campfires', em: '\u{1F525}', x: 42, y: 52, members: true },
  { k: 'members', art: '/art/village-path/spot-members.webp', icon: 'card', label: 'Members', short: 'Members', em: '\u{1F4C7}', x: 74, y: 53, members: true },
  { k: 'needs', art: '/art/village-path/spot-skillshare.webp', icon: 'heart-hands', label: 'Needs and offers', short: 'Needs', em: '\u{1F91D}', x: 15, y: 74, members: true },
  { k: 'share', art: '/art/village-path/spot-share.webp', icon: 'box', label: 'What we share', short: 'Share', em: '\u{1F4E6}', x: 41, y: 74 },
  { k: 'involved', art: '/art/village-path/spot-involved.webp', icon: 'raise-hand', label: 'Get involved', short: 'Get involved', em: '\u{1F64B}', x: 27, y: 90, s: 1.1 },
  { k: 'tools', art: '/art/village-path/spot-tools.webp', icon: 'toolbox', label: 'Organizer tools', short: 'Tools', em: '\u{1F9F0}', x: 85, y: 90, s: 1.1, organizers: true },
]

// An emergency response Group's page (OrgPage.jsx with kind 'group'). Same roadmap
// and lots as ORG_SPOTS. Groups say Keeper and Helper where organizations say Head and Organizer.
export const GROUP_SPOTS = [
  { k: 'rules', art: '/art/village-path/spot-charter.webp', icon: 'scroll', label: 'Our rules', short: 'Rules', em: '\u{1F4DC}', x: 14, y: 27, members: true },
  { k: 'where', art: '/art/village-path/spot-where.webp', icon: 'houses', label: 'Where we cover', short: 'Where', em: '\u{1F3D8}', x: 32, y: 17 },
  { k: 'links', art: '/art/village-path/spot-links.webp', icon: 'chain', label: 'Connections', short: 'Connections', em: '\u{1F517}', x: 49, y: 27 },
  { k: 'events', art: '/art/village-path/spot-calendar.webp', icon: 'calendar', label: 'Coming up', short: 'Coming up', em: '\u{1F4C5}', x: 86, y: 22 },
  { k: 'news', art: '/art/village-path/spot-news.webp', icon: 'megaphone', label: 'Announcements', short: 'News', em: '\u{1F4E3}', x: 12, y: 51, members: true },
  { k: 'fires', art: '/art/life/life-fire-2.webp', icon: 'campfire', label: 'Campfires', short: 'Campfires', em: '\u{1F525}', x: 42, y: 52, members: true },
  { k: 'members', art: '/art/village-path/spot-members.webp', icon: 'card', label: 'Members and what we bring', short: 'Members', em: '\u{1F4C7}', x: 74, y: 53, members: true },
  { k: 'ready', art: '/art/village-path/spot-groups.webp', icon: 'siren', label: 'Ready to respond', short: 'Respond', em: '\u{1F6A8}', x: 15, y: 74 },
  { k: 'share', art: '/art/village-path/spot-supplies.webp', icon: 'box', label: 'Supplies we keep', short: 'Supplies', em: '\u{1F4E6}', x: 41, y: 74 },
  { k: 'involved', art: '/art/village-path/spot-involved.webp', icon: 'raise-hand', label: 'Get involved', short: 'Get involved', em: '\u{1F64B}', x: 27, y: 90, s: 1.1 },
  { k: 'tools', art: '/art/village-path/spot-tools.webp', icon: 'toolbox', label: 'Keeper tools', short: 'Tools', em: '\u{1F9F0}', x: 85, y: 90, s: 1.1, organizers: true },
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

// Build my village (Oct 22): pieces anyone can add to their own village map.
// Painted in Canva to match the buildings. Pictures in public/art/village-build.
// s = starting size (1 is about one building).
export const DECOR_PIECES = [
  { k: 'tree', label: 'Round tree', s: 0.9 },
  { k: 'pine', label: 'Pine tree', s: 0.9 },
  { k: 'bush', label: 'Flowering bush', s: 0.6 },
  { k: 'flowers', label: 'Wildflowers', s: 0.5 },
  { k: 'pond', label: 'Pond', s: 1 },
  { k: 'stream', label: 'Stream', s: 1.2 },
  { k: 'bridge', label: 'Footbridge', s: 0.9 },
  { k: 'fence', label: 'Fence', s: 0.7 },
  { k: 'well', label: 'Well', s: 0.8 },
  { k: 'lamp', label: 'Lamp post', s: 0.6 },
  { k: 'garden', label: 'Garden bed', s: 0.8 },
  { k: 'rocks', label: 'Rocks', s: 0.5 },
].map((p) => ({ ...p, src: '/art/village-build/deco-' + p.k + '.webp' }))
export const OPEN_MEADOW = '/art/village-build/meadow-open.webp'

// Grounds people can choose under their village (Arrange and build).
// Every map sits on a simple field (Jade, Oct 22). Seasons can change it later:
// pick a different field picture here by the time of year.
export const FIELD_SRC = '/art/village-build/meadow-open.webp'

// Backgrounds people can pick in Arrange (Oct 22). Add a picture here and it shows in
// the Backgrounds tab (the tab appears once there is more than one).
// group: backgrounds of the same place in different seasons share a group.
// season: spring | summer | fall | winter.
export const BACKGROUNDS = [
  { k: 'field', label: 'Summer field', group: 'field', season: 'summer', src: FIELD_SRC },
  { k: 'field-spring', label: 'Spring field', group: 'field', season: 'spring', src: '/art/village-build/ground-field-spring.webp' },
  { k: 'field-fall', label: 'Fall field', group: 'field', season: 'fall', src: '/art/village-build/ground-field-fall.webp' },
  { k: 'field-winter', label: 'Winter field', group: 'field', season: 'winter', src: '/art/village-build/ground-field-winter.webp' },
  { k: 'forest', label: 'Forest', group: 'forest', season: 'summer', src: '/art/village-build/ground-forest-summer.webp' },
  { k: 'park', label: 'Park', group: 'park', season: 'summer', src: '/art/village-build/ground-park-summer.webp' },
]
// "Change with the seasons": the field picture for this time of year (Northern Hemisphere).
// Falls back to the summer field when a season's picture isn't there yet.
export function seasonNow(date = new Date()) {
  const m = date.getMonth() // 0 = January
  return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'fall' : 'winter'
}
export function backgroundSrc(key) {
  if (key === 'seasons') {
    const s = seasonNow()
    const hit = BACKGROUNDS.find((b) => b.group === 'field' && b.season === s)
    return (hit || BACKGROUNDS[0]).src
  }
  return (BACKGROUNDS.find((b) => b.k === key) || BACKGROUNDS[0]).src
}
// Is the seasons choice worth showing (the field has more than one season)?
export const HAS_SEASONS = BACKGROUNDS.filter((b) => b.group === 'field').length > 1
