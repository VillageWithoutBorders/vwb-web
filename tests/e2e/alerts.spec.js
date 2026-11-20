// Alerts: the list of things waiting for a neighbor.
import { test, expect } from './support/fixtures.js'

function alert(village, over) {
  return { user_id: village.user.id, type: 'offer', title: 'A neighbor offered help', body: 'Sam can bring soup.', link: '/tasks', read: false, created_at: new Date().toISOString(), ...over }
}

test('a neighbor sees their alerts, newest first', async ({ page, village, signIn }) => {
  await signIn()
  village.seed('notifications', [
    alert(village, { id: 1, title: 'Welcome', body: 'Glad you are here.', created_at: '2026-11-01T12:00:00Z', read: true }),
    alert(village, { id: 2, created_at: '2026-11-02T12:00:00Z' }),
  ])
  await page.goto('/notifications')

  await expect(page.getByRole('heading', { level: 1, name: 'Alerts' })).toBeVisible()
  await expect(page.getByText('Glad you are here.')).toBeVisible()
  const order = await page.getByText(/Glad you are here\.|Sam can bring soup\./).allInnerTexts()
  expect(order).toEqual(['Sam can bring soup.', 'Glad you are here.'])
})

test('new-message alerts are counted on Messages, not listed here', async ({ page, village, signIn }) => {
  await signIn()
  village.seed('notifications', [
    alert(village, { id: 1 }),
    alert(village, { id: 2, type: 'message', title: 'New message', body: 'You have a new message.' }),
    alert(village, { id: 3, type: 'group_post', title: 'New post', body: 'Someone posted in your group.' }),
  ])
  await page.goto('/notifications')
  await expect(page.getByText('Sam can bring soup.')).toBeVisible()
  await expect(page.getByText('You have a new message.')).toHaveCount(0)
  await expect(page.getByText('Someone posted in your group.')).toHaveCount(0)
})

test('Unread shows only what has not been opened', async ({ page, village, signIn }) => {
  await signIn()
  village.seed('notifications', [
    alert(village, { id: 1, title: 'Welcome', body: 'Glad you are here.', read: true }),
    alert(village, { id: 2 }),
  ])
  await page.goto('/notifications')
  await page.getByRole('button', { name: 'Unread' }).click()

  await expect(page.getByText('Sam can bring soup.')).toBeVisible()
  await expect(page.getByText('Glad you are here.')).toHaveCount(0)
})

test('with no alerts, the page says so', async ({ page, signIn }) => {
  await signIn()
  await page.goto('/notifications')
  await expect(page.getByRole('heading', { level: 1, name: 'Alerts' })).toBeVisible()
  await expect(page.getByText('No notifications yet')).toBeVisible()
})
