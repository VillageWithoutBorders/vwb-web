import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { lookupZip, saveZip } from '../utils/location'
import Icon from './Icon'

// Today, at the top (Oct 25): people with no zip code saved can't be matched to a
// village. One box, one tap. Only you and VWB admins see your zip code.
// After saving, it points to Find your village, which shows the villages that cover it.
export default function ZipCard() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [zip, setZip] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(null)

  if (!profile || (profile.zip_code && !saved)) return null

  async function save(e) {
    e.preventDefault()
    const clean = zip.replace(/[^0-9]/g, '').slice(0, 5)
    if (clean.length !== 5) { setError('Type the 5 numbers of your zip code.'); return }
    setBusy(true); setError('')
    const found = await lookupZip(clean)
    if (!found) { setBusy(false); setError('We could not find that zip code. Check the numbers and try again.'); return }
    const err = await saveZip(user.id, clean)
    setBusy(false)
    if (err) { setError(err); return }
    setSaved(found.label)
    if (refreshProfile) refreshProfile()
  }

  return (
    <section className="zip-card" aria-labelledby="zip-card-h">
      <h2 id="zip-card-h"><Icon name="houses" /> {saved ? 'Saved: ' + saved : 'Find your village'}</h2>
      {saved ? <>
        <p>Now we can show you the village for your area.</p>
        <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/find-village')}>See my village</button>
      </> : <>
        <p>Add your zip code so we can show you the village chat for your area. Only you and VWB admins can see it.</p>
        <form onSubmit={save} noValidate className="zip-card-form">
          <label htmlFor="zip-card-input">Zip code</label>
          <div className="zip-card-row">
            <input id="zip-card-input" type="text" inputMode="numeric" autoComplete="postal-code" maxLength={10}
              value={zip} onChange={(e) => { setZip(e.target.value); setError('') }} placeholder="30736"
              aria-invalid={!!error} aria-describedby={error ? 'zip-card-error' : undefined} />
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
          </div>
          {error && <p id="zip-card-error" className="form-error" role="alert">{error}</p>}
        </form>
      </>}
    </section>
  )
}
