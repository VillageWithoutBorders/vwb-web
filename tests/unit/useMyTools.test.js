// Your roles: a person only sees the tools their role gives them. A neighbor with no
// role sees none, and only reviewers (admins and Hope Ambassadors) load review counts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { db } from '../helpers/fakeSupabase.js'
import { useMyTools } from '../../src/hooks/useMyTools'

const auth = vi.hoisted(() => ({ user: null, profile: null, isAdmin: false, organizations: [] }))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => auth }))

const keys = (tools) => tools.map((t) => t.key)
const tool = (tools, key) => tools.find((t) => t.key === key)
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

beforeEach(() => {
  Object.assign(auth, { user: { id: 'me' }, profile: { is_hope_ambassador: false }, isAdmin: false, organizations: [] })
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('useMyTools', () => {
  it('gives a neighbor with no role no tools, and loads no review counts for them', async () => {
    const { result } = renderHook(() => useMyTools())
    await settle()
    expect(result.current).toEqual([])
    expect(db.rpcCalls('list_resource_suggestions')).toHaveLength(0)
  })

  it('gives nothing, without asking the database, when nobody is signed in', async () => {
    Object.assign(auth, { user: null, profile: null })
    const { result } = renderHook(() => useMyTools())
    await settle()
    expect(result.current).toEqual([])
    expect(db.calls).toHaveLength(0)
  })

  it('gives a VWB admin the Admin page and the reviewer tools', async () => {
    auth.isAdmin = true
    const { result } = renderHook(() => useMyTools())
    await settle()
    expect(keys(result.current)).toEqual(['admin', 'ambassador', 'suggestions', 'merges'])
    expect(tool(result.current, 'admin').to).toBe('/admin')
  })

  it('gives a Hope Ambassador the reviewer tools, but not the Admin page', async () => {
    auth.profile = { is_hope_ambassador: true }
    const { result } = renderHook(() => useMyTools())
    await settle()
    expect(keys(result.current)).toEqual(['ambassador', 'suggestions', 'merges'])
  })

  it('tells a reviewer how many new resource suggestions are waiting', async () => {
    auth.profile = { is_hope_ambassador: true }
    db.onRpc('list_resource_suggestions', () => [{ id: 1 }, { id: 2 }])
    const { result } = renderHook(() => useMyTools())
    expect(tool(result.current, 'suggestions')).toMatchObject({ note: 'Nothing new', noteVars: { n: 0 } })
    await waitFor(() => expect(tool(result.current, 'suggestions')).toMatchObject({ note: '{n} new', noteVars: { n: 2 } }))
    expect(db.rpcCalls('list_resource_suggestions')[0].args).toEqual({ p_status: 'new' })
  })

  it('says "Nothing new" when the count cannot load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    auth.profile = { is_hope_ambassador: true }
    db.failNext('list_resource_suggestions', 'rpc')
    const { result } = renderHook(() => useMyTools())
    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(tool(result.current, 'suggestions').note).toBe('Nothing new')
  })

  it('shows "Reports to review" to reviewers only while the CRN preview is switched on', async () => {
    auth.profile = { is_hope_ambassador: true }
    vi.stubEnv('VITE_CRN_PREVIEW', '1')
    vi.resetModules()
    const preview = await import('../../src/hooks/useMyTools')
    const { result } = renderHook(() => preview.useMyTools())
    await settle()
    expect(keys(result.current)).toEqual(['ambassador', 'suggestions', 'merges', 'reports'])
    auth.profile = { is_hope_ambassador: false }
    const neighbor = renderHook(() => preview.useMyTools())
    await settle()
    expect(neighbor.result.current).toEqual([])
  })

  it('gives the Organizer dashboard, once, to someone who heads or organizes any organization', async () => {
    auth.organizations = [
      { id: 1, kind: 'nonprofit', role: 'admin', name: 'Food Bank' },
      { id: 2, kind: 'church', role: 'organizer', name: 'First Baptist' },
    ]
    const { result } = renderHook(() => useMyTools())
    await settle()
    expect(result.current).toEqual([{ key: 'organizer', label: 'Organizer', icon: 'toolbox', to: '/org-dashboard' }])
  })

  it('gives a crew keeper one "My crew" tool per crew they run, with its name', async () => {
    auth.organizations = [
      { id: 5, kind: 'group', role: 'admin', name: 'Chainsaw Crew' },
      { id: 6, kind: 'group', role: 'organizer', name: 'Meal Train' },
    ]
    const { result } = renderHook(() => useMyTools())
    await settle()
    expect(result.current.map((t) => [t.key, t.label, t.name, t.to])).toEqual([
      ['group-5', 'My crew', 'Chainsaw Crew', '/orgs/5'],
      ['group-6', 'My crew', 'Meal Train', '/orgs/6'],
    ])
  })

  it('gives no tools for places where the person is only a member', async () => {
    auth.organizations = [
      { id: 1, kind: 'nonprofit', role: 'member', name: 'Food Bank' },
      { id: 5, kind: 'group', role: 'member', name: 'Chainsaw Crew' },
    ]
    const { result } = renderHook(() => useMyTools())
    await settle()
    expect(result.current).toEqual([])
  })

  describe('village Keepers', () => {
    const VILLAGES = [
      { id: 'v1', name: 'Ringgold', is_mine: true },
      { id: 'v2', name: 'Rossville', is_mine: true },
      { id: 'v3', name: 'Dalton', is_mine: false },
    ]

    it('gives a Keeper tool for each village the person keeps, and only checks their own villages', async () => {
      db.onRpc('village_network', () => VILLAGES)
      db.onRpc('village_keepers_info', ({ p_village }) => [{ i_am_keeper: p_village === 'v2' }])
      const { result } = renderHook(() => useMyTools())
      await waitFor(() => expect(result.current).toHaveLength(1))
      expect(result.current[0]).toEqual({ key: 'village-v2', label: 'Keeper', name: 'Rossville', icon: 'key', to: '/village/v2/keeper' })
      expect(db.rpcCalls('village_keepers_info').map((c) => c.args.p_village)).toEqual(['v1', 'v2'])
    })

    it('still shows the villages that could be checked when one check fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      db.onRpc('village_network', () => VILLAGES)
      db.onRpc('village_keepers_info', () => [{ i_am_keeper: true }])
      db.failNext('village_keepers_info', 'rpc')
      const { result } = renderHook(() => useMyTools())
      await waitFor(() => expect(keys(result.current)).toEqual(['village-v2']))
    })

    it('shows no Keeper tools when the villages cannot load', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      db.onRpc('village_keepers_info', () => [{ i_am_keeper: true }])
      db.failNext('village_network', 'rpc')
      const { result } = renderHook(() => useMyTools())
      await waitFor(() => expect(console.error).toHaveBeenCalled())
      await settle()
      expect(result.current).toEqual([])
    })
  })

  it('lists the tools in the same order every time: admin, reviewer, organizer, crews, villages', async () => {
    Object.assign(auth, {
      isAdmin: true,
      organizations: [{ id: 5, kind: 'group', role: 'admin', name: 'Chainsaw Crew' }, { id: 1, kind: 'nonprofit', role: 'admin', name: 'Food Bank' }],
    })
    db.onRpc('village_network', () => [{ id: 'v1', name: 'Ringgold', is_mine: true }])
    db.onRpc('village_keepers_info', () => [{ i_am_keeper: true }])
    const { result } = renderHook(() => useMyTools())
    await waitFor(() => expect(keys(result.current)).toEqual(['admin', 'ambassador', 'suggestions', 'merges', 'organizer', 'group-5', 'village-v1']))
  })
})
