// People can mute kinds of alerts they do not want. Emergencies and security
// warnings always come through and can never be muted.
import { describe, expect, it } from 'vitest'
import { ALWAYS_ALERTS, alertKindName, canMute } from '../../src/utils/alertKinds'

describe('canMute', () => {
  it.each(['emergency', 'emergency_verified', 'security_alert'])('never lets %s be muted', (type) => {
    expect(ALWAYS_ALERTS).toContain(type)
    expect(canMute(type)).toBe(false)
  })

  it('refuses every kind on the always list', () => {
    for (const type of ALWAYS_ALERTS) expect(canMute(type)).toBe(false)
  })

  it.each(['message', 'campfire', 'calendar_invite', 'new_request', 'vouch', 'some_new_kind'])('lets %s be muted', (type) => {
    expect(canMute(type)).toBe(true)
  })

  it.each([
    [''],
    [null],
    [undefined],
    ['Message'],
    ['group post'],
    ['message;drop'],
    ['kind2'],
    ['a'.repeat(41)],
  ])('refuses %j, which is not a plain kind name', (type) => {
    expect(canMute(type)).toBe(false)
  })
})

describe('alertKindName', () => {
  it('gives a plain name for a kind of alert', () => {
    expect(alertKindName('message')).toBe('Private messages')
    expect(alertKindName('new_request')).toBe('New requests for help nearby')
    expect(alertKindName('app_news')).toBe('VWB news and app updates')
  })

  it('uses one name for the old and new sign-up alerts, so the muted list reads the same', () => {
    expect(alertKindName('event_signup')).toBe(alertKindName('calendar_signup'))
  })

  it('has a fallback for a kind it has no name for', () => {
    expect(alertKindName('some_new_kind')).toBe('Other alerts like this')
    expect(alertKindName(undefined)).toBe('Other alerts like this')
  })
})
