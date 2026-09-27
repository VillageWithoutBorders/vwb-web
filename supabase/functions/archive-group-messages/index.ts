// Monthly locked archive of VWB's group and public messages.
//
// Once a month (a Supabase cron job calls this; see
// vwb-message-archive.sql), this gathers last month's group messages,
// LOCKS them with Jade's public key, and saves the locked file in the
// private "message-archives" storage bucket.
//
// Why it's safe:
//   * The file is encrypted with age (https://age-encryption.org) before
//     it's saved. This function only has the PUBLIC key, which can lock
//     files but never open them. The private key that opens them lives
//     offline with Jade and is never put on any server.
//   * So a break-in at Supabase, or anyone at Supabase, would find only
//     scrambled files.
//   * The bucket is private with no access rules, so only the service role
//     (this function, and Jade in the Supabase dashboard) can reach it.
//   * Messages are archived by user id, not name, and message text is
//     never written to the logs.
//
// Private 1:1 messages are NOT archived. They're end-to-end encrypted and
// VWB never holds a readable copy of them.
//
// Secrets this needs (Supabase > Edge Functions > Secrets):
//   ARCHIVE_PUBLIC_KEY   Jade's age public key (starts with "age1")
//   ARCHIVE_CRON_SECRET  the password the cron job sends (from the SQL file)
//   ARCHIVE_KEEP_MONTHS  optional. 0 or unset = keep every archive.
//                        12 = delete archives older than 12 months.
//
// To open an archive on Jade's computer:
//   age -d -i vwb-archive-key.txt 2026-09.json.age > 2026-09.json

import { createClient } from "npm:@supabase/supabase-js@2"
import { Encrypter } from "npm:age-encryption@0.3.1"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const PUBLIC_KEY = (Deno.env.get("ARCHIVE_PUBLIC_KEY") || "").trim()
const CRON_SECRET = (Deno.env.get("ARCHIVE_CRON_SECRET") || "").trim()
const KEEP_MONTHS = Number(Deno.env.get("ARCHIVE_KEEP_MONTHS") || "0")

const BUCKET = "message-archives"
const PAGE_SIZE = 1000

// Every group or public message table to archive. When the org group
// board is built, add it here (unless it's end-to-end encrypted, in which
// case there's nothing readable to archive).
const SOURCES = [
  { table: "campfire_messages", folder: "campfire" },
]

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

// "2026-09" -> { start: Sep 1, end: Oct 1 } in UTC.
// With no month given, uses last month.
function monthRange(month?: string) {
  let year: number, mon: number // mon is 0-based
  if (month) {
    const m = /^(\d{4})-(\d{2})$/.exec(month)
    if (!m) throw new Error('month must look like "2026-09"')
    year = Number(m[1])
    mon = Number(m[2]) - 1
    if (mon < 0 || mon > 11) throw new Error("month must be 01 to 12")
  } else {
    const now = new Date()
    year = now.getUTCFullYear()
    mon = now.getUTCMonth() - 1
    if (mon < 0) { mon = 11; year -= 1 }
  }
  const start = new Date(Date.UTC(year, mon, 1))
  const end = new Date(Date.UTC(year, mon + 1, 1))
  const label = `${year}-${String(mon + 1).padStart(2, "0")}`
  return { start, end, label }
}

async function fetchMonth(table: string, start: Date, end: Date) {
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`reading ${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

// Deletes archives older than KEEP_MONTHS. Off unless that secret is set.
async function pruneOld(folder: string, currentLabel: string) {
  if (!(KEEP_MONTHS > 0)) return []
  const [y, m] = currentLabel.split("-").map(Number)
  const cutoff = new Date(Date.UTC(y, m - 1 - KEEP_MONTHS, 1))
  const cutoffLabel = `${cutoff.getUTCFullYear()}-${String(cutoff.getUTCMonth() + 1).padStart(2, "0")}`

  const { data: files, error } = await admin.storage.from(BUCKET).list(folder, { limit: 1000 })
  if (error) throw new Error(`listing ${folder}: ${error.message}`)
  const old = (files || [])
    .map((f) => f.name)
    .filter((name) => /^\d{4}-\d{2}\.json\.age$/.test(name) && name.slice(0, 7) < cutoffLabel)
    .map((name) => `${folder}/${name}`)
  if (old.length > 0) {
    const { error: delErr } = await admin.storage.from(BUCKET).remove(old)
    if (delErr) throw new Error(`deleting old archives: ${delErr.message}`)
  }
  return old
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" })
  if (!CRON_SECRET || req.headers.get("x-archive-secret") !== CRON_SECRET) {
    return json(401, { error: "not allowed" })
  }
  if (!PUBLIC_KEY.startsWith("age1")) {
    return json(500, { error: "ARCHIVE_PUBLIC_KEY is missing or isn't an age public key" })
  }

  let month: string | undefined
  try {
    const body = await req.json().catch(() => ({}))
    month = body?.month
  } catch { /* no body is fine */ }

  let range
  try {
    range = monthRange(month)
  } catch (e) {
    return json(400, { error: (e as Error).message })
  }

  // Village names give the archive context without adding personal data.
  const { data: villages, error: villageErr } = await admin.from("villages").select("id, name")
  if (villageErr) console.error("[archive] could not read villages:", villageErr.message)

  const results: Record<string, unknown>[] = []
  for (const source of SOURCES) {
    try {
      const rows = await fetchMonth(source.table, range.start, range.end)
      const path = `${source.folder}/${range.label}.json.age`

      if (rows.length === 0) {
        results.push({ table: source.table, month: range.label, messages: 0, saved: false })
      } else {
        const archive = {
          about: "Village Without Borders group message archive",
          table: source.table,
          month: range.label,
          from: range.start.toISOString(),
          to: range.end.toISOString(),
          made_at: new Date().toISOString(),
          count: rows.length,
          villages: villages || [],
          messages: rows,
        }

        const encrypter = new Encrypter()
        encrypter.addRecipient(PUBLIC_KEY)
        const locked = await encrypter.encrypt(JSON.stringify(archive, null, 2))

        const { error: upErr } = await admin.storage
          .from(BUCKET)
          .upload(path, locked, { contentType: "application/octet-stream", upsert: true })
        if (upErr) throw new Error(`saving ${path}: ${upErr.message}`)

        results.push({ table: source.table, month: range.label, messages: rows.length, saved: path })
      }

      const removed = await pruneOld(source.folder, range.label)
      if (removed.length > 0) results[results.length - 1].deletedOld = removed
    } catch (e) {
      console.error("[archive]", source.table, (e as Error).message)
      results.push({ table: source.table, month: range.label, error: (e as Error).message })
    }
  }

  const failed = results.some((r) => "error" in r)
  console.log("[archive] done", JSON.stringify(results))
  return json(failed ? 500 : 200, { results })
})
