// Cloudflare Pages Function (Round E part 2, Nov 10): link previews for group invite links.
// /join/<token> serves the normal app page, with the preview card (Facebook, texts,
// Signal) showing the group's name and welcome line, but only for groups anyone can
// already see. Account-only and invisible groups get a plain "You're invited" card.
// Uses the public (anon) key, which is already in the app. Needs the Pages variables
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY; without them every link gets the plain card.

const PLAIN_TITLE = "You're invited to a group on Village Without Borders"
const PLAIN_DESC = 'A free app where neighbors help neighbors. Tap to join.'

// Same safety headers as public/_headers (Pages does not add those to Function responses).
const SAFETY = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
  'Cache-Control': 'no-store',
}

async function lookUp(env, token) {
  const base = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY
  if (!base || !key || !/^[0-9a-f-]{36}$/i.test(token)) return null
  try {
    const res = await fetch(base + '/rest/v1/rpc/org_invite_public_preview', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
      cf: { cacheTtl: 0 },
    })
    if (!res.ok) return null
    const rows = await res.json()
    return Array.isArray(rows) && rows[0] && rows[0].name ? rows[0] : null
  } catch {
    return null
  }
}

class SetContent {
  constructor(value) { this.value = value }
  element(el) { el.setAttribute('content', this.value) }
}
class SetText {
  constructor(value) { this.value = value }
  element(el) { el.setInnerContent(this.value) }
}

export async function onRequest(context) {
  const { request, env, params } = context
  const page = await env.ASSETS.fetch(new URL('/', request.url))
  const group = await lookUp(env, String(params.token || ''))
  const title = group ? 'Join ' + group.name + ' on Village Without Borders' : PLAIN_TITLE
  const desc = group && group.welcome ? group.welcome.slice(0, 160) + '.' : PLAIN_DESC
  const out = new HTMLRewriter()
    .on('title', new SetText(title))
    .on('meta[property="og:title"]', new SetContent(title))
    .on('meta[name="twitter:title"]', new SetContent(title))
    .on('meta[property="og:description"]', new SetContent(desc))
    .on('meta[name="twitter:description"]', new SetContent(desc))
    .on('meta[name="description"]', new SetContent(desc))
    .transform(page)
  const headers = new Headers(out.headers)
  for (const [k, v] of Object.entries(SAFETY)) headers.set(k, v)
  return new Response(out.body, { status: 200, headers })
}
