// Erases event entrance photos that aren't needed anymore. Nov 11, 2026.
//
// A Supabase cron job calls this every night (vwb-event-entrance-photos.sql).
// The database decides what to erase (event_photos_to_erase):
//   * photos of events that ended 30 or more days ago,
//   * photos of events that were deleted,
//   * leftover files that aren't any event's current photo.
// This function only removes those files from the private "event-photos" space.
//
// Safety:
//   * It needs the x-push-secret header to match PUSH_WEBHOOK_SECRET (the same
//     private password push alerts use). Anyone else gets "Unauthorized".
//   * It reads nothing about people and logs only counts.
import { createClient } from "npm:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const SECRET = (Deno.env.get("PUSH_WEBHOOK_SECRET") || "").trim()
const BUCKET = "event-photos"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

// Constant-time string compare
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const given = req.headers.get("x-push-secret") ?? ""
  if (!SECRET || !safeEqual(given, SECRET)) return json({ error: "Unauthorized" }, 401)

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data, error } = await admin.rpc("event_photos_to_erase")
  if (error) {
    console.error("event_photos_to_erase failed:", error.message)
    return json({ error: "Could not get the list" }, 500)
  }
  const names = ((data || []) as string[]).filter((n) => /^[0-9]{1,18}\/[0-9a-f-]{36}\.(webp|jpg)$/.test(n))
  let erased = 0
  for (let i = 0; i < names.length; i += 100) {
    const part = names.slice(i, i + 100)
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(part)
    if (rmErr) console.error("remove failed:", rmErr.message)
    else erased += part.length
  }
  console.log(`event photos erased: ${erased} of ${names.length}`)
  return json({ erased, found: names.length })
})
