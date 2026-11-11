import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { useT } from '../utils/lang'

// Nov 10 (Jade): the My World Resources tab is a real street map.
// Only resources with a public street address get a pin (see hasPublicAddress
// in World.jsx). Phone lines and places that keep their address private stay
// on the Resources list only. The person's own location is never drawn.
export default function ResourceMapView({ items, picked, onPick, center }) {
  const t = useT()
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const markers = useRef({})
  const pickRef = useRef(onPick)
  useEffect(() => { pickRef.current = onPick }, [onPick])

  useEffect(() => {
    if (!mapEl.current) return
    let cancelled = false
    import('leaflet').then((mod) => {
      if (cancelled || !mapEl.current) return
      const L = mod.default || mod
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      const map = L.map(mapEl.current, { scrollWheelZoom: false, zoomControl: true })
      mapRef.current = map
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)
      markers.current = {}
      const bounds = []
      items.forEach((r) => {
        const ll = [Number(r.latitude), Number(r.longitude)]
        bounds.push(ll)
        const m = L.circleMarker(ll, { radius: 9, color: '#0b3b38', weight: 2, fillColor: '#f2c763', fillOpacity: 0.95 }).addTo(map)
        m.bindTooltip(r.name, { direction: 'top' })
        m.on('click', () => pickRef.current && pickRef.current(r))
        markers.current[r.id] = m
      })
      // Show the closest pins first (within 25 miles when there are any).
      const near = items.filter((r) => r.miles != null && r.miles <= 25).map((r) => [Number(r.latitude), Number(r.longitude)])
      const fit = () => {
        if (near.length) map.fitBounds(near, { padding: [30, 30], maxZoom: 13 })
        else if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 })
        else if (center) map.setView([center.lat, center.lng], 10)
        else map.setView([34.95, -85.2], 9)
      }
      fit()
      // The box can still be settling its size when the map starts. Measure again, then fit.
      setTimeout(() => { if (mapRef.current === map) { map.invalidateSize(); fit() } }, 120)
    })
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [items, center])

  // The picked pin turns bright. The map only moves when the pin is near or past the edge.
  useEffect(() => {
    Object.entries(markers.current).forEach(([id, m]) => {
      const on = picked && String(picked.id) === id
      m.setStyle({ fillColor: on ? '#ff8844' : '#f2c763', weight: on ? 4 : 2, color: on ? '#ffffff' : '#0b3b38' })
      if (on) { m.bringToFront(); const map = mapRef.current; if (map && !map.getBounds().pad(-0.1).contains(m.getLatLng())) map.panTo(m.getLatLng()) }
    })
  }, [picked])

  return <div ref={mapEl} className="wd-res-map" role="region" aria-label={t('Map of resources with a public address')} />
}
