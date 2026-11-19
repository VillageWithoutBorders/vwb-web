// Saying yes or no to a neighbor's offer to help: one chat per pair of neighbors,
// the helper is always told, and a "no" only counts when the offer was really removed.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'
import { acceptHelpOffer, declineHelpOffer } from '../../src/utils/helpOffers'

const offer = (more = {}) => ({ id: 10, helper_id: 'helper', request_id: 77, skill_needed: 'Yard work', max_helpers: 2, accepted_count: 0, ...more })
const alerts = () => db.rows('notifications')
// Lets anything still on its way to the database land, before checking that nothing was sent.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  db.seed('skill_matches', [{ id: 10, helper_id: 'helper', request_id: 77, accepted: null }, { id: 11, helper_id: 'other', request_id: 77, accepted: null }])
  db.seed('help_requests', [{ id: 77, requester_id: 'me', status: 'open' }])
})

describe('acceptHelpOffer', () => {
  it('marks only that offer accepted and opens a chat with the helper', async () => {
    const out = await acceptHelpOffer(offer(), 'me')
    expect(db.rows('skill_matches').map((m) => m.accepted)).toEqual([true, null])
    expect(db.rows('conversations')).toEqual([expect.objectContaining({ request_id: 77, helper_id: 'helper', requester_id: 'me' })])
    expect(out).toEqual({ ok: true, convoId: db.rows('conversations')[0].id })
  })

  it('tells the helper, with a link straight to the chat', async () => {
    const out = await acceptHelpOffer(offer(), 'me')
    await vi.waitFor(() => expect(alerts()).toHaveLength(1))
    expect(alerts()[0]).toMatchObject({
      user_id: 'helper', type: 'offer_accepted', body: "You've been accepted to help with: Yard work", link: '/conversation/' + out.convoId,
    })
  })

  it('reuses the chat you already have with this helper and points it at the new request', async () => {
    db.seed('conversations', [{ id: 5, request_id: 12, helper_id: 'helper', requester_id: 'me' }])
    const out = await acceptHelpOffer(offer(), 'me')
    expect(out).toEqual({ ok: true, convoId: 5 })
    expect(db.rows('conversations')).toEqual([{ id: 5, request_id: 77, helper_id: 'helper', requester_id: 'me' }])
  })

  it('reuses the chat when it was started the other way round (they asked, you helped)', async () => {
    db.seed('conversations', [
      { id: 6, request_id: 3, helper_id: 'me', requester_id: 'helper' },
      { id: 7, request_id: 4, helper_id: 'stranger', requester_id: 'me' },
    ])
    const out = await acceptHelpOffer(offer(), 'me')
    expect(out.convoId).toBe(6)
    expect(db.rows('conversations')).toHaveLength(2)
    expect(db.rows('conversations').find((c) => c.id === 7).request_id).toBe(4)
  })

  it('moves the request to "in progress" when this helper fills the last spot', async () => {
    await acceptHelpOffer(offer({ max_helpers: 2, accepted_count: 1 }), 'me')
    expect(db.rows('help_requests')[0].status).toBe('in_progress')
  })

  it('leaves the request open while there is still room for more helpers', async () => {
    await acceptHelpOffer(offer({ max_helpers: 3, accepted_count: 1 }), 'me')
    expect(db.rows('help_requests')[0].status).toBe('open')
  })

  it('leaves the request open when there is no limit on helpers', async () => {
    await acceptHelpOffer(offer({ max_helpers: null, accepted_count: 9 }), 'me')
    expect(db.rows('help_requests')[0].status).toBe('open')
  })

  it('stops and changes nothing else when the yes cannot be saved', async () => {
    db.failNext('skill_matches', 'update')
    const out = await acceptHelpOffer(offer({ max_helpers: 1 }), 'me')
    expect(out).toEqual({ ok: false, convoId: null })
    expect(db.rows('conversations')).toHaveLength(0)
    expect(db.rows('help_requests')[0].status).toBe('open')
    await settle()
    expect(alerts()).toHaveLength(0)
  })

  it('still counts as a yes when the chat cannot be opened, and sends the helper to their tasks', async () => {
    db.failNext('conversations', 'insert')
    const out = await acceptHelpOffer(offer(), 'me')
    expect(out).toEqual({ ok: true, convoId: null })
    await vi.waitFor(() => expect(alerts()).toHaveLength(1))
    expect(alerts()[0].link).toBe('/tasks')
  })
})

describe('declineHelpOffer', () => {
  it('removes only that offer and thanks the helper', async () => {
    expect(await declineHelpOffer(offer())).toBe(true)
    expect(db.rows('skill_matches').map((m) => m.id)).toEqual([11])
    await vi.waitFor(() => expect(alerts()).toHaveLength(1))
    expect(alerts()[0]).toMatchObject({ user_id: 'helper', type: 'offer_declined', link: '/skillshare' })
  })

  it('counts as failed, and tells nobody, when the database quietly removed nothing', async () => {
    expect(await declineHelpOffer(offer({ id: 999 }))).toBe(false)
    expect(db.rows('skill_matches')).toHaveLength(2)
    await settle()
    expect(alerts()).toHaveLength(0)
  })

  it('counts as failed, and tells nobody, when the database gives an error', async () => {
    db.failNext('skill_matches', 'delete')
    expect(await declineHelpOffer(offer())).toBe(false)
    await settle()
    expect(alerts()).toHaveLength(0)
  })
})
