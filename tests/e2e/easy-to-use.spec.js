// Settings > Easy to use: language, text size, light or dark, motion, Simple view.
// Each choice shows right away, is still there after closing and reopening the app,
// and is saved to the account so it follows the person to another phone.
import { test, expect, settled } from './support/fixtures.js'

const html = (page) => page.locator('html')

test.describe('language', () => {
  test('the Welcome page switches to Spanish and back, before anyone signs in', async ({ page }) => {
    await page.goto('/welcome')
    await page.getByRole('button', { name: /Español/ }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vecinos ayudando a vecinos')
    await expect(html(page)).toHaveAttribute('lang', 'es')

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vecinos ayudando a vecinos')

    await page.getByRole('button', { name: /English/ }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Neighbors helping neighbors')
    await expect(html(page)).toHaveAttribute('lang', 'en')
  })

  test('choosing Español in Settings changes the app and saves it to the account', async ({ page, village, signIn }) => {
    await signIn()
    await page.goto('/settings')
    await page.getByRole('radio', { name: 'Español' }).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ajustes')
    await expect(page.getByRole('radio', { name: 'Español' })).toBeChecked()
    await expect(html(page)).toHaveAttribute('lang', 'es')
    await expect.poll(() => village.rpcCalls('set_my_ui_prefs').map((c) => c.body.p_prefs.lang)).toContain('es')

    await page.goto('/ask?skip=1')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pedir ayuda')
  })

  test('a person who chose Spanish on another phone gets Spanish here too', async ({ page, signIn }) => {
    await signIn({ profile: { ui_prefs: { lang: 'es' } } })
    await page.goto('/settings')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ajustes')
    await expect(page.getByRole('radio', { name: 'Español' })).toBeChecked()
  })
})

test.describe('seeing', () => {
  test('text size grows the words and stays after reopening the app', async ({ page, village, signIn }) => {
    await signIn()
    await page.goto('/settings')
    const normal = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))

    await page.getByRole('radio', { name: 'Largest' }).check()
    await expect(html(page)).toHaveClass(/text-largest/)
    const largest = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
    expect(largest).toBeGreaterThan(normal)
    await expect.poll(() => village.rpcCalls('set_my_ui_prefs').map((c) => c.body.p_prefs.text)).toContain('largest')

    await page.reload()
    await expect(html(page)).toHaveClass(/text-largest/)
    await expect(page.getByRole('radio', { name: 'Largest' })).toBeChecked()
  })

  test('the largest text still fits a small phone without scrolling sideways', async ({ page, signIn }) => {
    await signIn({ profile: { ui_prefs: { text: 'largest' } } })
    for (const path of ['/settings', '/ask?skip=1', '/messages', '/cottage']) {
      await page.goto(path)
      await settled(page)
      await expect(html(page)).toHaveClass(/text-largest/)
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(wide, path + ' is wider than the screen by ' + wide + 'px').toBeLessThanOrEqual(1)
    }
  })

  test('Light and Dark change the colors and stay after reopening', async ({ page, signIn }) => {
    await signIn()
    await page.goto('/settings')
    await page.getByRole('radio', { name: 'Dark', exact: true }).check()
    await expect(html(page)).toHaveAttribute('data-theme', 'dark')
    const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

    await page.getByRole('radio', { name: 'Light', exact: true }).check()
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(light).not.toBe(dark)

    await page.reload()
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
  })

  test('with "Match my phone", a phone set to dark gets the dark colors', async ({ browser, baseURL }) => {
    const colors = {}
    for (const scheme of ['light', 'dark']) {
      const context = await browser.newContext({ colorScheme: scheme, baseURL })
      const page = await context.newPage()
      await page.addInitScript(() => sessionStorage.setItem('vwb_splash_seen', '1'))
      await page.goto('/terms')
      await page.getByRole('heading', { level: 1, name: 'Terms of Use' }).waitFor()
      colors[scheme] = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      await context.close()
    }
    expect(colors.dark).not.toBe(colors.light)
  })

  test('Calm motion turns moving pictures off and stays after reopening', async ({ page, village, signIn }) => {
    await signIn()
    await page.goto('/settings')
    await page.getByRole('radio', { name: 'Calm' }).check()
    await expect(html(page)).toHaveClass(/calm-motion/)
    await expect.poll(() => village.rpcCalls('set_my_ui_prefs').map((c) => c.body.p_prefs.motion)).toContain('calm')

    await page.reload()
    await expect(html(page)).toHaveClass(/calm-motion/)
    await page.getByRole('radio', { name: 'Normal' }).last().check()
    await expect(html(page)).not.toHaveClass(/calm-motion/)
  })

  test('a story changes the look and place names, never the buttons', async ({ page, signIn }) => {
    await signIn()
    await page.goto('/settings')
    await page.getByRole('radio', { name: /^Space Station/ }).check()
    await expect(html(page)).toHaveClass(/skin-space/)
    await expect(page.getByRole('radio', { name: 'Largest' })).toBeVisible()
    await page.reload()
    await expect(html(page)).toHaveClass(/skin-space/)
  })
})

test.describe('using', () => {
  test('Simple view gives a plain home page with the main things', async ({ page, village, signIn }) => {
    await signIn()
    // The pretend database remembers the choice, the way the real one does.
    village.onRpc('set_simple_view', ({ p_on }) => { village.rows('helper_profiles')[0].simple_view = p_on })
    await page.goto('/settings')
    await page.getByRole('radio', { name: /^Simple/ }).check()
    await expect(html(page)).toHaveClass(/simple/)
    await expect.poll(() => village.rpcCalls('set_simple_view').map((c) => c.body.p_on)).toContain(true)

    await page.goto('/')
    await settled(page)
    await expect(page).toHaveURL(/\/$/)
    await expect(html(page)).toHaveClass(/simple/)
    await expect(page.getByRole('button', { name: /Read this to me/ })).toBeVisible()
  })

  test('a person with Simple view on their account gets it on a new phone', async ({ page, signIn }) => {
    await signIn({ profile: { simple_view: true } })
    await page.goto('/')
    await expect(html(page)).toHaveClass(/simple/)
  })

  test('the Read this to me button can be turned on in the full view', async ({ page, signIn }) => {
    await signIn()
    await page.goto('/settings')
    await expect(page.getByRole('button', { name: /Read this to me/ })).toHaveCount(0)
    await page.getByRole('radiogroup', { name: 'Read this to me button' }).getByRole('radio', { name: 'On' }).check()
    await expect(page.getByRole('button', { name: /Read this to me/ })).toBeVisible()
  })

  test('a phone that asks for less motion gets a still app', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', baseURL })
    const page = await context.newPage()
    await page.addInitScript(() => sessionStorage.setItem('vwb_splash_seen', '1'))
    await page.goto('/welcome')
    await page.getByRole('heading', { level: 1 }).waitFor()
    const moving = await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => {
      const s = getComputedStyle(el)
      return s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.01 && s.animationIterationCount === 'infinite'
    }).length)
    expect(moving).toBe(0)
    await context.close()
  })
})
