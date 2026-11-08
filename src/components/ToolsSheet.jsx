import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { useT } from '../utils/lang'

// The pop-up list behind My Tools (top bar). children show above the rows (your alerts).
// rows: { key, label, to, icon, pic?, name?, note? }. pic shows in place of the icon (your avatar).
// onClose(true) puts focus back on the button that opened it.
export default function ToolsSheet({ id, title, rows, onClose, children, rowsTitle, footer }) {
  const tr = useT()
  const navigate = useNavigate()
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const first = ref.current && ref.current.querySelector('button, a')
    if (first) first.focus()
    function onKey(e) { if (e.key === 'Escape') closeRef.current(true) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Nov 7 (Jade): the phone's Back button closes the sheet instead of leaving the page.
  // Opening adds a step to the history; Back takes that step away and closes it.
  // Closing any other way takes the step back out, so Back still works as before.
  useEffect(() => {
    const id = Date.now() + Math.random()
    let ours = false
    try { window.history.pushState({ ...(window.history.state || {}), vwbSheet: id }, ''); ours = true } catch { /* old browser */ }
    function onPop() { if (!(window.history.state && window.history.state.vwbSheet)) closeRef.current(false) }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (ours && window.history.state && window.history.state.vwbSheet === id) window.history.back()
    }
  }, [])

  // Going somewhere from the sheet takes the sheet's place in the history.
  function go(to) { navigate(to, { replace: !!(window.history.state && window.history.state.vwbSheet) }); closeRef.current(false) }

  return (
    <div className="tools-shade" onClick={(e) => { if (e.target === e.currentTarget) onClose(true) }}>
      <div className="tools-sheet" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <h2 id={id}>{title}</h2>
        {children}
        {rowsTitle && <h3 className="tools-sub">{rowsTitle}</h3>}
        <ul className="tools-list">
          {rows.map((t) => (
            <li key={t.key}>
              <button type="button" className="tools-row" onClick={() => go(t.to)}>
                {t.pic || <Icon name={t.icon} size={28} />}
                <span><b>{tr(t.label)}</b>{t.name && <small>{t.name}</small>}{t.note && <small>{tr(t.note)}</small>}</span>
                <span className="tools-arrow" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
        {footer}
        <button type="button" className="btn btn-outline btn-full" onClick={() => onClose(true)}>{tr('Close')}</button>
      </div>
    </div>
  )
}

// The rows both lists share: your role tools, then Emergency.
export const EMERGENCY = { key: 'emergency', label: 'Emergency', icon: 'siren', to: '/emergency' }
export function toolRows(tools, adminWaiting) {
  return tools.map((t) => t.key === 'admin' && adminWaiting > 0
    ? { ...t, to: '/admin?tab=inbox', note: adminWaiting + ' waiting in the inbox' }
    : t)
}
