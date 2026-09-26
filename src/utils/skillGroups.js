import { supabase } from '../supabaseClient'

// Skill chips are shown under a few plain-language headers so the list is
// easy to scan on a phone. The skills themselves still live in the
// skill_categories table; this file only decides which header each one sits
// under and in what order. A skill added in the database that isn't listed
// here still shows up, under "More Ways to Help", so nothing ever goes missing.
// If skill_categories ever gets a group_name column, that wins over this map.
export const SKILL_GROUPS = [
  {
    name: 'Everyday Help',
    skills: [
      'Food and Meals',
      'Rides and Transportation',
      'Transportation',
      'Cleaning and Household Help',
      'Pet Care',
      'Supplies and Lending',
      'Tech Help',
    ],
  },
  {
    name: 'Home and Storm Help',
    skills: [
      'Home Repair',
      'Storm and Flood Recovery',
      'Tree and Yard Work',
      'Housing Help',
    ],
  },
  {
    name: 'Care and Support',
    skills: [
      'Childcare',
      'Caregiving',
      'Check-ins and Companionship',
      'Tutoring and Teaching',
      'Translation',
      'Paperwork and Benefits',
    ],
  },
  {
    name: 'Trades and Trained Skills',
    skills: [
      'Car Repair and Mechanics',
      'Small Engine Repair',
      'Welding and Metalwork',
      'Electrical (licensed)',
      'Plumbing',
      'Carpentry and Building',
      'Heating and Cooling (HVAC)',
      'Ramps and Accessibility Builds',
      'Engineering and Safety Checks',
      'Medical and First Aid',
      'Counseling and Mental Health',
      'Legal Help',
    ],
  },
]

export const OTHER_GROUP = 'More Ways to Help'

const GROUP_OF = {}
const ORDER_OF = {}
SKILL_GROUPS.forEach((g, gi) => {
  g.skills.forEach((s, si) => {
    GROUP_OF[s.toLowerCase()] = g.name
    ORDER_OF[s.toLowerCase()] = gi * 100 + si
  })
})

// Returns [{ title, group }], sorted by header, then by the order above.
// select('*') on purpose: it keeps working whether or not optional columns
// like group_name exist yet.
export async function loadSkillCategories() {
  const { data, error } = await supabase.from('skill_categories').select('*')
  if (error) {
    console.error('Failed to load skill categories:', error)
    return []
  }
  return (data || [])
    .filter((row) => row.title)
    .map((row) => ({
      title: row.title,
      group: row.group_name || GROUP_OF[row.title.toLowerCase()] || OTHER_GROUP,
    }))
    .sort((a, b) => {
      const ga = groupIndex(a.group)
      const gb = groupIndex(b.group)
      if (ga !== gb) return ga - gb
      const oa = ORDER_OF[a.title.toLowerCase()] ?? 9999
      const ob = ORDER_OF[b.title.toLowerCase()] ?? 9999
      if (oa !== ob) return oa - ob
      return a.title.localeCompare(b.title)
    })
}

function groupIndex(name) {
  const i = SKILL_GROUPS.findIndex((g) => g.name === name)
  return i === -1 ? SKILL_GROUPS.length : i
}

// [{ title, group }] -> [{ group, skills: [title, ...] }], empty groups dropped.
export function groupSkills(rows) {
  const out = []
  for (const row of rows) {
    let bucket = out.find((b) => b.group === row.group)
    if (!bucket) {
      bucket = { group: row.group, skills: [] }
      out.push(bucket)
    }
    bucket.skills.push(row.title)
  }
  return out
}

// Offers can be things to give away, not just skills. These sit above the
// skill groups in the offer form and the offers filter.
export const OFFER_ITEM_CATEGORIES = ['Food and Meals', 'Supplies', 'Clothes', 'Furniture']
export const OFFER_ITEMS_GROUP = 'Things to Give'

// Skill rows minus anything already listed as a thing to give, so
// "Food and Meals" only shows up once.
export function offerSkillRows(rows) {
  return rows.filter((r) => !OFFER_ITEM_CATEGORIES.includes(r.title))
}
