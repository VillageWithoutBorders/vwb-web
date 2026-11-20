// Emergency Response: for when many neighbors are hit at once. The report form
// points people in danger to 911 first, never asks for a home address, checks for
// a report that is already there, and keeps working with no signal.
import { test, expect, settled } from './support/fixtures.js'
import { USER_ID } from './support/mockBackend.js'

const FLOOD = {
  id: 9, title: 'Flooding on Lakeview Drive', description: 'Several homes have water inside.', event_type: 'Flood', status: 'active',
  verified: true, upvote_count: 2, location_name: 'Lakeview, Fort Oglethorpe', latitude: 34.95, longitude: -85.25, radius_miles: 15,
  created_by: '55555555-5555-4555-8555-555555555555', created_at: new Date().toISOString(),
}

async function openStepTwo(page) {
  await page.goto('/emergency/create')
  await page.getByRole('button', { name: 'Yes, many neighbors are affected' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Tell neighbors what happened' })).toBeVisible()
}

async function fillReport(page, { kind = 'Storm', name = 'Ringgold Storm Damage', where = 'East Ringgold, near the creek', what = 'Trees down across several roads.' } = {}) {
  await page.getByLabel('What kind of emergency?').selectOption({ label: kind })
  await page.getByLabel('Short name').fill(name)
  await page.getByLabel('Where?').fill(where)
  if (what) await page.getByLabel('What is happening? (optional)').fill(what)
}

test('the list shows active emergencies near you, marked when neighbors have confirmed them', async ({ page, village, signIn }) => {
  await signIn()
  village.seed('emergency_events', [FLOOD, { ...FLOOD, id: 10, title: 'Old Ice Storm', status: 'closed', resolved_at: '2026-01-10T00:00:00Z' }])
  await page.goto('/emergency')

  await expect(page.getByRole('heading', { level: 1, name: 'Emergency Response' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Active (1)' })).toBeVisible()
  const card = page.getByRole('button', { name: 'Open event: Flooding on Lakeview Drive' })
  await expect(card).toContainText('Verified')
  await expect(card).toContainText('Lakeview, Fort Oglethorpe')
  await expect(page.getByText('Old Ice Storm')).toHaveCount(0)

  await page.getByRole('button', { name: 'Resolved' }).click()
  await expect(page.getByText('Old Ice Storm')).toBeVisible()
})

test('step one sends people in danger to 911 and single households to Ask for Help', async ({ page, signIn }) => {
  await signIn()
  await page.goto('/emergency/create')
  await expect(page.getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911')
  await expect(page.getByText('This app does not reach emergency services.')).toBeVisible()
  await page.getByRole('button', { name: 'Ask for Help' }).click()
  await expect(page).toHaveURL(/\/ask/)
})

test('a report is saved at the middle of the zip area, and the reporter becomes its first coordinator', async ({ page, village, signIn }) => {
  await signIn()
  await openStepTwo(page)
  await fillReport(page)
  await page.getByRole('button', { name: 'Report emergency' }).click()

  await expect.poll(() => village.writes('emergency_events').length).toBe(1)
  const report = village.writes('emergency_events')[0].body
  expect(report).toMatchObject({
    title: 'Ringgold Storm Damage', event_type: 'Storm', location_name: 'East Ringgold, near the creek',
    description: 'Trees down across several roads.', latitude: 34.92, longitude: -85.11, radius_miles: 15, created_by: USER_ID,
  })
  await expect.poll(() => village.writes('event_signups').length).toBe(1)
  expect(village.writes('event_signups')[0].body).toMatchObject({ user_id: USER_ID, role: 'coordinator' })
  // A phone opens the new emergency's page; a wide screen opens it beside the list.
  await expect(page).toHaveURL(/\/emergency(\/|\?open=)\d+/)
})

test('typing a home address in "Where?" shows the gentle address note', async ({ page, signIn }) => {
  await signIn()
  await openStepTwo(page)
  await page.getByLabel('Where?').fill('412 Oak Street')
  await expect(page.getByText('This looks like an address.')).toBeVisible()
  await page.getByLabel('Where?').fill('East Ringgold, near the creek')
  await expect(page.getByText('This looks like an address.')).toHaveCount(0)
})

test('a report cannot be sent without a kind, a short name and a place', async ({ page, village, signIn }) => {
  await signIn()
  await openStepTwo(page)
  await page.getByRole('button', { name: 'Report emergency' }).click()
  await settled(page)
  expect(village.writes('emergency_events')).toEqual([])
  await expect(page.getByRole('heading', { level: 1, name: 'Tell neighbors what happened' })).toBeVisible()
})

test('when the same emergency is already reported, the person is shown it before making a second one', async ({ page, village, signIn }) => {
  await signIn()
  village.seed('emergency_events', [FLOOD])
  await openStepTwo(page)
  await fillReport(page, { kind: 'Flood', name: 'Flooding on Lakeview Drive', where: 'Lakeview, Fort Oglethorpe', what: 'Water in homes.' })
  await page.getByRole('button', { name: 'Report emergency' }).click()

  await expect(page.getByRole('button', { name: 'Same one, open it' })).toBeVisible()
  expect(village.writes('emergency_events')).toEqual([])
  await page.getByRole('button', { name: 'Same one, open it' }).click()
  await expect(page).toHaveURL(/\/emergency\/9$/)
})

test('with no signal, the report is kept on the phone and sent when the signal is back', async ({ page, context, village, signIn }) => {
  await signIn()
  await openStepTwo(page)
  await context.setOffline(true)
  await fillReport(page, { name: 'Ringgold Power Outage', kind: 'Power Outage' })
  await page.getByRole('button', { name: 'Report emergency' }).click()

  await expect(page.getByRole('button', { name: 'OK' })).toBeVisible()
  expect(village.writes('emergency_events')).toEqual([])
  const kept = await page.evaluate((uid) => JSON.parse(localStorage.getItem('vwb_pending_reports_' + uid) || '[]'), USER_ID)
  expect(kept).toHaveLength(1)
  expect(kept[0].row).toMatchObject({ title: 'Ringgold Power Outage', latitude: 34.92, longitude: -85.11 })

  await context.setOffline(false)
  await expect.poll(() => village.writes('emergency_events').length, { timeout: 15000 }).toBe(1)
  expect(village.writes('emergency_events')[0].body).toMatchObject({ title: 'Ringgold Power Outage', created_by: USER_ID })
  await expect.poll(() => page.evaluate((uid) => localStorage.getItem('vwb_pending_reports_' + uid), USER_ID)).toBeNull()
})
