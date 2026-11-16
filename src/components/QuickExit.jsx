import { useT } from '../utils/lang'

// Quick exit (Nov 16): one tap leaves VWB for a plain weather page, for anyone
// looking for help who may be watched. It replaces this page in the history,
// so Back does not return here, and blanks the screen first, so an installed
// app that opens the weather page on top has nothing behind it.
// The browser's own history can still show VWB; the note says so.
const EXIT_URL = 'https://weather.com'

export function quickExit() {
  try { sessionStorage.clear() } catch { /* not available */ }
  try { window.history.replaceState(null, '', '/') } catch { /* not available */ }
  try { document.title = 'Weather' } catch { /* not available */ }
  try { document.body.innerHTML = '' } catch { /* not available */ }
  window.location.replace(EXIT_URL)
}

export default function QuickExit({ signedIn }) {
  const t = useT()
  return (
    <button
      type="button"
      className={'quick-exit' + (signedIn ? '' : ' quick-exit--no-tabs')}
      onClick={quickExit}
      title={t('Leaves VWB right away and opens a weather page. Your browser history may still show VWB.')}
    >
      <span aria-hidden="true" className="quick-exit-x">{'✕'}</span> {t('Quick exit')}
    </button>
  )
}
