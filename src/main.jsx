import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { startLang } from './utils/lang'
import { watchForUpdates } from './utils/freshApp'

watchForUpdates()

// Spanish words load first for people who picked Spanish, so the app opens in Spanish.
startLang().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
