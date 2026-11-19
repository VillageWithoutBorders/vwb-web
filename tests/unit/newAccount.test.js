// New accounts earn trust before they can message first or post offers. The database
// enforces that. This spots its "no" so the app can explain kindly instead of showing an error.
import { describe, expect, it } from 'vitest'
import { NEW_ACCOUNT_NOTE, isNewAccountBlock } from '../../src/utils/newAccount'

describe('isNewAccountBlock', () => {
  it.each([
    ['a named new-account rule', { code: 'P0001', message: 'new_accounts_cannot_message_first' }],
    ['the rule written out in words', { code: 'P0001', message: 'New accounts can do this once someone vouches for you.' }],
    ['the same words in other capitals', { message: 'new accounts can not start groups yet' }],
    ['a row-level security refusal', { code: '42501', message: 'new row violates row-level security policy for table "offers"' }],
  ])('recognizes %s', (_what, error) => {
    expect(isNewAccountBlock(error)).toBe(true)
  })

  it('recognizes the app\'s own kind note', () => {
    expect(isNewAccountBlock({ message: NEW_ACCOUNT_NOTE })).toBe(true)
  })

  it.each([
    ['no error', null],
    ['no error', undefined],
    ['an error with no message', {}],
    ['a network failure', { message: 'Failed to fetch' }],
    ['a permission error that is not about row-level security', { code: '42501', message: 'permission denied for table offers' }],
    ['a row-level security message with a different code', { code: 'PGRST301', message: 'row-level security' }],
    ['a duplicate row', { code: '23505', message: 'duplicate key value violates unique constraint' }],
  ])('does not blame the new-account rules for %s', (_what, error) => {
    expect(isNewAccountBlock(error)).toBe(false)
  })
})
