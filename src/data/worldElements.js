// The clickable elements of the VWB world. Names follow the VWB Vocabulary
// sheet (project doc claude/VWB-Vocabulary.md). x and y are percent positions
// on the village scene. "soon" marks things decided but not built yet.

// Layout: every map sits on a field background (see BACKGROUNDS below).
// x, y = percent of the map. s = size (1 is normal). Everyday spots sit low, by your thumb.
// icon = round badge in public/art/icons (same name .svg), used in lists; em is a text fallback.
// art: the painted picture for this spot (public/art/village-path, life, village-build).
// Every map place has one (Oct 22), so maps don't mix paintings and round badges.
// The round badge (icon) still shows in the list under the map, and if a painting fails to load.
export const VILLAGE_SPOTS = [
  { k: 'charter', art: '/art/village-path/spot-charter.webp', icon: 'scroll', label: 'Our charter', short: 'Charter', em: '\u{1F4DC}', x: 17, y: 39 },
  { k: 'chat', art: '/art/village-path/spot-chat.webp', icon: 'megaphone', label: 'Village chat', short: 'Village chat', em: '\u{1F4E3}', x: 21, y: 82, s: 1.1 },
  { k: 'keeper', art: '/art/village-path/spot-keeper.webp', icon: 'key', label: "Keeper's house", short: 'Keeper', em: '\u{1F5DD}️', x: 83, y: 39 },
  { k: 'sisters', art: '/art/village-path/spot-sisters.webp', icon: 'bridge', label: 'Sister villages', short: 'Sisters', em: '\u{1F309}', x: 50, y: 8 },
  { k: 'orgs', art: '/art/village-path/spot-orgs.webp', icon: 'people', label: 'Organizations here', short: 'Organizations', em: '\u{1F465}', x: 17, y: 19 },
  { k: 'campfires', art: '/art/life/life-fire-2.webp', icon: 'campfire', label: 'Campfires', short: 'Campfires', em: '\u{1F525}', x: 50, y: 42, s: 1.05 },
  { k: 'skillshare', art: '/art/village-path/spot-skillshare.webp', icon: 'basket', label: 'SkillShare', short: 'SkillShare', em: '\u{1F9FA}', x: 79, y: 82, s: 1.1 },
  { k: 'neighbors', art: '/art/life/life-cottage-lit.webp', icon: 'wave', label: 'Neighbors', short: 'Neighbors', em: '\u{1F44B}', x: 17, y: 60 },
  { k: 'groups', art: '/art/village-path/spot-groups.webp', icon: 'tent', label: 'Groups here', short: 'Groups', em: '⛺', x: 83, y: 19 },
  { k: 'me', art: '/art/village-path/spot-me.webp', icon: 'house', label: 'Your corner', short: 'You', em: '\u{1F3E0}', x: 50, y: 73 },
]

// Your cottage (Oct 22): your own page, the "My Village" tab. One per person,
// arranged by you, seen only by you. It holds everything you are part of and
// works as a dashboard (dots show where something new is waiting).
// Same painted meadow and clearings as the village page.
export const COTTAGE_SPOTS = [
  { k: 'home', art: '/art/village-path/spot-sisters.webp', icon: 'bridge', label: 'Your home village', short: 'Home village', x: 50, y: 9 },
  { k: 'visits', art: '/art/village-path/spot-visits.webp', icon: 'houses', label: 'Villages you visit', short: 'Visits', x: 18, y: 18 },
  { k: 'calendar', art: '/art/village-path/spot-calendar.webp', icon: 'calendar', label: 'Calendar', short: 'Calendar', x: 17, y: 37 },
  { k: 'orgs', art: '/art/village-path/spot-orgs.webp', icon: 'people', label: 'Your organizations', short: 'Organizations', x: 82, y: 18 },
  { k: 'connections', art: '/art/village-path/spot-connections.webp', icon: 'handshake', label: 'Connections', short: 'Connections', x: 17, y: 57 },
  { k: 'groups', art: '/art/village-path/spot-groups.webp', icon: 'tent', label: 'Your groups', short: 'Groups', x: 83, y: 38 },
  { k: 'cottage', art: '/art/village-path/spot-cottage.webp', icon: 'cottage', label: 'Cottage Chats', short: 'Cottage Chats', x: 83, y: 57 },
  { k: 'campfires', art: '/art/life/life-fire-2.webp', icon: 'campfire', label: 'Your Campfires', short: 'Campfires', x: 50, y: 32, s: 0.9 },
  { k: 'chat', art: '/art/village-path/spot-chat.webp', icon: 'megaphone', label: 'Village chats', short: 'Village chats', x: 19, y: 79 },
  { k: 'help', art: '/art/village-path/spot-skillshare.webp', icon: 'heart-hands', label: 'Help', short: 'Help', x: 81, y: 79 },
  { k: 'me', art: '/art/village-path/spot-me.webp', icon: 'house', label: 'Your corner', short: 'You', x: 50, y: 56, s: 1.35 },
  { k: 'messages', art: '/art/village-path/spot-messages.webp', icon: 'mailbox', label: 'Messages', short: 'Messages', x: 50, y: 87, s: 0.9 },
]

