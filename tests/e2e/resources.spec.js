// Find resources: the page anyone can open without an account, to find food,
// rides, housing and more. It only reads. Quick exit leaves fast for someone
// who may be watched.
import { test, expect, settled } from './support/fixtures.js'

const PLACES = [
  { id: 1, name: 'Ringgold Food Pantry', category: 'Food', description: 'Free groceries every Tuesday.', phone: '706-555-0100', neighborhood: 'Ringgold', verified: true, organizations: null },
  { id: 2, name: 'Valley Rides', category: 'Rides', description: 'Rides to the doctor for seniors.', phone: '706-555-0111', neighborhood: 'Chattanooga Valley', verified: true, organizations: null },
  { id: 3, name: 'Not Checked Yet Kitchen', category: 'Food', description: 'Waiting for review.', verified: false, organizations: null },
]

test.beforeEach(async ({ village }) => {
  village.seed('community_resources', PLACES)
})

test('lists kinds of help with how many places each has, checked places only', async ({ page }) => {
  await page.goto('/resources')
  await expect(page.getByRole('heading', { level: 1, name: 'Find resources' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Food 1 place' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rides 1 place' })).toBeVisible()
  await expect(page.getByText('Not Checked Yet Kitchen')).toHaveCount(0)
})

const pantry = (page) => page.getByRole('button', { name: /^Ringgold Food Pantry/ })
const rides = (page) => page.getByRole('button', { name: /^Valley Rides/ })

test('opening a kind of help shows its places, and a place opens to a phone number to tap', async ({ page }) => {
  await page.goto('/resources')
  await page.getByRole('button', { name: 'Food 1 place' }).click()
  await expect(pantry(page)).toBeVisible()
  await expect(rides(page)).toHaveCount(0)

  await pantry(page).click()
  await expect(page.getByText('Free groceries every Tuesday.').filter({ visible: true })).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Call 706-555-0100' })).toHaveAttribute('href', 'tel:7065550100')
})

test('search finds a place by what it does, and shows nothing when nothing matches', async ({ page }) => {
  await page.goto('/resources')
  const search = page.getByRole('searchbox', { name: 'Search resources' })
  await search.fill('doctor')
  await expect(rides(page)).toBeVisible()
  await expect(pantry(page)).toHaveCount(0)

  await search.fill('groceries')
  await expect(pantry(page)).toBeVisible()
  await expect(rides(page)).toHaveCount(0)

  await search.fill('zzzz nothing like this')
  await expect(pantry(page)).toHaveCount(0)
  await expect(rides(page)).toHaveCount(0)
})

test('the public page only reads: it saves nothing and asks for no account', async ({ page, village }) => {
  await page.goto('/resources')
  await page.getByRole('button', { name: 'Food 1 place' }).click()
  await page.getByRole('searchbox', { name: 'Search resources' }).fill('food')
  await settled(page)

  const saves = village.requests.filter((r) => (r.table || r.rpc) && !['GET', 'HEAD'].includes(r.method) && !r.rpc)
  expect(saves).toEqual([])
  expect(village.requests.filter((r) => r.path.startsWith('/auth/v1/') && r.method !== 'GET')).toEqual([])
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /auth|pending|profile/.test(k)))).toEqual([])
})

test('a signed-in neighbor gets the same list inside the app', async ({ page, signIn }) => {
  await signIn()
  await page.goto('/resources')
  await expect(page).toHaveURL(/\/community\/resources/)
  await expect(page.getByRole('button', { name: 'Food 1 place' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Suggest a resource' })).toBeVisible()
})

test.describe('Quick exit', () => {
  test('leaves for a weather page, blanks the screen, and Back does not return', async ({ page }) => {
    await page.goto('/welcome')
    await page.goto('/resources')
    await page.evaluate(() => sessionStorage.setItem('vwb_town_today', '{"label":"Ringgold"}'))
    await page.getByRole('button', { name: 'Quick exit' }).click()

    await expect(page).toHaveURL('https://weather.com/')
    await expect(page.getByText('Find resources')).toHaveCount(0)

    await page.goBack()
    // The resources page was replaced in the history, so Back lands on the page before it.
    await expect(page).not.toHaveURL(/\/resources/)
    expect(await page.evaluate(() => sessionStorage.getItem('vwb_town_today'))).toBeNull()
  })

  test('is one tap, big enough for a thumb, and always on screen', async ({ page }) => {
    await page.goto('/resources')
    const button = page.getByRole('button', { name: 'Quick exit' })
    await expect(button).toBeInViewport()
    const box = await button.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
    await page.mouse.wheel(0, 2000)
    await expect(button).toBeInViewport()
  })
})
