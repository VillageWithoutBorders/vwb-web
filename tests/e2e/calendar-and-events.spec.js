// The public calendar and event pages. Anyone can look; signing up takes an account.
// An event in a real place only shows to people who said where they are.
import { test, expect, settled } from './support/fixtures.js'

// A day and time a few days from now, the same on every computer (6 PM or 7 PM Eastern).
function daysFromNow(days, utcHour = 23) {
  const d = new Date(Date.now() + days * 86400000)
  d.setUTCHours(utcHour, 0, 0, 0)
  return d.toISOString()
}

const POTLUCK = {
  id: 41, title: 'Community Potluck', description: 'Bring a dish to share.', starts_at: daysFromNow(3), ends_at: daysFromNow(3, 24),
  location_name: 'Ringgold Depot', latitude: 34.916, longitude: -85.109, show_radius_miles: 25, visibility: 'public', status: 'active',
  is_online: false, organization_id: null, organization_name: null, signup_enabled: true, signup_limit: null, signup_count: 2, is_signed_up: false, all_ages: true,
}
const ONLINE = {
  id: 42, title: 'Know Your Rights (online)', description: 'A free talk for renters.', starts_at: daysFromNow(5), ends_at: daysFromNow(5, 24),
  location_name: null, latitude: null, longitude: null, visibility: 'public', status: 'active', is_online: true, organization_id: null, organization_name: null, signup_enabled: false, all_ages: true,
}

function seedEvents(village) {
  village.onRpc('list_calendar_events', () => [POTLUCK, ONLINE])
  village.onRpc('get_calendar_event', ({ p_id }) => [POTLUCK, ONLINE].filter((e) => e.id === Number(p_id)))
  village.onRpc('lookup_zip', ({ p_zip }) => (p_zip === '30736' ? [{ zip: '30736', city: 'Ringgold', state: 'GA', latitude: 34.92, longitude: -85.11 }] : []))
}