// The Organization page (OrgPage.jsx). Same roadmap.
// members: only members can open it (others see it faded with a lock).
// organizers: only Heads and organizers see it at all.
export const ORG_SPOTS = [
  { k: 'rules', art: '/art/village-path/spot-charter.webp', icon: 'scroll', label: 'Our rules', short: 'Rules', em: '\u{1F4DC}', x: 17, y: 35, members: true },
  { k: 'where', art: '/art/village-path/spot-where.webp', icon: 'houses', label: 'Where we work', short: 'Where', em: '\u{1F3D8}️', x: 17, y: 13 },
  { k: 'links', art: '/art/village-path/spot-links.webp', icon: 'chain', label: 'Connections', short: 'Connections', em: '\u{1F517}', x: 50, y: 11 },
  { k: 'events', art: '/art/village-path/spot-calendar.webp', icon: 'calendar', label: 'Coming up', short: 'Coming up', em: '\u{1F4C5}', x: 83, y: 14 },
  { k: 'news', art: '/art/village-path/spot-news.webp', icon: 'megaphone', label: 'Announcements', short: 'News', em: '\u{1F4E3}', x: 83, y: 35, members: true },
  { k: 'fires', art: '/art/life/life-fire-2.webp', icon: 'campfire', label: 'Campfires', short: 'Campfires', em: '\u{1F525}', x: 50, y: 42, s: 1.05, members: true },
  { k: 'members', art: '/art/village-path/spot-members.webp', icon: 'card', label: 'Members', short: 'Members', em: '\u{1F4C7}', x: 83, y: 59, members: true },
  { k: 'needs', art: '/art/village-path/spot-skillshare.webp', icon: 'heart-hands', label: 'Needs and offers', short: 'Needs', em: '\u{1F91D}', x: 17, y: 59, members: true },
  { k: 'share', art: '/art/village-path/spot-share.webp', icon: 'box', label: 'What we share', short: 'Share', em: '\u{1F4E6}', x: 50, y: 64, s: 0.95 },
  { k: 'involved', art: '/art/village-path/spot-involved.webp', icon: 'raise-hand', label: 'Get involved', short: 'Get involved', em: '\u{1F64B}', x: 25, y: 85, s: 1.1 },
  { k: 'tools', art: '/art/village-path/spot-tools.webp', icon: 'toolbox', label: 'Organizer tools', short: 'Tools', em: '\u{1F9F0}', x: 75, y: 85, s: 1.1, organizers: true },
]

