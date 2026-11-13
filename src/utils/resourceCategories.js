// Resource categories, shared by Community (the tiles) and Find help (the list).
// Built around what people ask 211 for most (Oct 2026), plus VWB's home repair
// work. The last two (Give and Get Involved, Other) aren't kinds of help, so
// they sit at the end.
export const CATEGORIES = [
  'Emergency Help', 'Housing', 'Bills and Utilities', 'Food', 'Health',
  'Mental Health and Recovery', 'Disability and Aging', 'Rides', 'Money and Benefits', 'Jobs and Learning', 'Legal and Tenant Help',
  'Home Repair', 'Family and Child Care', 'Clothing and Household', 'Pets', 'Safety', 'Give and Get Involved', 'Other',
]
// Picture for each kind of help, in public/art/icons (same look as the village map).
export const CAT_ICON_FILES = {
  'Emergency Help': 'cat-emergency', 'Housing': 'cat-housing', 'Bills and Utilities': 'cat-utilities',
  'Food': 'cat-food', 'Health': 'cat-health', 'Mental Health and Recovery': 'cat-recovery',
  'Rides': 'cat-rides', 'Money and Benefits': 'cat-government', 'Legal and Tenant Help': 'cat-tenant',
  'Home Repair': 'cat-repair', 'Family and Child Care': 'cat-family', 'Safety': 'cat-safety',
  // Nov 13: simple placeholder pictures (Claude, basic shapes) until Jade draws her own.
  'Clothing and Household': 'cat-clothing',
  'Jobs and Learning': 'cat-jobs',
  'Disability and Aging': 'cat-aging',
  'Pets': 'cat-pets',
  'Give and Get Involved': 'cat-donation', 'Other': 'cat-other',
}

// Names used before Oct 19, 2026. vwb-find-help-categories.sql moves the
// database, but old links, old import batches and undo can still carry them.
export const OLD_CATEGORY_NAMES = {
  'Tenant Rights': 'Legal and Tenant Help',
  'Recovery Support': 'Mental Health and Recovery',
  'Donation Points': 'Give and Get Involved',
  'Advocacy and Organizing': 'Give and Get Involved',
  'Government': 'Money and Benefits',
}
// Short, lowercase names from early test and partner listings (Nov 13).
const LOOSE_NAMES = {
  'food': 'Food', 'housing': 'Housing', 'shelter': 'Housing', 'health': 'Health', 'medical': 'Health',
  'transportation': 'Rides', 'transport': 'Rides', 'rides': 'Rides',
  'family': 'Family and Child Care', 'childcare': 'Family and Child Care', 'child care': 'Family and Child Care',
  'utilities': 'Bills and Utilities', 'bills': 'Bills and Utilities',
  'legal': 'Legal and Tenant Help', 'mental health': 'Mental Health and Recovery', 'recovery': 'Mental Health and Recovery',
  'emergency': 'Emergency Help', 'safety': 'Safety', 'repair': 'Home Repair', 'home repair': 'Home Repair',
  'clothing': 'Clothing and Household', 'clothes': 'Clothing and Household', 'household': 'Clothing and Household',
  'furniture': 'Clothing and Household', 'hygiene': 'Clothing and Household', 'laundry': 'Clothing and Household',
  'jobs': 'Jobs and Learning', 'employment': 'Jobs and Learning', 'job training': 'Jobs and Learning',
  'education': 'Jobs and Learning', 'learning': 'Jobs and Learning',
  'disability': 'Disability and Aging', 'disability support': 'Disability and Aging', 'aging': 'Disability and Aging',
  'seniors': 'Disability and Aging', 'older adults': 'Disability and Aging', 'money': 'Money and Benefits', 'benefits': 'Money and Benefits', 'volunteer': 'Give and Get Involved',
  'pets': 'Pets', 'pet': 'Pets', 'animals': 'Pets', 'animal': 'Pets', 'pet care': 'Pets', 'pet food': 'Pets',
}
const BY_LOWER = Object.fromEntries([
  ...CATEGORIES.map((c) => [c.toLowerCase(), c]),
  ...Object.entries(OLD_CATEGORY_NAMES).map(([k, v]) => [k.toLowerCase(), v]),
  ...Object.entries(LOOSE_NAMES),
])

