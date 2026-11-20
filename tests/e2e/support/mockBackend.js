// A pretend VWB database for the whole-app tests. The browser thinks it is talking
// to Supabase at https://fake.supabase.co; every one of those requests is answered
// here, from rows kept in memory. Nothing leaves the computer running the tests.
//
// In a test (see fixtures.js for how `village` is made):
//   village.seed('community_resources', [{ id: 1, name: 'Food Pantry' }])   // rows a page will load
//   village.onRpc('am_i_established', () => true)                           // answer a database function
//   village.rows('help_requests')                                           // what the app saved
//   village.requests                                                        // every request the app made
//   village.writes('help_requests')                                         // just the saves to one table
//
// It understands the everyday filters the app sends (eq, in, is, gt, order, limit...).
// A filter it does not know is ignored and listed in village.unknownFilters, so a
// test can check for surprises.

export const SUPA = 'https://fake.supabase.co'
export const USER_ID = '11111111-1111-4111-8111-111111111111'

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

// A sign-in token shaped like a real one (the app reads the two-step level from it).
export function makeToken(user, aal = 'aal1') {
  const now = Math.floor(Date.now() / 1000)
  return b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({
    sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', aal,
    amr: [{ method: 'password', timestamp: now }], session_id: 'test-session', iat: now, exp: now + 3600,
  }) + '.test-signature'
}

export function makeSession(user, aal = 'aal1') {
  const now = Math.floor(Date.now() / 1000)
  return { access_token: makeToken(user, aal), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'test-refresh', user }
}

export function makeUser(over = {}) {
  return {
    id: USER_ID, email: 'neighbor@example.org', aud: 'authenticated', role: 'authenticated',
    email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {},
    factors: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  }
}

export function makeProfile(over = {}) {
  return {
    id: 1, user_id: USER_ID, display_name: 'Test Neighbor', simple_view: false,
    guidelines_accepted_at: '2026-01-01T00:00:00Z', tour_done_at: '2026-01-01T00:00:00Z', setup_done_at: '2026-01-01T00:00:00Z',
    village_opt_in: true, zip_code: '30736', neighborhood: 'Ringgold, GA', skills: ['Tech Help'], ui_prefs: {},
    // The database turns a zip into the middle of that zip's area. Never a home address.
    location_source: 'zip', latitude: 34.92, longitude: -85.11,
    created_at: '2026-01-01T00:00:00Z', ...over,
  }
}

function parseValue(raw) {
  if (raw === 'null') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  return raw
}

function splitList(raw) {
  return raw.replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter((s) => s !== '')
}

