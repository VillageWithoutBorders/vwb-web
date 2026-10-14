// Sends a web push to every device a user has subscribed.
// Called by the database trigger on new notifications (see vwb-push.sql).
// Requires the header x-push-secret to match the PUSH_WEBHOOK_SECRET secret.
import { createClient } from "npm:@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!
const PUSH_WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
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
  if (!PUSH_WEBHOOK_SECRET || !safeEqual(given, PUSH_WEBHOOK_SECRET)) {
    return json({ error: "Unauthorized" }, 401)
  }

  try {
    const { record } = await req.json()
    if (!record?.user_id) return json({ error: "No user_id" }, 400)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", record.user_id)

    if (error || !subs?.length) return json({ message: "No subscriptions" })

    const payload = JSON.stringify({
      title: record.title || "Village Without Borders",
      body: record.body || "",
      url: record.link || "/",
      tag: record.type || "vwb-notification",
    })

    const dead: string[] = []
    let sent = 0
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 86400, urgency: "normal" },
        )
        sent++
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode
        // 404/410: subscription gone. 401/403: made with an old VAPID key.
        if (code === 404 || code === 410 || code === 401 || code === 403) dead.push(s.endpoint)
        else console.error("Push send error:", code, (err as Error).message)
      }
    }))

    if (dead.length) {
      await supabase.from("push_subscriptions").delete()
        .eq("user_id", record.user_id).in("endpoint", dead)
    }
    return json({ sent, removed: dead.length })
  } catch (err) {
    console.error("Edge function error:", err)
    return json({ error: "Server error" }, 500)
  }
})
