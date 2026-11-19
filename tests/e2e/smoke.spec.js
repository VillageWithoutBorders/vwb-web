// Every main page opens: the right heading shows, nothing crashes, nothing is
// blocked by the content rules, and the page fits the screen without scrolling
// sideways. Runs on a small phone and on a computer screen.
import { test, expect, settled, scrollsSideways } from './support/fixtures.js'

// [address, the main heading a person should see]
const SIGNED_OUT = [
  ['/welcome', 'Neighbors helping neighbors'],
  ['/login', 'Sign in'],
  ['/login?mode=signup', 'Create your account'],
  ['/resources', 'Find resources'],
  ['/terms', 'Terms of Use'],
  ['/calendar/embed', 'Community Calendar'],
]

const SIGNED_IN = [
  ['/cottage', 'My Cottage'],
  ['/messages', 'Messages'],
  ['/skillshare', 'Offer Help'],
  ['/tasks', 'Your tasks'],
  ['/community/resources', 'Find resources'],
  ['/ask?skip=1', 'Ask for Help'],
  ['/post-offer', 'Share an Offer'],
  ['/emergency', 'Emergency Response'],
  ['/emergency/create', 'Report an emergency'],
  ['/notifications', 'Alerts'],
  ['/profile', 'Test Neighbor'],
  ['/me', 'My Corner'],
  ['/settings', 'Settings'],
  ['/calendar', 'Calendar'],
  ['/calendar/new', 'Post an event'],
  ['/groups', 'Your group chats'],
  ['/world', 'Start here: find your village'],
  ['/help-doors', 'Help'],
  ['/help', 'App guide and feedback'],
  ['/find-village', 'Join or start a village'],
  ['/my-code', 'My QR code'],
  ['/trail', 'My story'],
  ['/whats-new', 'What’s new'],
  ['/village-square', 'The Village Square'],
  ['/start-group', 'Start an emergency crew'],
  ['/terms', 'Terms of Use'],
]

async function opensCleanly(page, heading) {
  await settled(page)
  await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
  await expect(page.getByText('This page had a problem')).toHaveCount(0)
  await expect(page.getByText('VWB was just updated')).toHaveCount(0)
  expect(await scrollsSideways(page), 'the page is wider than the screen').toBe(false)
}

test.describe('signed out', () => {
  for (const [path, heading] of SIGNED_OUT) {
    test(path + ' opens', async ({ page }) => {
      await page.goto(path)
      await opensCleanly(page, heading)
    })
  }
})

test.describe('signed in', () => {
  for (const [path, heading] of SIGNED_IN) {
    test(path + ' opens', async ({ page, signIn }) => {
      await signIn()
      await page.goto(path)
      await opensCleanly(page, heading)
    })
  }

  test('the bottom bar reaches the four main places', async ({ page, signIn }) => {
    await signIn()
    await page.goto('/cottage')
    const bar = page.getByRole('navigation', { name: 'Main navigation' })
    for (const [name, url, heading] of [['Offer Help', /\/skillshare/, 'Offer Help'], ['Calendar', /\/calendar/, 'Calendar'], ['Messages', /\/messages/, 'Messages'], ['Ask for Help', /\/ask/, 'Ask for Help']]) {
      await bar.getByRole('link', { name }).click()
      await expect(page).toHaveURL(url)
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    }
  })

  test('old addresses still work (alerts, bookmarks, links already sent)', async ({ page, signIn }) => {
    await signIn()
    for (const [old, now] of [['/home', /\/cottage/], ['/today', /\/cottage/], ['/community', /\/calendar/], ['/villages', /\/world/], ['/campfire', /\/village-square/]]) {
      await page.goto(old)
      await expect(page).toHaveURL(now)
    }
  })

  test('an address that does not exist goes home instead of a blank page', async ({ page, signIn }) => {
    await signIn()
    await page.goto('/no-such-page')
    await expect(page).toHaveURL(/\/cottage/)
    await expect(page.getByRole('heading', { name: 'My Cottage' })).toBeVisible()
  })

  test('admin tools do not open for a neighbor who is not an admin', async ({ page, signIn }) => {
    await signIn()
    await page.goto('/admin')
    await settled(page)
    await expect(page.getByRole('tab')).toHaveCount(0)
    await expect(page.getByText('Admin access only')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back to Profile' })).toBeVisible()
  })
})
