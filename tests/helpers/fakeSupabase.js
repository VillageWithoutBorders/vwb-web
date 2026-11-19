// A pretend Supabase for the unit and functional tests. It keeps rows in memory and
// answers the same calls the app makes (from().select().eq()..., rpc(), auth, storage),
// so the real code runs unchanged without a database.
//
// In a test:
//   import { db } from '../helpers/fakeSupabase.js'
//   db.seed('blocks', [{ blocker_id: 'me', blocked_id: 'them' }])   // rows to start with
//   db.onRpc('am_i_established', () => true)                         // answer a database function
//   db.failNext('blocks', 'select', { message: 'boom' })             // make the next call fail
//   db.failNext('blocks', 'select', undefined, { skip: 1 })          // ...or the one after it
//   db.rows('blocks')                                                // what is saved now
//   db.calls                                                         // every call the code made
//
// It only knows the filters the app really uses. An unknown filter throws, so a
// test never passes by quietly skipping one.

let nextId = 1

function matches(row, filters) {
  return filters.every((f) => f(row))
}

function parseOrValue(raw) {
  if (raw === 'null') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  return raw
}

// Splits "a.eq.1,and(b.eq.2,c.eq.3)" at the commas that are not inside brackets.
function splitTop(expr) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') depth++
    else if (expr[i] === ')') depth--
    else if (expr[i] === ',' && depth === 0) { parts.push(expr.slice(start, i)); start = i + 1 }
  }
  parts.push(expr.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

// One piece of an or() string, like "user_id.eq.abc", "ended_at.is.null",
// "left_at.not.is.null" or a group: "and(helper_id.eq.a,requester_id.eq.b)".
function orPart(part) {
  const group = /^(and|or)\((.*)\)$/s.exec(part.trim())
  if (group) {
    const inner = splitTop(group[2]).map(orPart)
    return group[1] === 'and' ? (row) => inner.every((p) => p(row)) : (row) => inner.some((p) => p(row))
  }
  const m = /^([a-zA-Z0-9_]+)\.(not\.)?(eq|neq|is|gt|gte|lt|lte|in|ilike|like)\.(.*)$/s.exec(part.trim())
  if (!m) throw new Error('fakeSupabase: cannot read or() part "' + part + '"')
  const [, col, not, op, raw] = m
  let check
  if (op === 'in') {
    const list = raw.replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
    check = (row) => list.includes(String(row[col]))
  } else {
    check = compare(col, op, parseOrValue(raw))
  }
  return not ? (row) => !check(row) : check
}

function compare(col, op, value) {
  switch (op) {
    case 'eq': return (row) => String(row[col]) === String(value) && row[col] != null
    case 'neq': return (row) => String(row[col]) !== String(value)
    case 'is': return (row) => (value === null ? row[col] == null : row[col] === value)
    case 'gt': return (row) => row[col] != null && row[col] > value
    case 'gte': return (row) => row[col] != null && row[col] >= value
    case 'lt': return (row) => row[col] != null && row[col] < value
    case 'lte': return (row) => row[col] != null && row[col] <= value
    case 'like':
    case 'ilike': {
      const re = new RegExp('^' + String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', op === 'ilike' ? 'i' : '')
      return (row) => row[col] != null && re.test(String(row[col]))
    }
    default: throw new Error('fakeSupabase: unknown comparison "' + op + '"')
  }
}

class Query {
  constructor(store, table) {
    this.store = store
    this.table = table
    this.op = 'select'
    this.filters = []
    this.filterLog = []
    this.payload = null
    this.options = {}
    this.orders = []
    this.max = null
    this.offset = 0
    this.one = null // 'single' | 'maybeSingle'
    this.returning = false
    this.columns = '*'
    this.head = false
    this.wantCount = false
  }

  // ---- what to do ----
  select(columns = '*', opts = {}) {
    if (this.op === 'select') {
      this.columns = columns
      this.head = !!opts.head
      this.wantCount = !!opts.count
    } else {
      this.returning = true
    }
    return this
  }
  insert(payload, options = {}) { this.op = 'insert'; this.payload = payload; this.options = options; return this }
  upsert(payload, options = {}) { this.op = 'upsert'; this.payload = payload; this.options = options; return this }
  update(payload) { this.op = 'update'; this.payload = payload; return this }
  delete() { this.op = 'delete'; return this }

  // ---- which rows ----
  _add(name, col, value, fn) { this.filters.push(fn); this.filterLog.push([name, col, value]); return this }
  eq(col, v) { return this._add('eq', col, v, compare(col, 'eq', v)) }
  neq(col, v) { return this._add('neq', col, v, compare(col, 'neq', v)) }
  gt(col, v) { return this._add('gt', col, v, compare(col, 'gt', v)) }
  gte(col, v) { return this._add('gte', col, v, compare(col, 'gte', v)) }
  lt(col, v) { return this._add('lt', col, v, compare(col, 'lt', v)) }
  lte(col, v) { return this._add('lte', col, v, compare(col, 'lte', v)) }
  like(col, v) { return this._add('like', col, v, compare(col, 'like', v)) }
  ilike(col, v) { return this._add('ilike', col, v, compare(col, 'ilike', v)) }
  is(col, v) { return this._add('is', col, v, compare(col, 'is', v)) }
  in(col, list) { const set = (list || []).map(String); return this._add('in', col, list, (row) => set.includes(String(row[col]))) }
  contains(col, v) {
    return this._add('contains', col, v, (row) => Array.isArray(v)
      ? Array.isArray(row[col]) && v.every((x) => row[col].includes(x))
      : row[col] && Object.entries(v).every(([k, x]) => row[col][k] === x))
  }
  overlaps(col, list) { return this._add('overlaps', col, list, (row) => Array.isArray(row[col]) && row[col].some((x) => list.includes(x))) }
  not(col, op, v) {
    const inner = op === 'in'
      ? (row) => String(v).replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, '')).includes(String(row[col]))
      : compare(col, op, v)
    return this._add('not.' + op, col, v, (row) => !inner(row))
  }
  or(expr) {
    const parts = splitTop(String(expr)).map(orPart)
    return this._add('or', null, expr, (row) => parts.some((p) => p(row)))
  }
  match(obj) { for (const [k, v] of Object.entries(obj)) this.eq(k, v); return this }

  // ---- shape of the answer ----
  order(col, opts = {}) { this.orders.push([col, opts.ascending !== false]); return this }
  limit(n) { this.max = n; return this }
  range(from, to) { this.offset = from; this.max = to - from + 1; return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybeSingle'; return this }
  abortSignal() { return this }
  returns() { return this }
  throwOnError() { return this }

  then(resolve, reject) {
    return Promise.resolve().then(() => this._run()).then(resolve, reject)
  }

  _run() {
    const store = this.store
    store.calls.push({ type: 'table', table: this.table, op: this.op, payload: this.payload, options: this.options, filters: this.filterLog, columns: this.columns })
    const failure = store._takeFailure(this.table, this.op)
    if (failure) return { data: null, error: failure, count: null }
    const rows = store._table(this.table)
    let out

    if (this.op === 'select') {
      out = rows.filter((r) => matches(r, this.filters))
    } else if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload]
      out = list.map((r) => store._withDefaults(this.table, r))
      rows.push(...out)
    } else if (this.op === 'upsert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload]
      const keys = String(this.options.onConflict || 'id').split(',').map((s) => s.trim())
      out = list.map((r) => {
        const found = rows.find((x) => keys.every((k) => String(x[k]) === String(r[k])))
        if (found) { Object.assign(found, r); return found }
        const made = store._withDefaults(this.table, r)
        rows.push(made)
        return made
      })
    } else if (this.op === 'update') {
      out = rows.filter((r) => matches(r, this.filters))
      for (const r of out) Object.assign(r, this.payload)
    } else if (this.op === 'delete') {
      out = rows.filter((r) => matches(r, this.filters))
      store.tables[this.table] = rows.filter((r) => !out.includes(r))
    }

    const total = out.length
    if (this.op !== 'select' && !this.returning) return { data: null, error: null, count: null }

    out = out.slice()
    for (const [col, asc] of this.orders.slice().reverse()) {
      out.sort((a, b) => {
        const x = a[col], y = b[col]
        if (x == null && y == null) return 0
        if (x == null) return 1
        if (y == null) return -1
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1)
      })
    }
    if (this.offset) out = out.slice(this.offset)
    if (this.max != null) out = out.slice(0, this.max)
    out = out.map((r) => ({ ...r }))
    const count = this.wantCount ? total : null
    if (this.head) return { data: null, error: null, count }

    if (this.one === 'single') {
      if (out.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, count }
      return { data: out[0], error: null, count }
    }
    if (this.one === 'maybeSingle') {
      if (out.length > 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple rows returned' }, count }
      return { data: out[0] || null, error: null, count }
    }
    return { data: out, error: null, count }
  }
}

