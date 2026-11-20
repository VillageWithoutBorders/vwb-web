// Resetting an account back to a plain Neighbor: Ambassador status, skills and admin
// area are cleared for that one person, and the founder is never demoted.
import { describe, expect, it } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'
import { resetAccountToBase } from '../../src/utils/resetAccount'

const ambassador = (userId, role) => ({
  user_id: userId, display_name: 'Name of ' + userId, role, is_hope_ambassador: true, is_available: true, skills: ['Rides', 'Food and Meals'],
  availability: 'Evenings', interests: 'Gardening', radius_miles: 60, zip_code: '30736',
  admin_region_name: 'Catoosa County', admin_latitude: 34.9, admin_longitude: -85.1,
})
const BASE = {
  is_hope_ambassador: false, is_available: false, skills: [], availability: '', interests: '', radius_miles: 25,
  admin_region_name: null, admin_latitude: null, admin_longitude: null,
}
const profile = (userId) => db.rows('helper_profiles').find((p) => p.user_id === userId)

describe('resetAccountToBase', () => {
  it('clears the role details and makes the account a plain member', async () => {
    db.seed('helper_profiles', [ambassador('ruth', 'admin')])
    expect(await resetAccountToBase('ruth', { currentRole: 'admin' })).toEqual({ error: null })
    expect(profile('ruth')).toEqual({ user_id: 'ruth', display_name: 'Name of ruth', zip_code: '30736', role: 'member', ...BASE })
  })

  it('demotes when the caller does not say what the role is', async () => {
    db.seed('helper_profiles', [ambassador('ruth', 'admin')])
    await resetAccountToBase('ruth')
    expect(profile('ruth').role).toBe('member')
  })

  it('never demotes the founder, but still clears the rest', async () => {
    db.seed('helper_profiles', [ambassador('jade', 'founder')])
    await resetAccountToBase('jade', { currentRole: 'founder' })
    expect(profile('jade')).toMatchObject({ role: 'founder', ...BASE })
    expect(db.callsTo('helper_profiles', 'update')[0].payload).not.toHaveProperty('role')
  })

  it("leaves everyone else's account alone", async () => {
    db.seed('helper_profiles', [ambassador('ruth', 'admin'), ambassador('sam', 'admin')])
    await resetAccountToBase('ruth', { currentRole: 'admin' })
    expect(profile('sam')).toEqual(ambassador('sam', 'admin'))
  })

  it('hands back the error when the database says no', async () => {
    db.seed('helper_profiles', [ambassador('ruth', 'admin')])
    db.failNext('helper_profiles', 'update', { code: '42501', message: 'permission denied' })
    expect(await resetAccountToBase('ruth', { currentRole: 'admin' })).toEqual({ error: { code: '42501', message: 'permission denied' } })
  })
})
