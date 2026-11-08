import { useEffect, useRef, useState } from 'react'
import MyCodePanel from './MyCodePanel'
import { useBackCloses } from '../hooks/useBackCloses'
import { useT } from '../utils/lang'

// Nov 8 (Jade): your QR code as a pop-up, so you can show it to someone fast and
// get right back to what you were doing. The My QR code page still works for old links.
// Close with the Close button, by tapping outside, Escape, or the phone's Back button.
function QrSheet({ onClose }) {
  const t = useT()
  const headRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

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

  // The phone's Back button closes the pop-up instead of leaving the page (same as My Tools).
  useBackCloses(closeRef)

  return (
    <div className="tools-shade qr-shade" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tools-sheet qr-sheet" role="dialog" aria-modal="true" aria-labelledby="qr-sheet-h">
        <div className="qr-sheet-top">
          <h2 id="qr-sheet-h" tabIndex={-1} ref={headRef}>{t('My QR code')}</h2>
          <button type="button" className="btn btn-outline qr-sheet-close" onClick={onClose}>{t('Close')}</button>
        </div>
        <MyCodePanel inSheet />
      </div>
    </div>
  )
}

// Lives in Layout. Opens when any button calls openMyQr() (utils/qrSheet.js).
export default function QrSheetHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener('vwb:my-qr', on)
    return () => window.removeEventListener('vwb:my-qr', on)
  }, [])
  return open ? <QrSheet onClose={() => setOpen(false)} /> : null
}
