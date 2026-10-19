import { useEffect, useState } from 'react'

// True on a computer-sized screen (1024px and wider). The Admin page uses it
// to switch between the simple phone build and the full desktop build.
const QUERY = '(min-width: 1024px)'

export function useWideScreen() {
  const [wide, setWide] = useState(() => {
    try { return window.matchMedia(QUERY).matches } catch { return false }
  })
  useEffect(() => {
    let mq
    try { mq = window.matchMedia(QUERY) } catch { return }
    const onChange = () => setWide(mq.matches)
    onChange()
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange)
    return () => { mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange) }
  }, [])
  return wide
}