class FakeDb {
  constructor() { this.reset() }

  reset() {
    this.tables = {}
    this.rpcs = {}
    this.failures = []
    this.calls = []
    this.channels = []
    this.user = null
    this.session = null
    this.authListeners = []
    this.storageFiles = {}
    this.functionHandlers = {}
    nextId = 1
  }

  // ---- for tests ----
  seed(table, rows) { this._table(table).push(...rows.map((r) => ({ ...r }))); return this }
  rows(table) { return this._table(table) }
  onRpc(name, handler) { this.rpcs[name] = handler; return this }
  onFunction(name, handler) { this.functionHandlers[name] = handler; return this }
  // op is 'select' | 'insert' | 'upsert' | 'update' | 'delete' | 'rpc' (then table is the function name).
  // Pass { skip: 1 } to let one matching call through first (for "the second lookup fails").
  failNext(table, op, error = { message: 'pretend failure', code: 'XX000' }, { skip = 0 } = {}) { this.failures.push({ table, op, error, skip }); return this }
  signIn(user) { this.user = user; this.session = user ? { access_token: 'test-token', refresh_token: 'r', user } : null; return this }
  callsTo(table, op) { return this.calls.filter((c) => c.table === table && (!op || c.op === op)) }
  rpcCalls(name) { return this.calls.filter((c) => c.type === 'rpc' && (!name || c.name === name)) }

