import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

async function importVapidKey(base64Key: string, isPrivate: boolean) {
  const padding = "=".repeat((4 - base64Key.length % 4) % 4)
  const base64 = (base64Key + padding).replace(/-/g, "+").replace(/_/g, "/")
  const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  return crypto.subtle.importKey(
    isPrivate ? "pkcs8" : "raw",
    isPrivate ? binary : binary,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    isPrivate ? ["sign"] : []
  )
}

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function createVapidAuthHeader(endpoint: string) {
  const url = new URL(endpoint)
  const audience = `${url.protocol}//${url.host}`
  const expiry = Math.floor(Date.now() / 1000) + 12 * 60 * 60

  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })))
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: expiry,
    sub: VAPID_SUBJECT
  })))

  const unsignedToken = `${header}.${payload}`
  const key = await importVapidKey(VAPID_PRIVATE_KEY, true)
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken)
  )

  const sig = base64UrlEncode(new Uint8Array(signature))
  return {
    authorization: `vapid t=${header}.${payload}.${sig}, k=${VAPID_PUBLIC_KEY}`,
  }
}

async function sendPush(subscription: any, payload: string) {
  try {
    const headers = await createVapidAuthHeader(subscription.endpoint)
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
        TTL: "86400",
      },
      body: new TextEncoder().encode(payload),
    })
    if (response.status === 410 || response.status === 404) {
      return { expired: true, endpoint: subscription.endpoint }
    }
    return { ok: response.ok, status: response.status }
  } catch (err) {
    console.error("Push send error:", err)
    return { ok: false, error: err.message }
  }
}

serve(async (req) => {
  try {
    const { record } = await req.json()
    if (!record?.user_id) {
      return new Response(JSON.stringify({ error: "No user_id" }), { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", record.user_id)

    if (error || !subscriptions?.length) {
      return new Response(JSON.stringify({ message: "No subscriptions found" }), { status: 200 })
    }

    const payload = JSON.stringify({
      title: record.title || "Village Without Borders",
      body: record.body || "",
      url: record.link || "/",
      tag: record.type || "vwb-notification"
    })

    const results = []
    const expiredEndpoints = []

    for (const sub of subscriptions) {
      const result = await sendPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
      results.push(result)
      if (result.expired) expiredEndpoints.push(sub.endpoint)
    }

    if (expiredEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", record.user_id)
        .in("endpoint", expiredEndpoints)
    }

    return new Response(JSON.stringify({ sent: results.length, results }), { status: 200 })
  } catch (err) {
    console.error("Edge function error:", err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})