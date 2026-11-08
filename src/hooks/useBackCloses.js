import { useEffect } from 'react'

// Nov 7/8 (Jade): the phone's Back button closes a pop-up (My Tools, My QR code)
// instead of leaving the page. Opening adds a step to the history; Back takes that
// step away and closes it. Closing any other way takes the step back out, so Back
// still works as before.
// Nov 8: the step is taken out a moment later, and only if no pop-up is still open.
// React's test mode opens every pop-up twice in a row, and taking the step out right
// away made the pop-up close itself.
let live = 0

export function useBackCloses(closeRef) {
  useEffect(() => {
    live += 1
    try {
      const st = window.history.state
      if (!(st && st.vwbSheet)) window.history.pushState({ ...(st || {}), vwbSheet: Date.now() + Math.random() }, '')
    } catch { /* old browser */ }
    function onPop() { if (!(window.history.state && window.history.state.vwbSheet)) closeRef.current(false) }
    window.addEventListener('popstate', onPop)
    return () => {
      live -= 1
      window.removeEventListener('popstate', onPop)
      setTimeout(() => {
        if (live === 0 && window.history.state && window.history.state.vwbSheet) window.history.back()
      }, 0)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
