// Resource categories, shared by Community (the tiles) and Find help (the list).
// Built around what people ask 211 for most (Oct 2026), plus VWB's home repair
// work. The last two (Give and Get Involved, Other) aren't kinds of help, so
// they sit at the end.
export const CATEGORIES = [
  'Emergency Help', 'Housing', 'Bills and Utilities', 'Food', 'Health',
  'Mental Health and Recovery', 'Rides', 'Money and Benefits', 'Legal and Tenant Help',
  'Home Repair', 'Family and Child Care', 'Safety', 'Give and Get Involved', 'Other',
]
// Picture for each kind of help, in public/art/icons (same look as the village map).
export const CAT_ICON_FILES = {
  'Emergency Help': 'cat-emergency', 'Housing': 'cat-housing', 'Bills and Utilities': 'cat-utilities',
  'Food': 'cat-food', 'Health': 'cat-health', 'Mental Health and Recovery': 'cat-recovery',
  'Rides': 'cat-rides', 'Money and Benefits': 'cat-government', 'Legal and Tenant Help': 'cat-tenant',
  'Home Repair': 'cat-repair', 'Family and Child Care': 'cat-family', 'Safety': 'cat-safety',
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
export function currentCategory(c) {
  return OLD_CATEGORY_NAMES[c] || c
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
