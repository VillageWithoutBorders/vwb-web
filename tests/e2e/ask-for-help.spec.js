// Asking for help: the heart of the app. A neighbor fills in a short form and the
// request is saved for neighbors nearby. With no signal, the request waits on the
// phone and goes out by itself when the signal is back.
import { test, expect, settled } from './support/fixtures.js'

const SKILLS = [
  { id: 1, title: 'Food and Meals', group_name: 'Everyday Help' },
  { id: 2, title: 'Rides and Transportation', group_name: 'Everyday Help' },
  { id: 3, title: 'Home Repair', group_name: 'Home and Storm Help' },
]

async function openForm(page, village, signIn, over) {
  await signIn(over)
  village.seed('skill_categories', SKILLS)
  await page.goto('/ask?skip=1')
  await settled(page)
}

async function fillAsk(page, words = 'My car broke down and I need a ride to the clinic on Friday.') {
  await page.getByRole('radio', { name: 'Me', exact: true }).check({ force: true })
  await page.getByRole('button', { name: /Everyday Help/ }).click()
  await page.getByRole('button', { name: 'Rides and Transportation' }).click()
  await page.getByLabel("What's going on?").fill(words)
}

test('a neighbor asks for a ride, and the request is saved for people nearby', async ({ page, village, signIn }) => {
  await openForm(page, village, signIn)
  await fillAsk(page)
  await page.getByRole('radio', { name: /^This week/ }).check({ force: true })
  await page.getByRole('radio', { name: '2 people' }).check({ force: true })
  await page.getByRole('button', { name: 'Post request' }).click()

  await expect(page).toHaveURL(/\/tasks\?tab=requests/)
  await expect(page.getByText('Your request has been posted.')).toBeVisible()
  const [saved] = village.writes('help_requests')
  expect(saved.method).toBe('POST')
  expect(saved.body).toMatchObject({
    requester_id: village.user.id,
    skill_needed: 'Rides and Transportation',
    description: 'My car broke down and I need a ride to the clinic on Friday.',
    urgency: 'this_week',
    max_helpers: 2,
    audience: 'everyone',
    opens_to_all_at: null,
    for_name: null,
    for_consent: false,
  })
})

test('the request carries the middle of the zip area, never an exact spot or an address', async ({ page, village, signIn }) => {
  await openForm(page, village, signIn)
  await fillAsk(page)
  await page.getByRole('button', { name: 'Post request' }).click()
  await expect(page).toHaveURL(/\/tasks/)

  const { body } = village.writes('help_requests')[0]
  expect(body.latitude).toBe(34.92)
  expect(body.longitude).toBe(-85.11)
  expect(body.neighborhood).toBe('Ringgold, GA')
  expect(Object.keys(body).filter((k) => /address|street|zip|phone/i.test(k))).toEqual([])
  // The page never asks the phone where it is.
  expect(await page.evaluate(() => navigator.permissions.query({ name: 'geolocation' }).then((p) => p.state))).not.toBe('granted')
})

test('nothing is posted until a kind of help and a few words are given', async ({ page, village, signIn }) => {
  await openForm(page, village, signIn)
  await page.getByRole('radio', { name: 'Me', exact: true }).check({ force: true })
  await page.getByLabel("What's going on?").fill('I need a hand.')
  await page.getByRole('button', { name: 'Post request' }).click()
  await expect(page.getByRole('alert')).toContainText('Please choose what kind of help you need.')

  await page.getByRole('button', { name: /Everyday Help/ }).click()
  await page.getByRole('button', { name: 'Food and Meals' }).click()
  await page.getByLabel("What's going on?").fill('   ')
  await page.getByRole('button', { name: 'Post request' }).click()
  await expect(page.getByRole('alert')).toContainText('Please describe what you need.')
  expect(village.writes('help_requests')).toEqual([])
})

test('typing something that looks like an address shows a gentle note, and still lets the person decide', async ({ page, village, signIn }) => {
  await openForm(page, village, signIn)
  await fillAsk(page, 'Please bring groceries to 123 Main Street')
  await expect(page.getByText('This looks like an address.')).toBeVisible()

  await page.getByLabel("What's going on?").fill('Please bring groceries. I will message you where.')
  await expect(page.getByText('This looks like an address.')).toHaveCount(0)
})

