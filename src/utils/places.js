import { supabase } from '../supabaseClient'

// Places: named areas (counties and so on) used to decide who a resource
// serves. No ZIP codes. See vwb-places.sql.

// The CRN work is only switched on in the test project until it goes live.
export const placesEnabled = import.meta.env.VITE_CRN_PREVIEW === '1'

export async function searchPlaces(text) {
  const q = (text || '').trim()
  if (q.length < 2) return { data: [], error: null }
  const { data, error } = await supabase.rpc('search_places', { p_query: q, p_limit: 8 })
  if (error) console.error('search_places failed:', error)
  return { data: data || [], error }
}

export async function nearestPlaces(lat, lng) {
  const { data, error } = await supabase.rpc('nearest_places', { p_lat: lat, p_lng: lng, p_limit: 3 })
  if (error) console.error('nearest_places failed:', error)
  return { data: data || [], error }
}

export async function getMyPlaces() {
  const { data, error } = await supabase.rpc('my_places')
  if (error) console.error('my_places failed:', error)
  return { data: data || [], error }
}

export async function saveMyPlaces(ids) {
  const { error } = await supabase.rpc('set_my_places', { p_place_ids: ids })
  if (error) console.error('set_my_places failed:', error)
  return { error }
}

// Signed-out visitors: their area stays on this device only. VWB never saves it.
const VISITOR_KEY = 'vwb-visitor-area'

export function getVisitorArea() {
  try {
    const raw = localStorage.getItem(VISITOR_KEY)
    const v = raw ? JSON.parse(raw) : null
    return v && typeof v.id === 'string' && typeof v.label === 'string' ? v : null
  } catch {
    return null
  }
}

export function setVisitorArea(area) {
  try {
    if (area) localStorage.setItem(VISITOR_KEY, JSON.stringify({ id: area.id, label: area.label }))
    else localStorage.removeItem(VISITOR_KEY)
  } catch {
    // Private window or storage blocked: the choice just lasts for this page.
  }
}
