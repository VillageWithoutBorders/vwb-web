import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

// The shared Admin inbox: everything waiting on a VWB admin or founder.
// It reads the real tables (admin_inbox() in vwb-admin-inbox.sql), so when
// one admin handles something it leaves the list for every admin.
// Checks every minute, when the app comes back into view, and whenever
// refreshAdminInbox() is called (the Admin page calls it after you act).

const POLL_MS = 60000
const EVENT = 'vwb-admin-inbox'

export function refreshAdminInbox() {
  try { window.dispatchEvent(new Event(EVENT)) } catch { /* old browser */ }
}

export function useAdminInbox() {
  const { user, isAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    if (!user?.id || !isAdmin) { setItems([]); return }
    const { data, error } = await supabase.rpc('admin_inbox')
    if (error) {
      console.error('[useAdminInbox] admin_inbox failed:', error)
      setFailed(true)
    } else {
      setItems(data || [])
      setFailed(false)
    }
    setLoaded(true)
  }, [user?.id, isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    load()
    const timer = setInterval(load, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(EVENT, load)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(EVENT, load)
    }
  }, [load, isAdmin])

  const total = items.reduce((sum, i) => sum + (i.how_many || 0), 0)
  const urgent = items.some((i) => i.urgent)
  return { items, total, urgent, loaded, failed, reload: load }
}
