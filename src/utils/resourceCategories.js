// Resource categories, shared by Community (the tiles) and Find help (the list).
export const CATEGORIES = ['Emergency Help', 'Safety', 'Food', 'Donation Points', 'Tenant Rights', 'Housing', 'Government', 'Recovery Support', 'Advocacy and Organizing', 'Other']
export const CAT_ICONS = { 'Emergency Help': '&#9888;', 'Safety': '&#128156;', 'Food': '&#127859;', 'Donation Points': '&#128230;', 'Tenant Rights': '&#127968;', 'Housing': '&#127969;', 'Government': '&#128203;', 'Recovery Support': '&#129419;', 'Advocacy and Organizing': '&#9994;', 'Other': '&#128204;' }

// A resource can belong to more than one category. Falls back to the old
// single `category` field for any row that hasn't been migrated yet.
export function resourceCats(r) {
  return (r.categories && r.categories.length) ? r.categories : (r.category ? [r.category] : ['Other'])
}

// Plain word search: every word typed has to show up somewhere in the
// resource (name, what they offer, who it's for, area, or category).
export function resourceMatches(r, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = [r.name, r.description, r.requirements, r.neighborhood, r.address, r.region, r.organizations?.name, ...resourceCats(r)]
    .filter(Boolean).join(' ').toLowerCase()
  return words.every((w) => hay.includes(w))
}
