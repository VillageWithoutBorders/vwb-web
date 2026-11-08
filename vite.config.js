import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
import { readFileSync, readdirSync } from 'node:fs'
// Nov 8: Jade's watercolor button pictures. Any <name>.webp in public/art/icons is
// used in place of <name>.svg (see Icon.jsx). The list is read when the app is built
// or `npm run dev` starts, so restart dev after adding a new painting.
function paintedIcons() {
  try {
    return readdirSync(fileURLToPath(new URL('./public/art/icons', import.meta.url)))
      .filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5))
  } catch { return [] }
}
export default defineConfig({
  define: { __PAINTED_ICONS__: JSON.stringify(paintedIcons()) },
  resolve: {
    alias: {
      // libsodium-wrappers' own ESM build (dist/modules-esm/libsodium-wrappers.mjs)
      // imports "./libsodium.mjs" as a relative sibling file that doesn't
      // actually exist in that package -- the real file only exists in the
      // separate `libsodium` package. That's a bug in how libsodium-wrappers
      // is published, not something wrong in this app, and it breaks any
      // strict ESM bundler (this failed the production build outright once
      // the temporary /* @vite-ignore */ workaround in e2ee.js was removed).
      // Its CJS build (dist/modules/libsodium-wrappers.js) doesn't have this
      // problem -- it requires the `libsodium` package by name instead of a
      // broken relative path -- so this alias points every import of
      // 'libsodium-wrappers' at that file directly, before Node's package
      // exports map (which doesn't allow deep-importing it) ever gets
      // involved.
      // The alias target must be an absolute file path, not another
      // package specifier -- a bare specifier here still goes through
      // Node/Rolldown's package-exports resolution and hits the very same
      // wall the alias exists to route around.
      'libsodium-wrappers': fileURLToPath(new URL('./node_modules/libsodium-wrappers/dist/modules/libsodium-wrappers.js', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      manifest: {
        name: 'Village Without Borders',
        short_name: 'VWB',
        description: 'Mutual aid resources for Northwest Georgia',
        theme_color: '#1a1a1a',
        background_color: '#0c1717',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          // New logo (Oct 15). The phone shows icon-512 on background_color while the app opens.
          {
            src: '/icons/icon-192-v2.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512-v2.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/icon-maskable-512-v2.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        // Long-press the VWB icon on Android or a computer for these (Oct 22).
        // Same four as a new neighbor's Quick Actions. iPhone does not show them yet.
        shortcuts: [
          { name: 'Find help', short_name: 'Find help', description: 'Food, housing, bills, rides, and more near you', url: '/community/resources', icons: [{ src: '/icons/shortcut-heart-hands.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Ask for help', short_name: 'Ask', description: 'Ask your neighbors for a hand', url: '/ask', icons: [{ src: '/icons/shortcut-raise-hand.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Show my QR', short_name: 'My QR', description: 'Connect with someone in person', url: '/my-code', icons: [{ src: '/icons/shortcut-phone-add.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'My village', short_name: 'Village', description: 'Your cottage and your home village', url: '/village', icons: [{ src: '/icons/shortcut-houses.png', sizes: '96x96', type: 'image/png' }] }
        ]
      },
      // Lighter first visit (Nov 3, barriers review): people on prepaid data were
      // downloading every screen of the app (about 3.6 MB) on their first visit.
      // Now only what the first screen needs is saved up front; every other
      // screen is saved the first time someone opens it (see src/sw.js), so it
      // still opens offline after that. The phone fetches the big app icons itself.
      includeManifestIcons: false,
      injectManifest: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: [
          'index.html',
          'registerSW.js',
          'manifest.webmanifest',
          'assets/index-*.{js,css}',
          'assets/rolldown-runtime-*.js',
          'assets/jsx-runtime-*.js',
          'assets/chunk-*.js',
          'assets/AuthContext-*.js',
          'assets/simpleView-*.js',
          // Nov 3: plus every file the first page itself loads (react-dom, the
          // Supabase client, ...). Their names change from build to build, so they
          // are read from the built index.html below instead of listed here.
          'assets/*.{js,css}'
        ],
        manifestTransforms: [firstScreenOnly]
      }
    })
  ]
})

// Keeps the lighter first visit (Nov 3): of all the app files, save up front only
// the ones the first page loads (named in the built index.html) and the short list
// above. Without the first page's own files, the app could not open with no signal.
const FIRST_SCREEN = /^assets\/(index|rolldown-runtime|jsx-runtime|chunk|AuthContext|simpleView)-/
function firstScreenOnly(entries) {
  let html = ''
  try { html = readFileSync(fileURLToPath(new URL('./dist/index.html', import.meta.url)), 'utf8') } catch { /* no built page yet */ }
  const used = new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((m) => m[1]))
  const manifest = entries.filter((e) => !e.url.startsWith('assets/') || used.has(e.url) || FIRST_SCREEN.test(e.url))
  return { manifest, warnings: html ? [] : ['index.html not found; only the short list is saved up front'] }
}
