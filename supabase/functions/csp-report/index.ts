// Catches "this would be blocked" reports that browsers send because of the
// content rules (CSP) in public/_headers. Nov 7, 2026.
//
// How it stays private:
//   * It keeps only: the day, which rule, the outside address that was
//     blocked (just the site, never the full link), and the page shape with
//     every id taken out ("/orgs/:id"). No IP address, no browser details,
//     no account, nothing anyone typed.
//   * Same reports on the same day are counted, not stored again.
//   * It uses the public anon key and one database function
//     (log_csp_reports, in vwb-csp-reports.sql). No service key.
//   * Reports from any site other than VWB are ignored.
//   * Rows are deleted after 30 days (a daily database job).
//
// Deploy:  supabase functions deploy csp-report --no-verify-jwt
// (Browsers send these reports without signing in, so the sign-in check is off.)

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const MAX_BODY = 64 * 1024
const MAX_REPORTS = 20
const OUR_SITES = [/^app\.villagewithoutborders\.org$/, /\.pages\.dev$/, /^localhost$/]

type Row = { directive: string; blocked: string; page: string; mode: string }

function done(status = 204): Response {
  return new Response(null, {
    status,
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" },
  })
}

// Just the outside site, or a plain word for the built-in kinds.
function blockedSite(raw: unknown): string {
  const s = String(raw || "").trim().toLowerCase()
  if (!s) return "unknown"
  if (["inline", "eval", "wasm-eval", "self", "data", "blob", "trusted-types-policy", "trusted-types-sink"].includes(s)) return s
  if (s.startsWith("data:")) return "data"
  if (s.startsWith("blob:")) return "blob"
  try {
    const u = new URL(s)
    return (u.protocol + "//" + u.host).slice(0, 120)
  } catch {
    return s.replace(/[^a-z0-9:.\-]/g, "").slice(0, 40) || "unknown"
  }
}

// The page with every id and number taken out, and no query.
// Returns null when the page is not on a VWB site.
function pageShape(raw: unknown): string | null {
  try {
    const u = new URL(String(raw || ""))
    if (!OUR_SITES.some((re) => re.test(u.hostname))) return null
    return u.pathname
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
      .replace(/\/\d+(?=\/|$)/g, "/:n")
      .slice(0, 120) || "/"
  } catch {
    return null
  }
}

function fromLegacy(r: Record<string, unknown>): Row | null {
  const page = pageShape(r["document-uri"])
  if (!page) return null
  return {
    directive: String(r["effective-directive"] || r["violated-directive"] || "unknown").split(" ")[0].slice(0, 40),
    blocked: blockedSite(r["blocked-uri"]),
    page,
    mode: String(r["disposition"] || "report").slice(0, 10),
  }
}

function fromReportingApi(r: Record<string, unknown>): Row | null {
  if (r.type !== "csp-violation") return null
  const b = (r.body || {}) as Record<string, unknown>
  const page = pageShape(b.documentURL || r.url)
  if (!page) return null
  return {
    directive: String(b.effectiveDirective || "unknown").slice(0, 40),
    blocked: blockedSite(b.blockedURL),
    page,
    mode: String(b.disposition || "report").slice(0, 10),
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return done()
  if (req.method !== "POST") return done(405)
  const size = Number(req.headers.get("content-length") || "0")
  if (size > MAX_BODY) return done(413)

  let text = ""
  try {
    text = await req.text()
  } catch {
    return done(400)
  }
  if (text.length > MAX_BODY) return done(413)

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return done(400)
  }

  const rows: Row[] = []
  if (Array.isArray(parsed)) {
    for (const r of parsed.slice(0, MAX_REPORTS)) {
      const row = r && typeof r === "object" ? fromReportingApi(r as Record<string, unknown>) : null
      if (row) rows.push(row)
    }
  } else if (parsed && typeof parsed === "object" && (parsed as Record<string, unknown>)["csp-report"]) {
    const row = fromLegacy((parsed as Record<string, Record<string, unknown>>)["csp-report"])
    if (row) rows.push(row)
  }
  if (rows.length === 0) return done()

  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/log_csp_reports", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    body: JSON.stringify({ p_rows: rows }),
  })
  if (!res.ok) console.error("log_csp_reports failed", res.status, (await res.text()).slice(0, 200))
  return done()
})
