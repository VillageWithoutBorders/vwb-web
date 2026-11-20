// Every alert is tappable and opens the right page, even old alerts that were
// saved with no link or with only "/admin".
import { describe, expect, it } from 'vitest'
import { adminAlertLink, personalAlertLink } from '../../src/utils/alertLink'

describe('personalAlertLink', () => {
  it('uses the alert\'s own link when it has one', () => {
    expect(personalAlertLink({ type: 'message', link: '/messages/abc' })).toBe('/messages/abc')
    expect(personalAlertLink({ type: 'never_seen_before', link: '/events/42' })).toBe('/events/42')
  })

  it.each([
    ['message', '/messages'],
    ['match_request', '/tasks?tab=requests'],
    ['task_complete', '/tasks'],
    ['emergency', '/emergency'],
    ['security_alert', '/settings?tab=account'],
    ['calendar_invite', '/calendar'],
    ['group_waiting', '/groups'],
    ['vouch', '/profile'],
    ['app_news', '/whats-new'],
  ])('opens the right page for a %s alert saved with no link', (type, page) => {
    expect(personalAlertLink({ type })).toBe(page)
    expect(personalAlertLink({ type, link: '' })).toBe(page)
    expect(personalAlertLink({ type, link: null })).toBe(page)
  })

  it('opens the Alerts page when it cannot tell where an alert belongs', () => {
    expect(personalAlertLink({ type: 'never_seen_before' })).toBe('/notifications')
    expect(personalAlertLink({})).toBe('/notifications')
    expect(personalAlertLink(null)).toBe('/notifications')
  })
})

describe('adminAlertLink', () => {
  it('uses the alert\'s own link when it points somewhere real', () => {
    expect(adminAlertLink({ kind: 'member_report', link: '/admin?tab=reports&id=7' })).toBe('/admin?tab=reports&id=7')
    expect(adminAlertLink({ kind: 'organization', link: '/org-dashboard' })).toBe('/org-dashboard')
  })

  it.each([
    ['member_report', '/admin?tab=reports'],
    ['safety_report', '/admin?tab=reports'],
    ['emergency', '/admin?tab=emergencies'],
    ['event_close', '/admin?tab=emergencies'],
    ['ambassador_application', '/admin?tab=approvals'],
    ['org_request', '/admin?tab=organizations'],
    ['resource_report', '/resource-reports'],
    ['resource_suggestion', '/community/resources?suggestions=1'],
    ['crn_preview', '/admin?tab=crn'],
  ])('sends a %s alert to the Admin section that handles it', (kind, page) => {
    expect(adminAlertLink({ kind, title: 'Needs a look', body: '' })).toBe(page)
    // A bare "/admin" goes nowhere when you are already on Admin.
    expect(adminAlertLink({ kind, link: '/admin' })).toBe(page)
    expect(adminAlertLink({ kind, link: '/admin/' })).toBe(page)
  })

  it('sends an alert that talks about a village or a keeper to the Villages section', () => {
    expect(adminAlertLink({ kind: 'general', title: 'New village waiting', link: '/admin' })).toBe('/admin?tab=villages')
    expect(adminAlertLink({ kind: 'general', title: 'Heads up', body: 'A Keeper stepped down.' })).toBe('/admin?tab=villages')
    expect(adminAlertLink({ kind: 'village' })).toBe('/admin?tab=villages')
  })

  it('opens the Admin inbox when it cannot tell where an alert belongs', () => {
    expect(adminAlertLink({ kind: 'never_seen_before', title: 'Something new' })).toBe('/admin?tab=inbox')
    expect(adminAlertLink({})).toBe('/admin?tab=inbox')
    expect(adminAlertLink(null)).toBe('/admin?tab=inbox')
  })
})
