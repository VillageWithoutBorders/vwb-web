import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// The Village tab: opens your home village. If you have none yet, the village
// you are in with the most neighbors. Not in a village yet: the village map,
// where you can join one. Route: /village
export default function MyVillage() {
  const [to, setTo] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    // Your home village first (Oct 22: one home village per person, from your zip).
    supabase.rpc('my_home_village').then(({ data: home, error: homeErr }) => {
      if (!alive) return
      if (homeErr) console.error('Failed to load your home village:', homeErr)
      const h = (home || [])[0]
      if (h && h.village_id) { setTo('/village/' + h.village_id); return }
      openBiggest()
    })
    return () => { alive = false }

    function openBiggest() {
    supabase.rpc('village_network').then(({ data, error: err }) => {
      if (!alive) return
      if (err) { console.error('Failed to load your village:', err); setError("We couldn't load your village. Check your connection and try again."); return }
      const mine = (data || []).filter((v) => v.is_mine).sort((a, b) => (b.member_count || 0) - (a.member_count || 0))
      setTo(mine.length ? '/village/' + mine[0].id : '/villages')
    })
    }
  }, [])

  if (to) return <Navigate to={to} replace />
  if (error) return <div className="cal-page"><p className="cal-empty" role="alert">{error}</p></div>
  return <div className="cal-page"><p className="cal-empty">Loading your village...</p></div>
}
