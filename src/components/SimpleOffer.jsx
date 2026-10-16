import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { saveSimpleView, phoneUsesLargeText, isSimpleView } from '../utils/simpleView'

// Asked once: Simple view or everything. Shows when the account has never
// answered (simple_view is empty). The tour waits until this is answered.
export default function SimpleOffer() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [closed, setClosed] = useState(false)
  const headRef = useRef(null)
  const ask = !!user && !!profile && Object.prototype.hasOwnProperty.call(profile, 'simple_view') && profile.simple_view === null && !closed

  // Came from the printed card (or chose Simple on this phone already):
  // save Simple to the account without asking.
  const already = ask && isSimpleView()
  useEffect(() => {
    if (!already) return
    setClosed(true)
    saveSimpleView(true).then(() => refreshProfile && refreshProfile())
  }, [already]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (ask && !already && headRef.current) headRef.current.focus() }, [ask, already])

  if (!ask || already) return null
  const large = phoneUsesLargeText()

  async function pick(simple) {
    setBusy(true)
    const ok = await saveSimpleView(simple)
    if (refreshProfile) await refreshProfile()
    setBusy(false)
    if (!ok) setClosed(true) // saved on this phone at least; don't keep asking this visit
    if (simple) navigate('/')
  }

  return (
    <div className="tools-shade so-shade">
      <div className="tools-sheet so-sheet" role="dialog" aria-modal="true" aria-labelledby="so-h">
        <h2 id="so-h" tabIndex={-1} ref={headRef}>How would you like the app to look?</h2>
        {large && <p className="so-text">Your phone uses large text, so Simple view may feel easier.</p>}
        <button type="button" className="so-choice so-choice-simple" disabled={busy} onClick={() => pick(true)}>
          <b>Simple</b>
          <span>Bigger words and buttons. Just the main things: ask for help, help others, and messages.</span>
        </button>
        <button type="button" className="so-choice" disabled={busy} onClick={() => pick(false)}>
          <b>Everything</b>
          <span>The full app: villages, the globe, Campfires, calendar, and more.</span>
        </button>
        <p className="so-text">You can change this any time in Settings.</p>
      </div>
    </div>
  )
}
