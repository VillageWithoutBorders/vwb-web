import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

// Open, verified emergencies this person can act on (Nov 10, Round A3): VWB admins,
// Hope Ambassadors in their villages, Keepers and Helpers of approved crews that cover
// the place, and anyone signed up to respond. The database decides who
// (vwb-emergency-banner.sql). Everyone else gets an empty list.
// Checked when the app opens, once a minute while the app is on screen, and when the
// signal comes back. With no signal, the last list stays.
export function useEmergenciesICanHelp() {
  const { user } = useAuth()
  // The list is kept with the account it belongs to, so it never shows for someone else.
  const [mine, setMine] = useState({ uid: null, rows: [] })
  const uid = user?.id
  useEffect(() => {
    if (!uid) return
    let alive = true
    let missing = false
    async function load() {
      if (missing || navigator.onLine === false || document.visibilityState === 'hidden') return
      const { data, error } = await supabase.rpc('emergencies_i_can_help')
      if (!alive) return
      if (error) {
        // The database part is not there yet: stop asking until the app opens again.
        if (error.code === 'PGRST202' || error.code === '42883') missing = true
        console.error('[EmergencyBanner] could not check open emergencies:', error)
        return
      }
      setMine({ uid, rows: data || [] })
    }
    load()
    const timer = setInterval(load, 60000)
    window.addEventListener('online', load)
    document.addEventListener('visibilitychange', load)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('online', load)
      document.removeEventListener('visibilitychange', load)
    }
  }, [uid])
  return uid && mine.uid === uid ? mine.rows : []
}