test.describe('the public calendar', () => {
  test('shows online events to everyone, and local events only after a zip code is given', async ({ page, village }) => {
    seedEvents(village)
    await page.goto('/calendar/embed')
    await expect(page.getByRole('heading', { level: 1, name: 'Community Calendar' })).toBeVisible()
    await expect(page.getByText('Know Your Rights (online)')).toBeVisible()
    await expect(page.getByText('Community Potluck')).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: 'No location set yet' })).toBeVisible()

    await page.getByLabel('Your zip code').fill('30736')
    await page.getByRole('button', { name: 'Go' }).click()
    await expect(page.getByText('Community Potluck')).toBeVisible()
    expect(village.rpcCalls('lookup_zip')[0].body).toEqual({ p_zip: '30736' })
  })

  test('a zip code that is not found says so and keeps local events hidden', async ({ page, village }) => {
    seedEvents(village)
    await page.goto('/calendar/embed')
    await page.getByLabel('Your zip code').fill('00000')
    await page.getByRole('button', { name: 'Go' }).click()
    await expect(page.getByRole('alert').or(page.getByRole('status')).filter({ hasText: /find that zip|zip code/i }).first()).toBeVisible()
    await expect(page.getByText('Community Potluck')).toHaveCount(0)
  })

  test('a phone switches between a list and a month; a computer shows both side by side', async ({ page, village, isMobile }) => {
    seedEvents(village)
    await page.goto('/calendar/embed')
    if (isMobile) {
      const views = page.getByRole('group', { name: 'How to show events' })
      await expect(views.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
      await views.getByRole('button', { name: 'Month' }).click()
      await expect(views.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true')
      await expect(views.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'false')
      await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible()
    } else {
      await expect(page.getByRole('region', { name: 'Month' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'List' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible()
    }
  })

  test('an empty calendar says so plainly', async ({ page, village }) => {
    village.onRpc('list_calendar_events', () => [])
    await page.goto('/calendar/embed')
    await expect(page.getByText('No public events nearby yet.')).toBeVisible()
  })

  test('the calendar says so when it cannot load', async ({ page, village }) => {
    village.fail((r) => r.rpc === 'list_calendar_events')
    await page.goto('/calendar/embed')
    await settled(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Community Calendar' })).toBeVisible()
    await expect(page.getByText('Community Potluck')).toHaveCount(0)
  })
})

test.describe('an event page', () => {
  test('opens for anyone with the title, day, place and words', async ({ page, village }) => {
    seedEvents(village)
    await page.goto('/events/41')
    await expect(page.getByRole('heading', { level: 1, name: 'Community Potluck' })).toBeVisible()
    await expect(page.getByText('Bring a dish to share.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ringgold Depot' })).toBeVisible()
    expect(village.rpcCalls('get_calendar_event')[0].body).toMatchObject({ p_id: 41 })
  })

  test('signing up without an account leads to making one, and comes back to the event after', async ({ page, village }) => {
    seedEvents(village)
    await page.goto('/events/41')
    await page.getByRole('button', { name: 'Sign up (create an account or log in)' }).click()
    await expect(page).toHaveURL(/\/login\?mode=signup/)
    expect(village.rpcCalls('signup_for_calendar_event')).toEqual([])
    expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).toContain('/events/41')
  })

  test('a signed-in neighbor signs up to help with a note', async ({ page, village, signIn }) => {
    await signIn()
    seedEvents(village)
    village.onRpc('signup_for_calendar_event', () => ({ ok: true }))
    await page.goto('/events/41')
    await page.getByLabel(/Anything the organizer/).fill('I can bring a folding table.')
    await page.getByRole('button', { name: 'Count me in' }).click()

    await expect.poll(() => village.rpcCalls('signup_for_calendar_event').length).toBe(1)
    expect(village.rpcCalls('signup_for_calendar_event')[0].body).toMatchObject({ p_id: 41, p_note: 'I can bring a folding table.' })
  })

  test('someone already signed up can cancel', async ({ page, village, signIn }) => {
    await signIn()
    village.onRpc('list_calendar_events', () => [])
    village.onRpc('get_calendar_event', () => [{ ...POTLUCK, is_signed_up: true }])
    await page.goto('/events/41')
    await expect(page.getByText("You're signed up.")).toBeVisible()
    await page.getByRole('button', { name: 'Cancel my sign-up' }).click()
    await expect.poll(() => village.rpcCalls('cancel_calendar_signup').length).toBe(1)
    expect(village.rpcCalls('cancel_calendar_signup')[0].body).toEqual({ p_id: 41 })
  })

  test('a cancelled or hidden event never shows on the public calendar', async ({ page, village }) => {
    village.onRpc('list_calendar_events', () => [
      { ...ONLINE, id: 43, title: 'Cancelled Talk', status: 'cancelled' },
      { ...ONLINE, id: 44, title: 'Members Only Talk', visibility: 'members' },
      ONLINE,
    ])
    await page.goto('/calendar/embed')
    await expect(page.getByText('Know Your Rights (online)')).toBeVisible()
    await expect(page.getByText('Cancelled Talk')).toHaveCount(0)
    await expect(page.getByText('Members Only Talk')).toHaveCount(0)
  })

  test('a full event takes no more sign-ups', async ({ page, village, signIn }) => {
    await signIn()
    village.onRpc('get_calendar_event', () => [{ ...POTLUCK, signup_limit: 2, signup_count: 2 }])
    await page.goto('/events/41')
    await expect(page.getByText('2 of 2 spots filled')).toBeVisible()
    await expect(page.getByText('All spots are filled.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Count me in' })).toHaveCount(0)
  })

  test('an event that is over cannot be signed up for', async ({ page, village, signIn }) => {
    await signIn()
    village.onRpc('get_calendar_event', () => [{ ...POTLUCK, starts_at: daysFromNow(-3), ends_at: daysFromNow(-3, 24) }])
    await page.goto('/events/41')
    await expect(page.getByText('This event has already happened.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Count me in' })).toHaveCount(0)
  })

  test('an event that does not exist says so instead of a blank page', async ({ page, village }) => {
    village.onRpc('get_calendar_event', () => [])
    await page.goto('/events/999')
    await settled(page)
    await expect(page.getByText("This event isn't available")).toBeVisible()
    await expect(page.getByText('It may be private, it may have been removed, or the link may be old.')).toBeVisible()
  })

  test('"Add to my calendar" offers a calendar file with the right event in it', async ({ page, village }) => {
    seedEvents(village)
    await page.goto('/events/41')
    await page.getByRole('button', { name: 'Add to my calendar' }).click()
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: /calendar file/ }).click()
    const file = await downloading
    expect(file.suggestedFilename()).toMatch(/\.ics$/)
    const stream = await file.createReadStream()
    let text = ''
    for await (const chunk of stream) text += chunk
    expect(text).toContain('BEGIN:VCALENDAR')
    expect(text).toContain('SUMMARY:Community Potluck')
    expect(text).toContain('LOCATION:Ringgold Depot')
    expect(text).toMatch(/DTSTART[^\r\n]*:\d{8}T\d{6}Z?/)
    expect(text).toContain('END:VCALENDAR')
  })
})
