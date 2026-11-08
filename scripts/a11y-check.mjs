// Accessibility check (Nov 8, Jade): runs axe on the main pages, in light and dark,
// on a computer-sized screen and a small phone. It uses pretend data (no real database),
// so it checks how pages are built, not what is in them.
//
// Run it:  npm run build:check   then   npm run a11y
// GitHub runs it on every push (.github/workflows/a11y.yml). Problems marked serious
// or critical make the check fail; smaller ones are listed so they can be fixed in time.
import playwright from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../dist-check/', import.meta.url))
const SUPA = 'https://fake.supabase.co'
const PAGES = ['/welcome', '/login', '/resources', '/terms', '/', '/messages', '/skillshare', '/tasks', '/community/resources',
  '/ask?skip=1', '/post-offer', '/emergency', '/notifications', '/profile', '/me', '/settings', '/calendar', '/groups', '/cottage', '/world', '/help-doors']
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }

const server = createServer((req, res) => {
  let p = join(ROOT, decodeURIComponent(req.url.split('?')[0]))
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(ROOT, 'index.html')
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' })
  res.end(readFileSync(p))
}).listen(4180)

const uid = '11111111-1111-1111-1111-111111111111'
const user = { id: uid, email: 'test@example.org', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const profile = { user_id: uid, display_name: 'Test Neighbor', simple_view: false, guidelines_accepted_at: '2026-01-01', tour_done_at: '2026-01-01', setup_done_at: '2026-01-01', village_opt_in: true, zip_code: '30736', neighborhood: 'Ringgold, GA', skills: ['Tech Help'], ui_prefs: {} }

const browser = await playwright.chromium.launch()
let serious = 0
let minor = 0
for (const scheme of ['light', 'dark']) {
  for (const [w, h] of [[1440, 900], [360, 740]]) {
    for (const signedIn of [false, true]) {
      const pages = PAGES.filter((r) => signedIn ? !['/welcome', '/login'].includes(r) : ['/welcome', '/login', '/resources', '/terms'].includes(r))
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme })
      await ctx.route(SUPA + '/**', (route) => {
        const u = route.request().url()
        if (u.includes('/auth/v1/user')) return signedIn ? route.fulfill({ json: user }) : route.fulfill({ status: 401, json: {} })
        if (u.includes('/auth/v1/')) return route.fulfill({ json: { all: [], totp: [], currentLevel: 'aal1', nextLevel: 'aal1' } })
        if (u.includes('helper_profiles')) return route.fulfill({ json: (route.request().headers().accept || '').includes('vnd.pgrst.object') ? profile : [profile] })
        if (u.includes('/rpc/')) return route.fulfill({ json: null })
        return route.fulfill({ json: [] })
      })
      await ctx.route((url) => !url.href.startsWith('http://localhost:4180') && !url.href.startsWith(SUPA), (route) => route.fulfill({ status: 204, body: '' }))
      await ctx.addInitScript(([u, inside]) => {
        sessionStorage.setItem('vwb_splash_seen', '1')
        localStorage.setItem('vwb_seen_globe', '1')
        if (inside) localStorage.setItem('sb-fake-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.x', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
      }, [user, signedIn])
      const page = await ctx.newPage()
      for (const route of pages) {
        await page.goto('http://localhost:4180' + route)
        await page.locator('h1, h2').first().waitFor({ timeout: 10000 }).catch(() => {})
        await page.waitForTimeout(800)
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
        for (const v of result.violations) {
          const big = v.impact === 'serious' || v.impact === 'critical'
          if (big) serious++; else minor++
          console.log(`${big ? 'FIX' : 'note'} [${v.impact}] ${route} (${scheme}, ${w}px${signedIn ? '' : ', signed out'}): ${v.id}: ${v.help} (${v.nodes.length})`)
          for (const n of v.nodes.slice(0, 3)) console.log('      ' + n.target.join(' ') + (n.failureSummary ? ' :: ' + n.failureSummary.split('\n').slice(1, 2).join(' ').trim() : ''))
        }
      }
      await ctx.close()
    }
  }
}
await browser.close()
server.close()
console.log(`\nDone. ${serious} serious or critical, ${minor} smaller.`)
process.exit(serious > 0 ? 1 : 0)
