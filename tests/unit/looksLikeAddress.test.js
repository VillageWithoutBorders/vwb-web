// Privacy guard: the gentle "that looks like an address" note (AddressHint) depends on this.
import { describe, expect, it } from 'vitest'
import { looksLikeAddress } from '../../src/utils/looksLikeAddress'

describe('looksLikeAddress', () => {
  it.each([
    '123 Main Street',
    'Meet me at 4502 Battlefield Pkwy',
    '77 oak rd',
    'Calle Luna 12',
    'vivo en avenida Juarez 450',
    'Apt 4B',
    'unit #12',
  ])('spots an address in %j', (text) => {
    expect(looksLikeAddress(text)).toBe(true)
  })

  it.each([
    '',
    null,
    undefined,
    'I need a ride on Tuesday',
    'Ringgold, GA',
    'Call me at 5 pm',
    'I have 3 kids and 2 dogs',
    '5 St',
  ])('leaves %j alone', (text) => {
    expect(looksLikeAddress(text)).toBe(false)
  })
})
