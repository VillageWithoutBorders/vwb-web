// Keeping the open app in step with the newest version (Nov 7, Jade).
//
// Why pages went blank: each update to VWB gives every screen file a new name, and
// the old files are removed from the website. An app that was already open still
// asks for the old names when you tap to a screen it has not opened yet, gets
// nothing back, and showed a blank page until a hard refresh.
//
// Now: the app checks for a new version when you come back to it, and if one has
// arrived, the next tap to another page quietly loads the new version. If a screen
// still fails to load, reloadFresh() fetches the new version first, then reloads.

const hadController = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !!navigator.serviceWorker.controller
let updated = false

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function whenActive(reg, ms) {
  const sw = reg.installing || reg.waiting
  if (!sw) return Promise.resolve()
  return Promise.race([
    new Promise((resolve) => sw.addEventListener('statechange', () => { if (sw.state === 'activated' || sw.state === 'redundant') resolve() })),
    wait(ms),
  ])
}

// Ask for the newest version, give it a few seconds to settle in, then reload.
export async function reloadFresh() {
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration()
    if (reg) {
      await Promise.race([reg.update(), wait(4000)])
      await whenActive(reg, 5000)
    }
  } catch (e) { console.error('[freshApp] update check failed:', e) }
  window.location.reload()
}

// Call once when the app starts.
export function watchForUpdates() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  // A new version took over. (The very first install also does this, so only count
  // it when an older version was already running.)
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) updated = true })
  // Coming back to the app: look for a new version.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    navigator.serviceWorker.getRegistration().then((reg) => reg && reg.update()).catch(() => {})
  })
  // Vite says a screen's files would not load.
  window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); reloadFresh() })
}

// True once a newer version is running underneath this page.
export function hasUpdate() { return updated }
