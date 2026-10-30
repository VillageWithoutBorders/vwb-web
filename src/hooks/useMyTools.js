import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

// The tools a person has because of their role, for My tools (top bar) and My Corner (bottom bar).
// Admin, Hope Ambassador, organization Head or organizer, group keeper, village keeper.
// Each tool: { key, label, icon, to }. An empty list means a neighbor with no role.
export function useMyTools() {
  const { user, profile, isAdmin, organizations } = useAuth()
  const [keptVillages, setKeptVillages] = useState([])
  // Oct 28: new resource suggestions, for a My Tools row (Hope Ambassadors and admins).
  const [newSuggestions, setNewSuggestions] = useState(0)
  const reviewer = !!(profile?.is_hope_ambassador || isAdmin)
  useEffect(() => {
    if (!user || !reviewer) { setNewSuggestions(0); return }
    let alive = true
    supabase.rpc('list_resource_suggestions', { p_status: 'new' }).then(({ data, error }) => {
      if (error) { console.error('Failed to count resource suggestions:', error); return }
      if (alive) setNewSuggestions((data || []).length)
    })
    return () => { alive = false }
  }, [user?.id, reviewer]) // eslint-disable-line react-hooks/exhaustive-deps

  // Villages I keep: check the villages I am in (usually one to three).
  useEffect(() => {
    if (!user) { setKeptVillages([]); return }
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.rpc('village_network')
      if (error) { console.error('Failed to load your villages:', error); return }
      const mine = (data || []).filter((v) => v.is_mine)
      const kept = []
      for (const v of mine) {
        const { data: k, error: kErr } = await supabase.rpc('village_keepers_info', { p_village: v.id })
        if (kErr) { console.error('Failed to check keeper for', v.name, kErr); continue }
        if (((k || [])[0] || {}).i_am_keeper) kept.push(v)
      }
      if (alive) setKeptVillages(kept)
    })()
    return () => { alive = false }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const tools = []
  if (isAdmin) tools.push({ key: 'admin', label: 'Admin', icon: 'shield', to: '/admin' })
  if (profile?.is_hope_ambassador || isAdmin) tools.push({ key: 'ambassador', label: 'Ambassador', icon: 'star', to: '/ambassador' })
  if (reviewer) tools.push({ key: 'suggestions', label: 'Resource suggestions', icon: 'books', to: '/community/resources?suggestions=1', note: newSuggestions ? newSuggestions + ' new' : 'Nothing new' })
  if (reviewer) tools.push({ key: 'merges', label: 'Merged listings', icon: 'chain', to: '/community/resources?merges=1', note: 'Undo a merge' })
  const runsOrg = (organizations || []).some((o) => o.kind !== 'group' && (o.role === 'admin' || o.role === 'organizer'))
  if (runsOrg) tools.push({ key: 'organizer', label: 'Organizer', icon: 'toolbox', to: '/org-dashboard' })
  ;(organizations || []).filter((o) => o.kind === 'group' && (o.role === 'admin' || o.role === 'organizer'))
    .forEach((g) => tools.push({ key: 'group-' + g.id, label: 'My crew', name: g.name, icon: 'tent', to: '/orgs/' + g.id }))
  keptVillages.forEach((v) => tools.push({ key: 'village-' + v.id, label: 'Keeper', name: v.name, icon: 'key', to: '/village/' + v.id + '/keeper' }))
  return tools
}
