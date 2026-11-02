import { useEffect, useRef } from 'react'

// Settings pickers re-read their choice when the account's settings arrive (uiPrefs.js).
export function usePrefsRefresh(fn) {
  const ref = useRef(fn)
  useEffect(() => { ref.current = fn })
  useEffect(() => {
    const on = () => ref.current()
    window.addEventListener('vwb:prefs', on)
    return () => window.removeEventListener('vwb:prefs', on)
  }, [])
}
