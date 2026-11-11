// Cloudflare Pages Function (Round E part 4, Nov 10): link previews for public events.
// /events/<id> serves the normal app page (which works without an account for public
// events), with the preview card showing the event's title, day and town. Never the
// street address. Events that are not public get the plain card.
// Needs the Pages variables VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.

const PLAIN_TITLE = 'An event on Village Without Borders'
const PLAIN_DESC = 'A free app where neighbors help neighbors and find local events.'

// Same safety headers as public/_headers (Pages does not add those to Function responses).
const SAFETY = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
  'Cache-Control': 'no-store',
}

async function lookUp(env, id) {
  const base = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY
  if (!base || !key || !/^\d{1,12}$/.test(id)) return null
  try {
    const res = await fetch(base + '/rest/v1/rpc/get_calendar_event', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: Number(id), p_token: null }),
    })
    if (!res.ok) return null
    const rows = await res.json()
    const ev = Array.isArray(rows) ? rows[0] : null
    return ev && ev.visibility === 'public' && ev.status !== 'cancelled' ? ev : null
  } catch {
    return null
  }
}

function when(ev) {
  try {
    return new Date(ev.starts_at).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
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
  const ev = await lookUp(env, String(params.id || ''))
  const title = ev ? String(ev.title).slice(0, 120) : PLAIN_TITLE
  const desc = ev ? [when(ev), ev.is_online ? 'Online' : ev.town].filter(Boolean).join(' · ') + (ev.organization_name ? ' · ' + ev.organization_name : '') : PLAIN_DESC
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
