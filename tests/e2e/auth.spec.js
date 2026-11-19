// Getting in and out: the front door, signing in, signing up, and the steps a new
// member must pass (Community Guidelines) before seeing anything inside.
import { test, expect, settled } from './support/fixtures.js'
import { makeProfile, makeUser } from './support/mockBackend.js'

function neighborWithPassword(village, profile = {}) {
  const user = makeUser()
  village.account('neighbor@example.org', 'correct horse', user)
  village.seed('helper_profiles', [makeProfile(profile)])
  village.onRpc('am_i_established', () => true)
  return user
}

test.describe('signed out', () => {
  test('the front door shows the Welcome page with Sign up first', async ({ page, village }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/welcome$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Neighbors helping neighbors' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/login?mode=signup')
    await expect(page.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
    expect(village.requests.filter((r) => r.table)).toEqual([])
  })

  for (const path of ['/settings', '/messages', '/ask', '/admin', '/cottage']) {
    test('a link to ' + path + ' goes to Sign in, and nothing private is asked for', async ({ page, village }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      const asked = village.requests.filter((r) => r.table && r.table !== 'skill_categories').map((r) => r.table)
      expect(asked).toEqual([])
    })
  }

  test('the public pages open without an account', async ({ page }) => {
    await page.goto('/resources')
    await expect(page.getByRole('heading', { level: 1, name: 'Find resources' })).toBeVisible()
    await page.goto('/terms')
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible()
  })
})

test.describe('signing in', () => {
  test('the right email and password open the app', async ({ page, village }) => {
    neighborWithPassword(village)
    await page.goto('/login')
    await page.getByLabel('Email').fill('neighbor@example.org')
    await page.getByRole('textbox', { name: 'Password' }).fill('correct horse')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/cottage/)
    await expect(page.getByRole('heading', { name: /Test Neighbor/ })).toBeVisible()
    const [signIn] = village.requests.filter((r) => r.path === '/auth/v1/token' && r.query.grant_type === 'password')
    expect(signIn.body).toMatchObject({ email: 'neighbor@example.org', password: 'correct horse' })
  })

  test('a wrong password says so, offers Forgot password, and stays signed out', async ({ page, village }) => {
    neighborWithPassword(village)
    await page.goto('/login')
    await page.getByLabel('Email').fill('neighbor@example.org')
    await page.getByRole('textbox', { name: 'Password' }).fill('wrong')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('alert')).toContainText('Invalid login credentials')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('sb-fake-auth-token'))).toBeNull()
  })

  test('the password can be shown and hidden', async ({ page }) => {
    await page.goto('/login')
    const box = page.getByRole('textbox', { name: 'Password' })
    await box.fill('secret words')
    await expect(box).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Show password' }).click()
    await expect(page.locator('#password, input[autocomplete="current-password"]').first()).toHaveAttribute('type', 'text')
  })

  test('on a shared computer, the sign-in is kept only until the browser closes', async ({ page, village }) => {
    neighborWithPassword(village)
    await page.goto('/login')
    await page.getByLabel('Email').fill('neighbor@example.org')
    await page.getByRole('textbox', { name: 'Password' }).fill('correct horse')
    await page.getByRole('checkbox', { name: /Keep me signed in/ }).uncheck()
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/cottage/)

    const where = await page.evaluate(() => ({
      forever: localStorage.getItem('sb-fake-auth-token'),
      thisVisit: sessionStorage.getItem('sb-fake-auth-token'),
    }))
    expect(where.forever).toBeNull()
    expect(where.thisVisit).toContain('access_token')
  })

  test('Forgot password asks for the email first, then sends the link', async ({ page, village }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Forgot password?' }).click()
    await expect(page.getByRole('alert')).toContainText('Enter your email first')

    await page.getByLabel('Email').fill('neighbor@example.org')
    await page.getByRole('button', { name: 'Forgot password?' }).click()
    await expect.poll(() => village.requests.filter((r) => r.path === '/auth/v1/recover').length).toBe(1)
    expect(village.requests.find((r) => r.path === '/auth/v1/recover').body.email).toBe('neighbor@example.org')
  })

  test('someone already signed in skips the Welcome and Sign in pages', async ({ page, signIn }) => {
    await signIn()
    await page.goto('/login')
    await expect(page).toHaveURL(/\/cottage/)
    await page.goto('/welcome')
    await expect(page).toHaveURL(/\/cottage/)
  })
})

