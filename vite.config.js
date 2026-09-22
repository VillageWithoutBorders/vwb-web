import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
export default defineConfig({
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
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      injectManifest: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024
      }
    })
  ]
})