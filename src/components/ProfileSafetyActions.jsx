import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

// Block and report buttons for someone else's profile.
//
// Block hides you and them from each other in messages and offers (the same
// block the inbox and Settings already use). Report goes to the admins'
// Reports tab with the reason you pick. You can do either one, or both.

const REASONS = [
  'Harassing me or making me feel unsafe',
  'Threatening or unsafe behavior',
  'Pretending to be someone else',
  'Asking for money or private information',
  'Something else',
]

const ghost = { padding: '0.5rem 1rem', minHeight: '40px', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#ccc', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }

export default function ProfileSafetyActions({ userId, name, myId, onBlockChange }) {
  const [blocked, setBlocked] = useState(null)
  const [dialog, setDialog] = useState(null) // 'block' | 'report' | 'reported' | null
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const firstRef = useRef(null)
  const who = name || 'this neighbor'

  useEffect(() => {
    let cancelled = false
    if (!myId || !userId) return
    supabase.from('blocks').select('id').eq('blocker_id', myId).eq('blocked_id', userId).maybeSingle().then(({ data, error: err }) => {
      if (cancelled) return
      if (err) { console.error('[ProfileSafetyActions] block lookup failed', err); setBlocked(false); return }
      setBlocked(!!data)
      if (onBlockChange) onBlockChange(!!data)
    })
    return () => { cancelled = true }
  }, [myId, userId])

  useEffect(() => {
    if (!dialog) return
    function onKey(e) { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    if (firstRef.current) firstRef.current.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog])

  function close() {
    setDialog(null)
    setError('')
    setReason('')
    setDetails('')
  }

  function setBlockedBoth(next) {
    setBlocked(next)
    if (onBlockChange) onBlockChange(next)
  }

  async function block() {
    setBusy(true)
    setError('')
    const { error: err } = await supabase.from('blocks').insert({ blocker_id: myId, blocked_id: userId })
    setBusy(false)
    // 23505 means the block already exists, which is the outcome we wanted.
    if (err && err.code !== '23505') {
      console.error('[ProfileSafetyActions] block failed', err)
      setError('Could not block this person. Try again.')
      return
    }
    setBlockedBoth(true)
    close()
  }

  async function unblock() {
    setBusy(true)
    const { error: err } = await supabase.from('blocks').delete().eq('blocker_id', myId).eq('blocked_id', userId)
    setBusy(false)
    if (err) {
      console.error('[ProfileSafetyActions] unblock failed', err)
      alert('Could not unblock this person. Try again.')
      return
    }
    setBlockedBoth(false)
  }

  async function submitReport() {
    if (!reason) { setError('Pick the closest reason.'); return }
    setBusy(true)
    setError('')
    const extra = details.trim().slice(0, 500)
    const description = 'Reported from profile. Reason: ' + reason + (extra ? '. Details: ' + extra : '')
    const { error: err } = await supabase.from('safety_alerts').insert({ reporter_id: myId, reported_user_id: userId, alert_type: 'flag', description })
    setBusy(false)
    if (err) {
      console.error('[ProfileSafetyActions] report failed', err)
      setError('Could not send your report. Try again.')
      return
    }
    setDialog('reported')
  }

  if (!myId || !userId || myId === userId || blocked === null) return null

  const overlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100 }
  const box = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#1e1e1e', border: '1px solid #333', borderRadius: '16px', padding: '1.25rem', zIndex: 1101, width: 'min(340px, calc(100vw - 2rem))', maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }
  const primary = { flex: 1, padding: '0.7rem', minHeight: '44px', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }
  const danger = { ...primary, background: '#c0392b', color: '#fff' }
  const quiet = { flex: 1, padding: '0.7rem', minHeight: '44px', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#aaa', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }

  return (
    <>
      {blocked && (
        <p style={{ margin: '0.6rem 0 0', color: '#aaa', fontSize: '0.8rem' }}>You blocked {who}. You will not see each other in messages or offers.</p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
        {blocked
          ? <button type="button" onClick={unblock} disabled={busy} style={ghost}>Unblock</button>
          : <button type="button" onClick={() => setDialog('block')} style={ghost}>Block</button>}
        <button type="button" onClick={() => setDialog('report')} style={{ ...ghost, color: '#ff6666', borderColor: '#5a2a2a' }}>Report</button>
      </div>

      {dialog && (
        <>
          <div onClick={close} style={overlay} />
          <div role="dialog" aria-modal="true" aria-labelledby="psa-title" style={box}>
            {dialog === 'block' && (
              <>
                <h2 id="psa-title" style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#fff' }}>Block {who}?</h2>
                <p style={{ margin: '0 0 1rem', color: '#bbb', fontSize: '0.9rem', lineHeight: 1.5 }}>You will stop seeing each other in messages and offers. They will not be told. You can undo this anytime on their profile or in Settings.</p>
                {error && <p role="alert" style={{ margin: '0 0 0.75rem', color: '#ff8080', fontSize: '0.85rem' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" ref={firstRef} onClick={close} style={quiet}>Cancel</button>
                  <button type="button" onClick={block} disabled={busy} style={danger}>{busy ? 'Blocking...' : 'Block'}</button>
                </div>
              </>
            )}

            {dialog === 'report' && (
              <>
                <h2 id="psa-title" style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#fff' }}>Report {who}</h2>
                <p style={{ margin: '0 0 0.75rem', color: '#bbb', fontSize: '0.9rem', lineHeight: 1.5 }}>Only admins see your report. The person you report is not told.</p>
                <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
                  <legend style={{ color: '#ddd', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>What happened?</legend>
                  {REASONS.map((r, i) => (
                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', minHeight: '40px', color: '#eee', fontSize: '0.9rem', cursor: 'pointer' }}>
                      <input ref={i === 0 ? firstRef : null} type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => { setReason(r); setError('') }} style={{ width: '18px', height: '18px', accentColor: '#4ecca3' }} />
                      {r}
                    </label>
                  ))}
                </fieldset>
                <label htmlFor="report-details" style={{ display: 'block', color: '#ddd', fontSize: '0.85rem', fontWeight: 600, margin: '0.75rem 0 0.3rem' }}>Anything else we should know? (optional)</label>
                <textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} rows={3} style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: '8px', border: '1px solid #444', background: '#111', color: '#eee', fontSize: '0.9rem', resize: 'vertical' }} />
                {error && <p role="alert" style={{ margin: '0.6rem 0 0', color: '#ff8080', fontSize: '0.85rem' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button type="button" onClick={close} style={quiet}>Cancel</button>
                  <button type="button" onClick={submitReport} disabled={busy} style={primary}>{busy ? 'Sending...' : 'Send report'}</button>
                </div>
              </>
            )}

            {dialog === 'reported' && (
              <>
                <h2 id="psa-title" style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#fff' }}>Thank you</h2>
                <p style={{ margin: '0 0 1rem', color: '#bbb', fontSize: '0.9rem', lineHeight: 1.5 }}>An admin will look at this. If you do not want to see or hear from {who} in the meantime, you can block them too.</p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" ref={firstRef} onClick={close} style={quiet}>Done</button>
                  {!blocked && <button type="button" onClick={block} disabled={busy} style={danger}>{busy ? 'Blocking...' : 'Block ' + who}</button>}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
