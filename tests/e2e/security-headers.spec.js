// The safety headers in public/_headers. The whole-app tests are served with them
// (tests/e2e/support/serve.mjs), so these checks make sure they are really on, and
// that the content rules (CSP) list matches the app that was built.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test, expect } from './support/fixtures.js'
import { siteHeaders } from './support/serve.mjs'

const headers = siteHeaders()
const csp = Object.fromEntries(headers['Content-Security-Policy'].split(';').map((part) => {
  const [name, ...values] = part.trim().split(/\s+/)
  return [name, values]
}))

test('every small script written inside index.html is on the allowed list', () => {
  // The same check as scripts/csp-hashes.mjs. If this fails, run that script and
  // put the new 'sha256-...' numbers in public/_headers.
  const html = readFileSync(new URL('../../dist-check/index.html', import.meta.url), 'utf8')
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  expect(inline.length).toBeGreaterThan(0)
  for (const script of inline) {
    const hash = "'sha256-" + createHash('sha256').update(script, 'utf8').digest('base64') + "'"
    expect(csp['script-src'], 'missing from script-src in public/_headers: ' + hash).toContain(hash)
  }
})

test('the content rules stay strict', () => {
  expect(csp['default-src']).toEqual(["'self'"])
  expect(csp['object-src']).toEqual(["'none'"])
  expect(csp['base-uri']).toEqual(["'self'"])
  expect(csp['form-action']).toEqual(["'self'"])
  expect(csp['frame-ancestors']).toEqual(["'none'"])
  // Scripts: only the app's own files, the listed small scripts, and the sign-up check.
  expect(csp['script-src']).not.toContain("'unsafe-inline'")
  expect(csp['script-src']).not.toContain("'unsafe-eval'")
  expect(csp['script-src']).not.toContain('*')
  expect(csp['script-src'].filter((v) => v.startsWith('http'))).toEqual(['https://challenges.cloudflare.com'])
  // The app talks only to itself and its own database.
  const outside = csp['connect-src'].filter((v) => v !== "'self'")
  expect(outside).toHaveLength(2)
  for (const address of outside) expect(address).toMatch(/^(https|wss):\/\/[a-z0-9]+\.supabase\.co$/)
})

test('the other safety headers are set', () => {
  expect(headers['X-Content-Type-Options']).toBe('nosniff')
  expect(headers['X-Frame-Options']).toBe('DENY')
  expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['Strict-Transport-Security']).toMatch(/max-age=\d{8,}/)
  // VWB never asks a phone where it is, or for its camera or microphone.
  for (const feature of ['geolocation', 'camera', 'microphone', 'payment']) {
    expect(headers['Permissions-Policy']).toContain(feature + '=()')
  }
})

test('the test site really sends these headers', async ({ request }) => {
  const res = await request.get('/welcome')
  expect(res.headers()['content-security-policy']).toContain("default-src 'self'")
  expect(res.headers()['x-frame-options']).toBe('DENY')
  expect(res.headers()['x-content-type-options']).toBe('nosniff')
})

test('the content rules are really enforced: a script that is not on the list does not run', async ({ page, village }) => {
  await page.goto('/welcome')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const ran = await page.evaluate(() => {
    const s = document.createElement('script')
    s.textContent = 'window.__sneaked = true'
    document.head.appendChild(s)
    return window.__sneaked === true
  })
  expect(ran).toBe(false)
  const blocked = await page.evaluate(() => window.__cspBlocked)
  expect(blocked.join(' ')).toContain('script-src')
  // This test broke the rules on purpose, so clear the record of it.
  await page.evaluate(() => { window.__cspBlocked = [] })
  village.problems.length = 0
})

test('the app cannot be put inside a frame on another site', async ({ page, village, baseURL }) => {
  await page.setContent('<iframe id="f" src="' + baseURL + '/welcome" width="300" height="300"></iframe>')
  const frame = page.frameLocator('#f')
  await expect.poll(() => village.problems.join(' ')).toMatch(/frame/i)
  await expect(frame.getByRole('heading', { name: 'Neighbors helping neighbors' })).toHaveCount(0)
  // The browser's refusal is what this test wants, so clear the record of it.
  village.problems.length = 0
})

test('opening pages asks only for addresses on the allowed list', async ({ page, village, signIn }) => {
  await signIn()
  for (const path of ['/cottage', '/community/resources', '/calendar', '/world', '/settings']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle').catch(() => {})
  }
  const hosts = [...new Set(village.outside.map((u) => new URL(u).host))]
  for (const host of hosts) expect(host).toMatch(/(^|\.)tile\.openstreetmap\.org$|^challenges\.cloudflare\.com$/)
})
