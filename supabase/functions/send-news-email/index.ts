// Emails a What's new post to everyone who has news emails on (the default).
// Called by the database (tell_app_news in vwb-whats-new.sql) right after a post,
// and once a day by the cron job news-email-resume to send what the daily limit held back.
// Those calls need the header x-push-secret to match PUSH_WEBHOOK_SECRET.
//
// Also the unsubscribe link: ?off=<token> turns news emails off for that person.
//   GET  (a person tapping the link) -> sends them to APP_URL/news-email-off
//   POST (the mail app's one-tap Unsubscribe button) -> 200
//
// Secrets: RESEND_API_KEY, WELCOME_FROM (same sender as the welcome email).
// Optional: NEWS_FROM (a different sender), WELCOME_REPLY_TO, APP_URL,
// NEWS_EMAILS_PER_RUN (default 80; the free Resend plan allows 100 emails a day in all,
// sign-in emails included).
import { createClient } from "npm:@supabase/supabase-js@2"

const PUSH_WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? ""
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? ""
const FROM = Deno.env.get("NEWS_FROM") || Deno.env.get("WELCOME_FROM") || ""
const REPLY_TO = Deno.env.get("WELCOME_REPLY_TO") ?? ""
const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.villagewithoutborders.org").replace(/\/+$/, "")
const PER_RUN = Math.max(1, Math.min(1000, Number(Deno.env.get("NEWS_EMAILS_PER_RUN") ?? "80") || 80))
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const SELF_URL = `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/send-news-email`

type News = {
  id: string; kind: "new" | "soon"; title: string; body: string
  title_es: string | null; body_es: string | null; link: string | null
  tell_round: number; told_at: string | null; created_at: string; here_at: string | null
}
type Person = { id: string; email: string; lang: "en" | "es"; name: string; token: string }

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
const isUuid = (s: unknown) => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s)

const WORDS = {
  en: {
    lead: { new: "New in VWB", soon: "Coming soon to VWB", here: "It's here" },
    hi: (n: string) => n ? `Hi ${n},` : "Hi neighbor,",
    open: "Open it in the app",
    also: "Also new",
    soonList: "Coming soon",
    all: "See all the news",
    sign: "With care,\nVillage Without Borders",
    why: "You got this because you have a Village Without Borders account.",
    off: "Stop news emails",
    offWhere: "You can also turn them off in Settings, under Alerts.",
  },
  es: {
    lead: { new: "Novedad en VWB", soon: "Muy pronto en VWB", here: "Ya llegó" },
    hi: (n: string) => n ? `Hola, ${n}:` : "Hola, vecino:",
    open: "Abrirlo en la app",
    also: "También es nuevo",
    soonList: "Muy pronto",
    all: "Ver todas las novedades",
    sign: "Con cariño,\nVillage Without Borders",
    why: "Recibió esto porque tiene una cuenta en Village Without Borders.",
    off: "No enviar más novedades",
    offWhere: "También puede apagarlas en Ajustes, en Alertas.",
  },
}

function pick(n: News, lang: "en" | "es") {
  return {
    title: lang === "es" && n.title_es ? n.title_es : n.title,
    body: lang === "es" && n.body_es ? n.body_es : n.body,
  }
}

