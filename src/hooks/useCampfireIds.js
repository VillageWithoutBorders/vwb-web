import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// The ids of the chats that are Campfires: private organizing chats started
// between connected groups. The fire icon belongs only to these. If the
// database has not been updated yet this quietly returns an empty set.
export function useCampfireIds() {
  const [ids, setIds] = useState(() => new Set())
  useEffect(() => {
    let alive = true
    supabase.from('community_groups').select('id').eq('is_campfire', true).then(({ data, error }) => {
      if (!alive || error) return
      setIds(new Set((data || []).map((r) => r.id)))
    })
    return () => { alive = false }
  }, [])
  return ids
}
