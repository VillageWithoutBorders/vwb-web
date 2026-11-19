// Settings for the unit and functional tests (npm test). These run in a pretend
// browser (jsdom) with a pretend database (tests/helpers/fakeSupabase.js), so they
// never talk to the real VWB database. The whole-app tests (npm run test:e2e) have
// their own settings in playwright.config.js. See tests/README.md.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// VWB's home is Northwest Georgia, and some rules use Eastern time (an ask for "today"
// closes at midnight Eastern). Tests run in that time zone on every computer.
process.env.TZ = 'America/New_York'

export default defineConfig({
  plugins: [react()],
  // The app build fills these in from public/art (see vite.config.js). Tests use empty lists.
  define: { __PAINTED_ICONS__: '[]', __SKIN_ART__: '[]' },
  resolve: {
    alias: {
      // Same reason as vite.config.js: libsodium-wrappers' own ESM build is broken.
      'libsodium-wrappers': fileURLToPath(new URL('./node_modules/libsodium-wrappers/dist/modules/libsodium-wrappers.js', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.js'],
    include: ['tests/unit/**/*.test.{js,jsx}', 'tests/functional/**/*.test.{js,jsx}'],
    env: { VITE_SUPABASE_URL: 'https://fake.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' },
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/utils/**', 'src/lib/**', 'src/hooks/**', 'src/supabaseClient.js'],
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage',
    },
  },
})
