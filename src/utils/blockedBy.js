import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

// People who have blocked the signed-in member. Their profiles can't be
// opened, so the app leaves out links to them. One load per sign-in,
// shared by every screen.
const EMPTY = new Set()
let cacheFor = null
let cache = EMPTY
let inflight = null

function load(userId) {
  if (cacheFor === userId) return Promise.resolve(cache)
  if (inflight && inflight.userId === userId) return inflight.promise
  const promise = supabase.rpc('blocked_by_ids').then(({ data, error }) => {
    if (error) { console.error('blocked_by_ids', error); return EMPTY }
    cacheFor = userId
    cache = new Set(data || [])
    return cache
  }).finally(() => { inflight = null })
  inflight = { userId, promise }
  return promise
}

// Returns a Set of user ids. Use: blockedBy.has(id) means "don't link".
export function useBlockedBy() {
  const { user } = useAuth()
  const userId = user?.id || null
  const [set, setSet] = useState(cacheFor === userId ? cache : EMPTY)
  useEffect(() => {
    if (!userId) { setSet(EMPTY); return }
    let alive = true
    load(userId).then((s) => { if (alive) setSet(s) })
    return () => { alive = false }
  }, [userId])
  return set
}
