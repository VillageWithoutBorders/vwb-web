import { useEffect, useRef, useState } from 'react'

// The warning every neighbor sees, and must agree to, before joining a
// village chat. The database checks the agreement too (join_village needs
// p_agreed = true), so this is the friendly front door, not the only lock.
export default function VillageRiskDialog({ villageName, busy = false, error = '', onAgree, onCancel }) {
  const [checked, setChecked] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    const prev = document.activeElement
    boxRef.current?.focus()
    function onKey(e) { if (e.key === 'Escape' && !busy) onCancel?.() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [])

  return (
    <div role="presentation" onClick={() => { if (!busy) onCancel?.() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div
        ref={boxRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vrd-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '480px', maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box', background: '#1f1f1f', border: '1px solid #444', borderRadius: '16px 16px 0 0', padding: '1.25rem 1rem calc(1.25rem + env(safe-area-inset-bottom))', outline: 'none' }}
      >
        <h2 id="vrd-title" style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', color: '#ffcc66' }}>Before you join{villageName ? ' ' + villageName : ''}</h2>
        <p style={{ margin: '0 0 0.5rem', color: '#ddd', fontSize: '1rem', lineHeight: 1.5 }}>A village chat is a community chat. Like any community chat, it comes with risk.</p>
        <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.2rem', color: '#ddd', fontSize: '1rem', lineHeight: 1.5 }}>
          <li>Neighbors who join later can read what you post after they join. There is no limit on how many can join.</li>
          <li>Not everyone is who they say they are. VWB cannot promise that everyone in a chat is safe.</li>
          <li>Keep your address, your schedule, money details, and anything private out of the chat.</li>
          <li>You can leave, mute, block, or report at any time.</li>
          <li>Only people who joined this village chat can open it. VWB admins cannot open it. It is not encrypted like private messages, so keep sensitive details out.</li>
        </ul>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', margin: '0 0 0.9rem', color: '#fff', fontSize: '1rem', lineHeight: 1.4, minHeight: '44px', cursor: 'pointer' }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ width: '24px', height: '24px', flexShrink: 0, marginTop: '0.1rem' }} />
          <span>I understand the risk I am taking by being in a community chat.</span>
        </label>
        {error && <p role="alert" style={{ margin: '0 0 0.75rem', color: '#ff8888', fontSize: '0.9rem' }}>{error}</p>}
        <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '48px', marginBottom: '0.5rem' }} disabled={!checked || busy} onClick={() => onAgree?.()}>
          {busy ? 'Joining...' : 'I agree. Join the chat'}
        </button>
        <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '48px' }} disabled={busy} onClick={() => onCancel?.()}>Not now</button>
      </div>
    </div>
  )
}