  // ---- inner workings ----
  _table(name) { return (this.tables[name] ||= []) }
  _withDefaults(table, row) {
    const made = { ...row }
    if (made.id === undefined) made.id = nextId++
    if (made.created_at === undefined) made.created_at = new Date().toISOString()
    return made
  }
  _takeFailure(table, op) {
    const i = this.failures.findIndex((f) => f.table === table && f.op === op)
    if (i < 0) return null
    if (this.failures[i].skip > 0) { this.failures[i].skip -= 1; return null }
    return this.failures.splice(i, 1)[0].error
  }
}

// One shared pretend database, even when a test reloads the app's modules
// (vi.resetModules) to act as a second phone.
export const db = (globalThis.__vwbFakeDb ||= new FakeDb())

function makeChannel(name) {
  const channel = {
    name,
    handlers: [],
    on(type, filter, cb) { channel.handlers.push({ type, filter, cb }); return channel },
    subscribe(cb) { if (typeof cb === 'function') cb('SUBSCRIBED'); return channel },
    unsubscribe() { return Promise.resolve('ok') },
    send() { return Promise.resolve('ok') },
    track() { return Promise.resolve('ok') },
    presenceState() { return {} },
  }
  db.channels.push(channel)
  return channel
}

export const supabase = {
  from(table) { return new Query(db, table) },

  async rpc(name, args) {
    db.calls.push({ type: 'rpc', name, args })
    const failure = db._takeFailure(name, 'rpc')
    if (failure) return { data: null, error: failure }
    const handler = db.rpcs[name]
    if (!handler) return { data: null, error: null }
    try {
      return { data: await handler(args, db), error: null }
    } catch (e) {
      return { data: null, error: { message: e.message, code: e.code || 'P0001' } }
    }
  },

  channel(name) { return makeChannel(name) },
  removeChannel() { return Promise.resolve('ok') },
  getChannels() { return db.channels },

  auth: {
    storageKey: 'sb-fake-auth-token',
    async getUser() { return db.user ? { data: { user: db.user }, error: null } : { data: { user: null }, error: { message: 'not signed in', status: 401 } } },
    async getSession() { return { data: { session: db.session }, error: null } },
    onAuthStateChange(cb) {
      db.authListeners.push(cb)
      return { data: { subscription: { unsubscribe() { db.authListeners = db.authListeners.filter((x) => x !== cb) } } } }
    },
    async signInWithPassword(creds) { db.calls.push({ type: 'auth', name: 'signInWithPassword', args: creds }); return { data: { user: db.user, session: db.session }, error: null } },
    async signUp(creds) { db.calls.push({ type: 'auth', name: 'signUp', args: creds }); return { data: { user: db.user, session: db.session }, error: null } },
    async signOut(opts) { db.calls.push({ type: 'auth', name: 'signOut', args: opts }); db.signIn(null); return { error: null } },
    async updateUser(attrs) { db.calls.push({ type: 'auth', name: 'updateUser', args: attrs }); return { data: { user: db.user }, error: null } },
    async resetPasswordForEmail(email, opts) { db.calls.push({ type: 'auth', name: 'resetPasswordForEmail', args: { email, ...opts } }); return { data: {}, error: null } },
    async refreshSession() { return { data: { session: db.session }, error: null } },
    mfa: {
      async listFactors() { return { data: { all: [], totp: [] }, error: null } },
      async getAuthenticatorAssuranceLevel() { return { data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null } },
      async enroll() { return { data: null, error: { message: 'not in tests' } } },
      async challengeAndVerify() { return { data: null, error: { message: 'not in tests' } } },
      async unenroll() { return { data: null, error: null } },
    },
  },

  storage: {
    from(bucket) {
      const files = (db.storageFiles[bucket] ||= {})
      return {
        async upload(path, body) { db.calls.push({ type: 'storage', name: 'upload', bucket, path }); files[path] = body; return { data: { path }, error: null } },
        async remove(paths) { db.calls.push({ type: 'storage', name: 'remove', bucket, paths }); for (const p of paths) delete files[p]; return { data: [], error: null } },
        async createSignedUrl(path) { return { data: { signedUrl: 'https://fake.supabase.co/storage/v1/object/sign/' + bucket + '/' + path }, error: null } },
        getPublicUrl(path) { return { data: { publicUrl: 'https://fake.supabase.co/storage/v1/object/public/' + bucket + '/' + path } } },
      }
    },
  },

  functions: {
    async invoke(name, opts) {
      db.calls.push({ type: 'function', name, args: opts })
      const handler = db.functionHandlers[name]
      return { data: handler ? await handler(opts) : null, error: null }
    },
  },
}
