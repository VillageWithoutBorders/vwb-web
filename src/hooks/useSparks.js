import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

// Sparks for a list of messages. `fn` is the database function that returns counts,
// `table` is where a spark is saved. Counts only; nobody sees who else sparked.
export function useSparks({ fn, table, ids, userId }) {
  const [sparks, setSparks] = useState({})
  const idsRef = useRef([])
  idsRef.current = ids
  const key = ids.join(',')

  async function load() {
    const list = idsRef.current
    if (!list.length) { setSparks({}); return }
    const { data, error } = await supabase.rpc(fn, { p_ids: list })
    if (error) { console.error('Failed to load sparks:', error); return }
    const map = {}
    for (const r of data || []) map[String(r.message_id)] = { n: Number(r.sparks), mine: !!r.mine }
    setSparks(map)
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [key])

  async function toggle(id) {
    const k = String(id)
    const cur = sparks[k] || { n: 0, mine: false }
    const next = cur.mine ? { n: Math.max(0, cur.n - 1), mine: false } : { n: cur.n + 1, mine: true }
    setSparks(prev => ({ ...prev, [k]: next }))
    const { error } = cur.mine
      ? await supabase.from(table).delete().eq('message_id', id).eq('user_id', userId)
      : await supabase.from(table).insert({ message_id: id, user_id: userId })
    if (error && !/duplicate/i.test(error.message || '')) {
      console.error('Failed to save spark:', error)
      setSparks(prev => ({ ...prev, [k]: cur }))
    }
  }

  return { sparks, toggle }
}
