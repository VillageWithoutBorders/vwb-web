// Weak signal and no signal. VWB is used on old phones, on prepaid data, and after
// storms. Once the app has been opened, it must open again with no signal, and a
// page that is not on the phone yet must say so instead of breaking.
import { test, expect, settled } from './support/fixtures.js'

// These tests need the offline helper (service worker) that the others keep off.
test.use({ serviceWorkers: 'allow' })

async function offlineHelperReady(page) {
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  // Open once more so the helper is in charge of this page.
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}

test('the first visit saves only what the first screen needs, not the whole app', async ({ page }) => {
  await page.goto('/welcome')
  await offlineHelperReady(page)
  const saved = await page.evaluate(async () => {
    const out = []
    for (const name of await caches.keys()) {
      if (!name.includes('precache')) continue
      for (const req of await (await caches.open(name)).keys()) out.push(new URL(req.url).pathname)
    }
    return out
  })
  expect(saved).toContain('/index.html')
  expect(saved.some((p) => /^\/assets\/index-.*\.js$/.test(p))).toBe(true)
  // Screens like Settings and Admin are fetched when first opened (Nov 3, lighter first visit).
  expect(saved.filter((p) => /\/assets\/(Settings|Admin|Terms)-/.test(p))).toEqual([])
})

test('the app opens with no signal after it has been opened once', async ({ page, context }) => {
  await page.goto('/welcome')
  await offlineHelperReady(page)
  await context.setOffline(true)

  await page.goto('/welcome')
  await expect(page.getByRole('heading', { level: 1, name: 'Neighbors helping neighbors' })).toBeVisible()
  // Any page address opens the saved app, even one never visited (a link from a text message).
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('a signed-in neighbor gets in with no signal, and a page opened before still opens', async ({ page, context, signIn }) => {
  await signIn()
  await page.goto('/ask?skip=1')
  await expect(page.getByRole('heading', { level: 1, name: 'Ask for Help' })).toBeVisible()
  await offlineHelperReady(page)
  await settled(page)
  await context.setOffline(true)

  await page.goto('/ask?skip=1')
  await expect(page.getByRole('heading', { level: 1, name: 'Ask for Help' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0)
})

test('a page that is not on the phone yet says "No signal" and opens when the signal is back', async ({ page, context, signIn }) => {
  await signIn()
  await page.goto('/ask?skip=1')
  await offlineHelperReady(page)
  await settled(page)
  await context.setOffline(true)

  // Move inside the app to a screen this phone has never opened.
  await page.evaluate(() => { window.history.pushState({}, '', '/trail'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByRole('status').filter({ hasText: 'No signal right now.' }).first()).toBeVisible()
  await expect(page.getByText('This page had a problem')).toHaveCount(0)

  await context.setOffline(false)
  await expect(page.getByRole('heading', { level: 1, name: 'My story' })).toBeVisible({ timeout: 15000 })
})

test('the app can be put on a home screen: its install card is complete', async ({ page, request }) => {
  await page.goto('/welcome')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  const res = await request.get(href)
  expect(res.ok()).toBe(true)
  const manifest = await res.json()

  expect(manifest.name).toBe('Village Without Borders')
  expect(manifest.short_name).toBe('VWB')
  expect(manifest.display).toBe('standalone')
  expect(manifest.start_url).toBe('/')
  const sizes = manifest.icons.map((i) => i.sizes)
  expect(sizes).toContain('192x192')
  expect(sizes).toContain('512x512')
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  for (const icon of [...manifest.icons, ...manifest.shortcuts.flatMap((s) => s.icons)]) {
    const img = await request.get(icon.src)
    expect(img.ok(), icon.src + ' should exist').toBe(true)
    expect(img.headers()['content-type']).toContain('image/')
  }
  // Each long-press shortcut opens a real page.
  expect(manifest.shortcuts.map((s) => s.url)).toEqual(['/community/resources', '/ask', '/my-code', '/village'])
})
