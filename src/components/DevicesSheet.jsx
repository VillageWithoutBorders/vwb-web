import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useBackCloses } from '../hooks/useBackCloses'
import BoxMoreBelow from './BoxMoreBelow'
import { useT } from '../utils/lang'

// Nov 8 (Jade): Settings > Account and privacy > Your devices, as a pop-up.
// The list can be long, so it lives here instead of stretching the page.
// Close with the Close button, tapping outside, Escape, or the phone's Back button.
export default function DevicesSheet({ onClose, children }) {
  const t = useT()
  const ref = useRef(null)
  const headRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useBackCloses(closeRef)

  useEffect(() => {
    const back = document.activeElement
    if (headRef.current) headRef.current.focus()
    function onKey(e) { if (e.key === 'Escape') closeRef.current() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (back && back.focus && document.contains(back)) back.focus()
    }
  }, [])

  // Drawn at the top of the page (a portal), so a page box can never trap it in half the screen.
  return createPortal(
    <div className="tools-shade qr-shade" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tools-sheet qr-sheet" role="dialog" aria-modal="true" aria-labelledby="devices-sheet-h" ref={ref}>
        <div className="qr-sheet-top">
          <h2 id="devices-sheet-h" tabIndex={-1} ref={headRef}>{t('Your Devices')}</h2>
          <button type="button" className="btn btn-outline qr-sheet-close" onClick={onClose}>{t('Close')}</button>
        </div>
        {children}
        <BoxMoreBelow boxRef={ref} />
      </div>
    </div>,
    document.body
  )
}
