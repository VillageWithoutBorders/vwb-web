// =============================================
// Location for VWB. Privacy first.
//
// Rules:
// - We never guess where someone is. If we don't know, we ask for a zip.
// - We never ask for GPS on our own. Only when someone taps
//   "Use my current location".
// - GPS is rounded to about half a mile and kept only for this visit
//   (sessionStorage). It is never saved to anyone's profile.
// - A zip saved on the profile is seen only by that person and VWB admins.
//   The database turns it into the zip's center point.
// =============================================

import { supabase } from '../supabaseClient'

const DEVICE_KEY = 'vwb_device_location'
const SESSION_ZIP_KEY = 'vwb_session_zip'
const ZIP_LABEL_KEY = 'vwb_zip_label'

function round2(n) {
  return Math.round(n * 100) / 100
}

function readSession(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') } catch { return null }
}

function writeSession(key, value) {
  try {
    if (value == null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(value))
  } catch { /* private mode: fine, it just won't be remembered */ }
}

/**
 * Asks the phone for its location. Only call this when the person tapped a
 * button asking for it. Returns { lat, lng, source: 'browser' } rounded to
 * about half a mile, or null if they said no or it failed. Never a guess.
 */
export function getCurrentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: round2(pos.coords.latitude), lng: round2(pos.coords.longitude), source: 'browser' }),
      (err) => { console.warn('Location not shared:', err.message); resolve(null) },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    )
  })
}

/**
 * The tap-to-share version: asks the phone, and if it works, remembers it for
 * this visit only so other pages can use it too.
 */
export async function shareDeviceLocation() {
  const loc = await getCurrentPosition()
  if (loc) {
    writeSession(SESSION_ZIP_KEY, null)
    writeSession(DEVICE_KEY, { lat: loc.lat, lng: loc.lng })
  }
  return loc ? { ...loc, source: 'device', label: 'your current location' } : null
}

/**
 * Use a zip for this visit only, without saving it anywhere.
 * `place` is what lookupZip() returned.
 */
export function setVisitZip(place) {
  writeSession(DEVICE_KEY, null)
  writeSession(SESSION_ZIP_KEY, { lat: place.latitude, lng: place.longitude, label: place.label })
}

/** Forget any location shared for this visit (phone or zip). */
export function forgetVisitLocation() {
  writeSession(DEVICE_KEY, null)
  writeSession(SESSION_ZIP_KEY, null)
}

/**
 * Where to look for this person, without asking the phone.
 * 1. A location they shared this visit (the phone button, or a zip they
 *    chose not to save).
 * 2. The center of the zip saved on their profile.
 * 3. Otherwise null. The page should show <LocationPrompt />.
 */
export function getMyLocation(profile) {
  const device = readSession(DEVICE_KEY)
  if (device && device.lat != null) {
    return { lat: device.lat, lng: device.lng, source: 'device', label: 'your current location' }
  }
  const visitZip = readSession(SESSION_ZIP_KEY)
  if (visitZip && visitZip.lat != null) {
    return { lat: visitZip.lat, lng: visitZip.lng, source: 'visit-zip', label: visitZip.label }
  }
  if (profile?.location_source === 'zip' && profile.latitude != null && profile.longitude != null) {
    const cached = readSession(ZIP_LABEL_KEY)
    const label = cached && cached.zip === profile.zip_code ? cached.label : profile.zip_code
    return { lat: Number(profile.latitude), lng: Number(profile.longitude), source: 'zip', label }
  }
  return null
}

/**
 * Looks a zip up in our own database (never an outside map service).
 * Returns { zip, city, state, latitude, longitude, label } or null.
 */
export async function lookupZip(raw) {
  const zip = String(raw || '').replace(/[^0-9]/g, '').slice(0, 5)
  if (zip.length !== 5) return null
  const { data, error } = await supabase.rpc('lookup_zip', { p_zip: zip })
  if (error) { console.error('lookup_zip failed:', error); return null }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  const label = row.city && row.state ? `${row.city}, ${row.state}` : row.zip
  writeSession(ZIP_LABEL_KEY, { zip: row.zip, label })
  return { zip: row.zip, city: row.city, state: row.state, latitude: Number(row.latitude), longitude: Number(row.longitude), label }
}

/**
 * Saves a zip on the person's own profile. The database checks it and sets
 * their location to the zip's center. Returns an error message or null.
 */
export async function saveZip(userId, zip) {
  const { error } = await supabase.from('helper_profiles').update({ zip_code: zip }).eq('user_id', userId)
  if (!error) { writeSession(SESSION_ZIP_KEY, null); return null }
  console.error('saveZip failed:', error)
  return error.code === '22023' ? error.message : 'Could not save your zip code. Try again.'
}

/**
 * Distance between two points in miles (Haversine).
 * Used on the page for display; the server does the real filtering.
 */
export function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3959
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg) {
  return (deg * Math.PI) / 180
}