test.describe('asking for someone else', () => {
  test('a brand-new account cannot do it yet, and is told why', async ({ page, village, signIn }) => {
    village.onRpc('my_ask_for_others_status', () => ({ allowed: false, unlimited: false, open_count: 0 }))
    await openForm(page, village, signIn)
    await page.getByText('Someone else', { exact: true }).click()

    await expect(page.getByRole('alert')).toContainText('You can ask for someone else after your first 14 days')
    await expect(page.getByLabel("What's going on?")).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Post request' })).toHaveCount(0)
  })

  test('three open requests for other people is the limit', async ({ page, village, signIn }) => {
    village.onRpc('my_ask_for_others_status', () => ({ allowed: true, unlimited: false, open_count: 3 }))
    await openForm(page, village, signIn)
    await page.getByText('Someone else', { exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('You already have 3 open requests for other people')
  })

  test('it needs their first name only, and their okay', async ({ page, village, signIn }) => {
    village.onRpc('my_ask_for_others_status', () => ({ allowed: true, unlimited: false, open_count: 0 }))
    await openForm(page, village, signIn)
    await page.getByText('Someone else', { exact: true }).click()
    await page.getByRole('button', { name: /Everyday Help/ }).click()
    await page.getByRole('button', { name: 'Food and Meals' }).click()
    await page.getByLabel("What's going on?").fill('She needs meals this week.')
    const post = page.getByRole('button', { name: 'Post request' })

    await post.click()
    await expect(page.getByRole('alert')).toContainText('Please add their first name.')

    await page.getByLabel('Their first name').fill('Ruth 555-0100')
    await post.click()
    await expect(page.getByRole('alert')).toContainText('Please use just their first name, with letters only.')

    await page.getByLabel('Their first name').fill('Ruth')
    await post.click()
    await expect(page.getByRole('alert')).toContainText("Please check that they said it's okay to post this for them.")
    expect(village.writes('help_requests')).toEqual([])

    await page.getByRole('checkbox', { name: /said it's okay for me to post this/ }).check()
    await post.click()
    await expect(page).toHaveURL(/\/tasks/)
    expect(village.writes('help_requests')[0].body).toMatchObject({ for_name: 'Ruth', for_consent: true, skill_needed: 'Food and Meals' })
  })
})

test('when the database says no, the words stay on the page so nothing is lost', async ({ page, village, signIn }) => {
  await openForm(page, village, signIn)
  village.fail((r) => r.table === 'help_requests' && r.method === 'POST', 500, { message: 'internal error', code: 'XX000' })
  await fillAsk(page, 'I need help moving a couch.')
  await page.getByRole('button', { name: 'Post request' }).click()

  await expect(page.getByRole('alert')).toContainText('Something went wrong. Please try again.')
  await expect(page.getByLabel("What's going on?")).toHaveValue('I need help moving a couch.')
  await expect(page).toHaveURL(/\/ask/)
})

test.describe('with no signal', () => {
  test('the request waits on the phone, then sends by itself when the signal is back', async ({ page, context, village, signIn }) => {
    await openForm(page, village, signIn)
    await context.setOffline(true)
    await fillAsk(page, 'Our power is out and we need ice for medicine.')
    await page.getByRole('button', { name: 'Post request' }).click()

    // Saved on the phone, form cleared so it cannot be posted twice.
    await expect(page.getByLabel("What's going on?")).toHaveCount(0)
    expect(village.writes('help_requests')).toEqual([])
    const waiting = await page.evaluate((uid) => JSON.parse(localStorage.getItem('vwb_pending_asks_' + uid) || '[]'), village.user.id)
    expect(waiting).toHaveLength(1)
    expect(waiting[0].row.description).toBe('Our power is out and we need ice for medicine.')

    await context.setOffline(false)
    await expect(page.getByText('Your saved request was sent. Neighbors can see it now.')).toBeVisible()
    expect(village.writes('help_requests').map((w) => w.body.description)).toEqual(['Our power is out and we need ice for medicine.'])
    expect(await page.evaluate((uid) => localStorage.getItem('vwb_pending_asks_' + uid), village.user.id)).toBeNull()
  })

  test('a waiting request that already reached VWB is not posted a second time', async ({ page, context, village, signIn }) => {
    await openForm(page, village, signIn)
    await context.setOffline(true)
    await fillAsk(page, 'Need a ride to the pharmacy.')
    await page.getByRole('button', { name: 'Post request' }).click()
    await expect(page.getByLabel("What's going on?")).toHaveCount(0)

    // The first try got through just as the signal dropped.
    village.seed('help_requests', [{ id: 77, requester_id: village.user.id, description: 'Need a ride to the pharmacy.', created_at: new Date().toISOString() }])
    await context.setOffline(false)

    await expect(page.getByText('Your saved request was sent.')).toBeVisible()
    expect(village.writes('help_requests')).toEqual([])
  })

  test('signing out removes waiting requests, so nothing is left on a shared phone', async ({ page, context, village, signIn }) => {
    await openForm(page, village, signIn)
    await context.setOffline(true)
    await fillAsk(page, 'A private worry.')
    await page.getByRole('button', { name: 'Post request' }).click()
    await expect(page.getByLabel("What's going on?")).toHaveCount(0)
    await context.setOffline(false)
    village.fail((r) => r.table === 'help_requests') // keep it waiting

    await page.goto('/me')
    await page.getByRole('button', { name: 'Log out' }).click()
    await page.getByRole('dialog', { name: 'Log out?' }).getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/(welcome|login)$/)
    const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('vwb_pending_')))
    expect(left).toEqual([])
  })
})