function build(n: News, arrived: boolean, extras: News[], p: Person) {
  const w = WORDS[p.lang]
  const main = pick(n, p.lang)
  const lead = arrived ? w.lead.here : w.lead[n.kind]
  const subject = `${lead}: ${main.title}`
  const openLink = `${APP_URL}${n.link || `/whats-new#news-${n.id}`}`
  const allLink = `${APP_URL}/whats-new`
  const offLink = `${SELF_URL}?off=${p.token}`
  const paras = main.body.split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean)
  const alsoNew = extras.filter((x) => x.kind === "new")
  const comingSoon = extras.filter((x) => x.kind === "soon")

  const text = [
    w.hi(p.name), "",
    main.title, "",
    ...paras.flatMap((s) => [s, ""]),
    `${w.open}: ${openLink}`, "",
    ...(alsoNew.length ? [w.also, ...alsoNew.map((x) => `- ${pick(x, p.lang).title}`), ""] : []),
    ...(comingSoon.length ? [w.soonList, ...comingSoon.map((x) => `- ${pick(x, p.lang).title}`), ""] : []),
    `${w.all}: ${allLink}`, "",
    w.sign, "", "--", w.why, `${w.off}: ${offLink}`, w.offWhere,
  ].join("\n")

  const P = (s: string) => `<p style="margin:0 0 16px;font-size:18px;line-height:1.55;color:#1f2a27">${esc(s)}</p>`
  const list = (h: string, xs: News[]) => xs.length ? `
<h2 style="margin:24px 0 8px;font-size:20px;color:#2E4D46">${esc(h)}</h2>
<ul style="margin:0 0 16px;padding-left:24px;font-size:18px;line-height:1.55;color:#1f2a27">
${xs.map((x) => `<li style="margin-bottom:6px"><a href="${esc(`${APP_URL}/whats-new#news-${x.id}`)}" style="color:#2E4D46">${esc(pick(x, p.lang).title)}</a></li>`).join("\n")}
</ul>` : ""

  const html = `<!doctype html><html lang="${p.lang}"><body style="margin:0;padding:0;background:#f6f1e7">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:'Atkinson Hyperlegible',Verdana,Arial,sans-serif">
<p style="margin:0 0 6px;font-size:16px;font-weight:700;letter-spacing:0.02em;color:#9C4A2C">${esc(lead)}</p>
<h1 style="margin:0 0 20px;font-size:26px;line-height:1.25;color:#2E4D46">${esc(main.title)}</h1>
${P(w.hi(p.name))}
${paras.map(P).join("\n")}
<p style="margin:0 0 8px"><a href="${esc(openLink)}" style="display:inline-block;background:#E78761;color:#1f2a27;text-decoration:none;font-size:18px;font-weight:700;padding:14px 24px;border-radius:12px">${esc(w.open)}</a></p>
${list(w.also, alsoNew)}
${list(w.soonList, comingSoon)}
<p style="margin:16px 0 24px;font-size:18px"><a href="${esc(allLink)}" style="color:#2E4D46">${esc(w.all)}</a></p>
<p style="margin:0 0 24px;font-size:18px;line-height:1.55;color:#1f2a27;white-space:pre-line">${esc(w.sign)}</p>
<p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:#55605c">${esc(w.why)}</p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#55605c"><a href="${esc(offLink)}" style="color:#55605c">${esc(w.off)}</a>. ${esc(w.offWhere)}</p>
</div></body></html>`

  return { subject, text, html, offLink }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Every confirmed, not banned account, with news emails on, and its unsubscribe token.
async function everyone(): Promise<Person[]> {
  const users: { id: string; email: string; lang: "en" | "es"; name: string }[] = []
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error("listUsers: " + error.message)
    const batch = data?.users ?? []
    for (const u of batch) {
      if (!u.email || !u.email_confirmed_at) continue
      const bannedUntil = (u as { banned_until?: string }).banned_until
      if (bannedUntil && new Date(bannedUntil) > new Date()) continue
      const m = (u.user_metadata ?? {}) as Record<string, unknown>
      users.push({
        id: u.id, email: u.email,
        lang: m.lang === "es" ? "es" : "en",
        name: typeof m.display_name === "string" ? m.display_name.trim().slice(0, 60) : "",
      })
    }
    if (batch.length < 1000) break
  }
  if (!users.length) return []

  // Make sure everyone has a prefs row (that is where the unsubscribe token lives).
  for (let i = 0; i < users.length; i += 500) {
    const rows = users.slice(i, i + 500).map((u) => ({ user_id: u.id }))
    const { error } = await supabase.from("news_email_prefs").upsert(rows, { onConflict: "user_id", ignoreDuplicates: true })
    if (error) throw new Error("prefs upsert: " + error.message)
  }
  const prefs = new Map<string, { on: boolean; token: string }>()
  for (let i = 0; i < users.length; i += 500) {
    const ids = users.slice(i, i + 500).map((u) => u.id)
    const { data, error } = await supabase.from("news_email_prefs").select("user_id, email_on, token").in("user_id", ids)
    if (error) throw new Error("prefs read: " + error.message)
    for (const r of data ?? []) prefs.set(r.user_id, { on: r.email_on, token: r.token })
  }
  return users
    .filter((u) => prefs.get(u.id)?.on !== false && prefs.get(u.id)?.token)
    .map((u) => ({ ...u, token: prefs.get(u.id)!.token }))
}

async function alreadyDone(newsId: string, round: number): Promise<Set<string>> {
  const done = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("app_news_email_log").select("user_id")
      .eq("news_id", newsId).eq("round", round).not("sent_at", "is", null).range(from, from + 999)
    if (error) throw new Error("log read: " + error.message)
    for (const r of data ?? []) done.add(r.user_id)
    if (!data || data.length < 1000) break
  }
  return done
}

