import { precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

// Take over from any previously-installed service worker as soon as this
// one activates, instead of waiting for every open tab/installed app to
// be fully closed first. Without this, a fresh deploy sits idle in the
// background and people keep seeing the old cached version until they
// close the app completely.
self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)

// Screens and pictures are saved the first time someone opens them (Nov 3),
// instead of all at once on the first visit. App files have a new name on each
// update, so a saved copy never goes stale. The oldest copies are dropped once
// there are more than 150.
const RUNTIME_CACHE = 'vwb-runtime-v1'
const RUNTIME_MAX = 150

async function trimRuntime() {
  const cache = await caches.open(RUNTIME_CACHE)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - RUNTIME_MAX; i++) await cache.delete(keys[i])
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith('/assets/') && !url.pathname.startsWith('/art/')) return
  event.respondWith((async () => {
    const hit = await caches.match(req)
    if (hit) return hit
    const res = await fetch(req)
    if (res.ok && res.type === 'basic') {
      const copy = res.clone()
      event.waitUntil(caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).then(trimRuntime).catch(() => {}))
    }
    return res
  })())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: 'Village Without Borders', body: event.data.text(), url: '/' }
  }
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192-v2.png',
    badge: '/icons/badge-96.png',
    tag: data.tag || 'vwb-notification',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200]
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Village Without Borders', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})