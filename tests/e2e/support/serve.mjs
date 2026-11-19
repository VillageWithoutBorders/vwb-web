// A tiny web server for the whole-app tests. It serves the test build (dist-check)
// the way Cloudflare Pages serves the live site:
//   * any address that is not a file opens the app (public/_redirects), and
//   * every answer carries the safety headers from public/_headers, with the real
//     database address swapped for the pretend one the test build uses.
// So the tests run under the real content rules (CSP).
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../dist-check/', import.meta.url))
const HEADERS_FILE = fileURLToPath(new URL('../../../public/_headers', import.meta.url))
const PORT = Number(process.env.PORT || 4181)
const FAKE = 'fake.supabase.co'
const TYPES = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.ico': 'image/x-icon',
}

// The headers under "/*" in public/_headers.
export function siteHeaders(text = readFileSync(HEADERS_FILE, 'utf8')) {
  const out = {}
  let inAll = false
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue
    if (!/^\s/.test(line)) { inAll = line.trim() === '/*'; continue }
    if (!inAll) continue
    const i = line.indexOf(':')
    if (i < 0) continue
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

function testHeaders() {
  const headers = siteHeaders()
  for (const k of Object.keys(headers)) headers[k] = headers[k].replace(/[a-z0-9]+\.supabase\.co/g, FAKE)
  // The live site is https; a plain local address must not be told to switch to it.
  delete headers['Strict-Transport-Security']
  return headers
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(join(ROOT, 'index.html'))) {
    console.error('No test build yet. Run: npm run build:check')
    process.exit(1)
  }
  const headers = testHeaders()
  createServer((req, res) => {
    const path = decodeURIComponent((req.url || '/').split('?')[0])
    if (path === '/__ready') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return }
    let file = normalize(join(ROOT, path))
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, 'index.html')
    res.writeHead(200, { ...headers, 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(readFileSync(file))
  }).listen(PORT, () => console.log('Test build is being served at http://localhost:' + PORT))
}