// Any spelling or capitals -> one of the current kinds of help. Names that
// don't match a kind of help go under Other, so the list
// never shows the same kind twice.
export function currentCategory(c) {
  const key = String(c || '').trim().toLowerCase()
  if (!key) return ''
  return BY_LOWER[key] || 'Other'
}

// The kinds of help that can also be a neighbor's skill. Picking one in
// "Ask for help" picks the first skill here that exists, so the request
// reaches helpers who chose that skill. Order matters: first is the best fit.
// Safety, Give and Get Involved and Other have none on purpose: safety needs
// trained help first, and the other two aren't asks.
export const CATEGORY_SKILLS = {
  'Emergency Help': ['Storm and Flood Recovery', 'Supplies and Lending', 'Medical and First Aid'],
  'Housing': ['Housing Help', 'Paperwork and Benefits'],
  'Bills and Utilities': ['Paperwork and Benefits', 'Heating and Cooling (HVAC)'],
  'Food': ['Food and Meals'],
  'Health': ['Medical and First Aid', 'Caregiving'],
  'Mental Health and Recovery': ['Counseling and Mental Health', 'Check-ins and Companionship'],
  'Rides': ['Rides and Transportation', 'Transportation', 'Car Repair and Mechanics'],
  'Money and Benefits': ['Paperwork and Benefits', 'Tech Help', 'Translation'],
  'Legal and Tenant Help': ['Legal Help', 'Paperwork and Benefits'],
  'Home Repair': ['Home Repair', 'Storm and Flood Recovery', 'Plumbing', 'Electrical (licensed)',
    'Carpentry and Building', 'Heating and Cooling (HVAC)', 'Ramps and Accessibility Builds',
    'Tree and Yard Work', 'Engineering and Safety Checks'],
  'Family and Child Care': ['Childcare', 'Caregiving', 'Tutoring and Teaching'],
  'Clothing and Household': ['Supplies and Lending'],
  'Jobs and Learning': ['Tutoring and Teaching', 'Tech Help', 'Paperwork and Benefits'],
  'Disability and Aging': ['Caregiving', 'Ramps and Accessibility Builds', 'Check-ins and Companionship'],
  'Pets': ['Pet Care'],
}

// "Food & Meals" and "Food and Meals" are the same skill.
function skillKey(title) {
  return String(title).toLowerCase().replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').trim()
}

// The skill titles (as the database spells them) that match a kind of help.
// skillTitles is the list loaded from skill_categories.
export function skillsForCategory(cat, skillTitles) {
  const wanted = CATEGORY_SKILLS[currentCategory(cat)] || []
  const byKey = {}
  ;(skillTitles || []).forEach((t) => { byKey[skillKey(t)] = t })
  return wanted.map((w) => byKey[skillKey(w)]).filter(Boolean)
}

// The other way: which kinds of help a skill belongs to (for helpers).
export function categoriesForSkill(skill) {
  const k = skillKey(skill)
  return Object.keys(CATEGORY_SKILLS).filter((c) => CATEGORY_SKILLS[c].some((s) => skillKey(s) === k))
}

// A resource can belong to more than one category. Falls back to the old
// single `category` field for any row that hasn't been migrated yet.
export function resourceCats(r) {
  const list = (r.categories && r.categories.length) ? r.categories : (r.category ? [r.category] : ['Other'])
  return [...new Set(list.map(currentCategory))]
}

// Plain word search: every word typed has to show up somewhere in the
// resource (name, what they offer, who it's for, area, or category).
export function resourceMatches(r, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = [r.name, r.description, r.requirements, r.neighborhood, r.address, r.region, r.organizations?.name, ...resourceCats(r),
    r.provider_name, r.crn_category, r.service_type, r.eligibility_summary, r.delivery_method, ...(Array.isArray(r.serves) ? r.serves : []),
    r.area_note, r.open_site, ...(Array.isArray(r.zips) ? r.zips : [])]
    .filter(Boolean).join(' ').toLowerCase()
  return words.every((w) => hay.includes(w))
}
