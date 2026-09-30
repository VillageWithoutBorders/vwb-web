import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// A scannable code for a link, so a friend standing next to you can open it
// with their phone camera. The code is always dark on white so every phone
// camera can read it, even in dark mode.
export default function QrShare({ url, title, hint }) {
  const [open, setOpen] = useState(false)
  const [png, setPng] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open || !url) return
    let alive = true
    QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((d) => { if (alive) { setPng(d); setFailed(false) } })
      .catch((err) => { console.error('QR code failed:', err); if (alive) setFailed(true) })
    return () => { alive = false }
  }, [open, url])

  async function shareLink() {
    try { await navigator.share({ title, url }) } catch { /* cancelled */ }
  }

  function save() {
    const a = document.createElement('a')
    a.href = png
    a.download = (title || 'vwb').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-qr.png'
    a.click()
  }

  if (!url) return null

  return (
    <div className="qr-share">
      <button type="button" className="btn btn-outline btn-full qr-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide QR code' : 'Show QR code for a friend'}
      </button>
      {open && (
        <div className="qr-panel">
          {failed && <p className="form-error" role="alert">Could not make the code. Use the link instead.</p>}
          {png && <img className="qr-image" src={png} width="256" height="256" alt={'QR code to open ' + (title || 'this page')} />}
          <p className="groups-note qr-hint">{hint || 'Ask your friend to open their phone camera and point it at this code.'}</p>
          <div className="groups-actions">
            {png && <button type="button" className="btn btn-outline" onClick={save}>Save image</button>}
            {typeof navigator !== 'undefined' && navigator.share && <button type="button" className="btn btn-outline" onClick={shareLink}>Share link</button>}
          </div>
        </div>
      )}
    </div>
  )
}
