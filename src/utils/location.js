// =============================================
// Location utility for VWB geofencing
// Asks browser for position, rounds for privacy
// =============================================

// Default center: Ringgold, GA area
const DEFAULT_LOCATION = { lat: 34.92, lng: -85.11 }

/**
 * Get the user's current position from the browser.
 * Returns { lat, lng } rounded to 2 decimal places for privacy.
 * Falls back to default location if denied or unavailable.
 */
export function getCurrentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported, using default')
      resolve({ ...DEFAULT_LOCATION, source: 'default' })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: Math.round(pos.coords.latitude * 100) / 100,
          lng: Math.round(pos.coords.longitude * 100) / 100,
          source: 'browser',
        })
      },
      (err) => {
        console.warn('Location denied or failed:', err.message)
        resolve({ ...DEFAULT_LOCATION, source: 'default' })
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 300000, // cache for 5 min
      }
    )
  })
}

/**
 * Calculate distance between two points in miles (Haversine).
 * Used client-side for display; server does the real filtering.
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
