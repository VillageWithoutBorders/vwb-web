import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './skins.css'
import App from './App'
import { startLang } from './utils/lang'
import { watchForUpdates } from './utils/freshApp'
import { readWidth, applyWidth } from './utils/pageWidth'

// Nov 7 (Jade): the app lives at app.villagewithoutborders.org. Its behind-the-scenes
// Cloudflare address (vwb-web.pages.dev) sends people there, keeping the page they
// asked for. Preview builds (something.vwb-web.pages.dev) are left alone for testing.
if (window.location.hostname === 'vwb-web.pages.dev') {
  window.location.replace('https://app.villagewithoutborders.org' + window.location.pathname + window.location.search + window.location.hash)
}

watchForUpdates()

// Nov 8: Fill the screen (Settings > Easy to use), before the app draws.
applyWidth(readWidth())

// Spanish words load first for people who picked Spanish, so the app opens in Spanish.
startLang().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
