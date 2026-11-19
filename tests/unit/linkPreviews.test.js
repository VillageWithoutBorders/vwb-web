// @vitest-environment node
// The preview cards shown when an event or invite link is shared (Cloudflare Pages
// Functions in functions/). The rule: a card may show a public event's or group's
// name, never anything private, and never a street address.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onRequest as eventPreview } from '../../functions/events/[id].js'
import { onRequest as invitePreview } from '../../functions/join/[token].js'

// A stand-in for Cloudflare's page rewriter: it records what each tag is set to.
let changes
class FakeRewriter {
  on(selector, handler) {
    handler.element({
      setAttribute: (name, value) => { changes[selector] = value },
      setInnerContent: (value) => { changes[selector] = value },
    })
    return this
  }
  transform(page) { return page }
}

function context(params, env = { VITE_SUPABASE_URL: 'https://fake.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' }) {
  return {
    request: new Request('https://app.example.org/whatever'),
    env: { ...env, ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }) } },
    params,
  }
}

function database(rows, ok = true) {
  return vi.fn(async () => new Response(JSON.stringify(rows), { status: ok ? 200 : 500 }))
}

const TOKEN = '0f8fad5b-d9cb-469f-a165-70867728950e'

beforeEach(() => {
  changes = {}
  vi.stubGlobal('HTMLRewriter', FakeRewriter)
})
afterEach(() => vi.unstubAllGlobals())

describe('event link preview', () => {
  const PUBLIC = { id: 41, title: 'Community Potluck', visibility: 'public', status: 'active', starts_at: '2026-11-21T23:00:00Z', town: 'Ringgold', address: '100 Church St', organization_name: 'Library Friends' }

  it('shows a public event\'s title, day, town and host', async () => {
    vi.stubGlobal('fetch', database([PUBLIC]))
    const res = await eventPreview(context({ id: '41' }))

    expect(res.status).toBe(200)
    expect(changes.title).toBe('Community Potluck')
    expect(changes['meta[property="og:title"]']).toBe('Community Potluck')
    expect(changes['meta[property="og:description"]']).toBe('Saturday, November 21 at 6:00 PM · Ringgold · Library Friends')
  })

  it('never puts the street address on the card', async () => {
    vi.stubGlobal('fetch', database([PUBLIC]))
    await eventPreview(context({ id: '41' }))
    expect(JSON.stringify(changes)).not.toContain('100 Church St')
  })

  it.each([
    ['a members-only event', [{ ...PUBLIC, visibility: 'members' }]],
    ['a cancelled event', [{ ...PUBLIC, status: 'cancelled' }]],
    ['an event that does not exist', []],
  ])('shows the plain card for %s', async (_what, rows) => {
    vi.stubGlobal('fetch', database(rows))
    await eventPreview(context({ id: '41' }))
    expect(changes.title).toBe('An event on Village Without Borders')
    expect(JSON.stringify(changes)).not.toContain('Potluck')
  })

  it('shows the plain card when the database cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const res = await eventPreview(context({ id: '41' }))
    expect(res.status).toBe(200)
    expect(changes.title).toBe('An event on Village Without Borders')
  })

  it('does not ask the database about an address that is not a number', async () => {
    const fetchSpy = database([PUBLIC])
    vi.stubGlobal('fetch', fetchSpy)
    await eventPreview(context({ id: '41; drop table' }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(changes.title).toBe('An event on Village Without Borders')
  })

  it('says Online instead of a town for an online event, and trims a very long title', async () => {
    vi.stubGlobal('fetch', database([{ ...PUBLIC, is_online: true, organization_name: null, title: 'A'.repeat(300) }]))
    await eventPreview(context({ id: '41' }))
    expect(changes.title).toHaveLength(120)
    expect(changes['meta[name="description"]']).toBe('Saturday, November 21 at 6:00 PM · Online')
  })

  it('sends the same safety headers as the rest of the site', async () => {
    vi.stubGlobal('fetch', database([PUBLIC]))
    const res = await eventPreview(context({ id: '41' }))
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=31536000')
    expect(res.headers.get('Permissions-Policy')).toContain('geolocation=()')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('group invite link preview', () => {
  it('shows the group\'s name and welcome line when the database says it may', async () => {
    const fetchSpy = database([{ name: 'Ringgold Gardeners', welcome: 'We grow food together' }])
    vi.stubGlobal('fetch', fetchSpy)
    await invitePreview(context({ token: TOKEN }))

    expect(changes.title).toBe('Join Ringgold Gardeners on Village Without Borders')
    expect(changes['meta[property="og:description"]']).toBe('We grow food together.')
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ p_token: TOKEN })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://fake.supabase.co/rest/v1/rpc/org_invite_public_preview')
  })

  it('shows the plain card for a hidden group (the database returns nothing)', async () => {
    vi.stubGlobal('fetch', database([]))
    await invitePreview(context({ token: TOKEN }))
    expect(changes.title).toBe("You're invited to a group on Village Without Borders")
    expect(changes['meta[name="description"]']).toBe('A free app where neighbors help neighbors. Tap to join.')
  })

  it('does not ask the database about a link that is not shaped like an invite', async () => {
    const fetchSpy = database([{ name: 'X' }])
    vi.stubGlobal('fetch', fetchSpy)
    await invitePreview(context({ token: '../../etc/passwd' }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(changes.title).toBe("You're invited to a group on Village Without Borders")
  })

  it('shows the plain card when the site has no database settings', async () => {
    const fetchSpy = database([{ name: 'X' }])
    vi.stubGlobal('fetch', fetchSpy)
    await invitePreview(context({ token: TOKEN }, {}))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(changes.title).toBe("You're invited to a group on Village Without Borders")
  })

  it('keeps a long welcome line short and sends the safety headers', async () => {
    vi.stubGlobal('fetch', database([{ name: 'G', welcome: 'w'.repeat(500) }]))
    const res = await invitePreview(context({ token: TOKEN }))
    expect(changes['meta[name="description"]']).toHaveLength(161)
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
