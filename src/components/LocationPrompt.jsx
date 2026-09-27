import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { lookupZip, saveZip, setVisitZip, shareDeviceLocation, forgetVisitLocation } from '../utils/location'

// Asks "where should we look?" with a zip code. We never guess a location.
// Shown wherever a page needs a location and doesn't have one yet.
// onDone() is called once a location is set, so the page can reload.
export function LocationPrompt({ onDone, onCancel, title = 'Where should we look?', intro }) {
  const { user, refreshProfile } = useAuth()
  const [zip, setZip] = useState('')
  const [place, setPlace] = useState(null)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleFind(e) {
    e.preventDefault()
    setError('')
    const clean = zip.replace(/[^0-9]/g, '')
    if (clean.length !== 5) { setError('Zip codes have 5 numbers.'); return }
    setBusy(true)
    const found = await lookupZip(clean)
    setBusy(false)
    if (!found) { setError("We couldn't find that zip code. Try the zip code where you live."); return }
    setPlace(found)
  }

  async function handleUse() {
    setError('')
    setBusy(true)
    if (remember && user) {
      const msg = await saveZip(user.id, place.zip)
      if (msg) { setBusy(false); setError(msg); return }
      forgetVisitLocation()
      await refreshProfile()
    } else {
      setVisitZip(place)
    }
    setBusy(false)
    onDone?.()
  }

  async function handleDevice() {
    setError('')
    setBusy(true)
    const loc = await shareDeviceLocation()
    setBusy(false)
    if (!loc) { setError("We couldn't get your phone's location. You can use your zip code instead."); return }
    onDone?.()
  }

  return (
    <div className="location-prompt" role="region" aria-label="Choose your area">
      <h2 className="location-prompt-title">{title}</h2>
      <p className="location-prompt-text">
        {intro || 'Enter your zip code to see neighbors near you. We never guess where you are.'}
      </p>

      {!place ? (
        <form onSubmit={handleFind} className="location-prompt-row">
          <label htmlFor="locZip" className="sr-only">Zip code</label>
          <input
            id="locZip"
            className="location-prompt-input"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            pattern="[0-9]*"
            maxLength={5}
            placeholder="Zip code"
            value={zip}
            onChange={(e) => { setZip(e.target.value.replace(/[^0-9]/g, '')); setError('') }}
            aria-invalid={!!error}
            aria-describedby={error ? 'locZipError' : undefined}
          />
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Looking...' : 'Find'}</button>
        </form>
      ) : (
        <div className="location-prompt-found">
          <p className="location-prompt-place">
            <span aria-hidden="true">&#128205;</span> {place.label}
            <button type="button" className="link-button" onClick={() => { setPlace(null); setError('') }}>Change</button>
          </p>
          {user && (
            <label className="checkbox-field location-prompt-remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>
                Remember my zip code.
                <span className="location-prompt-fine"> Only you and VWB admins can see it. Neighbors only ever see your town.</span>
              </span>
            </label>
          )}
          <button type="button" className="btn btn-primary btn-full" onClick={handleUse} disabled={busy}>
            {busy ? 'Saving...' : 'Use ' + place.label}
          </button>
        </div>
      )}

      {error && <p id="locZipError" className="form-error" role="alert">{error}</p>}

      <div className="location-prompt-alt">
        <button type="button" className="link-button" onClick={handleDevice} disabled={busy}>
          Use my phone's location instead
        </button>
        {onCancel && (
          <button type="button" className="link-button" onClick={onCancel}>Cancel</button>
        )}
      </div>
      <p className="location-prompt-fine">Your phone's location is rounded to about half a mile and only kept until you close the app.</p>
    </div>
  )
}

// A small line like "Near Ringgold, GA · Change". Tapping Change opens the
// prompt in place.
export function LocationBar({ loc, onChanged, prefix = 'Near' }) {
  const { profile } = useAuth()
  const [editing, setEditing] = useState(false)
  // Using a travel spot (phone or a zip for this visit) while a home zip is saved.
  const away = loc.source !== 'zip' && profile?.location_source === 'zip'
  if (editing) {
    return <LocationPrompt title="Change your area" onDone={() => { setEditing(false); onChanged?.() }} onCancel={() => setEditing(false)} />
  }
  return (
    <div className="location-bar">
      <span className="location-dot" aria-hidden="true" />
      <span className="location-bar-text">{prefix} {loc.label}</span>
      <button type="button" className="link-button location-bar-change" onClick={() => setEditing(true)}>Change</button>
      {away && (
        <button type="button" className="link-button location-bar-change" onClick={() => { forgetVisitLocation(); onChanged?.() }}>
          Back to my home area
        </button>
      )}
    </div>
  )
}
