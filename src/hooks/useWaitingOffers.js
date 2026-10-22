import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

// How many neighbors offered to help on your open requests and are waiting for your yes.
// Used by the Help doors page and the Help switch.
export function useWaitingOffers() {
  const { user } = useAuth()
  const [waiting, setWaiting] = useState(0)

  useEffect(() => {
    if (!user) return
    let alive = true
    ;(async () => {
      const { data: reqs, error } = await supabase.from('help_requests').select('id').eq('requester_id', user.id).eq('status', 'open')
      if (error) { console.error('Failed to load your open requests:', error); return }
      const ids = (reqs || []).map((r) => r.id)
      if (!ids.length) { if (alive) setWaiting(0); return }
      const { count, error: cErr } = await supabase.from('skill_matches').select('id', { count: 'exact', head: true }).in('request_id', ids).is('accepted', null)
      if (cErr) { console.error('Failed to count offers to help:', cErr); return }
      if (alive) setWaiting(count || 0)
    })()
    return () => { alive = false }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return waiting
}
