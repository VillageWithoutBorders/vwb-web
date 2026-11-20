// Starting a chat from a profile: a block stops it both ways without saying who blocked
// whom, two neighbors keep one chat, and every answer is a sentence safe to show.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'
import { startConversation } from '../../src/utils/startConversation'
import { NEW_ACCOUNT_NOTE } from '../../src/utils/newAccount'

const opened = () => db.rpcCalls('open_conversation')

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('startConversation', () => {
  it.each([
    ['nobody is signed in', null, 'ruth'],
    ['there is nobody to message', 'me', undefined],
    ['the person is yourself', 'me', 'me'],
  ])('gives a plain error, without asking the database, when %s', async (_when, myId, otherId) => {
    expect(await startConversation(myId, otherId)).toEqual({ error: 'Something went wrong. Try again.' })
    expect(db.calls).toHaveLength(0)
  })

  describe('blocks', () => {
    it.each([
      ['you blocked them', { blocker_id: 'me', blocked_id: 'ruth' }],
      ['they blocked you', { blocker_id: 'ruth', blocked_id: 'me' }],
    ])('stops when %s, with the same words either way, and never opens a chat', async (_when, block) => {
      db.seed('blocks', [block])
      db.seed('conversations', [{ id: 5, helper_id: 'me', requester_id: 'ruth', created_at: '2026-11-01T00:00:00.000Z' }])
      expect(await startConversation('me', 'ruth')).toEqual({ error: 'You cannot message this person.' })
      expect(db.callsTo('conversations')).toHaveLength(0)
      expect(opened()).toHaveLength(0)
    })

    it('a block between other people does not get in the way', async () => {
      db.seed('blocks', [{ blocker_id: 'ruth', blocked_id: 'sam' }])
      db.onRpc('open_conversation', () => [{ result: 'open', convo_id: 9 }])
      expect(await startConversation('me', 'ruth')).toEqual({ id: 9 })
    })
  })

  describe('a chat that already exists', () => {
    it.each([
      ['you helped them', { helper_id: 'me', requester_id: 'ruth' }],
      ['they helped you', { helper_id: 'ruth', requester_id: 'me' }],
    ])('is opened again when %s, without starting a new one', async (_when, pair) => {
      db.seed('conversations', [
        { id: 4, helper_id: 'me', requester_id: 'sam', created_at: '2026-10-01T00:00:00.000Z' },
        { id: 5, ...pair, created_at: '2026-11-01T00:00:00.000Z' },
      ])
      expect(await startConversation('me', 'ruth')).toEqual({ id: 5 })
      expect(opened()).toHaveLength(0)
    })

    it('opens the oldest one when the two of you somehow have more than one', async () => {
      db.seed('conversations', [
        { id: 8, helper_id: 'ruth', requester_id: 'me', created_at: '2026-11-05T00:00:00.000Z' },
        { id: 5, helper_id: 'me', requester_id: 'ruth', created_at: '2026-11-01T00:00:00.000Z' },
      ])
      expect(await startConversation('me', 'ruth')).toEqual({ id: 5 })
    })

    it('gives a plain error, and starts nothing, when the look for it fails', async () => {
      db.failNext('conversations', 'select')
      expect(await startConversation('me', 'ruth')).toEqual({ error: 'Something went wrong. Try again.' })
      expect(opened()).toHaveLength(0)
    })
  })

  describe('no chat yet: the database decides', () => {
    it('opens the chat when the rules allow it', async () => {
      db.onRpc('open_conversation', () => [{ result: 'open', convo_id: 9 }])
      expect(await startConversation('me', 'ruth')).toEqual({ id: 9 })
      expect(opened().map((c) => c.args)).toEqual([{ p_other: 'ruth' }])
    })

    it('reads the answer whether it comes as one row or a list', async () => {
      db.onRpc('open_conversation', () => ({ result: 'open', convo_id: 9 }))
      expect(await startConversation('me', 'ruth')).toEqual({ id: 9 })
    })

    it('says a request was sent when they have to accept first', async () => {
      db.onRpc('open_conversation', () => [{ result: 'requested', convo_id: null }])
      expect(await startConversation('me', 'ruth')).toEqual({ notice: 'Request sent. They will get an alert and can accept or ignore it.' })
    })

    it('says you already asked, instead of sending a second request', async () => {
      db.onRpc('open_conversation', () => [{ result: 'already' }])
      expect(await startConversation('me', 'ruth')).toEqual({ notice: 'You already asked. They will see it in their Messages.' })
    })

    it('says to try tomorrow when you have sent a lot of requests today', async () => {
      db.onRpc('open_conversation', () => [{ result: 'limit' }])
      expect(await startConversation('me', 'ruth')).toEqual({ error: 'You have sent a lot of requests today. Try again tomorrow.' })
    })
  })

  describe('when the database says no', () => {
    it.each([
      ['the new-account rule by name', { code: 'P0001', message: 'new_accounts_cannot_message_first' }],
      ['a row-level security refusal', { code: '42501', message: 'new row violates row-level security policy for table "conversations"' }],
    ])('explains the new-account rule kindly for %s', async (_what, error) => {
      db.failNext('open_conversation', 'rpc', error)
      expect(await startConversation('me', 'ruth')).toEqual({ error: NEW_ACCOUNT_NOTE })
    })

    it('shows the words the database wrote for a permission rule', async () => {
      db.failNext('open_conversation', 'rpc', { code: '42501', message: 'This person only takes messages from people they know.' })
      expect(await startConversation('me', 'ruth')).toEqual({ error: 'This person only takes messages from people they know.' })
    })

    it('shows a plain sentence, never the technical error, for anything else', async () => {
      db.failNext('open_conversation', 'rpc', { code: '23503', message: 'insert or update on table "conversations" violates foreign key constraint' })
      expect(await startConversation('me', 'ruth')).toEqual({ error: 'Could not start a conversation. Try again.' })
    })
  })
})
