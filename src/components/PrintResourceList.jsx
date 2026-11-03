import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'

// A paper list of the places on screen (Nov 3, barriers review). Hope
// Ambassadors hand it out at a pantry, a church, or a door, to neighbors who
// will never use an app. Black on white, plain words, a QR code to the full
// list. It prints only what is already shown: no names of members, nothing private.

const LIST_URL = 'https://app.villagewithoutborders.org/resources'

function short(text, max) {
  const t = (text || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '...' : t
}

function site(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

export default function PrintResourceList({ cats, grouped, title }) {
  const [qr, setQr] = useState('')

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(LIST_URL, { width: 240, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((d) => { if (alive) setQr(d) })
      .catch((err) => console.error('QR code for the printed list failed:', err))
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const done = () => document.body.classList.remove('vwb-print-list')
    window.addEventListener('afterprint', done)
    return () => { window.removeEventListener('afterprint', done); done() }
  }, [])

  function printIt() {
    document.body.classList.add('vwb-print-list')
    window.print()
  }

  const today = new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <>
      <button type="button" className="btn btn-outline btn-full fh-print-btn" onClick={printIt}>
        Print this list
      </button>
      {createPortal(
        <div className="print-sheet" aria-hidden="true">
          <header className="print-head">
            <div>
              <h1>{title}</h1>
              <p>Village Without Borders. Free help from neighbors and local groups. Printed {today}.</p>
              <p>Call ahead when you can. Hours and rules can change.</p>
            </div>
            {qr && <img src={qr} alt="" width="96" height="96" />}
          </header>
          {cats.map((cat) => (
            <section key={cat} className="print-cat">
              <h2>{cat}</h2>
              {grouped[cat].map((r) => {
                const phone = r.phone || r.provider_phone
                return (
                  <div key={cat + r.id} className="print-item">
                    <b>{r.name}</b>
                    {phone && <span>. Phone: {phone}</span>}
                    {r.address && <span>. Address: {r.address}</span>}
                    {!r.address && r.url && site(r.url) && <span>. Website: {site(r.url)}</span>}
                    {r.description && <small>{short(r.description, 160)}</small>}
                  </div>
                )
              })}
            </section>
          ))}
          <footer className="print-foot">
            Scan the code, or go to app.villagewithoutborders.org/resources, for the full list. Need a hand from a neighbor? Ask a Hope Ambassador.
          </footer>
        </div>,
        document.body
      )}
    </>
  )
}
