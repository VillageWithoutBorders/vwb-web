import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Which chats are sidechats, and which chat each one sits under.
// Returns a Map of sidechat id to parent id. If the database has not been
// updated yet this quietly returns an empty map.
export function useSidechatParents() {
  const [parents, setParents] = useState(() => new Map())
  useEffect(() => {
    let alive = true
    supabase.from('community_groups').select('id, parent_group_id').not('parent_group_id', 'is', null).then(({ data, error }) => {
      if (!alive || error) return
      setParents(new Map((data || []).map((r) => [r.id, r.parent_group_id])))
    })
    return () => { alive = false }
  }, [])
  return parents
}
