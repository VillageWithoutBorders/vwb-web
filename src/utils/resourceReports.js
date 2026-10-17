import { supabase } from '../supabaseClient'

// Find Help lists and resource reports. See vwb-crn-visibility.sql and
// vwb-resource-reports.sql. Only used while the CRN work is switched on
// (placesEnabled in utils/places.js).

// Messages the database writes for people (it raises them with these codes).
// Anything else gets a plain fallback.
export function friendlyError(error, fallback) {
  if (error && ['P0001', 'P0002', '22023', '42501', '28000'].includes(error.code) && error.message) return error.message
  return fallback
}

// What a signed-in member sees (same list for Ambassadors and admins).
export async function findHelpForMe() {
  const { data, error } = await supabase.rpc('find_help_for_me')
  if (error) console.error('find_help_for_me failed:', error)
  return { data: data || [], error }
}

// What a signed-out visitor sees after choosing a county.
export async function resourcesForPlace(placeId) {
  const { data, error } = await supabase.rpc('resources_for_place', { p_place: placeId })
  if (error) console.error('resources_for_place failed:', error)
  return { data: data || [], error }
}

export async function reportResource(resourceId, kind, details) {
  const { data, error } = await supabase.rpc('report_resource', { p_resource: resourceId, p_kind: kind, p_details: details || null })
  if (error) console.error('report_resource failed:', error)
  return { message: data, error }
}

export async function requestAreaChange(resourceId, add, drop, details) {
  const { error } = await supabase.rpc('request_area_change', { p_resource: resourceId, p_add: add, p_drop: drop, p_details: details || null })
  if (error) console.error('request_area_change failed:', error)
  return { error }
}

// The verified areas a resource serves, with names, for "Change where we serve".
export async function resourceAreas(resourceId) {
  const { data, error } = await supabase
    .from('resource_service_areas')
    .select('place_id')
    .eq('resource_id', resourceId)
    .eq('status', 'verified')
  if (error) { console.error('Failed to load service areas:', error); return { data: [], error } }
  const ids = (data || []).map((a) => a.place_id)
  if (!ids.length) return { data: [], error: null }
  const { data: places, error: pErr } = await supabase.from('places').select('id, name, parent_id').in('id', ids)
  if (pErr) { console.error('Failed to load area names:', pErr); return { data: ids.map((id) => ({ id, label: id })), error: null } }
  const parentIds = [...new Set((places || []).map((p) => p.parent_id).filter(Boolean))]
  let parents = []
  if (parentIds.length) {
    const { data: par, error: parErr } = await supabase.from('places').select('id, name, short_name').in('id', parentIds)
    if (parErr) console.error('Failed to load state names:', parErr)
    parents = par || []
  }
  const label = (p) => {
    const par = parents.find((x) => x.id === p.parent_id)
    return p.name + (par ? ', ' + (par.short_name || par.name) : '')
  }
  return { data: (places || []).map((p) => ({ id: p.id, label: label(p) })), error: null }
}

// Kinds of reports, in the order people see them.
export const REPORT_KINDS = [
  { key: 'id_needed', label: 'ID needed', hint: 'They asked for ID or papers the listing doesn’t mention.' },
  { key: 'not_there', label: 'Not there', hint: 'It closed, moved, or the number doesn’t work.' },
  { key: 'safety', label: 'Safety concern', hint: 'Someone could get hurt. A Hope Ambassador will check soon.' },
  { key: 'something_else', label: 'Something else', hint: 'Tell us what’s wrong.' },
]

// True only when the text clearly says "no". Blank or "Unknown" never counts.
export function saysNo(v) {
  return /^\s*no\s*$/i.test(String(v || ''))
}