function same(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

// One filter like  eq.5  /  in.(a,b)  /  is.null  /  not.is.null  -> a yes/no check for a row.
function makeCheck(col, expr) {
  let negate = false
  let rest = expr
  if (rest.startsWith('not.')) { negate = true; rest = rest.slice(4) }
  const dot = rest.indexOf('.')
  if (dot < 0) return null
  const op = rest.slice(0, dot)
  const raw = rest.slice(dot + 1)
  let check
  switch (op) {
    case 'eq': check = (r) => same(r[col], raw) || (typeof r[col] === 'boolean' && r[col] === parseValue(raw)); break
    case 'neq': check = (r) => !same(r[col], raw); break
    case 'gt': check = (r) => r[col] != null && String(r[col]) > raw; break
    case 'gte': check = (r) => r[col] != null && String(r[col]) >= raw; break
    case 'lt': check = (r) => r[col] != null && String(r[col]) < raw; break
    case 'lte': check = (r) => r[col] != null && String(r[col]) <= raw; break
    case 'is': { const v = parseValue(raw); check = (r) => (v === null ? r[col] == null : r[col] === v); break }
    case 'in': { const list = splitList(raw); check = (r) => list.some((x) => same(r[col], x)); break }
    case 'like':
    case 'ilike': {
      const re = new RegExp('^' + raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$', op === 'ilike' ? 'i' : '')
      check = (r) => r[col] != null && re.test(String(r[col]))
      break
    }
    case 'cs': { const list = splitList(raw.replace(/^\{|\}$/g, '')); check = (r) => Array.isArray(r[col]) && list.every((x) => r[col].map(String).includes(x)); break }
    case 'ov': { const list = splitList(raw.replace(/^\{|\}$/g, '')); check = (r) => Array.isArray(r[col]) && list.some((x) => r[col].map(String).includes(x)); break }
    default: return null
  }
  return negate ? (r) => !check(r) : check
}

const NOT_FILTERS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

export class MockVillage {
  constructor() {
    this.tables = {}
    this.rpcs = {}
    this.functions = {}
    this.requests = []
    this.unknownFilters = []
    this.user = null // who is signed in (null = signed out)
    this.accounts = [] // [{ email, password, user }] for the sign-in form
    this.failures = [] // [{ match, status, body }]
    this.nextId = 1000
    this.aal = 'aal1'
  }

  // ---- for tests ----
  seed(table, rows) { (this.tables[table] ||= []).push(...rows.map((r) => ({ ...r }))); return this }
  rows(table) { return (this.tables[table] ||= []) }
  onRpc(name, handler) { this.rpcs[name] = handler; return this }
  onFunction(name, handler) { this.functions[name] = handler; return this }
  // Make matching requests fail, e.g. village.fail((r) => r.table === 'help_requests' && r.method === 'POST')
  fail(match, status = 500, body = { message: 'pretend failure', code: 'XX000' }) { this.failures.push({ match, status, body }); return this }
  stopFailing() { this.failures = []; return this }
  writes(table) { return this.requests.filter((r) => r.table === table && r.method !== 'GET' && r.method !== 'HEAD') }
  rpcCalls(name) { return this.requests.filter((r) => r.rpc === name) }
  account(email, password, user) { this.accounts.push({ email, password, user }); return this }

  // ---- answering the browser ----
  async handle(route) {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const path = url.pathname
    let body = null
    try { body = request.postDataJSON() } catch { body = request.postData() }
    const entry = { method, path, query: Object.fromEntries(url.searchParams), body, headers: request.headers() }
    if (path.startsWith('/rest/v1/rpc/')) entry.rpc = path.slice('/rest/v1/rpc/'.length)
    else if (path.startsWith('/rest/v1/')) entry.table = path.slice('/rest/v1/'.length)
    this.requests.push(entry)

    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: this.cors() })
    const failure = this.failures.find((f) => f.match(entry))
    if (failure) return this.json(route, failure.body, failure.status)

    if (path.startsWith('/auth/v1/')) return this.auth(route, entry)
    if (entry.rpc) return this.rpc(route, entry)
    if (entry.table) return this.table(route, entry)
    if (path.startsWith('/functions/v1/')) {
      const handler = this.functions[path.slice('/functions/v1/'.length)]
      return this.json(route, handler ? await handler(entry) : {})
    }
    if (path.startsWith('/storage/v1/')) return this.json(route, method === 'GET' ? [] : { Key: 'test', path: 'test' })
    return this.json(route, {})
  }

  cors() {
    return { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' }
  }

  json(route, data, status = 200, headers = {}) {
    return route.fulfill({ status, headers: { ...this.cors(), 'content-type': 'application/json', ...headers }, body: JSON.stringify(data) })
  }

  auth(route, entry) {
    const { method, path, query, body } = entry
    if (path === '/auth/v1/user') {
      if (!this.user) return this.json(route, { code: 401, error_code: 'no_authorization', msg: 'not signed in' }, 401)
      if (method === 'PUT' && body) {
        if (body.data) this.user = { ...this.user, user_metadata: { ...this.user.user_metadata, ...body.data } }
        if (body.email) this.user = { ...this.user, new_email: body.email }
      }
      return this.json(route, this.user)
    }
    if (path === '/auth/v1/token') {
      if (query.grant_type === 'password') {
        const found = this.accounts.find((a) => a.email.toLowerCase() === String(body?.email || '').toLowerCase() && a.password === body?.password)
        if (!found) return this.json(route, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400)
        this.user = found.user
        return this.json(route, makeSession(found.user, this.aal))
      }
      if (!this.user) return this.json(route, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }, 400)
      return this.json(route, makeSession(this.user, this.aal))
    }
    if (path === '/auth/v1/signup') {
      const user = makeUser({ id: '22222222-2222-4222-8222-222222222222', email: body?.email, email_confirmed_at: null, user_metadata: body?.data || {} })
      return this.json(route, user) // no session: the person must confirm their email first
    }
    if (path === '/auth/v1/logout') { this.user = null; return route.fulfill({ status: 204, headers: this.cors() }) }
    if (path === '/auth/v1/recover') return this.json(route, {})
    return this.json(route, {})
  }

  async rpc(route, entry) {
    const handler = this.rpcs[entry.rpc]
    if (!handler) return this.json(route, null)
    try {
      const args = entry.method === 'GET' ? entry.query : entry.body
      return this.json(route, (await handler(args || {}, this)) ?? null)
    } catch (e) {
      return this.json(route, { message: e.message, code: e.code || 'P0001' }, 400)
    }
  }

  filterRows(table, query) {
    let rows = this.rows(table)
    for (const [key, value] of Object.entries(query)) {
      if (NOT_FILTERS.has(key)) continue
      if (key === 'or' || key === 'and') {
        const parts = value.replace(/^\(|\)$/g, '').split(/,(?![^(]*\))/).map((p) => {
          const i = p.indexOf('.')
          return makeCheck(p.slice(0, i), p.slice(i + 1))
        })
        if (parts.some((p) => !p)) { this.unknownFilters.push(table + ': ' + key + '=' + value); continue }
        rows = rows.filter((r) => (key === 'or' ? parts.some((p) => p(r)) : parts.every((p) => p(r))))
        continue
      }
      const check = makeCheck(key, value)
      if (!check) { this.unknownFilters.push(table + ': ' + key + '=' + value); continue }
      rows = rows.filter(check)
    }
    return rows
  }

  table(route, entry) {
    const { method, query, body, headers } = entry
    const table = entry.table
    const prefer = headers.prefer || ''
    const wantsOne = (headers.accept || '').includes('vnd.pgrst.object')
    const wantsRows = prefer.includes('return=representation')
    let out

    if (method === 'GET' || method === 'HEAD') {
      out = this.filterRows(table, query).slice()
      if (query.order) {
        for (const part of query.order.split(',').reverse()) {
          const [col, dir] = part.split('.')
          out.sort((a, b) => {
            const x = a[col], y = b[col]
            if (x == null && y == null) return 0
            if (x == null) return 1
            if (y == null) return -1
            return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1)
          })
        }
      }
      const total = out.length
      const offset = Number(query.offset || 0)
      if (offset) out = out.slice(offset)
      if (query.limit) out = out.slice(0, Number(query.limit))
      const range = { 'content-range': (out.length ? offset + '-' + (offset + out.length - 1) : '*') + '/' + total }
      if (method === 'HEAD') return route.fulfill({ status: 200, headers: { ...this.cors(), ...range } })
      if (wantsOne) {
        if (out.length !== 1) return this.json(route, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains ' + out.length + ' rows' }, 406)
        return this.json(route, out[0], 200, range)
      }
      return this.json(route, out, 200, range)
    }

    if (method === 'POST') {
      const list = Array.isArray(body) ? body : [body || {}]
      const keys = query.on_conflict ? query.on_conflict.split(',') : null
      const rows = this.rows(table)
      out = list.map((r) => {
        const found = keys && prefer.includes('resolution=merge-duplicates') && rows.find((x) => keys.every((k) => same(x[k], r[k])))
        if (found) { Object.assign(found, r); return found }
        const made = { id: this.nextId++, created_at: new Date().toISOString(), ...r }
        rows.push(made)
        return made
      })
    } else if (method === 'PATCH') {
      out = this.filterRows(table, query)
      for (const r of out) Object.assign(r, body || {})
    } else if (method === 'DELETE') {
      out = this.filterRows(table, query)
      this.tables[table] = this.rows(table).filter((r) => !out.includes(r))
    } else {
      return this.json(route, {})
    }

    if (!wantsRows) return route.fulfill({ status: method === 'POST' ? 201 : 204, headers: this.cors() })
    if (wantsOne) {
      if (out.length !== 1) return this.json(route, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 406)
      return this.json(route, out[0], method === 'POST' ? 201 : 200)
    }
    return this.json(route, out, method === 'POST' ? 201 : 200)
  }
}
