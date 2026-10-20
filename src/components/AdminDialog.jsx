import { useEffect, useRef, useState } from 'react'

// In-page "Are you sure?" panels and short notes, in place of the browser's
// pop-ups. Started in Admin; now used across the app (the host is in App.jsx). The panel sits at the bottom of the screen, where a thumb
// reaches, and works with a keyboard and screen readers.
//
//   const ok = await askConfirm('Reject this report?', { yes: 'Reject', danger: true })
//   const r = await ask({ message: 'Turn down X?', yes: 'Turn down', input: { label: 'Note (optional)' } })
//     -> null if cancelled, else { text }
//   tell('Saved.')            a note that fades after a few seconds
//   tell('Could not save.', { tone: 'error' })
//   tell('Report dismissed.', { action: { label: 'Undo', run: () => reopen(id) } })
//                             a note with a button, shown a little longer
//
// <AdminDialogHost /> must be on the page. Without it, the browser pop-ups are used.

let hostListener = null
let nextId = 1

export function ask(opts) {
  if (!hostListener) {
    // No host on this page: fall back to the browser.
    if (opts.input) {
      const t = window.prompt(opts.message + (opts.input.label ? '\n\n' + opts.input.label : ''), '')
      return Promise.resolve(t === null ? null : { text: t })
    }
    return Promise.resolve(window.confirm(opts.message) ? { text: '' } : null)
  }
  return new Promise((resolve) => hostListener({ kind: 'ask', id: nextId++, opts, resolve }))
}

export async function askConfirm(message, opts = {}) {
  return (await ask({ ...opts, message })) !== null
}

export function tell(message, opts = {}) {
  if (!hostListener) { window.alert(message); return }
  hostListener({ kind: 'tell', id: nextId++, message, tone: opts.tone || 'ok', action: opts.action || null })
}

export function AdminDialogHost() {
  const [panel, setPanel] = useState(null)
  const [notes, setNotes] = useState([])
  const [text, setText] = useState('')
  const boxRef = useRef(null)
  const lastFocus = useRef(null)
  const queue = useRef([])
  const current = useRef(null)

  useEffect(() => {
    hostListener = (item) => {
      if (item.kind === 'tell') {
        setNotes((n) => [...n.slice(-2), item])
        setTimeout(() => setNotes((n) => n.filter((x) => x.id !== item.id)), item.action ? 10000 : item.tone === 'error' ? 9000 : 5000)
        return
      }
      if (current.current) { queue.current.push(item); return }
      current.current = item
      setPanel(item)
    }
    return () => { hostListener = null }
  }, [])

  useEffect(() => {
    if (!panel) return
    lastFocus.current = document.activeElement
    setText('')
    const t = setTimeout(() => {
      const el = boxRef.current?.querySelector('textarea') || boxRef.current
      el?.focus()
    }, 0)
    return () => clearTimeout(t)
  }, [panel])

  function finish(result) {
    current.current?.resolve(result)
    const next = queue.current.shift() || null
    current.current = next
    setPanel(next)
    if (!next) lastFocus.current?.focus?.()
  }

  useEffect(() => {
    if (!panel) return
    function onKey(e) { if (e.key === 'Escape') finish(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const o = panel?.opts || {}
  return (
    <>
      {panel && (
        <div className="admin-dialog-scrim" role="presentation" onClick={() => finish(null)}>
          <div
            ref={boxRef}
            className="admin-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={'adlg-' + panel.id}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            {o.title && <h2 className="admin-dialog-title">{o.title}</h2>}
            <p id={'adlg-' + panel.id} className="admin-dialog-msg">{o.message}</p>
            {o.input && (
              <label className="admin-dialog-label">
                {o.input.label}
                <textarea rows={3} maxLength={o.input.max || 500} value={text} onChange={(e) => setText(e.target.value)} placeholder={o.input.placeholder || ''} />
              </label>
            )}
            <div className="admin-dialog-actions">
              <button type="button" className="btn btn-outline" onClick={() => finish(null)}>{o.no || 'Cancel'}</button>
              <button type="button" className={'btn ' + (o.danger ? 'btn-danger admin-dialog-danger' : 'btn-primary')} onClick={() => finish({ text: text.trim() })}>{o.yes || 'Yes'}</button>
            </div>
          </div>
        </div>
      )}
      <div className="admin-notes" aria-live="polite">
        {notes.map((n) => (
          <div key={n.id} className={'admin-note' + (n.tone === 'error' ? ' admin-note-error' : '')} role={n.tone === 'error' ? 'alert' : 'status'}>
            <span>{n.message}</span>
            {n.action && (
              <button type="button" className="admin-note-action" onClick={() => { setNotes((x) => x.filter((y) => y.id !== n.id)); n.action.run() }}>{n.action.label}</button>
            )}
            <button type="button" aria-label="Close" onClick={() => setNotes((x) => x.filter((y) => y.id !== n.id))}>&times;</button>
          </div>
        ))}
      </div>
    </>
  )
}
