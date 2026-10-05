import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// The ids of the chats that are Campfires: every chat started by an
// organization, nonprofit, or church (its general chat, sidechats, and chats
// between connected groups). The fire icon belongs only to these. Chats
// people make themselves are Cottage Chats.
export function useCampfireIds() {
  const [ids, setIds] = useState(() => new Set())
  useEffect(() => {
    let alive = true
    supabase.from('community_groups').select('id').not('organization_id', 'is', null).then(({ data, error }) => {
      if (!alive || error) return
      setIds(new Set((data || []).map((r) => r.id)))
    })
    return () => { alive = false }
  }, [])
  return ids
}
