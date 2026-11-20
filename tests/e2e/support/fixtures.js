// What every whole-app test starts with. Import `test` and `expect` from here,
// not from @playwright/test:
//
//   import { test, expect } from './support/fixtures.js'
//   test('a neighbor can ...', async ({ page, village, signIn }) => {
//     await signIn()                       // open the app as a signed-in neighbor
//     village.seed('some_table', [...])    // rows the page will load
//     await page.goto('/ask')
//   })
//
// Each test gets its own pretend database (`village`) and its own clean browser.
// A test fails by itself if the page crashes, if the content rules (CSP) block
// something, or if the app tries to reach a web address outside the short list
// it is allowed to use.
import { test as base, expect } from '@playwright/test'
import { MockVillage, SUPA, makeProfile, makeSession, makeUser } from './mockBackend.js'

// Outside addresses the app is allowed to ask for (the same list as public/_headers).
const ALLOWED_OUTSIDE = [/^https:\/\/fake\.supabase\.co\//, /^wss:\/\/fake\.supabase\.co\//, /^https:\/\/([a-c]\.)?tile\.openstreetmap\.org\//, /^https:\/\/challenges\.cloudflare\.com\//,
  // Pages a neighbor may leave for on purpose.
  /^https:\/\/weather\.com\//, /^https:\/\/(www\.)?villagewithoutborders\.org\//]

export const test = base.extend({
  // Most tests keep the offline helper (service worker) out of the way, so the
  // pretend database sees every request. The offline tests turn it back on.
  serviceWorkers: 'block',

  village: async ({ context, baseURL }, hand) => {
    const village = new MockVillage()
    village.problems = []
    village.outside = []

    await context.route(SUPA + '/**', (route) => village.handle(route))
    // Live updates (the app's open line to the database): accept the call and stay quiet.
    await context.routeWebSocket(/^wss:\/\/fake\.supabase\.co\//, () => {})
    // Anything else that is not the app itself: answer with nothing, and remember it.
    await context.route((url) => !url.href.startsWith(baseURL) && !url.href.startsWith(SUPA), (route) => {
      const url = route.request().url()
      village.outside.push(url)
      if (/tile\.openstreetmap\.org/.test(url)) {
        // A one-pixel map tile, so maps draw without leaving the computer.
        return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') })
      }
      // Leaving for another site (Quick exit, a link out): show a blank stand-in page.
      if (route.request().isNavigationRequest()) return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Outside page</title><p>Outside page</p>' })
      return route.fulfill({ status: 204, body: '' })
    })

    await context.addInitScript(() => {
      // Skip the opening animation and the first-visit globe, so tests start on the page they asked for.
      try {
        sessionStorage.setItem('vwb_splash_seen', '1')
        if (!localStorage.getItem('vwb_test_started')) {
          localStorage.setItem('vwb_seen_globe', '1')
          localStorage.setItem('vwb_test_started', '1')
        }
      } catch { /* storage blocked */ }
      // Remember anything the content rules (CSP) block.
      window.__cspBlocked = []
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspBlocked.push(e.violatedDirective + ' blocked ' + (e.blockedURI || 'inline'))
      })
    })

    await hand(village)

    const strays = village.outside.filter((u) => !ALLOWED_OUTSIDE.some((re) => re.test(u)))
    expect(strays, 'The app asked for a web address outside its allowed list').toEqual([])
    expect(village.problems, 'The page had an error while the test ran').toEqual([])
  },

  page: async ({ page, village }, hand) => {
    page.on('pageerror', (err) => village.problems.push('Page crashed: ' + err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /Content Security Policy|Refused to/i.test(msg.text())) village.problems.push('Blocked by the content rules: ' + msg.text())
    })
    await hand(page)
    const blocked = await page.evaluate(() => window.__cspBlocked || []).catch(() => [])
    for (const b of blocked) village.problems.push('Blocked by the content rules: ' + b)
  },

  // Opens the app as a signed-in neighbor. Pass { profile: {...}, user: {...} } to change who.
  signIn: async ({ context, village }, hand) => {
    await hand(async (over = {}) => {
      const user = makeUser(over.user)
      const profile = over.profile === null ? null : makeProfile({ user_id: user.id, ...over.profile })
      village.user = user
      if (profile) village.seed('helper_profiles', [profile])
      // People who have been around a while can message and post (see utils/newAccount.js).
      if (!village.rpcs.am_i_established) village.onRpc('am_i_established', () => true)
      if (!village.rpcs.am_i_banned) village.onRpc('am_i_banned', () => false)
      await context.addInitScript((session) => {
        if (!localStorage.getItem('vwb_test_signed_out')) localStorage.setItem('sb-fake-auth-token', JSON.stringify(session))
      }, makeSession(user, village.aal))
      return { user, profile }
    })
  },
})

export { expect }

// Waits until the app has finished its first round of loading.
export async function settled(page) {
  await page.waitForLoadState('domcontentloaded')
  await page.locator('#root > *').first().waitFor({ state: 'attached' })
  await page.waitForLoadState('networkidle').catch(() => {})
}

// True when the page is wider than the screen (it would scroll sideways).
export async function scrollsSideways(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
}
