import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// The ids of the chats that are Campfires: every chat started by an
// organization, nonprofit, or church (its general chat, sidechats, and chats
// between connected groups). The fire icon belongs only to these. Chats
// people make themselves are Cottage Chats. A village's own Campfires count too.
export function useCampfireIds() {
  const [ids, setIds] = useState(() => new Set())
  useEffect(() => {
    let alive = true
    supabase.from('community_groups').select('id').or('organization_id.not.is.null,village_kind.eq.campfire').then(({ data, error }) => {
      if (!alive || error) return
      setIds(new Set((data || []).map((r) => r.id)))
    })
    return () => { alive = false }
  }, [])
  return ids
}
