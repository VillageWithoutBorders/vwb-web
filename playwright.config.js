// Settings for the whole-app tests (npm run test:e2e). They open the built app in a
// real browser, on a small phone and on a computer screen, and use it the way a
// neighbor would. The database is pretend (tests/e2e/support/mockBackend.js), so
// nothing here can reach or change the real VWB. See tests/README.md.
import { defineConfig } from '@playwright/test'

const PORT = 4181

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.js',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 30000,
  expect: { timeout: 7000 },
  use: {
    baseURL: 'http://localhost:' + PORT,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // The smallest phone the app promises to work on (see the pull request checklist).
    { name: 'phone', use: { viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true } },
    { name: 'computer', use: { viewport: { width: 1280, height: 800 } } },
  ],
  // Serves the test build (npm run build:check) with the same safety headers the
  // live site sends, so a change that the content rules (CSP) would block fails here first.
  webServer: {
    command: 'node tests/e2e/support/serve.mjs',
    url: 'http://localhost:' + PORT + '/__ready',
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
  },
})
