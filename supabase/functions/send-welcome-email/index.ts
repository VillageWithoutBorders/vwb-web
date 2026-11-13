// Sends the welcome email to a new account, once, right after its email is confirmed.
// Called by the database trigger welcome_new_account (vwb-welcome-and-test-alerts.sql).
// Requires the header x-push-secret to match PUSH_WEBHOOK_SECRET (same secret as push).
// Secrets: RESEND_API_KEY, WELCOME_FROM (like: Village Without Borders <hello@villagewithoutborders.org>).
// Optional: WELCOME_REPLY_TO (an inbox a person reads; without it the "reply" line is left out),
// APP_URL (default https://app.villagewithoutborders.org).
import { createClient } from "npm:@supabase/supabase-js@2"

const PUSH_WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? ""
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? ""
const WELCOME_FROM = Deno.env.get("WELCOME_FROM") ?? ""
const WELCOME_REPLY_TO = Deno.env.get("WELCOME_REPLY_TO") ?? ""
const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.villagewithoutborders.org").replace(/\/+$/, "")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}

// The words. Short lines, plain language, no em dashes.
const WORDS = {
  en: {
    subject: "Welcome to Village Without Borders",
    hi: (n: string) => n ? `Hi ${n},` : "Hi neighbor,",
    lines: [
      "Your account is ready. We are glad you are here.",
      "Village Without Borders is neighbors helping neighbors. No money changes hands. You can ask for help, offer help, and find the people near you.",
      "Here are three good first steps:",
    ],
    steps: [
      "Open My Corner. Everything you need starts there.",
      "Find your village, so you can meet the people close by.",
      "Turn on alerts in Settings, so you know when a neighbor answers.",
    ],
    button: "Open the app",
    safety: "We never share where you live. You choose who sees what.",
    help: "Questions? Reply to this email and a person will answer.",
    sign: "With care,\nVillage Without Borders",
    why: "You got this email because you made an account on Village Without Borders. This is the only welcome email we send.",
  },
  es: {
    subject: "Bienvenido a Village Without Borders",
    hi: (n: string) => n ? `Hola, ${n}:` : "Hola, vecino:",
    lines: [
      "Su cuenta está lista. Nos alegra que esté aquí.",
      "Village Without Borders es vecinos que se ayudan. Nadie paga dinero. Puede pedir ayuda, ofrecer ayuda y encontrar a la gente cerca de usted.",
      "Tres buenos primeros pasos:",
    ],
    steps: [
      "Abra Mi rincón. Todo lo que necesita empieza ahí.",
      "Encuentre su aldea, para conocer a la gente cercana.",
      "Active las alertas en Ajustes, para saber cuando un vecino responde.",
    ],
    button: "Abrir la app",
    safety: "Nunca compartimos dónde vive. Usted decide quién ve qué.",
    help: "¿Preguntas? Responda a este correo y una persona le contestará.",
    sign: "Con cariño,\nVillage Without Borders",
    why: "Recibió este correo porque creó una cuenta en Village Without Borders. Es el único correo de bienvenida que enviamos.",
  },
}

function build(lang: "en" | "es", name: string) {
  const w = WORDS[lang]
  const link = `${APP_URL}/me`
  const text = [
    w.hi(name), "",
    ...w.lines.flatMap((l) => [l, ""]),
    ...w.steps.map((s, i) => `${i + 1}. ${s}`), "",
    `${w.button}: ${link}`, "",
    w.safety, "",
    ...(WELCOME_REPLY_TO ? [w.help, ""] : []),
    w.sign, "", "--", w.why,
  ].join("\n")

  const p = (s: string) => `<p style="margin:0 0 16px;font-size:18px;line-height:1.55;color:#1f2a27">${esc(s)}</p>`
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;padding:0;background:#f6f1e7">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:'Atkinson Hyperlegible',Verdana,Arial,sans-serif">
<h1 style="margin:0 0 20px;font-size:26px;line-height:1.25;color:#2E4D46">${esc(w.subject)}</h1>
${p(w.hi(name))}
${w.lines.map(p).join("\n")}
<ol style="margin:0 0 20px;padding-left:24px;font-size:18px;line-height:1.55;color:#1f2a27">
${w.steps.map((s) => `<li style="margin-bottom:8px">${esc(s)}</li>`).join("\n")}
</ol>
<p style="margin:0 0 24px"><a href="${esc(link)}" style="display:inline-block;background:#2E4D46;color:#ffffff;text-decoration:none;font-size:18px;font-weight:700;padding:14px 24px;border-radius:12px">${esc(w.button)}</a></p>
${p(w.safety)}
${WELCOME_REPLY_TO ? p(w.help) : ""}
<p style="margin:0 0 24px;font-size:18px;line-height:1.55;color:#1f2a27;white-space:pre-line">${esc(w.sign)}</p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#55605c">${esc(w.why)}</p>
</div></body></html>`
  return { subject: w.subject, text, html }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const given = req.headers.get("x-push-secret") ?? ""
  if (!PUSH_WEBHOOK_SECRET || !safeEqual(given, PUSH_WEBHOOK_SECRET)) return json({ error: "Unauthorized" }, 401)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  let userId = ""
  try {
    const body = await req.json()
    userId = typeof body?.user_id === "string" ? body.user_id : ""
  } catch { /* bad json */ }
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "No user_id" }, 400)

  async function note(error: string | null) {
    const { error: e } = await supabase.from("welcome_sent")
      .update(error ? { email_error: error.slice(0, 300) } : { email_at: new Date().toISOString(), email_error: null })
      .eq("user_id", userId)
    if (e) console.error("welcome_sent update failed:", e.message)
  }

  if (!RESEND_API_KEY || !WELCOME_FROM) {
    await note("RESEND_API_KEY or WELCOME_FROM secret is missing")
    return json({ error: "Not set up" }, 500)
  }

  const { data: sent } = await supabase.from("welcome_sent").select("email_at").eq("user_id", userId).maybeSingle()
  if (sent?.email_at) return json({ message: "Already sent" })

  const { data, error } = await supabase.auth.admin.getUserById(userId)
  const user = data?.user
  if (error || !user?.email || !user.email_confirmed_at) {
    await note("user not found or not confirmed")
    return json({ error: "User not ready" }, 400)
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const lang = meta.lang === "es" ? "es" : "en"
  const name = typeof meta.display_name === "string" ? meta.display_name.trim().slice(0, 60) : ""
  const msg = build(lang, name)

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: WELCOME_FROM, to: [user.email], subject: msg.subject, text: msg.text, html: msg.html,
      ...(WELCOME_REPLY_TO ? { reply_to: WELCOME_REPLY_TO } : {}) }),
  })
  if (!res.ok) {
    const why = `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`
    console.error(why)
    await note(why)
    return json({ error: "Send failed" }, 502)
  }
  await note(null)
  return json({ sent: true })
})
