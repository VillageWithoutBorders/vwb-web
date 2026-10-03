import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getRecoveryStatus } from '../lib/e2ee'

const DISMISS_KEY = 'vwb-recovery-nudge-dismissed'

// A gentle reminder on the home screen until a recovery key is set up.
export default function RecoveryNudge() {
  const { user } = useAuth()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!user) return
    let hidden = false
    try { hidden = localStorage.getItem(DISMISS_KEY + ':' + user.id) === '1' } catch (e) { /* ignore */ }
    if (hidden) return
    let alive = true
    getRecoveryStatus(user.id).then(s => { if (alive && !s.failed && !s.exists) setShow(true) })
    return () => { alive = false }
  }, [user])

  if (!show) return null
  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY + ':' + user.id, '1') } catch (e) { /* ignore */ }
    setShow(false)
  }
  return (
    <div className="recovery-nudge" role="region" aria-label="Recovery key">
      <p><strong>Keep your private messages safe.</strong> If you clear your browser or get a new phone, old messages can't be opened. A recovery key brings them back.</p>
      <div className="key-actions">
        <Link to="/settings#recovery" className="btn btn-primary" style={{ minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}>Make my recovery key</Link>
        <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={dismiss}>Not now</button>
      </div>
    </div>
  )
}
