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
  // Clear / Flag for later, shared by every admin (vwb-admin-inbox-marks.sql, Oct 25).
  const [marks, setMarks] = useState([])

  const load = useCallback(async () => {
    if (!user?.id || !isAdmin) { setItems([]); return }
    const [{ data, error }, mk] = await Promise.all([supabase.rpc('admin_inbox'), supabase.rpc('admin_inbox_marks_now')])
    // Before the database step is run, there are simply no marks.
    if (mk.error) { if (mk.error.code !== 'PGRST202') console.error('[useAdminInbox] marks failed:', mk.error); setMarks([]) }
    else setMarks(mk.data || [])
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

  // A cleared row stays hidden until more come in than when it was cleared.
  // A row flagged for later moves to the Later list and leaves the counts.
  const markOf = (kind) => marks.find((m) => m.kind === kind)
  const shown = items
    .filter((i) => { const m = markOf(i.kind); return !(m && m.mark === 'cleared' && (i.how_many || 0) <= m.how_many) })
    .map((i) => { const m = markOf(i.kind); return m && m.mark === 'later' ? { ...i, later: true, laterBy: m.marked_by_name, laterMine: m.mine, laterAt: m.marked_at } : i })
  const now = shown.filter((i) => !i.later)
  const total = now.reduce((sum, i) => sum + (i.how_many || 0), 0)
  const urgent = now.some((i) => i.urgent)
  const clearedCount = items.length - shown.length

  async function mark(item, how) {
    const { error } = await supabase.rpc('admin_inbox_mark', { p_kind: item.kind, p_mark: how, p_how_many: item.how_many || 0 })
    if (error) { console.error('[useAdminInbox] mark failed:', error); return error }
    await load()
    refreshAdminInbox()
    return null
  }

  return { items: shown, total, urgent, loaded, failed, reload: load, mark, clearedCount }
}
