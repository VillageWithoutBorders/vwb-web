import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { getMyLocation } from '../utils/location'
import Icon from './Icon'
import { useT } from '../utils/lang'

// A few tiles for Hope Ambassadors and admins: how much open need there is
// nearby right now, grouped by urgency. Same radius idea as the SkillShare
// feed, but not filtered to your own skills, since this is meant to show
// the community's need as a whole.
export default function NearbyNeedTiles() {
  const t = useT()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [counts, setCounts] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      // No known location means no tiles. We never guess.
      const loc = getMyLocation(profile)
      if (!loc) { setReady(false); return }
      const radius = profile?.radius_miles || 25
      const { data, error } = await supabase.rpc('nearby_open_request_counts', {
        helper_lat: loc.lat, helper_lng: loc.lng, helper_radius: radius,
      })
      if (cancelled) return
      if (error) { console.error('Failed to load nearby request counts:', error); setReady(false); return }
      const byUrgency = {}
      for (const row of data || []) byUrgency[row.urgency] = row.request_count
      setCounts(byUrgency)
      setReady(true)
    }
    load()
    return () => { cancelled = true }
  }, [profile?.radius_miles, profile?.latitude, profile?.longitude])

  if (!ready) return null

  const now = counts.now || 0
  const today = counts.today || 0
  const later = (counts.this_week || 0) + (counts.flexible || 0)
  const total = now + today + later

  const tiles = [
    { label: t('Open near you'), value: total, color: 'var(--accent)' },
    { label: t('Right now'), value: now, color: 'var(--danger)' },
    { label: t('Today'), value: today, color: 'var(--warn)' },
    { label: t('This week or later'), value: later, color: 'var(--accent)' },
  ]

  // Nothing open: one quiet line instead of four zeros.
  if (total === 0) {
    return (
      <button type="button" className="home-need-quiet" onClick={() => navigate('/skillshare')}>
        <span aria-hidden="true"><Icon name="leaf" /></span> {t('No open requests near you right now.')}
      </button>
    )
  }

  return (
    <section className="home-need" aria-labelledby="home-need-h">
      <h2 id="home-need-h" className="home-more-label">{t('Need nearby')}</h2>
      <div className="home-need-tiles">
        {tiles.map(tile => (
          <button key={tile.label} type="button" className="home-need-tile" onClick={() => navigate('/skillshare')}>
            <span className="home-need-num" style={{ color: tile.color }}>{tile.value}</span>
            <span className="home-need-label">{tile.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