async function sendFor(n: News, arrived: boolean, people: Person[], budget: { left: number }) {
  // Other posts made in the last 3 days without their own alert ride along in this email.
  const since = new Date(Date.now() - 3 * 864e5).toISOString()
  const { data: extrasData, error: exErr } = await supabase.from("app_news")
    .select("id, kind, title, body, title_es, body_es, link, tell_round, told_at, created_at, here_at")
    .eq("hidden", false).eq("tell_round", 0).neq("id", n.id).gte("created_at", since)
    .order("created_at", { ascending: true }).limit(8)
  if (exErr) console.error("extras read failed:", exErr.message)
  const extras = (extrasData ?? []) as News[]

  const done = await alreadyDone(n.id, n.tell_round)
  const todo = people.filter((p) => !done.has(p.id))
  // Mark everyone still to go as waiting, so the admin count is honest.
  for (let i = 0; i < todo.length; i += 500) {
    const rows = todo.slice(i, i + 500).map((p) => ({ news_id: n.id, round: n.tell_round, user_id: p.id }))
    const { error } = await supabase.from("app_news_email_log").upsert(rows, { onConflict: "news_id,round,user_id", ignoreDuplicates: true })
    if (error) console.error("log waiting failed:", error.message)
  }

  let sent = 0
  let stopped = ""
  for (let i = 0; i < todo.length && budget.left > 0; ) {
    const chunk = todo.slice(i, i + Math.min(50, budget.left))
    const payload = chunk.map((p) => {
      const m = build(n, arrived, extras, p)
      return {
        from: FROM, to: [p.email], subject: m.subject, text: m.text, html: m.html,
        headers: { "List-Unsubscribe": `<${m.offLink}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
      }
    })
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const ids = chunk.map((p) => p.id)
    if (res.status === 429) {
      // Daily or per-second limit. Leave the rest waiting for the daily pick-up.
      stopped = "limit"
      break
    }
    if (!res.ok) {
      const why = `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`
      console.error(why)
      const { error } = await supabase.from("app_news_email_log").update({ error: why })
        .eq("news_id", n.id).eq("round", n.tell_round).in("user_id", ids)
      if (error) console.error("log error failed:", error.message)
      stopped = "error"
      break
    }
    const { error } = await supabase.from("app_news_email_log").update({ sent_at: new Date().toISOString(), error: null })
      .eq("news_id", n.id).eq("round", n.tell_round).in("user_id", ids)
    if (error) console.error("log sent failed:", error.message)
    sent += chunk.length
    budget.left -= chunk.length
    i += chunk.length
  }
  return { news_id: n.id, sent, waiting: todo.length - sent, stopped }
}

async function turnOff(token: string) {
  if (!isUuid(token)) return false
  const { error } = await supabase.from("news_email_prefs")
    .update({ email_on: false, changed_at: new Date().toISOString() }).eq("token", token)
  if (error) { console.error("unsubscribe failed:", error.message); return false }
  return true
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const off = url.searchParams.get("off")
  if (off !== null) {
    const ok = await turnOff(off)
    if (req.method === "GET") {
      return new Response(null, { status: 302, headers: { Location: `${APP_URL}/news-email-off${ok ? "" : "?trouble=1"}` } })
    }
    return new Response(ok ? "Unsubscribed" : "Could not unsubscribe", { status: ok ? 200 : 400 })
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const given = req.headers.get("x-push-secret") ?? ""
  if (!PUSH_WEBHOOK_SECRET || !safeEqual(given, PUSH_WEBHOOK_SECRET)) return json({ error: "Unauthorized" }, 401)
  if (!RESEND_API_KEY || !FROM) return json({ error: "RESEND_API_KEY or WELCOME_FROM secret is missing" }, 500)

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty */ }
  const cols = "id, kind, title, body, title_es, body_es, link, tell_round, told_at, created_at, here_at"

  let targets: News[] = []
  if (isUuid(body.news_id)) {
    const { data, error } = await supabase.from("app_news").select(cols).eq("id", body.news_id).eq("hidden", false).maybeSingle()
    if (error) return json({ error: error.message }, 500)
    if (data && (data as News).tell_round > 0) targets = [data as News]
  } else if (body.resume === true) {
    const since = new Date(Date.now() - 7 * 864e5).toISOString()
    const { data, error } = await supabase.from("app_news").select(cols)
      .eq("hidden", false).gt("tell_round", 0).gte("told_at", since).order("told_at", { ascending: true })
    if (error) return json({ error: error.message }, 500)
    targets = (data ?? []) as News[]
  } else {
    return json({ error: "Send news_id or resume" }, 400)
  }
  if (!targets.length) return json({ message: "Nothing to send" })

  try {
    const people = await everyone()
    const budget = { left: PER_RUN }
    const results = []
    for (const n of targets) {
      if (budget.left <= 0) break
      // "It's here" emails: a Coming soon post that arrived (here_at set at the same moment it was told).
      const arrived = body.arrived === true || (!!n.here_at && !!n.told_at && Math.abs(new Date(n.here_at).getTime() - new Date(n.told_at).getTime()) < 60_000)
      const r = await sendFor(n, arrived, people, budget)
      results.push(r)
      if (r.stopped) break
    }
    return json({ results })
  } catch (e) {
    console.error(e)
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
