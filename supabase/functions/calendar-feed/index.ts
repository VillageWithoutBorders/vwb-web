// A calendar feed a group's followers can subscribe to from their phone or
// computer calendar. It lists ONLY the group's PUBLIC events.
//
// How it stays private:
//   * It asks the database the same way a signed-out visitor on the website
//     would (the public anon key, no sign-in). So it can only ever receive
//     what the public calendar already shows. Members-only, invite-only and
//     council-wide events never reach it.
//   * "Only show the address to people who sign up" is applied by the
//     database, so those events come through without an address.
//   * It uses no service key and writes nothing.
//
// Link shape:  <project>.supabase.co/functions/v1/calendar-feed?org=<group id>
// Without ?org= it lists Village Without Borders' own public events.
//
// Deploy:  supabase functions deploy calendar-feed --no-verify-jwt
// (Calendar apps cannot sign in, so the sign-in check is off. That is safe
// because of the points above.)
//
// Optional secret: SITE_URL (defaults to https://app.villagewithoutborders.org)

import { createClient } from "npm:@supabase/supabase-js@2"
import { buildCalendar, type FeedEvent } from "./ics.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const SITE_URL = (Deno.env.get("SITE_URL") || "https://app.villagewithoutborders.org").trim()

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } })
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return text(405, "GET only")
  const org = (new URL(req.url).searchParams.get("org") || "").trim()
  // No group id (or "vwb") means Village Without Borders' own public events.
  const own = org === "" || org.toLowerCase() === "vwb"
  if (!own && !UUID.test(org)) return text(400, "Bad group id.")

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const from = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()
  const until = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase.rpc("list_calendar_events", { p_from: from, p_until: until })
  if (error) {
    console.error("list_calendar_events failed", error.message)
    return text(502, "The calendar is not available right now. Try again later.")
  }

  const rows = (data || []).filter((e: Record<string, unknown>) =>
    (own ? !e.organization_id : e.organization_id === org) && e.visibility === "public"
  )
  const name = rows[0]?.organization_name ? String(rows[0].organization_name) + " events" : "Village Without Borders events"

  const body = buildCalendar({ name, siteUrl: SITE_URL, events: rows as FeedEvent[] })
  return new Response(req.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="vwb-events.ics"',
      "Cache-Control": "public, max-age=900",
    },
  })
})
