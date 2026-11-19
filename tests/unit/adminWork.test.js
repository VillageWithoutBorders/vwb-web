// Admin work belongs in the shared Admin inbox, not mixed into an admin's personal alerts.
// This decides which alerts count as admin work.
import { describe, expect, it } from 'vitest'
import { ADMIN_WORK_TYPES, isAdminWork } from '../../src/utils/adminWork'

describe('isAdminWork', () => {
  it('counts the two requests to close an emergency, with or without a link', () => {
    expect([...ADMIN_WORK_TYPES].sort()).toEqual(['duplicate_merge_request', 'false_alarm_request'])
    for (const type of ADMIN_WORK_TYPES) {
      expect(isAdminWork({ type })).toBe(true)
      expect(isAdminWork({ type, link: '/emergency/5' })).toBe(true)
    }
  })

  it('counts anything that opens the Admin page', () => {
    expect(isAdminWork({ type: 'ambassador_application', link: '/admin?tab=approvals' })).toBe(true)
    expect(isAdminWork({ type: 'village', link: '/admin' })).toBe(true)
  })

  it('counts resource and safety reports that open the resource reports page', () => {
    expect(isAdminWork({ type: 'resource_report', link: '/resource-reports' })).toBe(true)
    expect(isAdminWork({ type: 'safety_report', link: '/resource-reports?id=3' })).toBe(true)
    // Another kind of alert that opens the same page stays personal.
    expect(isAdminWork({ type: 'report_reviewed', link: '/resource-reports' })).toBe(false)
  })

  it('leaves an admin\'s own alerts alone', () => {
    expect(isAdminWork({ type: 'message', link: '/messages' })).toBe(false)
    expect(isAdminWork({ type: 'safety_report', link: '/notifications' })).toBe(false)
    expect(isAdminWork({ type: 'vouch' })).toBe(false)
    expect(isAdminWork({ type: 'village', link: null })).toBe(false)
    expect(isAdminWork({})).toBe(false)
    expect(isAdminWork(null)).toBe(false)
  })
})