test.describe('signing up', () => {
  async function openSignUp(page) {
    await page.goto('/login?mode=signup')
    await settled(page)
  }

  test('an empty form is stopped at an empty box, and no account is made', async ({ page, village }) => {
    await openSignUp(page)
    await page.getByRole('button', { name: 'Create account' }).click()

    // The browser points at the first box that must be filled in.
    expect(await page.evaluate(() => document.activeElement?.matches('input:invalid'))).toBe(true)
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    expect(village.requests.filter((r) => r.path === '/auth/v1/signup')).toEqual([])
  })

  test('a zip code that is not 5 digits is turned away', async ({ page, village }) => {
    await openSignUp(page)
    await page.getByLabel('Your name or nickname').fill('New Neighbor')
    await page.getByLabel(/^Zip code/).fill('3073')
    await page.getByLabel('Email').fill('new@example.org')
    await page.getByRole('textbox', { name: 'Password' }).fill('long enough 123')
    await page.getByRole('checkbox', { name: /18 or older/ }).check()
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('alert')).toContainText('Please enter your 5-digit zip code')
    expect(village.requests.filter((r) => r.path === '/auth/v1/signup')).toEqual([])
  })

  test('a password shorter than 6 is turned away, and so is an unconfirmed age', async ({ page, village }) => {
    await openSignUp(page)
    await page.getByLabel('Your name or nickname').fill('New Neighbor')
    await page.getByLabel(/^Zip code/).fill('30736')
    await page.getByLabel('Email').fill('new@example.org')
    const password = page.getByRole('textbox', { name: 'Password' })
    await password.pressSequentially('12345')
    await page.getByRole('checkbox', { name: /18 or older/ }).check()
    await page.getByRole('button', { name: 'Create account' }).click()
    // Either the browser's own check or the app's message stops it. No account either way.
    const stopped = (await password.evaluate((el) => el.validity.tooShort)) || (await page.getByRole('alert').isVisible())
    expect(stopped).toBe(true)
    expect(village.requests.filter((r) => r.path === '/auth/v1/signup')).toEqual([])

    await password.fill('long enough 123')
    await page.getByRole('checkbox', { name: /18 or older/ }).uncheck()
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('alert')).toContainText('Please confirm you are 18 or older')
    expect(village.requests.filter((r) => r.path === '/auth/v1/signup')).toEqual([])
  })

  test('the password meter moves from Weak to Strong', async ({ page }) => {
    await openSignUp(page)
    const password = page.getByRole('textbox', { name: 'Password' })
    await password.fill('abcdef')
    await expect(page.getByText('Weak', { exact: true })).toBeVisible()
    await password.fill('Abcdef1234!')
    await expect(page.getByText('Strong', { exact: true })).toBeVisible()
  })

  test('a complete form makes the account and says to check email', async ({ page, village }) => {
    await openSignUp(page)
    await page.getByLabel('Your name or nickname').fill('  New Neighbor ')
    await page.getByLabel(/^Zip code/).fill('30736')
    await page.getByLabel('Email').fill('new@example.org')
    await page.getByRole('textbox', { name: 'Password' }).fill('long enough 123')
    await page.getByRole('checkbox', { name: /18 or older/ }).check()
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    await expect(page.getByText('new@example.org')).toBeVisible()
    const [signup] = village.requests.filter((r) => r.path === '/auth/v1/signup')
    expect(signup.body.email).toBe('new@example.org')
    expect(signup.body.data).toMatchObject({ display_name: 'New Neighbor', zip_code: '30736' })
    // Age is confirmed, never stored (see Terms).
    expect(JSON.stringify(signup.body)).not.toMatch(/birth|age|adult/i)
  })
})

test.describe('first steps inside', () => {
  test('a new member reads the Community Guidelines and agrees before anything else opens', async ({ page, village, signIn }) => {
    await signIn({ profile: { guidelines_accepted_at: null } })
    await page.goto('/messages')
    await settled(page)
    await expect(page.getByRole('progressbar', { name: 'Step 1 of 6' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: "You're joining a village" })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'I Agree' })).toHaveCount(0)

    for (let step = 1; step < 6; step++) await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'I Agree' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible()
    const [saved] = village.writes('helper_profiles')
    expect(saved.method).toBe('PATCH')
    expect(saved.query.user_id).toBe('eq.' + village.user.id)
    expect(Date.parse(saved.body.guidelines_accepted_at)).not.toBeNaN()
  })

  test('an account whose profile cannot load gets a message and a way out, not a blank page', async ({ page, village, signIn }) => {
    await signIn({ profile: null })
    village.fail((r) => r.table === 'helper_profiles')
    await page.goto('/cottage')
    await expect(page.getByRole('alert')).toContainText("We couldn't load your account")
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('a brand-new account gets its profile made from the name and zip typed at sign up', async ({ page, village, signIn }) => {
    await signIn({ profile: null, user: { user_metadata: { display_name: 'Rosa', zip_code: '30736' } } })
    await page.goto('/')
    await expect.poll(() => village.writes('helper_profiles').length).toBeGreaterThan(0)
    expect(village.writes('helper_profiles')[0].body).toMatchObject({ display_name: 'Rosa', zip_code: '30736' })
  })

  test('logging out returns to the front door and forgets the sign-in', async ({ page, village, signIn }) => {
    await signIn()
    await page.goto('/me')
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page.getByRole('dialog', { name: 'Log out?' })).toContainText("You'll need your email and password to get back in.")
    await page.getByRole('dialog', { name: 'Log out?' }).getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/(welcome|login)$/)
    expect(await page.evaluate(() => localStorage.getItem('sb-fake-auth-token'))).toBeNull()
    expect(village.requests.some((r) => r.path === '/auth/v1/logout')).toBe(true)
  })
})