// An emergency response Group's page (OrgPage.jsx with kind 'group'). Same roadmap
// and lots as ORG_SPOTS. Groups say Keeper and Helper where organizations say Head and Organizer.
export const GROUP_SPOTS = [
  { k: 'rules', art: '/art/village-path/spot-charter.webp', icon: 'scroll', label: 'Our rules', short: 'Rules', em: '\u{1F4DC}', x: 17, y: 35, members: true },
  { k: 'where', art: '/art/village-path/spot-where.webp', icon: 'houses', label: 'Where we cover', short: 'Where', em: '\u{1F3D8}', x: 17, y: 13 },
  { k: 'links', art: '/art/village-path/spot-links.webp', icon: 'chain', label: 'Connections', short: 'Connections', em: '\u{1F517}', x: 50, y: 11 },
  { k: 'events', art: '/art/village-path/spot-calendar.webp', icon: 'calendar', label: 'Coming up', short: 'Coming up', em: '\u{1F4C5}', x: 83, y: 14 },
  { k: 'news', art: '/art/village-path/spot-news.webp', icon: 'megaphone', label: 'Announcements', short: 'News', em: '\u{1F4E3}', x: 83, y: 35, members: true },
  { k: 'fires', art: '/art/life/life-fire-2.webp', icon: 'campfire', label: 'Campfires', short: 'Campfires', em: '\u{1F525}', x: 17, y: 59, members: true },
  { k: 'members', art: '/art/village-path/spot-members.webp', icon: 'card', label: 'Members and what we bring', short: 'Members', em: '\u{1F4C7}', x: 83, y: 59, members: true },
  { k: 'ready', art: '/art/village-path/spot-groups.webp', icon: 'siren', label: 'Ready to respond', short: 'Respond', em: '\u{1F6A8}', x: 50, y: 40, s: 1.3 },
  { k: 'share', art: '/art/village-path/spot-supplies.webp', icon: 'box', label: 'Supplies we keep', short: 'Supplies', em: '\u{1F4E6}', x: 50, y: 64 },
  { k: 'involved', art: '/art/village-path/spot-involved.webp', icon: 'raise-hand', label: 'Get involved', short: 'Get involved', em: '\u{1F64B}', x: 25, y: 85, s: 1.1 },
  { k: 'tools', art: '/art/village-path/spot-tools.webp', icon: 'toolbox', label: 'Keeper tools', short: 'Tools', em: '\u{1F9F0}', x: 75, y: 85, s: 1.1, organizers: true },
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

// The usual look of each kind of map (Oct 22, Jade): the roads, streams and a few
// trees and flowers every map starts with. Top: the way out (water and bridges).
// Middle: the heart. Bottom: everyday places, by your thumb.
// Anyone can change it in Arrange; Keepers and leaders can change it for everyone.
// Points are percent of the map (x across, y down).
export const DEFAULT_WORLDS = {
  cottage: {
    decor: [{ id: 'cottage-1', k: 'tree', x: 66, y: 27, s: 0.9 }, { id: 'cottage-2', k: 'flowers', x: 34, y: 70, s: 0.5 }, { id: 'cottage-3', k: 'bush', x: 67, y: 71, s: 0.6 }, { id: 'cottage-4', k: 'flowers', x: 30, y: 23, s: 0.45 }],
    streams: [[[0, 12], [16, 8.5], [34, 10], [50, 9.5], [66, 7.5], [84, 10.5], [100, 8]]],
    roads: [[[50, 14], [44, 22], [52, 28], [47, 38], [50, 46]], [[50, 66], [52, 74], [49, 80]], [[38, 54], [28, 54]], [[62, 54], [72, 54]]],
  },
  village: {
    decor: [{ id: 'village-1', k: 'tree', x: 33, y: 29, s: 0.9 }, { id: 'village-2', k: 'pine', x: 67, y: 29, s: 0.9 }, { id: 'village-3', k: 'flowers', x: 66, y: 50, s: 0.5 }, { id: 'village-4', k: 'bush', x: 35, y: 93, s: 0.6 }],
    streams: [[[0, 11], [15, 8], [33, 10], [50, 8.5], [67, 7], [85, 10], [100, 7.5]]],
    roads: [[[50, 13], [45, 21], [53, 29], [50, 36]], [[46, 50], [36, 62], [26, 74]], [[54, 50], [64, 62], [74, 74]], [[50, 51], [50, 64]]],
  },
  org: {
    decor: [{ id: 'org-1', k: 'tree', x: 33, y: 22, s: 0.9 }, { id: 'org-2', k: 'flowers', x: 33, y: 48, s: 0.5 }, { id: 'org-3', k: 'bush', x: 66, y: 24, s: 0.6 }, { id: 'org-4', k: 'flowers', x: 63, y: 92, s: 0.45 }],
    streams: [[[100, 22], [92, 30], [95, 44], [90, 50], [93, 66], [100, 74]]],
    roads: [[[29, 79], [36, 72], [44, 70], [48, 58], [50, 50]], [[50, 34], [48, 26], [51, 18]], [[56, 48], [64, 56], [70, 70], [73, 78]]],
  },
  group: {
    decor: [{ id: 'group-1', k: 'pine', x: 33, y: 22, s: 0.9 }, { id: 'group-2', k: 'flowers', x: 33, y: 47, s: 0.5 }, { id: 'group-3', k: 'tree', x: 67, y: 23, s: 0.85 }, { id: 'group-4', k: 'bush', x: 63, y: 93, s: 0.55 }],
    streams: [[[100, 22], [92, 30], [95, 44], [90, 50], [93, 66], [100, 74]]],
    roads: [[[29, 79], [36, 72], [44, 70], [48, 58], [50, 52]], [[50, 30], [48, 24], [51, 18]], [[57, 48], [64, 56], [70, 70], [73, 78]]],
  },
}
