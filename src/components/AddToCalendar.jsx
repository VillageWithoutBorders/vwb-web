import { useState } from 'react'
import { addToPhoneCalendar, downloadIcs, googleCalendarLink, outlookCalendarLink } from '../utils/calendar'

// "Add this event to my calendar." The same choices on every device, so
// nothing is a surprise. People pick each time, or tick "Use this one every
// time" and the app remembers it on that device.
const KEY = 'vwb_calendar_choice'

function readSaved() {
  try { return localStorage.getItem(KEY) || '' } catch { return '' }
}
function writeSaved(v) {
  try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY) } catch { /* storage blocked: skip */ }
}

const OPTIONS = [
  { id: 'google', label: 'Google Calendar', run: (ev) => window.open(googleCalendarLink(ev), '_blank', 'noopener') },
  { id: 'outlook', label: 'Outlook calendar', run: (ev) => window.open(outlookCalendarLink(ev), '_blank', 'noopener') },
  { id: 'device', label: "Apple or my phone's calendar", run: addToPhoneCalendar },
  { id: 'file', label: 'Proton or other (calendar file)', run: downloadIcs },
]

const linkStyle = {
  background: 'none', border: 'none', padding: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center',
  textAlign: 'left', font: 'inherit', color: '#4ecca3', textDecoration: 'underline', cursor: 'pointer',
}
const smallLink = { ...linkStyle, fontSize: '0.9rem', color: 'var(--text-secondary)' }

// asButton: a full-width button (children = its label).
// Otherwise the children (the date) become the tappable link.
export default function AddToCalendar({ ev, children, asButton = false }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(readSaved)
  const [remember, setRemember] = useState(false)
  const usual = OPTIONS.find((o) => o.id === saved)

  function choose(o) {
    if (remember) { writeSaved(o.id); setSaved(o.id) }
    o.run(ev)
    setOpen(false)
    setRemember(false)
  }

  function tap() {
    if (usual) usual.run(ev)
    else setOpen((v) => !v)
  }

  function change() {
    writeSaved('')
    setSaved('')
    setOpen(true)
  }

  return (
    <>
      {asButton
        ? <button type="button" className="btn btn-outline btn-full" aria-expanded={usual ? undefined : open} onClick={tap}>{children}</button>
        : <button type="button" style={linkStyle} aria-expanded={usual ? undefined : open} onClick={tap}>{children}</button>}
      {!asButton && (
        <>
          <br />
          <em style={{ color: 'var(--text-secondary)' }}>
            {usual ? 'Tap the date to add it to ' + usual.label + '.' : 'Tap the date to add it to your calendar.'}
          </em>
        </>
      )}
      {usual && (
        <>
          <br />
          <button type="button" style={smallLink} onClick={change}>Use a different calendar</button>
        </>
      )}
      {open && !usual && (
        <div className="cal-actions" role="group" aria-label="Choose your calendar" style={{ marginTop: '0.5rem' }}>
          {OPTIONS.map((o) => (
            <button key={o.id} type="button" className="btn btn-outline btn-full" onClick={() => choose(o)}>{o.label}</button>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: 44 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 20, height: 20 }} />
            Use this one every time
          </label>
        </div>
      )}
    </>
  )
}
